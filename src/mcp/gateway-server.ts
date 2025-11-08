/**
 * MCP Gateway Server
 *
 * Exposes AgentCards functionality via MCP protocol (stdio transport)
 * Compatible with Claude Code and other MCP clients.
 *
 * Implements MCP methods:
 * - tools/list: Returns relevant tools (with semantic search)
 * - tools/call: Executes single tool or workflow
 * - prompts/get: Optional prompt retrieval
 *
 * @module mcp/gateway-server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../dag/executor.ts";
import { GatewayHandler } from "./gateway-handler.ts";
import { MCPClient } from "./client.ts";
import type { MCPTool } from "./types.ts";
import type { DAGStructure } from "../graphrag/types.ts";

/**
 * MCP JSON-RPC error codes
 */
const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * MCP Gateway Server Configuration
 */
export interface GatewayServerConfig {
  name?: string;
  version?: string;
  enableSpeculative?: boolean;
  defaultToolLimit?: number;
}

/**
 * MCP Gateway Server
 *
 * Transparent gateway that exposes AgentCards as a single MCP server.
 * Claude Code sees all tools from all MCP servers + workflow execution capability.
 */
export class AgentCardsGatewayServer {
  private server: Server;
  private gatewayHandler: GatewayHandler;
  private config: Required<GatewayServerConfig>;

  constructor(
    private db: PGliteClient,
    private vectorSearch: VectorSearch,
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    private executor: ParallelExecutor,
    private mcpClients: Map<string, MCPClient>,
    config?: GatewayServerConfig,
  ) {
    // Merge config with defaults
    this.config = {
      name: config?.name ?? "agentcards",
      version: config?.version ?? "1.0.0",
      enableSpeculative: config?.enableSpeculative ?? true,
      defaultToolLimit: config?.defaultToolLimit ?? 10,
    };

    // Initialize MCP Server
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    // Initialize Gateway Handler
    this.gatewayHandler = new GatewayHandler(
      this.graphEngine,
      this.dagSuggester,
      {
        enableSpeculative: this.config.enableSpeculative,
      },
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handler: tools/list
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request: any) => await this.handleListTools(request),
    );

