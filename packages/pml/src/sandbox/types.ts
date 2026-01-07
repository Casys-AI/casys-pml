/**
 * Sandbox Types
 *
 * Types for sandboxed capability code execution.
 *
 * @module sandbox/types
 */

// ============================================================================
// RPC Message Types
// ============================================================================

/**
 * RPC message types for Worker ↔ Main thread communication.
 */
export type RpcMessageType =
  | "execute" // Main → Worker: execute capability code
  | "result" // Worker → Main: execution success
  | "error" // Worker → Main: execution error
  | "rpc" // Worker → Main: mcp.* call
  | "rpc_response" // Main → Worker: mcp.* response
  | "rpc_error"; // Main → Worker: mcp.* error

/**
 * Base RPC message structure.
 */
export interface RpcMessage {
  type: RpcMessageType;
  id: string;
}

/**
 * Execute request: Main → Worker
 *
 * Tells the sandbox to execute capability code.
 */
export interface ExecuteMessage extends RpcMessage {
  type: "execute";
  code: string;
  args: unknown;
}

/**
 * Result response: Worker → Main
 *
 * Capability code execution succeeded.
 */
export interface ResultMessage extends RpcMessage {
  type: "result";
  value: unknown;
}

/**
 * Error response: Worker → Main
 *
 * Capability code execution failed.
 */
export interface ErrorMessage extends RpcMessage {
  type: "error";
  error: string;
  code?: SandboxErrorCode;
}

/**
 * RPC request: Worker → Main
 *
 * mcp.namespace.action() call from sandbox.
 */
export interface RpcRequestMessage extends RpcMessage {
  type: "rpc";
  rpcId: string;
  method: string; // format: "namespace:action"
  args: unknown;
}

/**
 * RPC response: Main → Worker
 *
 * Result of mcp.* call.
 */
export interface RpcResponseMessage {
  type: "rpc_response";
  id: string;
  result: unknown;
}

/**
 * RPC error: Main → Worker
 *
 * Error from mcp.* call.
 */
export interface RpcErrorMessage {
  type: "rpc_error";
  id: string;
  error: string;
}

// ============================================================================
// Sandbox Result Types
// ============================================================================

/**
 * Error codes for sandbox failures.
 */
export type SandboxErrorCode =
  | "PERMISSION_DENIED" // Direct Deno API access blocked
  | "EXECUTION_TIMEOUT" // 5 minute timeout exceeded
  | "RPC_TIMEOUT" // mcp.* call timeout
  | "WORKER_TERMINATED" // Worker crashed or was killed
  | "CODE_ERROR" // Error in capability code
  | "RPC_ERROR"; // Error from mcp.* call

/**
 * Sandbox execution result.
 */
export interface SandboxResult<T = unknown> {
  /** Whether execution succeeded */
  success: boolean;
  /** Result value (if success) */
  value?: T;
  /** Error details (if failed) */
  error?: SandboxError;
  /** Execution duration in ms */
  durationMs: number;
}

/**
 * Sandbox execution error.
 */
export interface SandboxError {
  /** Error code for programmatic handling */
  code: SandboxErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original error stack (if available) */
  stack?: string;
}

// ============================================================================
// RPC Handler Types
// ============================================================================

/**
 * RPC handler function type.
 *
 * Called when sandbox sends mcp.* request.
 * Routes to StdioManager, cloud, or local capability.
 */
export type RpcHandler = (
  method: string,
  args: unknown,
) => Promise<unknown>;

/**
 * Promise resolver for pending operations.
 */
export interface PromiseResolver<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// Worker Options Types
// ============================================================================

/**
 * Options for creating a sandbox worker.
 */
export interface SandboxWorkerOptions {
  /** RPC handler for mcp.* calls */
  onRpc: RpcHandler;
  /** Execution timeout in ms (default: 5 min) */
  executionTimeoutMs?: number;
  /** RPC timeout in ms (default: 30 sec) */
  rpcTimeoutMs?: number;
}
