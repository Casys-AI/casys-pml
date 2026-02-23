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
 * ## UI Collection (Story 16.3 — re-wired Epic 16)
 *
 * Per SEP-1865, both `tools/list` (static) and `tools/call` (dynamic) can carry
 * `_meta.ui`. The sandbox collects UI metadata from tool call responses using
 * `extractUiMeta()`. This enables the package-side MCP path (Option B) to
 * return `_meta.ui` to clients (Claude Desktop, Cursor, etc.).
 *
 * Server-side collection via `UiCollector` handles the dashboard path (Option A)
 * separately — no duplication.
 *
 * @module execution/sandbox-executor
 */

import * as log from "@std/log";
import { uuidv7 } from "../utils/uuid.ts";
import { SandboxWorker } from "../sandbox/mod.ts";
import type { SandboxResult } from "../sandbox/mod.ts";
import { resolveToolRouting } from "../routing/mod.ts";
import type {
  SandboxExecuteOptions,
  SandboxExecutionResult,
  SandboxExecutorOptions,
  ToolCallHandler,
  ToolCallRecord,
} from "./types.ts";
import { extractUiMeta, extractResultData } from "./ui-utils.ts";
import type { CollectedUiResource } from "../types/ui-orchestration.ts";

/**
 * Log debug message for sandbox operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:sandbox-executor] ${message}`);
}

/**
 * Context for RPC call handling.
 * Groups mutable state accessed during tool call processing.
 */
interface RpcCallContext {
  clientToolHandler: ToolCallHandler | undefined;
  traceId: string;
  fqdnMap: Map<string, string> | undefined;
  toolsCalled: string[];
  toolCallRecords: ToolCallRecord[];
  /** Story 16.3: UI resources collected from tool responses */
  collectedUi: CollectedUiResource[];
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
  private readonly onUiCollected?: (ui: CollectedUiResource, parsedResult: unknown) => void;

  constructor(options: SandboxExecutorOptions) {
    this.cloudUrl = options.cloudUrl;
    this.apiKey = options.apiKey ?? Deno.env.get("PML_API_KEY");
    this.executionTimeoutMs = options.executionTimeoutMs ?? 300_000; // 5 min default
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 30_000; // 30s default
    this.onUiCollected = options.onUiCollected;
  }

  /**
   * Execute code in an isolated sandbox with hybrid routing.
   *
   * @param code - TypeScript code to execute
   * @param options - Execution options (context, handlers, fqdnMap)
   * @returns Execution result
   */
  async execute(
    code: string,
    options: SandboxExecuteOptions,
  ): Promise<SandboxExecutionResult> {
    const { context, clientToolHandler, workflowId, fqdnMap } = options;

    logDebug(`Executing code in sandbox (${code.length} chars)`);

    // Use provided workflowId or generate new one (ADR-041: unified ID for traces + HIL)
    const traceId = workflowId ?? uuidv7();
    logDebug(`Workflow/Trace ID: ${traceId}${workflowId ? " (continued)" : " (new)"}`);

    const toolsCalled: string[] = [];
    const toolCallRecords: ToolCallRecord[] = [];
    const collectedUi: CollectedUiResource[] = [];
    const startTime = Date.now();

    // Create sandbox with hybrid RPC handler
    const sandbox = new SandboxWorker({
      onRpc: async (method: string, args: unknown) => {
        return await this.handleRpcCall(method, args, {
          clientToolHandler,
          traceId,
          fqdnMap,
          toolsCalled,
          toolCallRecords,
          collectedUi,
        });
      },
      executionTimeoutMs: this.executionTimeoutMs,
      rpcTimeoutMs: this.rpcTimeoutMs,
    });

    try {
      const result: SandboxResult = await sandbox.execute(code, context);

      const durationMs = Date.now() - startTime;

      // Story 16.3: Only include collectedUi when non-empty (tests expect absent, not empty array)
      const uiResult = collectedUi.length > 0 ? { collectedUi } : {};

      if (!result.success) {
        logDebug(`Sandbox execution failed: ${result.error?.message}`);
        return {
          success: false,
          error: result.error,
          durationMs,
          toolsCalled,
          toolCallRecords,
          traceId,
          ...uiResult,
        };
      }

      logDebug(`Sandbox execution completed in ${durationMs}ms`);
      return {
        success: true,
        value: result.value,
        durationMs,
        toolsCalled,
        toolCallRecords,
        traceId,
        ...uiResult,
      };
    } finally {
      sandbox.shutdown();
    }
  }

  /**
   * Handle an RPC call from the sandbox worker.
   * Routes the tool call, records execution metrics, and collects UI metadata.
   *
   * Story 16.3: After each tool call, extracts `_meta.ui` from the response
   * and builds a `CollectedUiResource` with source, resourceUri, context + _args.
   */
  private async handleRpcCall(
    method: string,
    args: unknown,
    ctx: RpcCallContext,
  ): Promise<unknown> {
    ctx.toolsCalled.push(method);
    const callStart = Date.now();
    let result: unknown;
    let success = true;

    try {
      result = await this.routeToolCall(method, args, ctx.clientToolHandler, ctx.traceId);
    } catch (error) {
      success = false;
      result = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const toolFqdn = ctx.fqdnMap?.get(method) ?? method;
      ctx.toolCallRecords.push({
        tool: toolFqdn,
        args,
        result,
        success,
        durationMs: Date.now() - callStart,
      });
    }

    // Story 16.3: Collect _meta.ui from tool response if present
    if (success) {
      const uiMeta = extractUiMeta(result);
      if (uiMeta) {
        const collected: CollectedUiResource = {
          source: method,
          resourceUri: uiMeta.resourceUri,
          context: { ...uiMeta.context, _args: args },
          slot: ctx.collectedUi.length,
        };
        ctx.collectedUi.push(collected);
        this.onUiCollected?.(collected, extractResultData(result));
      }
    }

    return result;
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
    clientHandler: ToolCallHandler | undefined,
    parentTraceId: string,
  ): Promise<unknown> {
    const routing = resolveToolRouting(toolId);

    logDebug(`Routing ${toolId} → ${routing}`);

    if (routing === "client") {
      if (!clientHandler) {
        throw new Error(
          `Client tool ${toolId} requires handler but none provided`,
        );
      }
      return await clientHandler(toolId, args, parentTraceId);
    }

    // Server routing - forward to cloud
    return await this.callServer(toolId, args);
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
