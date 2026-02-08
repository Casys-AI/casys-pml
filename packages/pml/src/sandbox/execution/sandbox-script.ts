/// <reference lib="deno.worker" />
/**
 * Sandbox Worker Script
 *
 * This script runs INSIDE the isolated Deno Worker with `permissions: "none"`.
 * It has NO access to filesystem, network, or subprocess spawning.
 *
 * The ONLY way to interact with the outside world is via postMessage RPC
 * to the main thread, which then routes mcp.* calls appropriately.
 *
 * @module sandbox/execution/sandbox-script
 */

// ============================================================================
// Types (duplicated here since Worker is isolated)
// ============================================================================

interface RpcRequest {
  rpcId: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ExecuteRequest {
  type: "execute";
  id: string;
  code: string;
  args: unknown;
}

interface RpcResponse {
  type: "rpc_response";
  id: string;
  result: unknown;
}

interface RpcError {
  type: "rpc_error";
  id: string;
  error: string;
}

// ============================================================================
// State
// ============================================================================

/** Pending RPC requests awaiting response from main thread */
const pendingRpc = new Map<string, RpcRequest>();

/** Counter for generating unique RPC IDs */
let rpcIdCounter = 0;

// ============================================================================
// MCP Proxy
// ============================================================================

/**
 * Create the mcp.* proxy.
 *
 * This is the ONLY way capability code can interact with the outside world.
 * Every mcp.namespace.action() call is serialized as an RPC message to main thread.
 *
 * @example
 * ```ts
 * // In capability code:
 * const content = await mcp.filesystem.read_file({ path: "/home/user/file.txt" });
 * ```
 */
const mcp: Record<string, Record<string, (args: unknown) => Promise<unknown>>> =
  new Proxy({} as Record<string, Record<string, (args: unknown) => Promise<unknown>>>, {
    get: (_target, namespace: string) => {
      // Return a proxy for the namespace
      return new Proxy({} as Record<string, (args: unknown) => Promise<unknown>>, {
        get: (_innerTarget, action: string) => {
          // Return a function that sends RPC and returns a Promise
          return (args: unknown): Promise<unknown> => {
            const rpcId = `rpc-${++rpcIdCounter}`;

            return new Promise((resolve, reject) => {
              // Store pending request
              pendingRpc.set(rpcId, { rpcId, resolve, reject });

              // Send RPC to main thread
              self.postMessage({
                type: "rpc",
                rpcId,
                method: `${namespace}:${action}`,
                args,
              });
            });
          };
        },
      });
    },
  });

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle messages from main thread.
 */
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;

  if (data.type === "execute") {
    await handleExecute(data as ExecuteRequest);
  } else if (data.type === "rpc_response") {
    handleRpcResponse(data as RpcResponse);
  } else if (data.type === "rpc_error") {
    handleRpcError(data as RpcError);
  }
};

/**
 * Handle execute request from main thread.
 *
 * Executes capability code with `mcp` proxy injected.
 */
async function handleExecute(request: ExecuteRequest): Promise<void> {
  const { id, code, args } = request;

  try {
    // Create a function that has access to `mcp` and `args`
    // The capability code can use `mcp.namespace.action()` for RPC
    // and access `args` for input parameters
    //
    // We use AsyncFunction to allow await in the code
    // deno-lint-ignore no-explicit-any
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as any;

    // Wrap the code in an async function that returns the result
    // The code should be the body of an async function
    const fn = new AsyncFunction("mcp", "args", `
      "use strict";
      ${code}
    `);

    // Execute the function with mcp proxy and args
    const result = await fn(mcp, args);

    // Send result back to main thread
    self.postMessage({
      type: "result",
      id,
      value: result,
    });
  } catch (error) {
    // Format error message
    let errorMessage: string;
    let errorCode: string | undefined;

    if (error instanceof Error) {
      // Check for permission denied errors
      if (
        error.message.includes("PermissionDenied") ||
        error.message.includes("Requires")
      ) {
        errorCode = "PERMISSION_DENIED";
        errorMessage = error.message;
      } else {
        errorCode = "CODE_ERROR";
        errorMessage = error.message;
      }
    } else {
      errorCode = "CODE_ERROR";
      errorMessage = String(error);
    }

    // Send error back to main thread
    self.postMessage({
      type: "error",
      id,
      error: errorMessage,
      code: errorCode,
    });
  }
}

/**
 * Handle RPC response from main thread.
 */
function handleRpcResponse(response: RpcResponse): void {
  const pending = pendingRpc.get(response.id);
  if (pending) {
    pendingRpc.delete(response.id);
    pending.resolve(response.result);
  }
}

/**
 * Handle RPC error from main thread.
 */
function handleRpcError(error: RpcError): void {
  const pending = pendingRpc.get(error.id);
  if (pending) {
    pendingRpc.delete(error.id);
    pending.reject(new Error(error.error));
  }
}
