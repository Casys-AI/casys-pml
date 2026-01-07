/**
 * Sandbox Constants
 *
 * Timeout and configuration values for sandboxed execution.
 *
 * @module sandbox/constants
 */

/**
 * Maximum execution time for capability code in sandbox (5 minutes).
 *
 * After this timeout, the Worker is forcefully terminated.
 * This prevents infinite loops and runaway computations.
 */
export const SANDBOX_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Maximum time to wait for a single RPC call (30 seconds).
 *
 * Each mcp.* call from sandbox → main thread must complete within this time.
 * This includes HIL approval flow time.
 */
export const SANDBOX_RPC_TIMEOUT_MS = 30 * 1000;

/**
 * Maximum time to wait for Worker initialization (5 seconds).
 */
export const SANDBOX_INIT_TIMEOUT_MS = 5 * 1000;
