/**
 * Sandbox Module
 *
 * Exports for sandboxed capability code execution.
 *
 * @module sandbox
 */

// Types
export type {
  PromiseResolver,
  RpcHandler,
  RpcMessage,
  RpcMessageType,
  SandboxError,
  SandboxErrorCode,
  SandboxResult,
  SandboxWorkerOptions,
} from "./types.ts";

// Constants
export {
  SANDBOX_EXECUTION_TIMEOUT_MS,
  SANDBOX_INIT_TIMEOUT_MS,
  SANDBOX_RPC_TIMEOUT_MS,
} from "./constants.ts";

// Execution
export { SandboxWorker } from "./execution/worker-runner.ts";
export { RpcBridge } from "./execution/rpc-bridge.ts";
export type { InitHandler } from "./execution/rpc-bridge.ts";
export { TimeoutError, TimeoutHandler, timeoutHandler } from "./execution/timeout-handler.ts";

// Transport (MessageTransport abstractions)
export type { MessageTransport, ProtocolAdapter } from "./transport/types.ts";
export { DenoWorkerTransport } from "./transport/deno-worker-transport.ts";
export { IframeTransport } from "./transport/iframe-transport.ts";
export { McpAppsProtocolAdapter } from "./transport/mcp-apps-adapter.ts";
