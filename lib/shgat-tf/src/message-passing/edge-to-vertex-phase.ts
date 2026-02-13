/**
 * Hyperedge → Vertex Message Passing Phase
 *
 * Phase 2 of SHGAT message passing: L1+ nodes (groups) send messages
 * back to the L0 nodes they contain.
 *
 * Algorithm:
 *   1. Project L1+ node embeddings: E' = E · W_e^T
 *   2. Project L0 node embeddings: H' = H · W_v^T
 *   3. Compute attention scores: score(c, t) = a^T · LeakyReLU([E'_c || H'_t])
 *      (masked by incidence matrix: only compute for L1+ nodes containing L0 node)
 *   4. Normalize per L0 node: α_t = softmax({score(c, t) | t ∈ c})
 *   5. Aggregate: H^new_t = ELU(Σ_c α_ct · E'_c)
 *
 * Uses SparseConnectivity for O(edges) memory instead of O(numL0 × numL1).
 *
 * @module graphrag/algorithms/shgat/message-passing/edge-to-vertex-phase
 */

import * as math from "../utils/math.ts";
import type { MessagePassingPhase, PhaseParameters, PhaseResult, SparseConnectivity } from "./phase-interface.ts";

/**
 * Cache for backward pass
 *
 * NOTE: concatPreAct was removed to reduce RAM usage during training.
 * The concatenated vectors [E_proj[c] || H_proj[t]] are reconstructed
 * on-the-fly during backward from the already-cached E_proj and H_proj.
 */
export interface EVForwardCache {
  /** Original L1+ node embeddings [numL1][embDim] */
  E: number[][];
  /** Original L0 node embeddings [numL0][embDim] */
  H: number[][];
  /** Projected L1+ node embeddings [numL1][headDim] — Float32 for RAM */
  E_proj: Float32Array[];
  /** Projected L0 node embeddings [numL0][headDim] — Float32 for RAM */
  H_proj: Float32Array[];
  /** Aggregated values before ELU [numL0][headDim] — Float32 for RAM */
  aggregated: Float32Array[];
  /** Attention weights: sparse Map (edgeKey → weight) */
  attention: Map<number, number>;
  /** Sparse connectivity */
  connectivity: SparseConnectivity;
  /** LeakyReLU slope */
  leakyReluSlope: number;
}

/**
 * Gradients from backward pass
 */
export interface EVGradients {
  /** Gradient for W_source [headDim][embDim] */
  dW_source: number[][];
  /** Gradient for W_target [headDim][embDim] */
  dW_target: number[][];
  /** Gradient for a_attention [2*headDim] */
  da_attention: number[];
  /** Gradient for input E (L1+ nodes) [numL1][embDim] */
  dE: number[][];
  /** Gradient for input H (L0 nodes) [numL0][embDim] */
  dH: number[][];
}

/**
 * Extended result with cache
 */
export interface EVPhaseResultWithCache extends PhaseResult {
  cache: EVForwardCache;
}

/** Compute edge key from source/target indices (avoids string GC) */
function edgeKey(c: number, t: number, numL0: number): number {
  return c * numL0 + t;
}

/**
 * Hyperedge → Vertex message passing implementation
 */
export class EdgeToVertexPhase implements MessagePassingPhase {
  getName(): string {
    return "Edge→Vertex";
  }

  forward(
    E: number[][],
    H: number[][],
    connectivity: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): PhaseResult {
    const result = this.forwardWithCache(E, H, connectivity, params, config);
    return { embeddings: result.embeddings, attention: result.attention };
  }

