/**
 * Sandbox Execution Types
 *
 * Types for the SandboxExecutor module.
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
  /** Tools called during execution (for tracing) */
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
