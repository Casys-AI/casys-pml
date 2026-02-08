/**
 * Sandbox Execution Types
 *
 * Types for the SandboxExecutor module.
 *
 * ## UI Collection Architecture (Story 16.6)
 *
 * The sandbox executor does NOT collect UI metadata. Per MCP Apps spec (SEP-1865),
 * `_meta.ui.resourceUri` is defined in `tools/list` (during discovery), not in
 * `tools/call` responses.
 *
 * UI collection happens **server-side** after execution:
 * 1. Sandbox returns `toolsCalled[]` (list of tool IDs that were invoked)
 * 2. Server looks up `tool_schema.ui_meta` for each called tool
 * 3. Server builds `CollectedUiResource[]` for tools that have UI
 *
 * See `src/services/ui-collector.ts` for the server-side implementation.
 *
 * @module execution/types
 */

import type { SandboxError } from "../sandbox/mod.ts";

/**
 * Record of a single tool call during execution.
 */
export interface ToolCallRecord {
  /** Tool identifier (e.g., "std:echo") */
  tool: string;
  /** Arguments passed to the tool */
  args: unknown;
  /** Result returned by the tool */
  result: unknown;
  /** Whether the call succeeded */
  success: boolean;
  /** Call duration in milliseconds */
  durationMs: number;
}

/**
 * Result from sandbox code execution.
 *
 * Note: UI collection is NOT included here. It's done server-side based on
 * `toolsCalled` + `tool_schema.ui_meta`. See module docs for details.
 */
export interface SandboxExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result value if successful */
  value?: unknown;
  /** Error details if failed */
  error?: SandboxError;
  /** Execution duration in milliseconds */
  durationMs: number;
  /**
   * Tools called during execution (for tracing and UI collection).
   * Used by server-side UI collector to look up which tools have UIs.
   */
  toolsCalled?: string[];
  /** Detailed records of each tool call */
  toolCallRecords?: ToolCallRecord[];
  /** Trace ID for this execution (for parent-child linking) */
  traceId: string;
}

/**
 * Options for SandboxExecutor.
 */
export interface SandboxExecutorOptions {
  /** Cloud URL for forwarding server-routed tools */
  cloudUrl: string;
  /** API key for cloud authentication */
  apiKey?: string;
  /** Execution timeout in milliseconds */
  executionTimeoutMs?: number;
  /** RPC timeout for individual tool calls */
  rpcTimeoutMs?: number;
}

/**
 * Routing decision for a tool call.
 */
export type ToolRouting = "client" | "server";

/**
 * Tool call handler function type.
 *
 * @param toolId - Tool identifier (e.g., "std:exec_35eb9188")
 * @param args - Arguments for the tool
 * @param parentTraceId - Trace ID of the parent execution (for linking nested traces)
 */
export type ToolCallHandler = (
  toolId: string,
  args: unknown,
  parentTraceId: string,
) => Promise<unknown>;

/**
 * Options for SandboxExecutor.execute() method.
 */
export interface SandboxExecuteOptions {
  /** Context/arguments passed to the sandboxed code */
  context: Record<string, unknown>;
  /** Handler for client-routed tool calls */
  clientToolHandler?: ToolCallHandler;
  /** Workflow ID for HIL continuation (also used as traceId per ADR-065) */
  workflowId?: string;
  /**
   * Map from short tool format to FQDN.
   * Used to record FQDNs in toolCallRecords for layerIndex resolution.
   * Example: "filesystem:read_file" → "pml.mcp.filesystem.read_file.4ff0"
   */
  fqdnMap?: Map<string, string>;
}
