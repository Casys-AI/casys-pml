/**
 * TensorFlow.js Backend for GRU TransitionModel
 *
 * Initializes TensorFlow.js with optimal backend selection:
 * - WASM backend (2-10x faster than CPU, works in Deno)
 * - CPU as fallback
 *
 * @module gru/tf/backend
 */

import * as tf from "npm:@tensorflow/tfjs@4.22.0";
// Import WASM backend to register it
import "npm:@tensorflow/tfjs-backend-wasm@4.22.0";

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
 *
 * @param preferredBackend - Optional preferred backend:
 *   - 'wasm': TF.js WASM backend (fast)
 *   - 'cpu': TF.js CPU backend (slowest, but complete)
 *   - 'webgpu': TF.js WebGPU backend (if available)
 * @returns The backend that was selected
 *
 * @example
 * ```typescript
 * import { initTensorFlow } from "./tf/backend.ts";
 * const backend = await initTensorFlow("wasm");
 * console.log(`Using backend: ${backend}`);
 * ```
 */
export async function initTensorFlow(
  preferredBackend?: "webgpu" | "wasm" | "cpu",
): Promise<string> {
  if (initialized) {
    return currentBackend;
  }

  await tf.ready();

  // Try backends in order of preference
  // WASM is preferred as it works reliably in Deno and is 2-10x faster than CPU
  const backends = preferredBackend
    ? [preferredBackend]
    : ["wasm", "webgpu", "cpu"];

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