  /**
   * Forward pass with cache for backward
   */
  forwardWithCache(
    E: number[][],
    H: number[][],
    conn: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): EVPhaseResultWithCache {
    const numL1 = E.length;
    const numL0 = H.length;

    // Project embeddings (Float32 for cache RAM)
    const E_proj = math.matmulTransposeF32(E, params.W_source);
    const H_proj = math.matmulTransposeF32(H, params.W_target);

    const hiddenDim = E_proj[0]?.length ?? 0;

    // Sparse attention scores: edgeKey → raw score
    const attentionScores = new Map<number, number>();

    // Compute attention scores only for existing edges.
    // NOTE: concat vectors are computed inline to avoid storing them in a Map.
    // They can be reconstructed from E_proj and H_proj during backward pass.
    // connectivity is [numL0][numL1] orientation: sourceToTargets maps L0→L1+ nodes.
    // In E→V, for each L0 node we iterate over its connected L1+ nodes.
    for (const [t, sources] of conn.sourceToTargets) {
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        // Inline attention: a^T · LeakyReLU([E_proj[c] || H_proj[t]])
        let score = 0;
        for (let d = 0; d < hiddenDim; d++) {
          score += params.a_attention[d] * math.leakyRelu(E_proj[c][d], config.leakyReluSlope);
        }
        for (let d = 0; d < hiddenDim; d++) {
          score += params.a_attention[hiddenDim + d] * math.leakyRelu(H_proj[t][d], config.leakyReluSlope);
        }
        attentionScores.set(key, score);
      }
    }

    // Softmax per L0 node (over L1+ nodes connected to that L0 node)
    const attentionEV = new Map<number, number>();

    for (const [t, sources] of conn.sourceToTargets) {
      if (sources.length === 0) continue;

      const scores = sources.map((c) => attentionScores.get(edgeKey(c, t, numL0))!);
      const softmaxed = math.softmax(scores);

      for (let i = 0; i < sources.length; i++) {
        attentionEV.set(edgeKey(sources[i], t, numL0), softmaxed[i]);
      }
    }

    // Aggregate: H_new[t] = ELU(Σ_c attention[c,t] * E_proj[c])
    const H_new: number[][] = [];
    const aggregated: Float32Array[] = [];

    for (let t = 0; t < numL0; t++) {
      const agg = new Float32Array(hiddenDim);
      const sources = conn.sourceToTargets.get(t);
      if (sources) {
        for (const c of sources) {
          const alpha = attentionEV.get(edgeKey(c, t, numL0)) ?? 0;
          if (alpha > 0) {
            for (let d = 0; d < hiddenDim; d++) {
              agg[d] += alpha * E_proj[c][d];
            }
          }
        }
      }
      aggregated.push(agg);
      H_new.push(Array.from(agg, (x) => math.elu(x)));
    }

    // Build dense attention matrix for PhaseResult (backward compat)
    const attentionDense: number[][] = Array.from(
      { length: numL1 },
      () => Array(numL0).fill(0),
    );
    for (const [key, val] of attentionEV) {
      const c = Math.floor(key / numL0);
      const t = key % numL0;
      attentionDense[c][t] = val;
    }

    const cache: EVForwardCache = {
      E,
      H,
      E_proj,
      H_proj,
      aggregated,
      attention: attentionEV,
      connectivity: conn,
      leakyReluSlope: config.leakyReluSlope,
    };

