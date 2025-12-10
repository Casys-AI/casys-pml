/**
 * MCP Gateway Server
 *
 * Exposes Casys Intelligence functionality via MCP protocol (stdio transport)
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
import { DenoSandboxExecutor, type WorkerExecutionConfig } from "../sandbox/executor.ts";
import { ContextBuilder } from "../sandbox/context-builder.ts";
// TraceEvent imported from sandbox/types.ts is now used via executeWithTools result
import { addBreadcrumb, captureError, startTransaction } from "../telemetry/sentry.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import type { AdaptiveThresholdManager } from "./adaptive-threshold.ts";
import { hashCode } from "../capabilities/hash.ts";
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
import { EventsStreamManager } from "../server/events-stream.ts";
import { logAuthMode, validateRequest } from "../lib/auth.ts";
import { RateLimiter } from "../utils/rate-limiter.ts";
import { getRateLimitKey } from "../lib/rate-limiter-helpers.ts";

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

// ============================================
// Story 7.1b: Native Tracing via Worker RPC Bridge
// ============================================
// The parseTraces() function from Story 7.1 has been removed.
// Tracing is now handled natively in WorkerBridge (src/sandbox/worker-bridge.ts).
// See ADR-032 for details on the Worker RPC Bridge architecture.

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
 * Transparent gateway that exposes Casys Intelligence as a single MCP server.
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

export class CasysIntelligenceGatewayServer {
  private server: Server;
  private gatewayHandler: GatewayHandler;
  private healthChecker: HealthChecker;
  private config: Required<GatewayServerConfig>;
  private contextBuilder: ContextBuilder;
  private toolSchemaCache: Map<string, string> = new Map(); // serverId:toolName → schema hash
  private httpServer: Deno.HttpServer | null = null; // HTTP server for SSE transport (ADR-014)
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map(); // Story 2.5-4
  private checkpointManager: CheckpointManager | null = null; // Story 2.5-4
  private eventsStream: EventsStreamManager | null = null; // Story 6.1: Real-time graph events

  constructor(
    // @ts-ignore: db kept for future use (direct queries)
    private db: PGliteClient,
    private vectorSearch: VectorSearch,
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    private executor: ParallelExecutor,
    private mcpClients: Map<string, MCPClient>,
    // Optional for backward compatibility, but required for Story 7.3a features
    private capabilityStore?: CapabilityStore,
    private adaptiveThresholdManager?: AdaptiveThresholdManager,
    config?: GatewayServerConfig,
  ) {
    // Merge config with defaults
    this.config = {
      name: config?.name ?? "mcp-gateway",
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
        title: "Multi-tool DAG orchestration, semantic tool search, sandboxed code execution",
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    // Initialize Gateway Handler (ADR-030: pass mcpClients for real execution)
    this.gatewayHandler = new GatewayHandler(
      this.graphEngine,
      this.dagSuggester,
      this.mcpClients, // ADR-030: enable real tool execution
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
    | { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
    | {
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
        name: "cai:execute_dag",
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
        name: "cai:search_tools",
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

      // Add search_capabilities tool (Story 7.3a)
      const searchCapabilitiesTool: MCPTool = {
        name: "cai:search_capabilities",
        description:
          "Search for existing learned capabilities (code patterns) matching your intent. Returns capabilities that can be executed directly to solve your problem.",
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: "Natural language description of what you want to accomplish",
            },
            include_suggestions: {
              type: "boolean",
              description: "Include related capability suggestions from the graph (default: false)",
            },
          },
          required: ["intent"],
        },
      };

      // Add code execution tool (Story 3.4)
      const executeCodeTool: MCPTool = {
        name: "cai:execute_code",
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
        name: "cai:continue",
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
        name: "cai:abort",
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
        name: "cai:replan",
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
        name: "cai:approval_response",
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
          searchCapabilitiesTool,
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
   * - DAG execution: Executes via Casys Intelligence DAG engine ("cai:execute_dag")
   * - Control tools: continue, abort, replan_dag, approval_response (Story 2.5-4)
   *
   * @param request - MCP request with params.name and params.arguments
   * @returns Tool execution result
   */
  private async handleCallTool(
    request: unknown,
    userId?: string, // Story 9.5: Multi-tenant isolation
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
      if (name === "cai:execute_dag") {
        const result = await this.handleWorkflowExecution(args, userId);
        transaction.finish();
        return result;
      }

      // Story 2.5-4: Control tools for per-layer validation
      if (name === "cai:continue") {
        const result = await this.handleContinue(args);
        transaction.finish();
        return result;
      }

      if (name === "cai:abort") {
        const result = await this.handleAbort(args);
        transaction.finish();
        return result;
      }

      if (name === "cai:replan") {
        const result = await this.handleReplan(args);
        transaction.finish();
        return result;
      }

      if (name === "cai:approval_response") {
        const result = await this.handleApprovalResponse(args);
        transaction.finish();
        return result;
      }

      // Check if this is a code execution request (Story 3.4)
      if (name === "cai:execute_code") {
        const result = await this.handleExecuteCode(args);
        transaction.finish();
        return result;
      }

      // Check if this is a search_tools request (Spike: search-tools-graph-traversal)
      if (name === "cai:search_tools") {
        const result = await this.handleSearchTools(args);
        transaction.finish();
        return result;
      }

      // Check if this is a search_capabilities request (Story 7.3a)
      if (name === "cai:search_capabilities") {
        const result = await this.handleSearchCapabilities(args);
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
    userId?: string, // Story 9.5: Multi-tenant isolation
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

      // Normalize tasks: ensure dependsOn is always an array (API boundary validation)
      // Root tasks without dependencies may omit dependsOn field
      const normalizedWorkflow: DAGStructure = {
        ...workflowArgs.workflow,
        tasks: workflowArgs.workflow.tasks.map((task) => ({
          ...task,
          dependsOn: task.dependsOn ?? [],
        })),
      };

      // Story 2.5-4: Per-layer validation mode
      if (perLayerValidation) {
        return await this.executeWithPerLayerValidation(
          normalizedWorkflow,
          workflowArgs.intent ?? "explicit_workflow",
          userId, // Story 9.5: Multi-tenant isolation
        );
      }

      // Standard execution (no validation pauses)
      const result = await this.executor.execute(normalizedWorkflow);

      // Update graph with execution data (learning loop)
      await this.graphEngine.updateFromExecution({
        executionId: crypto.randomUUID(),
        executedAt: new Date(),
        intentText: workflowArgs.intent ?? "",
        dagStructure: normalizedWorkflow,
        success: result.errors.length === 0,
        executionTimeMs: result.executionTimeMs,
        userId: userId ?? "local", // Story 9.5: Multi-tenant isolation
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "completed",
                results: result.results,
                executionTimeMs: result.executionTimeMs,
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
            userId, // Story 9.5: Multi-tenant isolation
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
                  executionTimeMs: executionMode.executionTimeMs,
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
    userId?: string, // Story 9.5: Multi-tenant isolation
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
      { taskTimeout: 30000, userId: userId ?? "local" }, // Story 9.5: Multi-tenant isolation
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
        totalLayers = event.totalLayers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.taskId ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { executionTimeMs: event.executionTimeMs }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpointId ?? null;
        currentLayer = event.layerIndex ?? 0;

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
                  total_time_ms: event.totalTimeMs,
                  successful_tasks: event.successfulTasks,
                  failed_tasks: event.failedTasks,
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
   * Handle search_tools request (Story 5.2 / ADR-022: Refactored)
   *
   * Delegates to GraphRAGEngine.searchToolsHybrid() for centralized hybrid search logic.
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

    // ADR-022: Delegate to centralized hybrid search in GraphRAGEngine
    const hybridResults = await this.graphEngine.searchToolsHybrid(
      this.vectorSearch,
      query,
      limit,
      contextTools,
      includeRelated,
    );

    if (hybridResults.length === 0) {
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

    // Map to MCP response format (snake_case for external API)
    const results = hybridResults.map((result) => ({
      tool_id: result.toolId,
      server_id: result.serverId,
      description: result.description,
      semantic_score: result.semanticScore,
      graph_score: result.graphScore,
      final_score: result.finalScore,
      related_tools: result.relatedTools?.map((rt) => ({
        tool_id: rt.toolId,
        relation: rt.relation,
        score: rt.score,
      })) || [],
    }));

    // Get meta info from graph engine
    const edgeCount = this.graphEngine.getEdgeCount();
    const nodeCount = this.graphEngine.getStats().nodeCount;
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
    const alpha = Math.max(0.5, 1.0 - density * 2);

    log.info(
      `search_tools: found ${results.length} results (alpha=${
        alpha.toFixed(2)
      }, edges=${edgeCount})`,
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          {
            tools: results,
            meta: {
              query,
              alpha: Math.round(alpha * 100) / 100,
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
   * Handle search_capabilities request (Story 7.3a)
   *
   * Delegates to DAGSuggester.searchCapabilities() for capability matching.
   * Matches capabilities using semantic similarity * reliability score.
   *
   * @param args - Search arguments (intent, include_suggestions)
   * @returns Capability matches formatted for Claude
   */
  private async handleSearchCapabilities(
    args: unknown,
  ): Promise<
    | { content: Array<{ type: string; text: string }> }
    | { error: { code: number; message: string; data?: unknown } }
  > {
    const transaction = startTransaction("mcp.capabilities.search", "mcp");
    try {
      const params = args as {
        intent?: string;
        include_suggestions?: boolean;
      };

      if (!params.intent || typeof params.intent !== "string") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Missing required parameter: 'intent'",
            }),
          }],
        };
      }

      const intent = params.intent;
      transaction.setData("intent", intent);
      addBreadcrumb("mcp", "Processing search_capabilities request", { intent });

      log.info(`search_capabilities: "${intent}"`);

      // 1. Search for capability match via DAGSuggester
      // Note: DAGSuggester orchestrates the CapabilityMatcher
      const match = await this.dagSuggester.searchCapabilities(intent);

      // 2. Format response (AC5)
      const response = {
        capabilities: match
          ? [{
            id: match.capability.id,
            name: match.capability.name,
            description: match.capability.description,
            code_snippet: match.capability.codeSnippet,
            parameters_schema: match.parametersSchema,
            success_rate: match.capability.successRate,
            usage_count: match.capability.usageCount,
            score: match.score, // Final score (Semantic * Reliability)
            semantic_score: match.semanticScore,
          }]
          : [],
        suggestions: [], // To be implemented in Story 7.4 (Strategic Discovery)
        threshold_used: match?.thresholdUsed ?? 0,
        total_found: match ? 1 : 0,
      };

      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2),
        }],
      };
    } catch (error) {
      log.error(`search_capabilities error: ${error}`);
      captureError(error as Error, {
        operation: "capabilities/search",
        handler: "handleSearchCapabilities",
      });
      transaction.finish();
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Capability search failed: ${(error as Error).message}`,
      );
    }
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

      // Build execution context (for non-tool variables)
      const executionContext = request.context || {};

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

      // Story 7.1b: Use Worker RPC Bridge for tool execution with native tracing
      let toolDefinitions: import("../sandbox/types.ts").ToolDefinition[] = [];
      let toolsCalled: string[] = [];

      // Intent-based mode: Use vector search to discover tools
      if (request.intent) {
        log.debug("Intent-based mode: discovering relevant tools for Worker RPC bridge");

        // Vector search for relevant tools (top 5)
        const toolResults = await this.vectorSearch.searchTools(request.intent, 5, 0.6);

        if (toolResults.length > 0) {
          log.debug(`Found ${toolResults.length} relevant tools for intent`);

          // Build tool definitions for Worker RPC bridge (Story 7.1b)
          toolDefinitions = this.contextBuilder.buildToolDefinitions(toolResults);
        } else {
          log.warn("No relevant tools found for intent (similarity threshold not met)");
        }
      }

      // Execute code using Worker RPC bridge (Story 7.1b: native tracing)
      const startTime = performance.now();
      const workerConfig: WorkerExecutionConfig = {
        toolDefinitions,
        mcpClients: this.mcpClients,
      };

      const result = await executor.executeWithTools(
        request.code,
        workerConfig,
        executionContext,
      );
      const executionTimeMs = performance.now() - startTime;

      // Handle capability feedback (Story 7.3a / AC6)
      if (this.capabilityStore && this.adaptiveThresholdManager && result.success) {
        try {
          // Identify if executed code matches a known capability
          const codeHash = await hashCode(request.code);
          const capability = await this.capabilityStore.findByCodeHash(codeHash);

          if (capability) {
            // Update usage stats
            await this.capabilityStore.updateUsage(codeHash, true, executionTimeMs);

            // Record execution for adaptive learning
            // Use intent similarity if available, otherwise fallback to success rate
            let confidence = capability.successRate;
            if (request.intent) {
              // Re-calculate similarity would be expensive here without vector search results
              // Just use successRate as a proxy for "confidence in this capability"
              // Or if we had the match result passed in, we'd use that.
              // For now, successRate is a reasonable proxy for established capabilities.
            }

            this.adaptiveThresholdManager.recordExecution({
              mode: "speculative", // Treat user execution of capability as "speculative" confirmation?
              // Actually, if user runs it, it's "manual" or "explicit".
              // But AC6 says "mode: speculative".
              // If we treat it as speculative, we confirm the system's "suggestion" (the search result).
              confidence: confidence,
              success: true,
              executionTime: executionTimeMs,
              timestamp: Date.now(),
            });

            log.info(`[Story 7.3a] Capability feedback recorded`, { id: capability.id });
          }
        } catch (err) {
          log.warn(`[Story 7.3a] Failed to record capability feedback: ${err}`);
        }
      }

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
            executionTimeMs: executionTimeMs,
          },
        );
      }

      // Story 7.1b: Use native traces from Worker RPC bridge (replaces stdout parsing)
      let trackedToolsCount = 0;
      if (result.toolsCalled && result.toolsCalled.length > 0) {
        toolsCalled = result.toolsCalled;
        log.info(`[Story 7.1b] Tracked ${toolsCalled.length} tool calls via native tracing`, {
          tools: toolsCalled,
        });

        // Build WorkflowExecution from traced tool calls
        const tracedDAG = {
          tasks: toolsCalled.map((tool, index) => ({
            id: `traced_${index}`,
            tool,
            arguments: {},
            dependsOn: index > 0 ? [`traced_${index - 1}`] : [], // Sequential dependency assumption
          })),
        };

        // Update GraphRAG with execution data
        await this.graphEngine.updateFromExecution({
          executionId: crypto.randomUUID(),
          executedAt: new Date(),
          intentText: request.intent ?? "code_execution",
          dagStructure: tracedDAG,
          success: true,
          executionTimeMs: executionTimeMs,
        });

        trackedToolsCount = toolsCalled.length;
      }

      // Log native trace stats (Story 7.1b)
      if (result.traces && result.traces.length > 0) {
        log.debug(`[Story 7.1b] Captured ${result.traces.length} native trace events`);
      }

      // Calculate output size
      const outputSizeBytes = new TextEncoder().encode(
        JSON.stringify(result.result),
      ).length;

      // Build response (Story 7.1b: traces are kept internal, not exposed to user)
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
        trackedTools: trackedToolsCount, // Story 7.1b: native tracing
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
        totalLayers = event.totalLayers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.taskId ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { executionTimeMs: event.executionTimeMs }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpointId ?? null;
        currentLayer = event.layerIndex ?? currentLayer;

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
                  total_time_ms: event.totalTimeMs,
                  successful_tasks: event.successfulTasks,
                  failed_tasks: event.failedTasks,
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

    log.info("✓ Casys Intelligence MCP gateway started (stdio mode)");
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info("  Claude Code can now connect to cai");
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

    // Initialize events stream manager (Story 6.1, Story 6.5: uses EventBus)
    this.eventsStream = new EventsStreamManager();
    log.info(`✓ EventsStreamManager initialized with EventBus`);

    // Story 9.3: Log auth mode at startup (AC #5)
    logAuthMode("API Server");

    // Story 9.5: Rate limiters per endpoint (cloud mode only)
    const RATE_LIMITERS = {
      mcp: new RateLimiter(100, 60000),  // 100 req/min for MCP gateway
      api: new RateLimiter(200, 60000),  // 200 req/min for API routes (graph, executions)
    };

    // CORS headers for Fresh dashboard (runs on different port)
    // Prod: https://DOMAIN, Dev: http://localhost:FRESH_PORT
    const getAllowedOrigin = (): string => {
      const domain = Deno.env.get("DOMAIN");
      if (domain) return `https://${domain}`;
      const dashboardPort = Deno.env.get("FRESH_PORT") || "8081";
      return `http://localhost:${dashboardPort}`;
    };
    const allowedOrigin = getAllowedOrigin();
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    };
    log.info(`✓ CORS configured for origin: ${allowedOrigin}`);

    // Create HTTP server
    this.httpServer = Deno.serve({ port }, async (req) => {
      const url = new URL(req.url);

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Story 9.3: Auth validation for protected routes
      const PUBLIC_ROUTES = ["/health"];
      let authResult = null;
      if (!PUBLIC_ROUTES.includes(url.pathname)) {
        authResult = await validateRequest(req);
        if (!authResult) {
          return new Response(
            JSON.stringify({
              error: "Unauthorized",
              message: "Valid API key required",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        // Story 9.5: Rate limiting per user_id (cloud mode) or IP/shared (local mode)
        const clientIp = req.headers.get("x-forwarded-for") ||
                        req.headers.get("cf-connecting-ip") ||
                        "unknown";
        const rateLimitKey = getRateLimitKey(authResult, clientIp);

        // Select rate limiter based on endpoint
        let limiter: RateLimiter | null = null;
        if (url.pathname === "/mcp") {
          limiter = RATE_LIMITERS.mcp;
        } else if (url.pathname.startsWith("/api/")) {
          limiter = RATE_LIMITERS.api;
        }
        // No limiter for /health and /events/stream

        // Check rate limit
        if (limiter && !(await limiter.checkLimit(rateLimitKey))) {
          log.warn(`Rate limit exceeded for ${rateLimitKey} on ${url.pathname}`);
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded",
              message: "Too many requests. Please try again later.",
              retryAfter: 60,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "60",
                ...corsHeaders,
              },
            },
          );
        }
      }

      // MCP Streamable HTTP endpoint (for Claude Code HTTP transport)
      // Spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
      if (url.pathname === "/mcp") {
        // POST: Client-to-server JSON-RPC messages
        if (req.method === "POST") {
          try {
            const body = await req.json();
            const response = await this.handleJsonRpcRequest(body, authResult?.user_id);
            return new Response(JSON.stringify(response), {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
              },
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ error: `Invalid request: ${error}` }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
        }
        // GET: Server-to-client SSE stream
        if (req.method === "GET") {
          if (!this.eventsStream) {
            return new Response(
              JSON.stringify({ error: "Events stream not initialized" }),
              { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
          return this.eventsStream.handleRequest(req);
        }
        // Method not allowed
        return new Response(null, { status: 405, headers: corsHeaders });
      }

      // Health check endpoint
      if (url.pathname === "/health" && req.method === "GET") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Server-Sent Events stream for graph events (Story 6.1)
      if (url.pathname === "/events/stream" && req.method === "GET") {
        if (!this.eventsStream) {
          return new Response(
            JSON.stringify({ error: "Events stream not initialized" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
        return this.eventsStream.handleRequest(req);
      }

      // Dashboard redirect to Fresh (Story 6.2 migrated to Fresh)
      if (url.pathname === "/dashboard" && req.method === "GET") {
        return new Response(null, {
          status: 302,
          headers: { "Location": "http://localhost:8080/dashboard" },
        });
      }

      // Graph snapshot API (Story 6.2)
      if (url.pathname === "/api/graph/snapshot" && req.method === "GET") {
        try {
          const snapshot = this.graphEngine.getGraphSnapshot();
          return new Response(JSON.stringify(snapshot), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to get graph snapshot: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Path Finding API (Story 6.4 AC4)
      if (url.pathname === "/api/graph/path" && req.method === "GET") {
        try {
          const from = url.searchParams.get("from") || "";
          const to = url.searchParams.get("to") || "";

          if (!from || !to) {
            return new Response(
              JSON.stringify({ error: "Missing required parameters: 'from' and 'to'" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const path = this.graphEngine.findShortestPath(from, to);
          return new Response(
            JSON.stringify({
              path: path || [],
              total_hops: path ? path.length - 1 : -1,
              from,
              to,
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Path finding failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Related Tools API (Story 6.4 AC6 - Adamic-Adar)
      if (url.pathname === "/api/graph/related" && req.method === "GET") {
        try {
          const toolId = url.searchParams.get("tool_id") || "";
          const limit = parseInt(url.searchParams.get("limit") || "5", 10);

          if (!toolId) {
            return new Response(
              JSON.stringify({ error: "Missing required parameter: 'tool_id'" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const related = this.graphEngine.computeAdamicAdar(toolId, limit);

          // Enrich with server info and edge data
          const enrichedRelated = related.map((r) => {
            const edgeData = this.graphEngine.getEdgeData(toolId, r.toolId) ||
              this.graphEngine.getEdgeData(r.toolId, toolId);

            // Extract server and name from tool_id
            let server = "unknown";
            let name = r.toolId;
            if (r.toolId.includes(":")) {
              const colonIndex = r.toolId.indexOf(":");
              server = r.toolId.substring(0, colonIndex);
              name = r.toolId.substring(colonIndex + 1);
            }

            return {
              tool_id: r.toolId,
              name,
              server,
              adamic_adar_score: Math.round(r.score * 1000) / 1000,
              edge_confidence: edgeData?.weight ?? null,
            };
          });

          return new Response(
            JSON.stringify({
              tool_id: toolId,
              related: enrichedRelated,
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Related tools lookup failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Search Tools API (Story 6.4 AC10)
      if (url.pathname === "/api/tools/search" && req.method === "GET") {
        try {
          const q = url.searchParams.get("q") || "";
          const limit = parseInt(url.searchParams.get("limit") || "10", 10);

          if (q.length < 2) {
            return new Response(
              JSON.stringify({ results: [], total: 0 }),
              { headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const results = this.graphEngine.searchToolsForAutocomplete(q, limit);
          return new Response(
            JSON.stringify({ results, total: results.length }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Search failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Metrics API (Story 6.3)
      if (url.pathname === "/api/metrics" && req.method === "GET") {
        try {
          const range = url.searchParams.get("range") || "24h";
          // Validate range parameter
          if (range !== "1h" && range !== "24h" && range !== "7d") {
            return new Response(
              JSON.stringify({
                error: `Invalid range parameter: ${range}. Must be one of: 1h, 24h, 7d`,
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
          const metrics = await this.graphEngine.getMetrics(range as "1h" | "24h" | "7d");
          return new Response(JSON.stringify(metrics), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to get metrics: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // JSON-RPC message endpoint
      if (url.pathname === "/message" && req.method === "POST") {
        try {
          const body = await req.json();
          const response = await this.handleJsonRpcRequest(body, authResult?.user_id);
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

    log.info(`✓ Casys Intelligence MCP gateway started (HTTP mode on port ${port})`);
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info(
      `  Endpoints: GET /health, GET /events/stream, GET /dashboard, GET /api/graph/snapshot, GET /api/metrics, POST /message`,
    );
  }

  /**
   * Handle a JSON-RPC request directly (for HTTP transport)
   */
  private async handleJsonRpcRequest(
    request: {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: Record<string, unknown>;
    },
    userId?: string, // Story 9.5: Multi-tenant isolation
  ): Promise<Record<string, unknown>> {
    const { id, method, params } = request;

    try {
      // MCP initialize handshake
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: { listChanged: true },
            },
            serverInfo: {
              name: this.config.name || "mcp-gateway",
              title: "Multi-tool DAG orchestration, semantic tool search, sandboxed code execution",
              version: this.config.version || "1.0.0",
            },
          },
        };
      }

      // MCP initialized notification (no response needed but we ack it)
      if (method === "notifications/initialized") {
        return { jsonrpc: "2.0", id, result: {} };
      }

      if (method === "tools/list") {
        const result = await this.handleListTools({ params });
        return { jsonrpc: "2.0", id, result };
      }

      if (method === "tools/call") {
        const result = await this.handleCallTool({ params }, userId);
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
    log.info("Shutting down Casys Intelligence gateway...");

    // Stop health checks
    this.healthChecker.stopPeriodicChecks();

    // Close events stream (Story 6.1)
    if (this.eventsStream) {
      this.eventsStream.close();
      this.eventsStream = null;
    }

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
