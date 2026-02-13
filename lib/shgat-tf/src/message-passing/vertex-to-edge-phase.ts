/**
 * Vertex → Hyperedge Message Passing Phase
 *
 * Phase 1 of SHGAT message passing: L0 nodes send messages to
 * L1+ nodes (groups) they participate in.
 *
 * Algorithm:
 *   1. Project L0 node embeddings: H' = H · W_v^T
 *   2. Project L1+ node embeddings: E' = E · W_e^T
 *   3. Compute attention scores: score(t, c) = a^T · LeakyReLU([H'_t || E'_c])
 *      (masked by incidence matrix: only compute for L0 nodes in L1+ group)
 *   4. Normalize per L1+ node: α_c = softmax({score(t, c) | t ∈ c})
 *   5. Aggregate: E^new_c = ELU(Σ_t α_tc · H'_t)
 *
 * Uses SparseConnectivity for O(edges) memory instead of O(numL0 × numL1).
 *
 * @module graphrag/algorithms/shgat/message-passing/vertex-to-edge-phase
 */

import * as math from "../utils/math.ts";
import type { MessagePassingPhase, PhaseParameters, PhaseResult, SparseConnectivity } from "./phase-interface.ts";

/**
 * Cache for backward pass
 */
export interface VEForwardCache {
  /** Original L0 node embeddings [numL0][embDim] */
  H: number[][];
  /** Original L1+ node embeddings [numL1][embDim] */
  E: number[][];
  /** Projected L0 node embeddings [numL0][headDim] */
  H_proj: number[][];
  /** Projected L1+ node embeddings [numL1][headDim] */
  E_proj: number[][];
  /** Pre-activation concatenated vectors for each (t,c) pair */
  concatPreAct: Map<number, number[]>;
  /** Aggregated values before ELU [numL1][headDim] (per L1+ node) */
  aggregated: number[][];
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
export interface VEGradients {
  /** Gradient for W_source [headDim][embDim] */
  dW_source: number[][];
  /** Gradient for W_target [headDim][embDim] */
  dW_target: number[][];
  /** Gradient for a_attention [2*headDim] */
  da_attention: number[];
  /** Gradient for input H (L0 nodes) [numL0][embDim] */
  dH: number[][];
  /** Gradient for input E (L1+ nodes) [numL1][embDim] */
  dE: number[][];
}

/**
 * Extended result with cache
 */
export interface VEPhaseResultWithCache extends PhaseResult {
  cache: VEForwardCache;
}

/** Compute edge key from source/target indices (avoids string GC) */
function edgeKey(s: number, t: number, numL1: number): number {
  return s * numL1 + t;
}

/**
 * Vertex → Hyperedge message passing implementation
 */
export class VertexToEdgePhase implements MessagePassingPhase {
  getName(): string {
    return "Vertex→Edge";
  }

  forward(
    H: number[][],
    E: number[][],
    connectivity: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): PhaseResult {
    const result = this.forwardWithCache(H, E, connectivity, params, config);
    return { embeddings: result.embeddings, attention: result.attention };
  }

  /**
   * Forward pass with cache for backward
   */
  forwardWithCache(
    H: number[][],
    E: number[][],
    conn: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): VEPhaseResultWithCache {
    const numL1 = E.length;

    // Project embeddings
    const H_proj = math.matmulTranspose(H, params.W_source);
    const E_proj = math.matmulTranspose(E, params.W_target);

    const hiddenDim = H_proj[0]?.length ?? 0;

    // Sparse attention scores: edgeKey → raw score
    const attentionScores = new Map<number, number>();
    // Cache for backward: pre-activation concat values
    const concatPreAct = new Map<number, number[]>();

    // Compute attention scores only for existing edges
    for (const [c, sources] of conn.targetToSources) {
      for (const t of sources) {
        const key = edgeKey(t, c, numL1);
        const concat = [...H_proj[t], ...E_proj[c]];
        concatPreAct.set(key, concat);
        const activated = concat.map((x) => math.leakyRelu(x, config.leakyReluSlope));
        attentionScores.set(key, math.dot(params.a_attention, activated));
      }
    }

    // Softmax per L1+ node (over L0 nodes in that group)
    const attentionVE = new Map<number, number>();

    for (const [c, sources] of conn.targetToSources) {
      if (sources.length === 0) continue;

      const scores = sources.map((t) => attentionScores.get(edgeKey(t, c, numL1))!);
      const softmaxed = math.softmax(scores);

      for (let i = 0; i < sources.length; i++) {
        attentionVE.set(edgeKey(sources[i], c, numL1), softmaxed[i]);
      }
    }

    // Aggregate: E_new[c] = ELU(Σ_t attention[t,c] * H_proj[t])
    const E_new: number[][] = [];
    const aggregated: number[][] = [];

    for (let c = 0; c < numL1; c++) {
      const agg = Array(hiddenDim).fill(0);
      const sources = conn.targetToSources.get(c);
      if (sources) {
        for (const t of sources) {
          const alpha = attentionVE.get(edgeKey(t, c, numL1)) ?? 0;
          if (alpha > 0) {
            for (let d = 0; d < hiddenDim; d++) {
              agg[d] += alpha * H_proj[t][d];
            }
          }
        }
      }
      aggregated.push(agg);
      E_new.push(agg.map((x) => math.elu(x)));
    }

    // Build dense attention matrix for PhaseResult (backward compat)
    const attentionDense: number[][] = Array.from(
      { length: H.length },
      () => Array(numL1).fill(0),
    );
    for (const [key, val] of attentionVE) {
      const t = Math.floor(key / numL1);
      const c = key % numL1;
      attentionDense[t][c] = val;
    }

    const cache: VEForwardCache = {
      H,
      E,
      H_proj,
      E_proj,
      concatPreAct,
      aggregated,
      attention: attentionVE,
      connectivity: conn,
      leakyReluSlope: config.leakyReluSlope,
    };

    return { embeddings: E_new, attention: attentionDense, cache };
  }

