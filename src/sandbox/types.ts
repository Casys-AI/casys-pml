/**
 * Type definitions for Deno Sandbox Executor
 *
 * This module provides TypeScript interfaces for secure code execution
 * in an isolated Deno subprocess environment.
 */

/**
 * Configuration options for the sandbox executor
 */
export interface SandboxConfig {
  /**
   * Maximum execution time in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum heap memory in megabytes
   * @default 512
   */
  memoryLimit?: number;

  /**
   * Additional read paths to allow (beyond temp file)
   * Use with caution - each path increases attack surface
   * @default []
   */
  allowedReadPaths?: string[];

  /**
   * PII protection configuration
   * @default { enabled: true, types: all, detokenizeOutput: false }
   */
  piiProtection?: {
    /** Whether PII protection is enabled */
    enabled: boolean;
    /** Which PII types to detect */
    types?: Array<"email" | "phone" | "credit_card" | "ssn" | "api_key">;
    /** Whether to detokenize output (default: false - safer) */
    detokenizeOutput?: boolean;
  };

  /**
   * Code execution cache configuration
   * @default { enabled: true, maxEntries: 100, ttlSeconds: 300, persistence: false }
   */
  cacheConfig?: {
    /** Whether caching is enabled */
    enabled: boolean;
    /** Maximum number of cache entries (LRU eviction) */
    maxEntries?: number;
    /** Time-to-live for cache entries in seconds */
    ttlSeconds?: number;
    /** Whether to persist cache to PGlite */
    persistence?: boolean;
  };
}

/**
 * Structured error types that can occur during code execution
 */
export type ErrorType =
  | "SyntaxError"
  | "RuntimeError"
  | "TimeoutError"
  | "MemoryError"
  | "PermissionError"
  | "SecurityError"
  | "ResourceLimitError";

/**
 * Structured error information
 */
export interface StructuredError {
  /**
   * Type of error that occurred
   */
  type: ErrorType;

  /**
   * Human-readable error message (sanitized)
   */
  message: string;

  /**
   * Stack trace (optional, sanitized to remove host paths)
   */
  stack?: string;
}

/**
 * Result of code execution in the sandbox
 */
export interface ExecutionResult {
  /**
   * Whether the code executed successfully
   */
  success: boolean;

  /**
   * The return value of the executed code (if successful)
   * Must be JSON-serializable
   */
  result?: unknown;

  /**
   * Error information (if execution failed)
   */
  error?: StructuredError;

  /**
   * Execution time in milliseconds
   */
  executionTimeMs: number;

  /**
   * Memory used in megabytes (if available)
   */
  memoryUsedMb?: number;
}

/**
 * Internal command execution output
 * @internal
 */
export interface CommandOutput {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

// =============================================================================
// Worker RPC Bridge Types (Story 7.1b / ADR-032)
// =============================================================================

/**
 * Tool definition for Worker sandbox (serializable - no functions!)
 * Passed to Worker during initialization to generate tool proxies.
 */
export interface ToolDefinition {
  /** MCP server identifier (e.g., "filesystem", "memory") */
  server: string;
  /** Tool name (e.g., "read_file", "write_file") */
  name: string;
  /** Human-readable tool description */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * RPC call request from Worker to Bridge
 * Sent when sandbox code calls an MCP tool.
 */
export interface RPCCallMessage {
  type: "rpc_call";
  /** UUID for correlating request/response */
  id: string;
  /** MCP server identifier (e.g., "filesystem") */
  server: string;
  /** Tool name (e.g., "read_file") */
  tool: string;
  /** Tool arguments */
  args: Record<string, unknown>;
}

/**
 * RPC result response from Bridge to Worker
 * Sent after Bridge executes tool call via MCPClient.
 */
export interface RPCResultMessage {
  type: "rpc_result";
  /** Matching request ID */
  id: string;
  /** Whether tool call succeeded */
  success: boolean;
  /** Tool result (if success) */
  result?: unknown;
  /** Error message (if failure) */
  error?: string;
}

/**
 * Initialization message from Bridge to Worker
 * Sent when Worker is created to setup sandbox environment.
 */
export interface InitMessage {
  type: "init";
  /** TypeScript code to execute */
  code: string;
  /** Tool definitions for proxy generation */
  toolDefinitions: ToolDefinition[];
  /** Optional context variables to inject */
  context?: Record<string, unknown>;
}

/**
 * Execution complete message from Worker to Bridge
 * Sent when sandbox code execution finishes.
 */
export interface ExecutionCompleteMessage {
  type: "execution_complete";
  /** Whether execution succeeded */
  success: boolean;
  /** Execution result (if success) */
  result?: unknown;
  /** Error message (if failure) */
  error?: string;
}

/**
 * Union type for all Worker → Bridge messages
 */
export type WorkerToBridgeMessage = RPCCallMessage | ExecutionCompleteMessage;

/**
 * Union type for all Bridge → Worker messages
 */
export type BridgeToWorkerMessage = InitMessage | RPCResultMessage;

/**
 * Trace event for native tool call tracking
 * Captured in WorkerBridge during RPC handling (not stdout parsing).
 */
export interface TraceEvent {
  /** Event type */
  type: "tool_start" | "tool_end";
  /** Tool identifier (e.g., "filesystem:read_file") */
  tool: string;
  /** UUID for correlating start/end events */
  trace_id: string;
  /** Timestamp in milliseconds */
  ts: number;
  /** Whether tool call succeeded (for tool_end only) */
  success?: boolean;
  /** Execution duration in milliseconds (for tool_end only) */
  duration_ms?: number;
  /** Error message (for failed tool_end only) */
  error?: string;
}

/**
 * Execution mode for sandbox
 * - subprocess: Original Deno subprocess (deprecated)
 * - worker: Web Worker with RPC bridge (default)
 */
export type ExecutionMode = "subprocess" | "worker";
