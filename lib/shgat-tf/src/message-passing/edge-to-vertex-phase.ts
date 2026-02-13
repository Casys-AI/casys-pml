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
 */
export interface EVForwardCache {
  /** Original L1+ node embeddings [numL1][embDim] */
  E: number[][];
  /** Original L0 node embeddings [numL0][embDim] */
  H: number[][];
  /** Projected L1+ node embeddings [numL1][headDim] */
  E_proj: number[][];
  /** Projected L0 node embeddings [numL0][headDim] */
  H_proj: number[][];
  /** Pre-activation concatenated vectors for each (c,t) pair */
  concatPreAct: Map<number, number[]>;
  /** Aggregated values before ELU [numL0][headDim] (per L0 node) */
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

    // Project embeddings
    const E_proj = math.matmulTranspose(E, params.W_source);
    const H_proj = math.matmulTranspose(H, params.W_target);

    const hiddenDim = E_proj[0]?.length ?? 0;

    // Sparse attention scores: edgeKey → raw score
    const attentionScores = new Map<number, number>();
    // Cache for backward: pre-activation concat values
    const concatPreAct = new Map<number, number[]>();

    // Compute attention scores only for existing edges.
    // connectivity is [numL0][numL1] orientation: sourceToTargets maps L0→L1+ nodes.
    // In E→V, for each L0 node we iterate over its connected L1+ nodes.
    for (const [t, sources] of conn.sourceToTargets) {
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
        // Concatenate: [E'_c || H'_t] (source embeddings first in EV phase)
        const concat = [...E_proj[c], ...H_proj[t]];
        concatPreAct.set(key, concat);
        const activated = concat.map((x) => math.leakyRelu(x, config.leakyReluSlope));
        attentionScores.set(key, math.dot(params.a_attention, activated));
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
    const aggregated: number[][] = [];

    for (let t = 0; t < numL0; t++) {
      const agg = Array(hiddenDim).fill(0);
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
      H_new.push(agg.map((x) => math.elu(x)));
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
      concatPreAct,
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
    const { E, H, E_proj, concatPreAct, aggregated, attention, connectivity: conn, leakyReluSlope } = cache;
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
    for (const [t, sources] of conn.sourceToTargets) {
      for (const c of sources) {
        const key = edgeKey(c, t, numL0);
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

        // Split dConcat into dE_proj and dH_proj
        // concat = [E_proj[c], H_proj[t]]
        for (let d = 0; d < headDim; d++) {
          dE_proj[c][d] += dConcat[d];
          dH_proj[t][d] += dConcat[headDim + d];
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