  /**
   * Backward pass: compute gradients for W_source, W_target, a_attention
   *
   * @param dE_new - Gradient from next layer [numL1][headDim]
   * @param cache - Forward pass cache
   * @param params - Phase parameters (needed for chain rule)
   * @returns Gradients for all parameters and inputs
   */
  backward(
    dE_new: number[][],
    cache: VEForwardCache,
    params: PhaseParameters,
  ): VEGradients {
    const { H, E, H_proj, concatPreAct, aggregated, attention, connectivity: conn, leakyReluSlope } = cache;
    const numL0 = H.length;
    const numL1 = E.length;
    const headDim = H_proj[0]?.length ?? 0;
    const embDim = H[0]?.length ?? 0;

    // Initialize gradients
    const dW_source: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const dW_target: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const da_attention: number[] = Array(2 * headDim).fill(0);
    const dH: number[][] = Array.from({ length: numL0 }, () => Array(embDim).fill(0));
    const dE: number[][] = Array.from({ length: numL1 }, () => Array(embDim).fill(0));

    // Intermediate gradients
    const dH_proj: number[][] = Array.from({ length: numL0 }, () => Array(headDim).fill(0));
    const dE_proj: number[][] = Array.from({ length: numL1 }, () => Array(headDim).fill(0));

    // Step 1: Through ELU activation
    const dAggregated: number[][] = [];
    for (let c = 0; c < numL1; c++) {
      const dAgg = dE_new[c].map((grad, d) => {
        const x = aggregated[c][d];
        const eluDeriv = x >= 0 ? 1 : Math.exp(x);
        return grad * eluDeriv;
      });
      dAggregated.push(dAgg);
    }

    // Step 2: Through aggregation (sparse)
    // aggregated[c] = Σ_t attention[t,c] * H_proj[t]
    const dAttention = new Map<number, number>();

    for (const [c, sources] of conn.targetToSources) {
      for (const t of sources) {
        const key = edgeKey(t, c, numL1);
        const alpha = attention.get(key) ?? 0;
        if (alpha > 0) {
          // dAttention[t,c] = dot(dAggregated[c], H_proj[t])
          dAttention.set(key, math.dot(dAggregated[c], H_proj[t]));

          // dH_proj[t] += attention[t,c] * dAggregated[c]
          for (let d = 0; d < headDim; d++) {
            dH_proj[t][d] += alpha * dAggregated[c][d];
          }
        }
      }
    }

    // Step 3: Through softmax (per L1+ node)
    const dScore = new Map<number, number>();

    for (const [c, sources] of conn.targetToSources) {
      if (sources.length === 0) continue;

      let sumAttnDAttn = 0;
      for (const t of sources) {
        const key = edgeKey(t, c, numL1);
        sumAttnDAttn += (attention.get(key) ?? 0) * (dAttention.get(key) ?? 0);
      }

      for (const t of sources) {
        const key = edgeKey(t, c, numL1);
        const alpha = attention.get(key) ?? 0;
        dScore.set(key, alpha * ((dAttention.get(key) ?? 0) - sumAttnDAttn));
      }
    }

    // Step 4 & 5: Through attention computation and LeakyReLU
    for (const [c, sources] of conn.targetToSources) {
      for (const t of sources) {
        const key = edgeKey(t, c, numL1);
        const concat = concatPreAct.get(key);
        if (!concat) continue;

        const score_grad = dScore.get(key) ?? 0;
        const activated = concat.map((x) => math.leakyRelu(x, leakyReluSlope));

        for (let i = 0; i < activated.length; i++) {
          da_attention[i] += activated[i] * score_grad;
        }

        const dConcat = concat.map((x, i) => {
          const leakyDeriv = x > 0 ? 1 : leakyReluSlope;
          return score_grad * params.a_attention[i] * leakyDeriv;
        });

        for (let d = 0; d < headDim; d++) {
          dH_proj[t][d] += dConcat[d];
          dE_proj[c][d] += dConcat[headDim + d];
        }
      }
    }

    // Step 6: Through projection matrices (BLAS-accelerated)
    const dW_source_contrib = math.matmul(math.transpose(dH_proj), H);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_source[i][j] += dW_source_contrib[i]?.[j] ?? 0;
      }
    }

    const dW_target_contrib = math.matmul(math.transpose(dE_proj), E);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_target[i][j] += dW_target_contrib[i]?.[j] ?? 0;
      }
    }

    const dH_contrib = math.matmul(dH_proj, params.W_source);
    for (let t = 0; t < numL0; t++) {
      for (let j = 0; j < embDim; j++) {
        dH[t][j] += dH_contrib[t]?.[j] ?? 0;
      }
    }

    const dE_contrib = math.matmul(dE_proj, params.W_target);
    for (let c = 0; c < numL1; c++) {
      for (let j = 0; j < embDim; j++) {
        dE[c][j] += dE_contrib[c]?.[j] ?? 0;
      }
    }

    return { dW_source, dW_target, da_attention, dH, dE };
  }
}
