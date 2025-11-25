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
  type CallToolRequest,
  CallToolRequestSchema,
  type GetPromptRequest,
  GetPromptRequestSchema,
  type ListToolsRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../dag/executor.ts";
import { GatewayHandler } from "./gateway-handler.ts";
import { MCPClient } from "./client.ts";
import type { CodeExecutionRequest, CodeExecutionResponse, MCPTool } from "./types.ts";
import type { DAGStructure } from "../graphrag/types.ts";
import { HealthChecker } from "../health/health-checker.ts";
import { DenoSandboxExecutor } from "../sandbox/executor.ts";
import { ContextBuilder } from "../sandbox/context-builder.ts";
import { addBreadcrumb, captureError, startTransaction } from "../telemetry/sentry.ts";
// Story 2.5-4: MCP Control Tools & Per-Layer Validation
import {
  deleteWorkflowDAG,
  extendWorkflowDAGExpiration,
  getWorkflowDAG,
  saveWorkflowDAG,
  updateWorkflowDAG,
} from "./workflow-dag-store.ts";
import { ControlledExecutor } from "../dag/controlled-executor.ts";
import { CheckpointManager } from "../dag/checkpoint-manager.ts";
import type { ExecutionEvent, TaskResult } from "../dag/types.ts";

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
  piiProtection?: {
    enabled: boolean;
    types?: Array<"email" | "phone" | "credit_card" | "ssn" | "api_key">;
    detokenizeOutput?: boolean;
  };
  cacheConfig?: {
    enabled: boolean;
    maxEntries?: number;
    ttlSeconds?: number;
    persistence?: boolean;
  };
}

/**
 * MCP Gateway Server
 *
 * Transparent gateway that exposes AgentCards as a single MCP server.
 * Claude Code sees all tools from all MCP servers + workflow execution capability.
 */
/**
 * Active workflow state for per-layer validation (Story 2.5-4)
 */
interface ActiveWorkflow {
  workflowId: string;
  executor: ControlledExecutor;
  generator: AsyncGenerator<ExecutionEvent, import("../dag/state.ts").WorkflowState, void>;
  dag: DAGStructure;
  currentLayer: number;
  totalLayers: number;
  layerResults: TaskResult[];
  status: "running" | "paused" | "complete" | "aborted";
  createdAt: Date;
  lastActivityAt: Date;
  latestCheckpointId: string | null;
}

export class AgentCardsGatewayServer {
  private server: Server;
  private gatewayHandler: GatewayHandler;
  private healthChecker: HealthChecker;
  private config: Required<GatewayServerConfig>;
  private contextBuilder: ContextBuilder;
  private toolSchemaCache: Map<string, string> = new Map(); // serverId:toolName → schema hash
  private httpServer: Deno.HttpServer | null = null; // HTTP server for SSE transport (ADR-014)
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map(); // Story 2.5-4
  private checkpointManager: CheckpointManager | null = null; // Story 2.5-4

