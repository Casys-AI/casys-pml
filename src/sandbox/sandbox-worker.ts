/**
 * Sandbox Worker - Isolated Code Execution with RPC Tool Proxies
 *
 * Story 7.1b / ADR-032: Worker script that executes user code in isolation.
 *
 * Security Model:
 * - Runs with `permissions: "none"` (Deno Worker permission)
 * - No direct access to filesystem, network, or environment
 * - Tool calls route through RPC bridge to main process
 *
 * @module sandbox/sandbox-worker
 */

/// <reference lib="deno.worker" />

import type {
  InitMessage,
  RPCResultMessage,
  ToolDefinition,
  BridgeToWorkerMessage,
} from "./types.ts";

// Declare Worker global scope for TypeScript
declare const self: DedicatedWorkerGlobalScope;

/**
 * Pending RPC calls waiting for response from bridge
 */
const pendingCalls = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

/**
 * RPC call function - sends message to bridge and waits for response
 *
 * @param server MCP server identifier
 * @param tool Tool name
 * @param args Tool arguments
 * @returns Tool execution result
 */
async function __rpcCall(
  server: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });

    // Send RPC request to bridge
    self.postMessage({
      type: "rpc_call",
      id,
      server,
      tool,
      args,
    });
  });
}

/**
 * Generate tool proxy object from definitions
 *
 * Creates an object structure like:
 * ```
 * {
 *   filesystem: {
 *     read_file: (args) => __rpcCall("filesystem", "read_file", args),
 *     write_file: (args) => __rpcCall("filesystem", "write_file", args),
 *   },
 *   memory: {
 *     store: (args) => __rpcCall("memory", "store", args),
 *   }
 * }
 * ```
 */
function generateToolProxies(
  toolDefinitions: ToolDefinition[],
): Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>> {
  const mcp: Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>> = {};

  for (const def of toolDefinitions) {
    if (!mcp[def.server]) {
      mcp[def.server] = {};
    }
    mcp[def.server][def.name] = (args: Record<string, unknown>) =>
      __rpcCall(def.server, def.name, args);
  }

  return mcp;
}

/**
 * Execute user code with tool proxies available
 *
 * @param code User code to execute
 * @param mcp Tool proxy object
 * @param context Optional context variables
 * @returns Execution result
 */
async function executeCode(
  code: string,
  mcp: Record<string, Record<string, (args: Record<string, unknown>) => Promise<unknown>>>,
  context?: Record<string, unknown>,
): Promise<unknown> {
  // Build context variables for injection
  const contextVars = context
    ? Object.entries(context)
        .map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`)
        .join("\n")
    : "";

  // ADR-016: REPL-style auto-return with heuristic detection
  // Check if code contains statement keywords
  const hasStatements = /(^|\n|\s)(const|let|var|function|class|if|for|while|do|switch|try|return|throw|break|continue)\s/.test(code.trim());

  // If code has statements, execute as-is (requires explicit return)
  // If code is pure expression, wrap in return for auto-return
  const wrappedUserCode = hasStatements
    ? code
    : `return (${code});`;

  // Create async function with mcp and context injected
  // Using Function constructor (required for dynamic code execution in Worker)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  // Build function body with context injection
  const functionBody = `
    ${contextVars}
    ${wrappedUserCode}
  `;

  // Create and execute the function with mcp as parameter
  const fn = new AsyncFunction("mcp", functionBody);
  return await fn(mcp);
}

/**
 * Handle messages from bridge
 */
self.onmessage = async (e: MessageEvent<BridgeToWorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "init") {
    await handleInit(msg);
  } else if (msg.type === "rpc_result") {
    handleRPCResult(msg);
  }
};

/**
 * Handle init message - setup and execute user code
 */
async function handleInit(msg: InitMessage): Promise<void> {
  const { code, toolDefinitions, context } = msg;

  try {
    // Generate tool proxies from definitions
    const mcp = generateToolProxies(toolDefinitions);

    // Execute user code
    const result = await executeCode(code, mcp, context);

    // Send success response
    self.postMessage({
      type: "execution_complete",
      success: true,
      result,
    });
  } catch (error) {
    // Send error response
    self.postMessage({
      type: "execution_complete",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle RPC result message - resolve pending call
 */
function handleRPCResult(msg: RPCResultMessage): void {
  const pending = pendingCalls.get(msg.id);

  if (pending) {
    pendingCalls.delete(msg.id);

    if (msg.success) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.error || "RPC call failed"));
    }
  }
}