    // Handler: tools/call
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any) => await this.handleCallTool(request),
    );

    // Handler: prompts/get (optional)
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: any) => await this.handleGetPrompt(request),
    );

    log.info("MCP handlers registered: tools/list, tools/call, prompts/get");
  }

  /**
   * Handler: tools/list
   *
   * Returns relevant tools based on optional query context.
   * Uses semantic search when query provided, otherwise returns all tools (with warning).
   *
   * @param request - MCP request with optional params.query
   * @returns List of available tools
   */
  private async handleListTools(request: unknown): Promise<{ tools: Array<{ name: string; description: string; inputSchema: unknown }> } | { error: { code: number; message: string; data?: unknown } }> {
    try {
      const params = (request as { params?: { query?: string } }).params;
      const query = params?.query;

      let tools: MCPTool[];

      if (query) {
        // Semantic search for relevant tools
        log.info(`list_tools with query: "${query}"`);
        const results = await this.vectorSearch.searchTools(
          query,
          this.config.defaultToolLimit,
          0.6, // Lower threshold for broader results
        );

        tools = results.map((r) => r.schema);
      } else {
        // Return all tools (warning: context saturation risk)
        log.warn("⚠️  list_tools without query - returning all tools (context saturation risk)");
        tools = await this.loadAllTools();
      }

      // Add special workflow execution tool
      const workflowTool: MCPTool = {
        name: "agentcards:execute_workflow",
        description:
          "Execute a multi-tool workflow using AgentCards DAG engine. Supports intent-based suggestions or explicit workflow definitions.",
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: "Natural language description of what you want to accomplish",
            },
            workflow: {
              type: "object",
              description: "Explicit DAG workflow structure with tasks and dependencies",
            },
          },
          oneOf: [
            { required: ["intent"] },
            { required: ["workflow"] },
          ],
        },
      };

      return {
        tools: [workflowTool, ...tools].map((schema) => ({
          name: schema.name,
          description: schema.description,
          inputSchema: schema.inputSchema,
        })),
      };
    } catch (error) {
      log.error(`list_tools error: ${error}`);
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Failed to list tools: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handler: tools/call
   *
   * Supports both single tool execution and workflow execution.
   * - Single tool: Proxies to underlying MCP server (e.g., "filesystem:read")
   * - Workflow: Executes via AgentCards DAG engine ("agentcards:execute_workflow")
   *
   * @param request - MCP request with params.name and params.arguments
   * @returns Tool execution result
   */
  private async handleCallTool(request: unknown): Promise<{ content: Array<{ type: string; text: string }> } | { error: { code: number; message: string; data?: unknown } }> {
    try {
      const params = (request as { params?: { name?: string; arguments?: unknown } }).params;

      if (!params?.name) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          "Missing required parameter: 'name'",
        );
      }

      const { name, arguments: args } = params;

      log.info(`call_tool: ${name}`);

      // Check if this is a workflow request
      if (name === "agentcards:execute_workflow") {
        return await this.handleWorkflowExecution(args);
      }

      // Single tool execution (proxy to underlying MCP server)
      const [serverId, ...toolNameParts] = name.split(":");
      const toolName = toolNameParts.join(":"); // Handle tools with ':' in name

      const client = this.mcpClients.get(serverId);

      if (!client) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Unknown MCP server: ${serverId}`,
          { available_servers: Array.from(this.mcpClients.keys()) },
        );
      }

      // Proxy tool call to underlying server
      const result = await client.callTool(toolName, args as Record<string, unknown>);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      log.error(`call_tool error: ${error}`);
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Tool execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle workflow execution
   *
   * Supports two modes:
   * 1. Intent-based: Natural language → DAG suggestion
   * 2. Explicit: DAG structure → Execute
   *
   * @param args - Workflow arguments (intent or workflow)
   * @returns Execution result or suggestion
   */
  private async handleWorkflowExecution(args: unknown): Promise<{ content: Array<{ type: string; text: string }> } | { error: { code: number; message: string; data?: unknown } }> {
    const workflowArgs = args as { intent?: string; workflow?: DAGStructure };

    // Case 1: Explicit workflow provided
    if (workflowArgs.workflow) {
      log.info("Executing explicit workflow");
      const result = await this.executor.execute(workflowArgs.workflow);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "completed",
                results: result.results,
                execution_time_ms: result.executionTimeMs,
                parallelization_layers: result.parallelizationLayers,
                errors: result.errors,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Case 2: Intent-based (GraphRAG suggestion)
    if (workflowArgs.intent) {
      log.info(`Processing workflow intent: "${workflowArgs.intent}"`);

      const executionMode = await this.gatewayHandler.processIntent({
        text: workflowArgs.intent,
      });

      if (executionMode.mode === "explicit_required") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "explicit_required",
                  message: executionMode.explanation || "Low confidence - please provide explicit workflow",
                  confidence: executionMode.confidence,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (executionMode.mode === "suggestion") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "suggestion",
                  suggested_dag: executionMode.dagStructure,
                  confidence: executionMode.confidence,
                  explanation: executionMode.explanation,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (executionMode.mode === "speculative_execution") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "speculative_execution",
                  results: executionMode.results,
                  confidence: executionMode.confidence,
                  execution_time_ms: executionMode.execution_time_ms,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Neither intent nor workflow provided
    return this.formatMCPError(
      MCPErrorCodes.INVALID_PARAMS,
      "Either 'intent' or 'workflow' must be provided",
      { received: Object.keys(workflowArgs) },
    );
  }

  /**
   * Handler: prompts/get
   *
   * Optional handler for retrieving pre-defined prompts.
   * Currently returns empty list (can be extended later).
   *
   * @param request - MCP request
   * @returns Empty prompts list
   */
  private async handleGetPrompt(_request: unknown): Promise<{ prompts: Array<unknown> }> {
    log.debug("prompts/get called (not implemented)");
    return {
      prompts: [],
    };
  }

  /**
   * Load all tools from database
   *
   * @returns All available tools
   */
  private async loadAllTools(): Promise<MCPTool[]> {
    const rows = await this.db.query(
      `SELECT server_id, name, input_schema, description FROM tool_schema ORDER BY server_id, name`,
    );

    return rows.map((row: any) => {
      return {
        name: `${row.server_id}:${row.name}`,
        description: row.description || "",
        inputSchema: row.input_schema || {},
      };
    });
  }

  /**
   * Format MCP-compliant error response
   *
   * @param code - JSON-RPC error code
   * @param message - Error message
   * @param data - Optional error data
   * @returns Error response object
   */
  private formatMCPError(
    code: number,
    message: string,
    data?: unknown,
  ): { error: { code: number; message: string; data?: unknown } } {
    const error: { code: number; message: string; data?: unknown } = {
      code,
      message,
    };
    if (data !== undefined) {
      error.data = data;
    }
    return { error };
  }

  /**
   * Start gateway server with stdio transport
   *
   * Connects to stdio streams and begins listening for MCP requests.
   * Runs indefinitely until process is killed.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    log.info("✓ AgentCards MCP gateway started (stdio mode)");
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info("  Claude Code can now connect to agentcards");
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    log.info("Shutting down AgentCards gateway...");

    // Close all MCP client connections
    for (const [serverId, client] of this.mcpClients.entries()) {
      try {
        await client.disconnect();
        log.debug(`Disconnected from ${serverId}`);
      } catch (error) {
        log.error(`Error disconnecting from ${serverId}: ${error}`);
      }
    }

    // Close server transport
    await this.server.close();

    log.info("✓ Gateway stopped");
  }
}