  constructor(
    // @ts-ignore: db kept for future use (direct queries)
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
      piiProtection: config?.piiProtection ?? {
        enabled: true,
        types: ["email", "phone", "credit_card", "ssn", "api_key"],
        detokenizeOutput: false,
      },
      cacheConfig: config?.cacheConfig ?? {
        enabled: true,
        maxEntries: 100,
        ttlSeconds: 300,
        persistence: false,
      },
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

    // Initialize Health Checker
    this.healthChecker = new HealthChecker(this.mcpClients);

    // Initialize Context Builder for tool injection (Story 3.4)
    // Sandbox executors are created per-request with custom config
    this.contextBuilder = new ContextBuilder(this.vectorSearch, this.mcpClients);

    // Initialize CheckpointManager for per-layer validation (Story 2.5-4)
    this.checkpointManager = new CheckpointManager(this.db, true);

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handler: tools/list
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request: ListToolsRequest) => await this.handleListTools(request),
    );

    // Handler: tools/call
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => await this.handleCallTool(request),
    );

    // Handler: prompts/get (optional)
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest) => await this.handleGetPrompt(request),
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
  private handleListTools(
    request: unknown,
  ): Promise<
    { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const transaction = startTransaction("mcp.tools.list", "mcp");
    try {
      const params = (request as { params?: { query?: string } }).params;
      const query = params?.query;

      transaction.setData("has_query", !!query);
      if (query) {
        transaction.setData("query_length", query.length);
      }

      addBreadcrumb("mcp", "Processing tools/list request", { query });

      // ADR-013: Only expose meta-tools to minimize context usage
      // Tool discovery happens via execute_workflow with intent parameter
      // Underlying tools are accessed internally via DAGSuggester + vector search
      log.info(`list_tools: returning meta-tools only (ADR-013)`);
      if (query) {
        log.debug(`Query "${query}" ignored - use execute_dag with intent instead`);
      }

      // Add special DAG execution tool (renamed from execute_workflow - Story 2.5-4)
      const executeDagTool: MCPTool = {
        name: "agentcards:execute_dag",
        description:
          "Execute a multi-tool DAG (Directed Acyclic Graph) workflow. Supports intent-based suggestions or explicit DAG definitions. Provide EITHER 'intent' (for AI suggestion) OR 'workflow' (for explicit DAG), not both.",
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description:
                "Natural language description of what you want to accomplish (use this for AI-suggested workflows)",
            },
            workflow: {
              type: "object",
              description:
                "Explicit DAG workflow structure with tasks and dependencies (use this for explicit workflows)",
            },
          },
          // Note: Both fields optional, but at least one should be provided
          // Claude API doesn't support oneOf at root level, so we document the constraint in description
        },
      };

      // Add search_tools (Spike: search-tools-graph-traversal)
      const searchToolsTool: MCPTool = {
        name: "agentcards:search_tools",
        description:
          "Search for relevant tools using semantic search and graph-based recommendations. Returns tools matching your query with optional related tools from usage patterns.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Natural language description of what you want to do",
            },
            limit: {
              type: "number",
              description: "Maximum number of tools to return (default: 5)",
            },
            include_related: {
              type: "boolean",
              description: "Include graph-related tools based on usage patterns (default: false)",
            },
            context_tools: {
              type: "array",
              items: { type: "string" },
              description: "Tools already in use - boosts related tools in results",
            },
          },
          required: ["query"],
        },
      };

      // Add code execution tool (Story 3.4)
      const executeCodeTool: MCPTool = {
        name: "agentcards:execute_code",
        description:
          "[INTERNAL] Execute TypeScript/JavaScript in Deno sandbox. Simple expressions auto-return, multi-statement code requires explicit return. See ADR-016 for details.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "TypeScript code to execute in sandbox",
            },
            intent: {
              type: "string",
              description:
                "Natural language description of task (optional, triggers tool discovery)",
            },
            context: {
              type: "object",
              description: "Custom context/data to inject into sandbox (optional)",
            },
            sandbox_config: {
              type: "object",
              description: "Sandbox configuration (timeout, memory, etc.)",
              properties: {
                timeout: {
                  type: "number",
                  description: "Maximum execution time in milliseconds (default: 30000)",
                },
                memoryLimit: {
                  type: "number",
                  description: "Maximum heap memory in megabytes (default: 512)",
                },
                allowedReadPaths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Additional read paths to allow",
                },
              },
            },
          },
          required: ["code"],
        },
      };

      // Story 2.5-4: Control tools for per-layer validation (ADR-020)
      const continueTool: MCPTool = {
        name: "agentcards:continue",
        description:
          "Continue DAG execution to next layer. Use after receiving layer_complete status from execute_dag with per_layer_validation enabled.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Workflow ID from execute_dag response",
            },
            reason: {
              type: "string",
              description: "Optional reason for continuing",
            },
          },
          required: ["workflow_id"],
        },
      };

      const abortTool: MCPTool = {
        name: "agentcards:abort",
        description:
          "Abort DAG execution. Use to stop a running workflow when issues are detected.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Workflow ID to abort",
            },
            reason: {
              type: "string",
              description: "Reason for aborting the workflow",
            },
          },
          required: ["workflow_id", "reason"],
        },
      };

      const replanTool: MCPTool = {
        name: "agentcards:replan",
        description:
          "Replan DAG with new requirement. Triggers GraphRAG to add new tasks based on discovered context (e.g., found XML files → add XML parser).",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Workflow ID to replan",
            },
            new_requirement: {
              type: "string",
              description: "Natural language description of what needs to be added",
            },
            available_context: {
              type: "object",
              description: "Context data for replanning (e.g., discovered files)",
            },
          },
          required: ["workflow_id", "new_requirement"],
        },
      };

      const approvalResponseTool: MCPTool = {
        name: "agentcards:approval_response",
        description:
          "Respond to HIL (Human-in-the-Loop) approval checkpoint. Use when workflow pauses for approval of critical operations.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Workflow ID requiring approval",
            },
            checkpoint_id: {
              type: "string",
              description: "Checkpoint ID from the approval request",
            },
            approved: {
              type: "boolean",
              description: "true to approve, false to reject",
            },
            feedback: {
              type: "string",
              description: "Optional feedback or reason for decision",
            },
          },
          required: ["workflow_id", "checkpoint_id", "approved"],
        },
      };

      // ADR-013: Only return meta-tools (no underlying tools)
      const result = {
        tools: [
          executeDagTool,
          searchToolsTool,
          executeCodeTool,
          continueTool,
          abortTool,
          replanTool,
          approvalResponseTool,
        ].map((schema) => ({
          name: schema.name,
          description: schema.description,
          inputSchema: schema.inputSchema,
        })),
      };
      transaction.setData("tools_returned", 7);

      transaction.finish();
      return Promise.resolve(result);
    } catch (error) {
      log.error(`list_tools error: ${error}`);
      captureError(error as Error, {
        operation: "tools/list",
        handler: "handleListTools",
      });
      transaction.finish();
      return Promise.resolve(this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Failed to list tools: ${(error as Error).message}`,
      ));
    }
  }

  /**
   * Handler: tools/call
   *
   * Supports both single tool execution and workflow execution.
   * - Single tool: Proxies to underlying MCP server (e.g., "filesystem:read")
   * - DAG execution: Executes via AgentCards DAG engine ("agentcards:execute_dag")
   * - Control tools: continue, abort, replan_dag, approval_response (Story 2.5-4)
   *
   * @param request - MCP request with params.name and params.arguments
   * @returns Tool execution result
   */
  private async handleCallTool(
    request: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const transaction = startTransaction("mcp.tools.call", "mcp");
    try {
      const params = (request as { params?: { name?: string; arguments?: unknown } }).params;

      if (!params?.name) {
        transaction.finish();
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          "Missing required parameter: 'name'",
        );
      }

      const { name, arguments: args } = params;

      transaction.setTag("tool", name);
      transaction.setData("has_arguments", !!args);
      addBreadcrumb("mcp", "Processing tools/call request", { tool: name });

      log.info(`call_tool: ${name}`);

      // Check if this is a DAG execution request (renamed from execute_workflow)
      if (name === "agentcards:execute_dag") {
        const result = await this.handleWorkflowExecution(args);
        transaction.finish();
        return result;
      }

      // Story 2.5-4: Control tools for per-layer validation
      if (name === "agentcards:continue") {
        const result = await this.handleContinue(args);
        transaction.finish();
        return result;
      }

      if (name === "agentcards:abort") {
        const result = await this.handleAbort(args);
        transaction.finish();
        return result;
      }

      if (name === "agentcards:replan") {
        const result = await this.handleReplan(args);
        transaction.finish();
        return result;
      }

      if (name === "agentcards:approval_response") {
        const result = await this.handleApprovalResponse(args);
        transaction.finish();
        return result;
      }

      // Check if this is a code execution request (Story 3.4)
      if (name === "agentcards:execute_code") {
        const result = await this.handleExecuteCode(args);
        transaction.finish();
        return result;
      }

      // Check if this is a search_tools request (Spike: search-tools-graph-traversal)
      if (name === "agentcards:search_tools") {
        const result = await this.handleSearchTools(args);
        transaction.finish();
        return result;
      }

      // Single tool execution (proxy to underlying MCP server)
      const [serverId, ...toolNameParts] = name.split(":");
      const toolName = toolNameParts.join(":"); // Handle tools with ':' in name

      transaction.setTag("server", serverId);

      const client = this.mcpClients.get(serverId);

      if (!client) {
        transaction.finish();
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Unknown MCP server: ${serverId}`,
          { available_servers: Array.from(this.mcpClients.keys()) },
        );
      }

      // Proxy tool call to underlying server
      const result = await client.callTool(toolName, args as Record<string, unknown>);

      transaction.finish();
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
      captureError(error as Error, {
        operation: "tools/call",
        handler: "handleCallTool",
      });
      transaction.finish();
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Tool execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle workflow execution
   *
   * Supports three modes:
   * 1. Intent-based: Natural language → DAG suggestion
   * 2. Explicit: DAG structure → Execute
   * 3. Per-layer validation: Execute with pauses between layers (Story 2.5-4)
   *
   * @param args - Workflow arguments (intent or workflow, optional config)
   * @returns Execution result, suggestion, or layer_complete status
   */
  private async handleWorkflowExecution(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const workflowArgs = args as {
      intent?: string;
      workflow?: DAGStructure;
      config?: { per_layer_validation?: boolean };
    };
    const perLayerValidation = workflowArgs.config?.per_layer_validation === true;

    // Case 1: Explicit workflow provided
    if (workflowArgs.workflow) {
      log.info(`Executing explicit workflow (per_layer_validation: ${perLayerValidation})`);

      // Story 2.5-4: Per-layer validation mode
      if (perLayerValidation) {
        return await this.executeWithPerLayerValidation(
          workflowArgs.workflow,
          workflowArgs.intent ?? "explicit_workflow",
        );
      }

      // Standard execution (no validation pauses)
      const result = await this.executor.execute(workflowArgs.workflow);

      // Update graph with execution data (learning loop)
      await this.graphEngine.updateFromExecution({
        execution_id: crypto.randomUUID(),
        executed_at: new Date(),
        intent_text: workflowArgs.intent ?? "",
        dag_structure: workflowArgs.workflow,
        success: result.errors.length === 0,
        execution_time_ms: result.executionTimeMs,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "complete",
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
      log.info(
        `Processing workflow intent: "${workflowArgs.intent}" (per_layer_validation: ${perLayerValidation})`,
      );

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
                  message: executionMode.explanation ||
                    "Low confidence - please provide explicit workflow",
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
        // Story 2.5-4: If per_layer_validation enabled, execute the suggested DAG
        if (perLayerValidation && executionMode.dagStructure) {
          return await this.executeWithPerLayerValidation(
            executionMode.dagStructure,
            workflowArgs.intent,
          );
        }

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
   * Execute workflow with per-layer validation (Story 2.5-4)
   *
   * Starts DAG execution and pauses after first layer, returning
   * layer_complete status with workflow_id for continuation.
   *
   * @param dag - DAG structure to execute
   * @param intent - Original intent text
   * @returns layer_complete status or complete status
   */
  private async executeWithPerLayerValidation(
    dag: DAGStructure,
    intent: string,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const workflowId = crypto.randomUUID();

    // Save DAG to database for stateless continuation
    await saveWorkflowDAG(this.db, workflowId, dag, intent);

    // Create ControlledExecutor for this workflow
    const controlledExecutor = new ControlledExecutor(
      async (tool, args) => {
        // Route to underlying MCP servers
        const [serverId, ...toolNameParts] = tool.split(":");
        const toolName = toolNameParts.join(":");
        const client = this.mcpClients.get(serverId);
        if (!client) {
          throw new Error(`Unknown MCP server: ${serverId}`);
        }
        return await client.callTool(toolName, args);
      },
      { taskTimeout: 30000 },
    );

    // Configure checkpointing
    controlledExecutor.setCheckpointManager(this.db, true);
    controlledExecutor.setDAGSuggester(this.dagSuggester);

    // Start streaming execution
    const generator = controlledExecutor.executeStream(dag, workflowId);

    // Collect events until first layer completes
    const layerResults: TaskResult[] = [];
    let currentLayer = 0;
    let totalLayers = 0;
    let latestCheckpointId: string | null = null;

    for await (const event of generator) {
      if (event.type === "workflow_start") {
        totalLayers = event.total_layers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.task_id ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { execution_time_ms: event.execution_time_ms }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpoint_id ?? null;
        currentLayer = event.layer_index ?? 0;

        // Pause after first layer completes (layer 0)
        // Store active workflow state for continuation
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor: controlledExecutor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "paused",
          createdAt: new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return layer_complete status
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "layer_complete",
                  workflow_id: workflowId,
                  checkpoint_id: latestCheckpointId,
                  layer_index: currentLayer,
                  total_layers: totalLayers,
                  layer_results: layerResults,
                  next_layer_preview: currentLayer + 1 < totalLayers
                    ? { layer_index: currentLayer + 1 }
                    : null,
                  options: ["continue", "replan", "abort"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "workflow_complete") {
        // Workflow completed in first layer (single layer DAG)
        await deleteWorkflowDAG(this.db, workflowId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "complete",
                  workflow_id: workflowId,
                  total_time_ms: event.total_time_ms,
                  successful_tasks: event.successful_tasks,
                  failed_tasks: event.failed_tasks,
                  results: layerResults,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Should not reach here
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "complete", workflow_id: workflowId }),
        },
      ],
    };
  }

  /**
   * Handle search_tools request (Spike: search-tools-graph-traversal)
   *
   * Combines semantic search with graph-based recommendations:
   * 1. Semantic search for query-matching tools
   * 2. Adaptive alpha: more semantic weight when graph is sparse
   * 3. Optional related tools via Adamic-Adar / neighbors
   *
   * @param args - Search arguments (query, limit, include_related, context_tools)
   * @returns Search results with scores
   */
  private async handleSearchTools(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const params = args as {
      query?: string;
      limit?: number;
      include_related?: boolean;
      context_tools?: string[];
    };

    // Validate query
    if (!params.query || typeof params.query !== "string") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Missing required parameter: 'query'",
          }),
        }],
      };
    }

    const query = params.query;
    const limit = params.limit || 10;
    const includeRelated = params.include_related || false;
    const contextTools = params.context_tools || [];

    log.info(`search_tools: query="${query}", limit=${limit}, include_related=${includeRelated}`);

    // 1. Semantic search (main candidates)
    const semanticResults = await this.vectorSearch.searchTools(query, limit * 2, 0.5);

    if (semanticResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tools: [],
            message: "No tools found matching your query",
          }),
        }],
      };
    }

    // 2. Calculate adaptive alpha based on graph density (ADR-015)
    const edgeCount = this.graphEngine.getEdgeCount();
    const nodeCount = this.graphEngine.getStats().nodeCount;
    const maxPossibleEdges = nodeCount * (nodeCount - 1); // directed graph
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
    const alpha = Math.max(0.5, 1.0 - density * 2);

    // 3. Compute final scores with graph boost
    const results = semanticResults.map((result) => {
      const graphScore = this.graphEngine.computeGraphRelatedness(result.toolId, contextTools);
      const finalScore = alpha * result.score + (1 - alpha) * graphScore;

      return {
        tool_id: result.toolId,
        server_id: result.serverId,
        description: result.schema?.description || "",
        semantic_score: Math.round(result.score * 100) / 100,
        graph_score: Math.round(graphScore * 100) / 100,
        final_score: Math.round(finalScore * 100) / 100,
        related_tools: [] as Array<{ tool_id: string; relation: string; score: number }>,
      };
    });

    // Sort by final score and limit
    results.sort((a, b) => b.final_score - a.final_score);
    const topResults = results.slice(0, limit);

    // 4. Add related tools if requested
    if (includeRelated) {
      for (const result of topResults) {
        // Get in-neighbors (tools often used BEFORE this one)
        const inNeighbors = this.graphEngine.getNeighbors(result.tool_id, "in");
        for (const neighbor of inNeighbors.slice(0, 2)) {
          result.related_tools.push({
            tool_id: neighbor,
            relation: "often_before",
            score: 0.8,
          });
        }

        // Get out-neighbors (tools often used AFTER this one)
        const outNeighbors = this.graphEngine.getNeighbors(result.tool_id, "out");
        for (const neighbor of outNeighbors.slice(0, 2)) {
          result.related_tools.push({
            tool_id: neighbor,
            relation: "often_after",
            score: 0.8,
          });
        }
      }
    }

    log.info(
      `search_tools: found ${topResults.length} results (alpha=${alpha}, edges=${edgeCount})`,
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          {
            tools: topResults,
            meta: {
              query,
              alpha,
              edge_count: edgeCount,
            },
          },
          null,
          2,
        ),
      }],
    };
  }

  /**
   * Handle code execution (Story 3.4)
   *
   * Supports two modes:
   * 1. Intent-based: Natural language → vector search → tool injection → execute
   * 2. Explicit: Direct code execution with provided context
   *
   * @param args - Code execution arguments
   * @returns Execution result with metrics
   */
  private async handleExecuteCode(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    try {
      const request = args as CodeExecutionRequest;

      // Validate required parameters
      if (!request.code || typeof request.code !== "string") {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          "Missing or invalid required parameter: 'code' must be a non-empty string",
        );
      }

      // Validate code size (max 100KB)
      const codeSizeBytes = new TextEncoder().encode(request.code).length;
      if (codeSizeBytes > 100 * 1024) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Code size exceeds maximum: ${codeSizeBytes} bytes (max: 102400)`,
        );
      }

      log.info("Executing code in sandbox", {
        intent: request.intent ? `"${request.intent.substring(0, 50)}..."` : "none",
        contextKeys: request.context ? Object.keys(request.context) : [],
        codeSize: codeSizeBytes,
      });

      // Build execution context
      let executionContext = request.context || {};

      // Intent-based mode: Use vector search to discover and inject relevant tools
      if (request.intent) {
        log.debug("Intent-based mode: discovering relevant tools");

        // Vector search for relevant tools (top 5)
        const toolResults = await this.vectorSearch.searchTools(request.intent, 5, 0.6);

        if (toolResults.length > 0) {
          log.debug(`Found ${toolResults.length} relevant tools for intent`);

          // Build tool context using ContextBuilder
          const toolContext = await this.contextBuilder.buildContextFromSearchResults(
            toolResults,
          );

          // Merge tool context with user-provided context
          executionContext = { ...executionContext, ...toolContext };
        } else {
          log.warn("No relevant tools found for intent (similarity threshold not met)");
        }
      }

      // Configure sandbox
      const sandboxConfig = request.sandbox_config || {};
      const executor = new DenoSandboxExecutor({
        timeout: sandboxConfig.timeout ?? 30000,
        memoryLimit: sandboxConfig.memoryLimit ?? 512,
        allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
        piiProtection: this.config.piiProtection,
        cacheConfig: this.config.cacheConfig,
      });

      // Set tool versions for cache key generation (Story 3.7)
      const toolVersions = this.buildToolVersionsMap();
      executor.setToolVersions(toolVersions);

      // Execute code in sandbox with injected context
      const startTime = performance.now();
      const result = await executor.execute(request.code, executionContext);
      const executionTimeMs = performance.now() - startTime;

      // Handle execution failure
      if (!result.success) {
        const error = result.error!;
        return this.formatMCPError(
          MCPErrorCodes.INTERNAL_ERROR,
          `Code execution failed: ${error.type} - ${error.message}`,
          {
            error_type: error.type,
            error_message: error.message,
            stack: error.stack,
            execution_time_ms: executionTimeMs,
          },
        );
      }

      // Calculate output size
      const outputSizeBytes = new TextEncoder().encode(
        JSON.stringify(result.result),
      ).length;

      // Build response
      const response: CodeExecutionResponse = {
        result: result.result,
        logs: [], // TODO: Capture console logs in future enhancement
        metrics: {
          executionTimeMs: result.executionTimeMs,
          inputSizeBytes: codeSizeBytes,
          outputSizeBytes,
        },
        state: executionContext, // Return context for checkpoint compatibility
      };

      log.info("Code execution succeeded", {
        executionTimeMs: response.metrics.executionTimeMs.toFixed(2),
        outputSize: outputSizeBytes,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      log.error(`execute_code error: ${error}`);
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Code execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle continue command (Story 2.5-4)
   *
   * Continues a paused workflow to the next layer.
   * Uses in-memory activeWorkflows if available, otherwise loads from DB.
   *
   * @param args - Continue arguments (workflow_id, reason?)
   * @returns Next layer results or completion status
   */
  private async handleContinue(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as { workflow_id?: string; reason?: string };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    log.info(
      `handleContinue: workflow_id=${params.workflow_id}, reason=${params.reason || "none"}`,
    );

    // Check in-memory workflows first
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);

    if (activeWorkflow) {
      // Resume from in-memory state
      return await this.continueFromActiveWorkflow(activeWorkflow, params.reason);
    }

    // Fallback: Load from database (workflow was lost from memory, e.g., restart)
    const dag = await getWorkflowDAG(this.db, params.workflow_id);
    if (!dag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Load latest checkpoint
    if (!this.checkpointManager) {
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        "CheckpointManager not initialized",
      );
    }

    const latestCheckpoint = await this.checkpointManager.getLatestCheckpoint(params.workflow_id);
    if (!latestCheckpoint) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `No checkpoints found for workflow ${params.workflow_id}`,
      );
    }

    // Create new executor and resume from checkpoint
    const controlledExecutor = new ControlledExecutor(
      async (tool, toolArgs) => {
        const [serverId, ...toolNameParts] = tool.split(":");
        const toolName = toolNameParts.join(":");
        const client = this.mcpClients.get(serverId);
        if (!client) {
          throw new Error(`Unknown MCP server: ${serverId}`);
        }
        return await client.callTool(toolName, toolArgs);
      },
    );

    controlledExecutor.setCheckpointManager(this.db, true);
    controlledExecutor.setDAGSuggester(this.dagSuggester);

    // Resume from checkpoint
    const generator = controlledExecutor.resumeFromCheckpoint(dag, latestCheckpoint.id);

    // Process events until next checkpoint or completion
    return await this.processGeneratorUntilPause(
      params.workflow_id,
      controlledExecutor,
      generator,
      dag,
      latestCheckpoint.layer + 1,
    );
  }

  /**
   * Continue workflow from active in-memory state
   */
  private async continueFromActiveWorkflow(
    workflow: ActiveWorkflow,
    reason?: string,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    log.debug(`Continuing workflow ${workflow.workflowId} from layer ${workflow.currentLayer}`);

    // Enqueue continue command to executor
    workflow.executor.enqueueCommand({
      type: "continue",
      reason: reason || "external_agent_continue",
    });

    workflow.status = "running";
    workflow.lastActivityAt = new Date();

    // Extend DAG TTL
    await extendWorkflowDAGExpiration(this.db, workflow.workflowId);

    // Process events until next checkpoint or completion
    return await this.processGeneratorUntilPause(
      workflow.workflowId,
      workflow.executor,
      workflow.generator,
      workflow.dag,
      workflow.currentLayer + 1,
    );
  }

  /**
   * Process generator events until next pause point or completion
   */
  private async processGeneratorUntilPause(
    workflowId: string,
    executor: ControlledExecutor,
    generator: AsyncGenerator<ExecutionEvent, import("../dag/state.ts").WorkflowState, void>,
    dag: DAGStructure,
    expectedLayer: number,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const layerResults: TaskResult[] = [];
    let currentLayer = expectedLayer;
    let totalLayers = 0;
    let latestCheckpointId: string | null = null;

    for await (const event of generator) {
      if (event.type === "workflow_start") {
        totalLayers = event.total_layers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.task_id ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { execution_time_ms: event.execution_time_ms }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpoint_id ?? null;
        currentLayer = event.layer_index ?? currentLayer;

        // Update active workflow state
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "paused",
          createdAt: this.activeWorkflows.get(workflowId)?.createdAt ?? new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return layer_complete status
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "layer_complete",
                  workflow_id: workflowId,
                  checkpoint_id: latestCheckpointId,
                  layer_index: currentLayer,
                  total_layers: totalLayers,
                  layer_results: layerResults,
                  options: ["continue", "replan", "abort"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "workflow_complete") {
        // Workflow completed - clean up
        this.activeWorkflows.delete(workflowId);
        await deleteWorkflowDAG(this.db, workflowId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "complete",
                  workflow_id: workflowId,
                  total_time_ms: event.total_time_ms,
                  successful_tasks: event.successful_tasks,
                  failed_tasks: event.failed_tasks,
                  results: layerResults,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Generator exhausted without workflow_complete (unexpected)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "complete", workflow_id: workflowId }),
        },
      ],
    };
  }

  /**
   * Handle abort command (Story 2.5-4)
   *
   * Aborts a running or paused workflow, cleaning up resources.
   *
   * @param args - Abort arguments (workflow_id, reason)
   * @returns Abort confirmation with partial results
   */
  private async handleAbort(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as { workflow_id?: string; reason?: string };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.reason) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'reason'",
      );
    }

    log.info(`handleAbort: workflow_id=${params.workflow_id}, reason=${params.reason}`);

    // Check if workflow exists
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);
    const dag = await getWorkflowDAG(this.db, params.workflow_id);

    if (!activeWorkflow && !dag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Send abort command if workflow is active
    if (activeWorkflow) {
      activeWorkflow.executor.enqueueCommand({
        type: "abort",
        reason: params.reason,
      });
      activeWorkflow.status = "aborted";
    }

    // Collect partial results
    const partialResults = activeWorkflow?.layerResults ?? [];
    const completedLayers = activeWorkflow?.currentLayer ?? 0;

    // Clean up resources
    this.activeWorkflows.delete(params.workflow_id);
    await deleteWorkflowDAG(this.db, params.workflow_id);

    log.info(`Workflow ${params.workflow_id} aborted: ${params.reason}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "aborted",
              workflow_id: params.workflow_id,
              reason: params.reason,
              completed_layers: completedLayers,
              partial_results: partialResults,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Handle replan command (Story 2.5-4)
   *
   * Replans a workflow by adding new tasks via GraphRAG.
   *
   * @param args - Replan arguments (workflow_id, new_requirement, available_context?)
   * @returns Updated DAG with new tasks
   */
  private async handleReplan(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as {
      workflow_id?: string;
      new_requirement?: string;
      available_context?: Record<string, unknown>;
    };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.new_requirement) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'new_requirement'",
      );
    }

    log.info(
      `handleReplan: workflow_id=${params.workflow_id}, new_requirement=${params.new_requirement}`,
    );

    // Get current DAG
    const currentDag = await getWorkflowDAG(this.db, params.workflow_id);
    if (!currentDag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Get active workflow state
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);
    const completedTasks = activeWorkflow?.layerResults ?? [];

    // Replan via DAGSuggester/GraphRAG
    try {
      const augmentedDAG = await this.dagSuggester.replanDAG(currentDag, {
        completedTasks: completedTasks.map((t) => ({
          taskId: t.taskId,
          status: t.status,
          output: t.output,
        })),
        newRequirement: params.new_requirement,
        availableContext: params.available_context ?? {},
      });

      // Calculate new tasks added
      const newTasksCount = augmentedDAG.tasks.length - currentDag.tasks.length;
      const newTaskIds = augmentedDAG.tasks
        .filter((t) => !currentDag.tasks.some((ct) => ct.id === t.id))
        .map((t) => t.id);

      // Update DAG in database
      await updateWorkflowDAG(this.db, params.workflow_id, augmentedDAG);

      // Update active workflow if exists
      if (activeWorkflow) {
        activeWorkflow.dag = augmentedDAG;
        activeWorkflow.lastActivityAt = new Date();

        // Send replan command to executor
        activeWorkflow.executor.enqueueCommand({
          type: "replan_dag",
          new_requirement: params.new_requirement,
          available_context: params.available_context ?? {},
        });
      }

      log.info(`Workflow ${params.workflow_id} replanned: ${newTasksCount} new tasks`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "replanned",
                workflow_id: params.workflow_id,
                new_requirement: params.new_requirement,
                new_tasks_count: newTasksCount,
                new_task_ids: newTaskIds,
                total_tasks: augmentedDAG.tasks.length,
                options: ["continue", "abort"],
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      log.error(`Replan failed: ${error}`);
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Replanning failed: ${error instanceof Error ? error.message : String(error)}`,
        { workflow_id: params.workflow_id },
      );
    }
  }

  /**
   * Handle approval_response command (Story 2.5-4)
   *
   * Responds to a HIL approval checkpoint, continuing or rejecting the workflow.
   *
   * @param args - Approval arguments (workflow_id, checkpoint_id, approved, feedback?)
   * @returns Approval confirmation or next layer results
   */
  private async handleApprovalResponse(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as {
      workflow_id?: string;
      checkpoint_id?: string;
      approved?: boolean;
      feedback?: string;
    };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.checkpoint_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'checkpoint_id'",
      );
    }

    if (params.approved === undefined) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'approved'",
      );
    }

    log.info(
      `handleApprovalResponse: workflow_id=${params.workflow_id}, checkpoint_id=${params.checkpoint_id}, approved=${params.approved}`,
    );

    // Get active workflow
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);

    if (!activeWorkflow) {
      // Check if workflow exists in DB
      const dag = await getWorkflowDAG(this.db, params.workflow_id);
      if (!dag) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Workflow ${params.workflow_id} not found or expired`,
          { workflow_id: params.workflow_id },
        );
      }

      // Workflow exists but not active - it needs to be resumed
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} is not active. Use 'continue' to resume.`,
        { workflow_id: params.workflow_id },
      );
    }

    // Send approval command to executor
    activeWorkflow.executor.enqueueCommand({
      type: "approval_response",
      checkpoint_id: params.checkpoint_id,
      approved: params.approved,
      feedback: params.feedback,
    });

    if (!params.approved) {
      // Rejected - abort workflow
      activeWorkflow.status = "aborted";

      const partialResults = activeWorkflow.layerResults;
      const completedLayers = activeWorkflow.currentLayer;

      // Clean up
      this.activeWorkflows.delete(params.workflow_id);
      await deleteWorkflowDAG(this.db, params.workflow_id);

      log.info(`Workflow ${params.workflow_id} rejected at checkpoint ${params.checkpoint_id}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "rejected",
                workflow_id: params.workflow_id,
                checkpoint_id: params.checkpoint_id,
                feedback: params.feedback,
                completed_layers: completedLayers,
                partial_results: partialResults,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Approved - continue execution
    activeWorkflow.status = "running";
    activeWorkflow.lastActivityAt = new Date();

    // Extend TTL
    await extendWorkflowDAGExpiration(this.db, params.workflow_id);

    log.info(`Workflow ${params.workflow_id} approved at checkpoint ${params.checkpoint_id}`);

    // Continue to next layer
    return await this.processGeneratorUntilPause(
      params.workflow_id,
      activeWorkflow.executor,
      activeWorkflow.generator,
      activeWorkflow.dag,
      activeWorkflow.currentLayer + 1,
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
  private handleGetPrompt(_request: unknown): Promise<{ prompts: Array<unknown> }> {
    log.debug("prompts/get called (not implemented)");
    return Promise.resolve({
      prompts: [],
    });
  }

  /**
   * Generate hash of tool schema for change detection
   *
   * @param schema - Tool input schema object
   * @returns Hash string
   */
  private hashToolSchema(schema: unknown): string {
    const str = JSON.stringify(schema);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Track tool usage for cache invalidation (Story 3.7)
   *
   * Called by executor when a tool is invoked. Retrieves schema from DB
   * and tracks changes for cache invalidation.
   *
   * @param toolKey - Tool identifier (serverId:toolName)
   */
  public async trackToolUsage(toolKey: string): Promise<void> {
    try {
      const [serverId, ...toolNameParts] = toolKey.split(":");
      const toolName = toolNameParts.join(":");

      const rows = await this.db.query(
        `SELECT input_schema FROM tool_schema WHERE server_id = $1 AND name = $2`,
        [serverId, toolName],
      );

      if (rows.length > 0) {
        const schema = rows[0].input_schema;
        this.trackToolSchemaInternal(toolKey, schema);
      }
    } catch (error) {
      log.debug(`Failed to track tool schema for ${toolKey}: ${error}`);
    }
  }

  /**
   * Internal: Track tool schema for cache invalidation
   *
   * @param toolKey - Tool identifier (serverId:toolName)
   * @param schema - Tool input schema
   */
  private trackToolSchemaInternal(toolKey: string, schema: unknown): void {
    const schemaHash = this.hashToolSchema(schema);
    const previousHash = this.toolSchemaCache.get(toolKey);

    if (previousHash && previousHash !== schemaHash) {
      log.info(`Tool schema changed: ${toolKey}, cache will be invalidated`);
    }

    this.toolSchemaCache.set(toolKey, schemaHash);
  }

  /**
   * Build tool versions map for cache key generation (Story 3.7)
   *
   * @returns Map of tool names to version hashes
   */
  private buildToolVersionsMap(): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const [toolKey, schemaHash] of this.toolSchemaCache.entries()) {
      versions[toolKey] = schemaHash;
    }
    return versions;
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
    // Run initial health check
    await this.healthChecker.initialHealthCheck();

    // Start periodic health checks
    this.healthChecker.startPeriodicChecks();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    log.info("✓ AgentCards MCP gateway started (stdio mode)");
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info("  Claude Code can now connect to agentcards");
  }

  /**
   * Start gateway server with HTTP transport (ADR-014)
   *
   * Creates an HTTP server that accepts JSON-RPC requests via POST /message
   * and provides health checks via GET /health.
   *
   * @param port - Port number to listen on
   */
  async startHttp(port: number): Promise<void> {
    // Run initial health check
    await this.healthChecker.initialHealthCheck();

    // Start periodic health checks
    this.healthChecker.startPeriodicChecks();

    // Create HTTP server
    this.httpServer = Deno.serve({ port }, async (req) => {
      const url = new URL(req.url);

      // Health check endpoint
      if (url.pathname === "/health" && req.method === "GET") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // JSON-RPC message endpoint
      if (url.pathname === "/message" && req.method === "POST") {
        try {
          const body = await req.json();
          const response = await this.handleJsonRpcRequest(body);
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32700, message: `Parse error: ${error}` },
              id: null,
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    });

    log.info(`✓ AgentCards MCP gateway started (HTTP mode on port ${port})`);
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info(`  Endpoints: GET /health, POST /message`);
  }

  /**
   * Handle a JSON-RPC request directly (for HTTP transport)
   */
  private async handleJsonRpcRequest(request: {
    jsonrpc: string;
    id: number | string;
    method: string;
    params?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const { id, method, params } = request;

    try {
      if (method === "tools/list") {
        const result = await this.handleListTools(
          params as { query?: string; limit?: number } | undefined,
        );
        return { jsonrpc: "2.0", id, result };
      }

      if (method === "tools/call") {
        const result = await this.handleCallTool({ params });
        return { jsonrpc: "2.0", id, result };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: MCPErrorCodes.METHOD_NOT_FOUND, message: `Method not found: ${method}` },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: MCPErrorCodes.INTERNAL_ERROR, message: `${error}` },
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    log.info("Shutting down AgentCards gateway...");

    // Stop health checks
    this.healthChecker.stopPeriodicChecks();

    // Close HTTP server if running (ADR-014)
    if (this.httpServer) {
      await this.httpServer.shutdown();
      this.httpServer = null;
    }

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
