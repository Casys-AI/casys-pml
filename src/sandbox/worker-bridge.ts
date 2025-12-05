/**
 * Worker RPC Bridge - Native Tool Tracing via Web Workers
 *
 * Story 7.1b / ADR-032: Replaces subprocess-based sandbox with Web Worker + RPC bridge.
 *
 * Architecture:
 * - WorkerBridge (this file): Main process coordinator
 * - SandboxWorker: Worker script that executes user code
 * - RPC Protocol: postMessage-based tool invocation
 *
 * Benefits:
 * - MCP tools work in sandbox (proxies instead of serialized functions)
 * - Native tracing (no stdout parsing)
 * - Structured RPC communication
 *
 * @module sandbox/worker-bridge
 */

import type { MCPClient } from "../mcp/client.ts";
import type {
  ExecutionResult,
  ToolDefinition,
  TraceEvent,
  RPCCallMessage,
  RPCResultMessage,
  InitMessage,
  ExecutionCompleteMessage,
  WorkerToBridgeMessage,
} from "./types.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Configuration for WorkerBridge
 */
export interface WorkerBridgeConfig {
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout?: number;
  /** RPC call timeout in milliseconds (default: 10000) */
  rpcTimeout?: number;
  /** Optional CapabilityStore for eager learning (Story 7.2a) */
  capabilityStore?: CapabilityStore;
}

/**
 * Default configuration values
 */
const DEFAULTS = {
  TIMEOUT_MS: 30000,
  RPC_TIMEOUT_MS: 10000,
} as const;

/**
 * WorkerBridge - RPC Bridge for Sandbox Code Execution
 *
 * Coordinates between main process (MCP clients) and Worker (sandbox code).
 * All tool calls are traced natively in the bridge, not via stdout parsing.
 *
 * @example
 * ```typescript
 * const bridge = new WorkerBridge(mcpClients);
 * const toolDefs = buildToolDefinitions(searchResults);
 * const result = await bridge.execute(code, toolDefs, context);
 * const traces = bridge.getTraces(); // Native tracing!
 * ```
 */
export class WorkerBridge {
  private config: Omit<Required<WorkerBridgeConfig>, "capabilityStore">;
  private capabilityStore?: CapabilityStore;
  private worker: Worker | null = null;
  private traces: TraceEvent[] = [];
  private pendingRPCs: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = new Map();
  private completionPromise: {
    resolve: (result: ExecutionResult) => void;
    reject: (error: Error) => void;
  } | null = null;
  private startTime: number = 0;
  private lastExecutedCode: string = "";
  private lastIntent?: string;

  constructor(
    private mcpClients: Map<string, MCPClient>,
    config?: WorkerBridgeConfig,
  ) {
    this.config = {
      timeout: config?.timeout ?? DEFAULTS.TIMEOUT_MS,
      rpcTimeout: config?.rpcTimeout ?? DEFAULTS.RPC_TIMEOUT_MS,
    };
    this.capabilityStore = config?.capabilityStore;

    logger.debug("WorkerBridge initialized", {
      mcpClientsCount: mcpClients.size,
      timeout: this.config.timeout,
      rpcTimeout: this.config.rpcTimeout,
      capabilityStoreEnabled: !!this.capabilityStore,
    });
  }

  /**
   * Execute code in Worker sandbox with RPC bridge for tool calls
   *
   * @param code TypeScript code to execute
   * @param toolDefinitions Tool definitions for proxy generation
   * @param context Optional context variables to inject (may include 'intent' for capability learning)
   * @returns Execution result with traces available via getTraces()
   */
  async execute(
    code: string,
    toolDefinitions: ToolDefinition[],
    context?: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    this.startTime = performance.now();
    this.traces = []; // Reset traces for new execution
    this.lastExecutedCode = code;
    this.lastIntent = context?.intent as string | undefined;

    try {
      logger.debug("Starting Worker execution", {
        codeLength: code.length,
        toolCount: toolDefinitions.length,
        contextKeys: context ? Object.keys(context) : [],
      });

      // 1. Spawn Worker with no permissions (sandboxed)
      const workerUrl = new URL("./sandbox-worker.ts", import.meta.url).href;
      this.worker = new Worker(workerUrl, {
        type: "module",
        // @ts-ignore: Deno-specific Worker option for permissions
        deno: { permissions: "none" },
      });

      // 2. Setup message handler
      this.worker.onmessage = (e: MessageEvent<WorkerToBridgeMessage>) => {
        this.handleWorkerMessage(e.data);
      };

      this.worker.onerror = (e: ErrorEvent) => {
        logger.error("Worker error", { message: e.message });
        if (this.completionPromise) {
          this.completionPromise.reject(new Error(`Worker error: ${e.message}`));
        }
      };

      // 3. Create completion promise
      const result = await new Promise<ExecutionResult>((resolve, reject) => {
        this.completionPromise = { resolve, reject };

        // Setup overall timeout
        const timeoutId = setTimeout(() => {
          this.terminate();
          reject(new Error("TIMEOUT"));
        }, this.config.timeout);

        // Send init message
        const initMessage: InitMessage = {
          type: "init",
          code,
          toolDefinitions,
          context,
        };

        this.worker!.postMessage(initMessage);

        // Clear timeout on completion (handled in handleWorkerMessage)
        this.completionPromise.resolve = (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        };
      });

      logger.info("Worker execution completed", {
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        tracesCount: this.traces.length,
      });

      // Eager Learning: Save capability after successful execution (Story 7.2a)
      if (result.success && this.capabilityStore && this.lastIntent) {
        try {
          await this.capabilityStore.saveCapability({
            code: this.lastExecutedCode,
            intent: this.lastIntent,
            durationMs: result.executionTimeMs,
            success: true,
            toolsUsed: this.getToolsCalled(),
          });
          logger.debug("Capability saved via eager learning", {
            intent: this.lastIntent.substring(0, 50),
            toolsUsed: this.getToolsCalled().length,
          });
        } catch (capError) {
          // Don't fail execution if capability storage fails
          logger.warn("Failed to save capability", {
            error: capError instanceof Error ? capError.message : String(capError),
          });
        }
      }

      return result;
    } catch (error) {
      const executionTimeMs = performance.now() - this.startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.debug("Worker execution failed", {
        error: errorMessage,
        executionTimeMs,
      });

      // Map error types
      if (errorMessage.includes("TIMEOUT")) {
        return {
          success: false,
          error: {
            type: "TimeoutError",
            message: `Execution exceeded timeout of ${this.config.timeout}ms`,
          },
          executionTimeMs,
        };
      }

      return {
        success: false,
        error: {
          type: "RuntimeError",
          message: errorMessage,
        },
        executionTimeMs,
      };
    } finally {
      this.terminate();
    }
  }

