/**
 * Vertex → Vertex co-occurrence enrichment (pure JS, no TF.js).
 *
 * Migrated from `lib/shgat-tf/src/message-passing/vertex-to-vertex-phase.ts`
 * to eliminate the shgat-tf/dist-node dependency from benchmark-e2e.ts.
 *
 * @module shgat-for-gru/v2v
 */

import type { CooccurrenceEntry, VertexToVertexConfig } from "./types.ts";

// ==========================================================================
// Math helpers (inlined from shgat-tf/src/utils/math.ts)
// ==========================================================================

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = dot(a, b);
  const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return normA * normB > 0 ? dotProduct / (normA * normB) : 0;
}

function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  let maxVal = -Infinity;
  for (const v of values) {
    if (v > maxVal) maxVal = v;
  }
  const exps = values.map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum > 0 ? exps.map((e) => e / sum) : new Array(values.length).fill(1 / values.length);
}

// ==========================================================================
// Default config
// ==========================================================================

const DEFAULT_V2V_CONFIG: VertexToVertexConfig = {
  residualWeight: 0.3,
  useAttention: true,
  temperature: 1.0,
};

// ==========================================================================
// Public API
// ==========================================================================

/**
 * Build sparse co-occurrence entries from workflow tool lists.
 *
 * Every pair of tools appearing in the same workflow gets a bidirectional edge
 * with weight = log2(1 + count) — diminishing returns for high counts.
 *
 * @param workflowToolLists - Array of tool ID arrays (one per workflow)
 * @param toolIndex - Map from tool ID to numeric index
 * @returns Sparse bidirectional co-occurrence entries
 */
export function buildCooccurrenceFromWorkflows(
  workflowToolLists: string[][],
  toolIndex: Map<string, number>,
): CooccurrenceEntry[] {
  const pairCount = new Map<string, number>();

  for (const tools of workflowToolLists) {
    const indices: number[] = [];
    for (const toolId of tools) {
      const idx = toolIndex.get(toolId);
      if (idx !== undefined) indices.push(idx);
    }

    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = Math.min(indices[i], indices[j]);
        const b = Math.max(indices[i], indices[j]);
        const key = `${a}:${b}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const entries: CooccurrenceEntry[] = [];
  for (const [key, count] of pairCount) {
    const [aStr, bStr] = key.split(":");
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);
    const weight = Math.log2(1 + count);
    entries.push({ from: a, to: b, weight });
    entries.push({ from: b, to: a, weight });
  }

  return entries;
}

/**
 * One-shot V→V enrichment.
 *
 * Takes raw tool embeddings + co-occurrence, returns enriched embeddings.
 * Algorithm:
 *   1. Compute cosine similarity between co-occurring tools
 *   2. Weight by co-occurrence frequency / temperature
 *   3. Softmax normalization per tool
 *   4. Residual connection: H' = H + β · Σ_j α_ij · H_j
 *   5. L2 normalize
 *
 * @param H - Raw tool embeddings [numTools][embDim]
 * @param cooccurrence - Sparse co-occurrence entries
 * @param config - Optional config (defaults: residualWeight=0.3, temperature=1.0, useAttention=true)
 * @returns Enriched embeddings [numTools][embDim]
 */
export function v2vEnrich(
  H: number[][],
  cooccurrence: CooccurrenceEntry[],
  config?: Partial<VertexToVertexConfig>,
): number[][] {
  const cfg: VertexToVertexConfig = { ...DEFAULT_V2V_CONFIG, ...config };
  const numTools = H.length;
  if (numTools === 0) return [];

  const embeddingDim = H[0].length;

  // Build adjacency list from sparse co-occurrence
  const neighbors = new Map<number, { idx: number; weight: number }[]>();
  for (const entry of cooccurrence) {
    if (entry.from >= numTools || entry.to >= numTools) continue;
    if (!neighbors.has(entry.from)) {
      neighbors.set(entry.from, []);
    }
    neighbors.get(entry.from)!.push({ idx: entry.to, weight: entry.weight });
  }

  const H_enriched: number[][] = [];

  for (let i = 0; i < numTools; i++) {
    const neighborList = neighbors.get(i);

    if (!neighborList || neighborList.length === 0) {
      H_enriched.push([...H[i]]);
      continue;
    }

    let aggregated: number[];

    if (cfg.useAttention) {
      // Attention-weighted aggregation
      const scores: number[] = [];
      for (const neighbor of neighborList) {
        const sim = cosineSimilarity(H[i], H[neighbor.idx]);
        scores.push((sim * neighbor.weight) / cfg.temperature);
      }

      const attention = softmax(scores);

      aggregated = Array(embeddingDim).fill(0);
      for (let n = 0; n < neighborList.length; n++) {
        const neighbor = neighborList[n];
        for (let d = 0; d < embeddingDim; d++) {
          aggregated[d] += attention[n] * H[neighbor.idx][d];
        }
      }
    } else {
      // Simple weighted sum
      aggregated = Array(embeddingDim).fill(0);
      let totalWeight = 0;
      for (const neighbor of neighborList) {
        totalWeight += neighbor.weight;
        for (let d = 0; d < embeddingDim; d++) {
          aggregated[d] += neighbor.weight * H[neighbor.idx][d];
        }
      }
      if (totalWeight > 0) {
        for (let d = 0; d < embeddingDim; d++) {
          aggregated[d] /= totalWeight;
        }
      }
    }

    // Residual connection: H' = H + β * aggregated
    const enriched = Array(embeddingDim);
    for (let d = 0; d < embeddingDim; d++) {
      enriched[d] = H[i][d] + cfg.residualWeight * aggregated[d];
    }

    // L2 normalize
    const norm = Math.sqrt(enriched.reduce((sum, x) => sum + x * x, 0));
    if (norm > 0) {
      for (let d = 0; d < embeddingDim; d++) {
        enriched[d] /= norm;
      }
    }

    H_enriched.push(enriched);
  }

  return H_enriched;
}
