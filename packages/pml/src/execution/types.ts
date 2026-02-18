/**
 * Sandbox Execution Types
 *
 * Types for the SandboxExecutor module.
 *
 * ## UI Collection (Story 16.3 — re-wired Epic 16)
 *
 * The sandbox executor collects `_meta.ui` from MCP tool responses at execution time.
 * Both `tools/list` (discovery-time, static) and `tools/call` (execution-time, dynamic)
 * can carry UI metadata per SEP-1865. The sandbox collects the dynamic path.
 *
 * Server-side `UiCollector` handles the dashboard (Option A) path separately.
 *
 * @module execution/types
 */

import type { SandboxError } from "../sandbox/mod.ts";
import type { CollectedUiResource } from "../types/ui-orchestration.ts";

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
 * Includes `collectedUi` when at least one tool returned `_meta.ui`
 * in its response (Story 16.3). Undefined (not present) when no UI collected.
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
   */
  toolsCalled?: string[];
  /** Detailed records of each tool call */
  toolCallRecords?: ToolCallRecord[];
  /** Trace ID for this execution (for parent-child linking) */
  traceId: string;
  /**
   * UI resources collected from tool responses during execution.
   * Present only when at least one tool returned `_meta.ui`.
   * Story 16.3: collected in-sandbox via `extractUiMeta()`.
   */
  collectedUi?: CollectedUiResource[];
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
  /** Callback fired when a tool returns _meta.ui. For real-time SSE feed. */
  onUiCollected?: (ui: CollectedUiResource, parsedResult: unknown) => void;
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