  /**
   * Handle messages from Worker
   */
  private handleWorkerMessage(msg: WorkerToBridgeMessage): void {
    if (msg.type === "rpc_call") {
      this.handleRPCCall(msg as RPCCallMessage);
    } else if (msg.type === "execution_complete") {
      this.handleExecutionComplete(msg as ExecutionCompleteMessage);
    }
  }

  /**
   * Handle RPC call from Worker - route to MCPClient with native tracing
   */
  private async handleRPCCall(msg: RPCCallMessage): Promise<void> {
    const { id, server, tool, args } = msg;
    const toolId = `${server}:${tool}`;
    const startTime = Date.now();

    // TRACE START - native tracing in bridge!
    this.traces.push({
      type: "tool_start",
      tool: toolId,
      trace_id: id,
      ts: startTime,
    });

    logger.debug("RPC call received", { id, server, tool, argsKeys: Object.keys(args) });

    try {
      const client = this.mcpClients.get(server);
      if (!client) {
        throw new Error(`MCP server "${server}" not connected`);
      }

      const result = await client.callTool(tool, args);

      // TRACE END - success
      this.traces.push({
        type: "tool_end",
        tool: toolId,
        trace_id: id,
        ts: Date.now(),
        success: true,
        duration_ms: Date.now() - startTime,
      });

      // Send result back to Worker
      const response: RPCResultMessage = {
        type: "rpc_result",
        id,
        success: true,
        result,
      };
      this.worker?.postMessage(response);

      logger.debug("RPC call succeeded", { id, tool: toolId, duration_ms: Date.now() - startTime });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // TRACE END - failure
      this.traces.push({
        type: "tool_end",
        tool: toolId,
        trace_id: id,
        ts: Date.now(),
        success: false,
        duration_ms: Date.now() - startTime,
        error: errorMessage,
      });

      // Send error back to Worker
      const response: RPCResultMessage = {
        type: "rpc_result",
        id,
        success: false,
        error: errorMessage,
      };
      this.worker?.postMessage(response);

      logger.debug("RPC call failed", { id, tool: toolId, error: errorMessage });
    }
  }

  /**
   * Handle execution complete message from Worker
   */
  private handleExecutionComplete(msg: ExecutionCompleteMessage): void {
    const executionTimeMs = performance.now() - this.startTime;

    if (this.completionPromise) {
      if (msg.success) {
        this.completionPromise.resolve({
          success: true,
          result: msg.result,
          executionTimeMs,
        });
      } else {
        this.completionPromise.resolve({
          success: false,
          error: {
            type: "RuntimeError",
            message: msg.error || "Unknown error",
          },
          executionTimeMs,
        });
      }
    }
  }

  /**
   * Get all trace events from the execution
   * These are captured natively in the bridge, not via stdout parsing.
   */
  getTraces(): TraceEvent[] {
    return [...this.traces];
  }

  /**
   * Get list of successfully called tools (for GraphRAG integration)
   */
  getToolsCalled(): string[] {
    const toolsCalled = new Set<string>();

    for (const trace of this.traces) {
      if (trace.type === "tool_end" && trace.success) {
        toolsCalled.add(trace.tool);
      }
    }

    return Array.from(toolsCalled);
  }

  /**
   * Terminate the Worker and cleanup resources
   */
  terminate(): void {
    // Cancel pending RPC calls
    for (const [id, pending] of this.pendingRPCs) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Worker terminated"));
      this.pendingRPCs.delete(id);
    }

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    logger.debug("WorkerBridge terminated", { tracesCount: this.traces.length });
  }
}
