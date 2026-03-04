/**
 * GRU Weight Serialization — JSON + gzip
 *
 * Serializes GRUWeights + GRUVocabulary + GRUConfig into a compact
 * gzipped JSON blob for persistence in the gru_weights table.
 *
 * Maps are serialized as arrays and reconstructed on deserialization.
 *
 * @module vault-exec/gru/weights
 */

import type { GRUWeights, GRUVocabulary, GRUConfig, VocabNode } from "./types.ts";

// ---------------------------------------------------------------------------
// Internal wire format (JSON-safe)
// ---------------------------------------------------------------------------

interface SerializedPayload {
  version: 1;
  weights: GRUWeights;
  vocab: {
    nodes: VocabNode[];
    indexToName: string[];
  };
  config: GRUConfig;
}

// ---------------------------------------------------------------------------
// Compression helpers (Web Streams API — zero deps)
// ---------------------------------------------------------------------------

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize GRU weights, vocabulary, and config into a gzipped JSON blob.
 *
 * Maps in GRUVocabulary (nameToIndex) are stripped — they are reconstructed
 * from indexToName on deserialization.
 */
export async function serializeWeights(
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
): Promise<Uint8Array> {
  const payload: SerializedPayload = {
    version: 1,
    weights,
    vocab: {
      nodes: vocab.nodes,
      indexToName: vocab.indexToName,
    },
    config,
  };

  const json = JSON.stringify(payload);
  const encoded = new TextEncoder().encode(json);
  return gzipCompress(encoded);
}

/**
 * Deserialize a gzipped JSON blob back into weights, vocabulary, and config.
 *
 * Reconstructs the nameToIndex Map from indexToName.
 */
export async function deserializeWeights(
  blob: Uint8Array,
): Promise<{ weights: GRUWeights; vocab: GRUVocabulary; config: GRUConfig }> {
  const decompressed = await gzipDecompress(blob);
  const json = new TextDecoder().decode(decompressed);
  const payload: SerializedPayload = JSON.parse(json);

  if (payload.version !== 1) {
    throw new Error(
      `[deserializeWeights] Unsupported version: ${payload.version}. Expected 1.`,
    );
  }

  // Reconstruct nameToIndex from indexToName
  const nameToIndex = new Map<string, number>();
  for (let i = 0; i < payload.vocab.indexToName.length; i++) {
    nameToIndex.set(payload.vocab.indexToName[i], i);
  }

  return {
    weights: payload.weights,
    vocab: {
      nodes: payload.vocab.nodes,
      nameToIndex,
      indexToName: payload.vocab.indexToName,
    },
    config: payload.config,
  };
}