    return { embeddings: H_new, attention: attentionDense, cache };
  }

  /**
   * Backward pass: compute gradients for W_source, W_target, a_attention
   *
   * @param dH_new - Gradient from next layer [numL0][headDim]
   * @param cache - Forward pass cache
   * @param params - Phase parameters (needed for chain rule)
   * @returns Gradients for all parameters and inputs
   */
  backward(
    dH_new: number[][],
    cache: EVForwardCache,
    params: PhaseParameters,
  ): EVGradients {
    const { E, H, E_proj, H_proj, aggregated, attention, connectivity: conn, leakyReluSlope } = cache;
    const numL1 = E.length;
    const numL0 = H.length;
    const headDim = E_proj[0]?.length ?? 0;
    const embDim = E[0]?.length ?? 0;

    // Initialize gradients
    const dW_source: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const dW_target: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const da_attention: number[] = Array(2 * headDim).fill(0);
    const dE: number[][] = Array.from({ length: numL1 }, () => Array(embDim).fill(0));
    const dH: number[][] = Array.from({ length: numL0 }, () => Array(embDim).fill(0));

    // Intermediate gradients
    const dE_proj: number[][] = Array.from({ length: numL1 }, () => Array(headDim).fill(0));
    const dH_proj: number[][] = Array.from({ length: numL0 }, () => Array(headDim).fill(0));

    // Step 1: Through ELU activation
    // dAggregated[t][d] = dH_new[t][d] * ELU'(aggregated[t][d])
    const dAggregated: number[][] = [];
    for (let t = 0; t < numL0; t++) {
      const dAgg = dH_new[t].map((grad, d) => {
        const x = aggregated[t][d];
        // ELU'(x) = 1 if x >= 0, else exp(x)
        const eluDeriv = x >= 0 ? 1 : Math.exp(x);
        return grad * eluDeriv;
      });
      dAggregated.push(dAgg);
    }

    // Step 2: Through aggregation (sparse)
    // aggregated[t] = Σ_c attention[c,t] * E_proj[c]
    const dAttention = new Map<number, number>();

    for (const [t, sources] of conn.sourceToTargets) {
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        const alpha = attention.get(key) ?? 0;
        if (alpha > 0) {
          // dAttention[c,t] = dot(dAggregated[t], E_proj[c])
          dAttention.set(key, math.dot(dAggregated[t], E_proj[c]));

          // dE_proj[c] += attention[c,t] * dAggregated[t]
          for (let d = 0; d < headDim; d++) {
            dE_proj[c][d] += alpha * dAggregated[t][d];
          }
        }
      }
    }

    // Step 3: Through softmax (per L0 node)
    const dScore = new Map<number, number>();

    for (const [t, sources] of conn.sourceToTargets) {
      if (sources.length === 0) continue;

      let sumAttnDAttn = 0;
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        sumAttnDAttn += (attention.get(key) ?? 0) * (dAttention.get(key) ?? 0);
      }

      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        const alpha = attention.get(key) ?? 0;
        dScore.set(key, alpha * ((dAttention.get(key) ?? 0) - sumAttnDAttn));
      }
    }

    // Step 4 & 5: Through attention computation and LeakyReLU
    // Reconstruct concat = [E_proj[c], H_proj[t]] inline (no Map lookup needed)
    for (const [t, sources] of conn.sourceToTargets) {
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        const score_grad = dScore.get(key) ?? 0;

        // da_attention += leakyRelu(x) * score_grad; dProj += score_grad * a * leakyRelu'(x)
        for (let d = 0; d < headDim; d++) {
          const x = E_proj[c][d];
          da_attention[d] += math.leakyRelu(x, leakyReluSlope) * score_grad;
          const leakyDeriv = x > 0 ? 1 : leakyReluSlope;
          dE_proj[c][d] += score_grad * params.a_attention[d] * leakyDeriv;
        }
        for (let d = 0; d < headDim; d++) {
          const x = H_proj[t][d];
          da_attention[headDim + d] += math.leakyRelu(x, leakyReluSlope) * score_grad;
          const leakyDeriv = x > 0 ? 1 : leakyReluSlope;
          dH_proj[t][d] += score_grad * params.a_attention[headDim + d] * leakyDeriv;
        }
      }
    }

    // Step 6: Through projection matrices (BLAS-accelerated)
    // E_proj = E @ W_source.T → dW_source += dE_proj.T @ E, dE += dE_proj @ W_source
    // H_proj = H @ W_target.T → dW_target += dH_proj.T @ H, dH += dH_proj @ W_target

    const dW_source_contrib = math.matmul(math.transpose(dE_proj), E);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_source[i][j] += dW_source_contrib[i]?.[j] ?? 0;
      }
    }

    const dW_target_contrib = math.matmul(math.transpose(dH_proj), H);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_target[i][j] += dW_target_contrib[i]?.[j] ?? 0;
      }
    }

    const dE_contrib = math.matmul(dE_proj, params.W_source);
    for (let c = 0; c < numL1; c++) {
      for (let j = 0; j < embDim; j++) {
        dE[c][j] += dE_contrib[c]?.[j] ?? 0;
      }
    }

    const dH_contrib = math.matmul(dH_proj, params.W_target);
    for (let t = 0; t < numL0; t++) {
      for (let j = 0; j < embDim; j++) {
        dH[t][j] += dH_contrib[t]?.[j] ?? 0;
      }
    }

    return { dW_source, dW_target, da_attention, dE, dH };
  }
}
