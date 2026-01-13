/**
 * Sandbox Executor
 *
 * Executes code in an isolated sandbox with hybrid MCP tool routing.
 * Client tools are executed locally, server tools are forwarded to cloud.
 *
 * Used by:
 * - Package-side execution when server returns `execute_locally`
 * - CapabilityLoader for sandboxed capability execution
 *
 * @module execution/sandbox-executor
 */

import * as log from "@std/log";
import { SandboxWorker } from "../sandbox/mod.ts";
import type { SandboxResult } from "../sandbox/mod.ts";
import { resolveToolRouting } from "../routing/mod.ts";
import type {
  SandboxExecutionResult,
  SandboxExecutorOptions,
  ToolCallHandler,
  ToolCallRecord,
} from "./types.ts";

/**
 * Log debug message for sandbox operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:sandbox-executor] ${message}`);
}

/**
 * Sandbox Executor for hybrid code execution.
 *
 * Creates isolated sandboxes and routes MCP tool calls based on
 * the routing configuration (client vs server).
 *
 * @example
 * ```ts
 * const executor = new SandboxExecutor({
 *   cloudUrl: "https://pml.casys.ai",
 *   apiKey: Deno.env.get("PML_API_KEY"),
 * });
 *
 * const result = await executor.execute(
 *   code,
 *   { arg1: "value" },
 *   async (toolId, args) => {
 *     // Handle client-side tool calls (e.g., filesystem)
 *     return await localToolHandler(toolId, args);
 *   },
 * );
 * ```
 */
export class SandboxExecutor {
  private readonly cloudUrl: string;
  private readonly apiKey?: string;
  private readonly executionTimeoutMs: number;
  private readonly rpcTimeoutMs: number;

  constructor(options: SandboxExecutorOptions) {
    this.cloudUrl = options.cloudUrl;
    this.apiKey = options.apiKey ?? Deno.env.get("PML_API_KEY");
    this.executionTimeoutMs = options.executionTimeoutMs ?? 300_000; // 5 min default
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 30_000; // 30s default
  }

  /**
   * Execute code in an isolated sandbox with hybrid routing.
   *
   * @param code - TypeScript code to execute
   * @param context - Context/arguments passed to the code
   * @param clientToolHandler - Handler for client-routed tool calls
   * @returns Execution result
   */
  async execute(
    code: string,
    context: Record<string, unknown>,
    clientToolHandler?: ToolCallHandler,
  ): Promise<SandboxExecutionResult> {
    logDebug(`Executing code in sandbox (${code.length} chars)`);

    const toolsCalled: string[] = [];
    const toolCallRecords: ToolCallRecord[] = [];
    const startTime = Date.now();

    // Create sandbox with hybrid RPC handler
    const sandbox = new SandboxWorker({
      onRpc: async (method: string, args: unknown) => {
        toolsCalled.push(method);
        const callStart = Date.now();
        let result: unknown;
        let success = true;
        try {
          result = await this.routeToolCall(method, args, clientToolHandler);
        } catch (error) {
          success = false;
          result = error instanceof Error ? error.message : String(error);
          throw error; // Re-throw to propagate the error
        } finally {
          toolCallRecords.push({
            tool: method,
            args,
            result,
            success,
            durationMs: Date.now() - callStart,
          });
        }
        return result;
      },
      executionTimeoutMs: this.executionTimeoutMs,
      rpcTimeoutMs: this.rpcTimeoutMs,
    });

    try {
      const result: SandboxResult = await sandbox.execute(code, context);

      const durationMs = Date.now() - startTime;

      if (!result.success) {
        logDebug(`Sandbox execution failed: ${result.error?.message}`);
        return {
          success: false,
          error: result.error,
          durationMs,
          toolsCalled,
          toolCallRecords,
        };
      }

      logDebug(`Sandbox execution completed in ${durationMs}ms`);
      return {
        success: true,
        value: result.value,
        durationMs,
        toolsCalled,
        toolCallRecords,
      };
    } finally {
      sandbox.shutdown();
    }
  }

  /**
   * Route a tool call based on routing configuration.
   *
   * @param toolId - Tool ID in format "namespace:action"
   * @param args - Tool arguments
   * @param clientHandler - Handler for client-routed calls
   * @returns Tool execution result
   */
  private async routeToolCall(
    toolId: string,
    args: unknown,
    clientHandler?: ToolCallHandler,
  ): Promise<unknown> {
    const routing = resolveToolRouting(toolId);

    logDebug(`Routing ${toolId} → ${routing}`);

    if (routing === "client") {
      if (!clientHandler) {
        throw new Error(
          `Client tool ${toolId} requires handler but none provided`,
        );
      }
      return clientHandler(toolId, args);
    }

    // Server routing - forward to cloud
    return this.callServer(toolId, args);
  }

  /**
   * Forward a tool call to the cloud server.
   */
  private async callServer(toolId: string, args: unknown): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error(
        "PML_API_KEY required for cloud calls. Set it in environment.",
      );
    }

    logDebug(`Cloud call: ${toolId}`);

    const response = await fetch(`${this.cloudUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolId,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Cloud error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Cloud RPC error: ${data.error.message}`);
    }

    return data.result;
  }
}
