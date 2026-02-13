/**
 * Shared Parquet utilities for n8n data pipeline scripts.
 *
 * Wraps parquet-wasm + apache-arrow to provide:
 * - WASM initialization (idempotent)
 * - embeddingToBytes: Float64[] → Float32 raw bytes
 * - softTargetToBytes: sparse [[idx,prob], ...] → two Binary columns
 * - writeParquetFile: Arrow Table → .parquet file with Snappy compression
 *
 * @module gru/n8n/parquet-utils
 */

import * as arrow from "apache-arrow";
import parquetWasmModule, {
  Compression,
  Table as WasmTable,
  writeParquet,
  WriterPropertiesBuilder,
} from "parquet-wasm";
import { writeFileSync } from "node:fs";

let _wasmReady = false;

/** Initialize parquet-wasm (idempotent — safe to call multiple times). */
export async function initParquetWasm(): Promise<void> {
  if (_wasmReady) return;
  // Node entry point: auto-initialized (parquetWasmModule is the module itself).
  // ESM entry point: parquetWasmModule is the async init function.
  // deno-lint-ignore no-explicit-any
  const mod = parquetWasmModule as any;
  if (typeof mod === "function") {
    await mod();
  }
  _wasmReady = true;
}

/**
 * Convert a number[] embedding to raw Float32 bytes.
 * Returns a Uint8Array of length `embedding.length * 4`.
 */
export function embeddingToBytes(emb: number[]): Uint8Array {
  const f32 = new Float32Array(emb);
  return new Uint8Array(f32.buffer);
}

/**
 * Convert a sparse target array [[idx, prob], ...] to two separate byte arrays.
 * Indices: Int32Array bytes. Probs: Float32Array bytes.
 */
export function softTargetToBytes(sparse: [number, number][]): {
  indicesBytes: Uint8Array;
  probsBytes: Uint8Array;
} {
  if (!sparse || sparse.length === 0) {
    return { indicesBytes: new Uint8Array(0), probsBytes: new Uint8Array(0) };
  }
  const indices = new Int32Array(sparse.map(([idx]) => idx));
  const probs = new Float32Array(sparse.map(([, prob]) => prob));
  return {
    indicesBytes: new Uint8Array(indices.buffer),
    probsBytes: new Uint8Array(probs.buffer),
  };
}

/**
 * Write an Arrow Table to a Parquet file using parquet-wasm with Snappy compression.
 * Caller must call `initParquetWasm()` first.
 */
export function writeParquetFile(table: arrow.Table, filePath: string): void {
  if (!_wasmReady) {
    throw new Error(
      "[parquet-utils] WASM not initialized. Call initParquetWasm() before writeParquetFile().",
    );
  }
  const ipcStream = arrow.tableToIPC(table, "stream");
  const wasmTable = WasmTable.fromIPCStream(ipcStream);
  const writerProps = new WriterPropertiesBuilder()
    .setCompression(Compression.SNAPPY)
    .build();
  const parquetBytes = writeParquet(wasmTable, writerProps);
  writeFileSync(filePath, parquetBytes);
}

// Re-export arrow for convenience (avoids duplicate imports in scripts)
export { arrow };
