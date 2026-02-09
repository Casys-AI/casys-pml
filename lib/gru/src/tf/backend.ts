/**
 * TensorFlow.js Backend for GRU TransitionModel
 *
 * Initializes TensorFlow.js with optimal backend selection:
 * - Native Node.js backend via @tensorflow/tfjs-node (10-50x faster than CPU)
 * - WASM backend via @tensorflow/tfjs-backend-wasm (2-10x faster than CPU)
 * - CPU as fallback
 *
 * Compatible with Node.js (bare specifiers) and bundlers.
 * Optional backends (tfjs-node, tfjs-backend-wasm) are loaded dynamically
 * at init time so they don't need to be installed.
 *
 * @module gru/tf/backend
 */

import * as tf from "@tensorflow/tfjs";

// Re-export tf for use throughout the codebase
export { tf };

// Backend state
let initialized = false;
let currentBackend: string = "cpu";
let initPromise: Promise<string> | null = null;

/**
 * Ensure TensorFlow.js is initialized before use.
 * This is called automatically when needed.
 */
export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = initTensorFlow();
  }
  await initPromise;
}

/**
 * Initialize TensorFlow.js with optimal backend
 *
 * Call once at application startup for best performance.
 * Dynamically loads optional backends (tfjs-node, tfjs-backend-wasm)
 * so they don't need to be hard dependencies.
 *
 * Backend priority (default):
 * 1. "tensorflow" - Native Node.js backend via @tensorflow/tfjs-node (10-50x faster)
 * 2. "wasm" - WASM backend via @tensorflow/tfjs-backend-wasm (2-10x faster)
 * 3. "cpu" - Pure JS fallback (always available)
 *
 * @param preferredBackend - Optional preferred backend:
 *   - 'tensorflow': Native Node.js backend (fastest, requires @tensorflow/tfjs-node)
 *   - 'wasm': TF.js WASM backend (fast, requires @tensorflow/tfjs-backend-wasm)
 *   - 'cpu': TF.js CPU backend (slowest, but always available)
 *   - 'webgpu': TF.js WebGPU backend (if available)
 * @returns The backend that was selected
 *
 * @example
 * ```typescript
 * import { initTensorFlow } from "./tf/backend";
 * const backend = await initTensorFlow();
 * console.log(`Using backend: ${backend}`);
 * ```
 */
export async function initTensorFlow(
  preferredBackend?: "tensorflow" | "webgpu" | "wasm" | "cpu",
): Promise<string> {
  if (initialized) {
    return currentBackend;
  }

  // Dynamically load optional backends to register them with tf.
  // These are optional: if not installed, we gracefully skip them.

  // Detect runtime: tfjs-node only works in Node.js, not Deno
  // deno-lint-ignore no-explicit-any
  const isDeno = typeof (globalThis as any).Deno !== "undefined";

  if (!isDeno) {
    // Try native Node.js backend first (10-50x faster than CPU)
    try { await import("@tensorflow/tfjs-node"); } catch { /* not available */ }
  }
  // Try WASM backend (2-10x faster than CPU, works in both Deno and Node)
  try { await import("@tensorflow/tfjs-backend-wasm"); } catch { /* not available */ }

  await tf.ready();

  // Try backends in order of preference
  // "tensorflow" is the native Node.js backend registered by tfjs-node
  const backends = preferredBackend
    ? [preferredBackend]
    : ["tensorflow", "wasm", "cpu"];

  for (const backend of backends) {
    try {
      await tf.setBackend(backend);
      currentBackend = tf.getBackend();
      if (currentBackend === backend) {
        break;
      }
    } catch {
      // Backend not available, try next
    }
  }

  initialized = true;
  currentBackend = tf.getBackend();

  return currentBackend;
}

/**
 * Get current backend name
 */
export function getBackend(): string {
  return tf.getBackend();
}

/**
 * Check if TensorFlow.js is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Get memory info (useful for debugging leaks)
 */
export function getMemoryInfo(): tf.MemoryInfo {
  return tf.memory();
}

/**
 * Log memory stats to console
 */
export function logMemory(prefix = ""): void {
  const mem = tf.memory();
  console.log(
    `${prefix}[TF Memory] tensors: ${mem.numTensors}, bytes: ${(mem.numBytes / 1024 / 1024).toFixed(2)}MB`,
  );
}

/**
 * Dispose all tensors (use with caution - only for cleanup)
 */
export function disposeAll(): void {
  tf.disposeVariables();
}

/**
 * Run a function within tf.tidy() for automatic cleanup
 *
 * @param fn Function to run
 * @returns Result of the function
 */
export function tidy<T extends tf.TensorContainer>(fn: () => T): T {
  return tf.tidy(fn);
}

/**
 * Dispose tensors safely
 */
export function dispose(tensors: tf.Tensor | tf.Tensor[] | null | undefined): void {
  if (!tensors) return;
  if (Array.isArray(tensors)) {
    tensors.forEach((t) => t?.dispose());
  } else {
    tensors.dispose();
  }
}
