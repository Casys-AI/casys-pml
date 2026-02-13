/**
 * Hyperedge → Hyperedge Message Passing Phase (Multi-Level)
 *
 * Phase for multi-level n-SuperHyperGraph: Level-k nodes send
 * messages to level-(k+1) nodes that contain them.
 *
 * This is the KEY phase for hierarchical message passing:
 *   V → E^0 → E^1 → E^2 → ... → E^n → ... → V
 *
 * Algorithm (E^k → E^(k+1)):
 *   1. Project child node embeddings: E^k' = E^k · W_source^T
 *   2. Project parent node embeddings: E^(k+1)' = E^(k+1) · W_target^T
 *   3. Compute attention scores: score(c_k, c_{k+1}) = a^T · LeakyReLU([E^k'_c || E^(k+1)'_p])
 *      (masked by containment: only compute for c_k ∈ c_{k+1})
 *   4. Normalize per parent: α_p = softmax({score(c, p) | c ∈ p})
 *   5. Aggregate: E^(k+1)^new_p = ELU(Σ_c α_cp · E^k'_c)
 *
 * Uses SparseConnectivity for O(edges) memory instead of O(numSourceNodes × numTargetNodes).
 *
 * @module graphrag/algorithms/shgat/message-passing/edge-to-edge-phase
 */

import * as math from "../utils/math.ts";
import type { MessagePassingPhase, PhaseParameters, PhaseResult, SparseConnectivity } from "./phase-interface.ts";

/**
 * Cache for backward pass
 */
export interface EEForwardCache {
  /** Child node embeddings (level k) [numSourceNodes][embDim] */
  E_k: number[][];
  /** Parent node embeddings (level k+1) [numTargetNodes][embDim] */
  E_kPlus1: number[][];
  /** Projected child embeddings [numSourceNodes][headDim] */
  E_k_proj: number[][];
  /** Projected parent embeddings [numTargetNodes][headDim] */
  E_kPlus1_proj: number[][];
  /** Pre-activation concatenated vectors for each (c,p) pair */
  concatPreAct: Map<number, number[]>;
  /** Aggregated values before ELU [numTargetNodes][headDim] */
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
export interface EEGradients {
  /** Gradient for W_source [headDim][embDim] */
  dW_source: number[][];
  /** Gradient for W_target [headDim][embDim] */
  dW_target: number[][];
  /** Gradient for a_attention [2*headDim] */
  da_attention: number[];
  /** Gradient for input E_k (child nodes, level k) [numSourceNodes][embDim] */
  dE_k: number[][];
  /** Gradient for input E_kPlus1 (parent nodes, level k+1) [numTargetNodes][embDim] */
  dE_kPlus1: number[][];
}

/**
 * Extended result with cache
 */
export interface EEPhaseResultWithCache extends PhaseResult {
  cache: EEForwardCache;
}

/** Compute edge key from source/target indices (avoids string GC) */
function edgeKey(s: number, t: number, numTargetNodes: number): number {
  return s * numTargetNodes + t;
}

/**
 * Hyperedge → Hyperedge message passing implementation
 *
 * Used for hierarchical node levels where higher-level nodes contain
 * lower-level nodes (n-SuperHyperGraph structure).
 *
 * Containment semantics: source=child, target=parent.
 * conn.targetToSources.get(p) gives all children in parent p.
 */
export class EdgeToEdgePhase implements MessagePassingPhase {
  private readonly levelK: number;
  private readonly levelKPlus1: number;

  constructor(levelK: number, levelKPlus1: number) {
    this.levelK = levelK;
    this.levelKPlus1 = levelKPlus1;
  }

  getName(): string {
    return `Edge^${this.levelK}→Edge^${this.levelKPlus1}`;
  }

  forward(
    E_k: number[][],
    E_kPlus1: number[][],
    connectivity: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): PhaseResult {
    const result = this.forwardWithCache(E_k, E_kPlus1, connectivity, params, config);
    return { embeddings: result.embeddings, attention: result.attention };
  }

  /**
   * Forward pass with cache for backward
   */
  forwardWithCache(
    E_k: number[][],
    E_kPlus1: number[][],
    conn: SparseConnectivity,
    params: PhaseParameters,
    config: { leakyReluSlope: number },
  ): EEPhaseResultWithCache {
    const numTargetNodes = E_kPlus1.length;

    // Project embeddings
    const E_k_proj = math.matmulTranspose(E_k, params.W_source);
    const E_kPlus1_proj = math.matmulTranspose(E_kPlus1, params.W_target);

    const hiddenDim = E_k_proj[0]?.length ?? 0;

    // Sparse attention scores: edgeKey → raw score
    const attentionScores = new Map<number, number>();
    // Cache for backward: pre-activation concat values
    const concatPreAct = new Map<number, number[]>();

    // Compute attention scores only for existing edges
    // conn.targetToSources: parent → children (target=parent, source=child)
    for (const [p, children] of conn.targetToSources) {
      for (const c of children) {
        const key = edgeKey(c, p, numTargetNodes);
        const concat = [...E_k_proj[c], ...E_kPlus1_proj[p]];
        concatPreAct.set(key, concat);
        const activated = concat.map((x) => math.leakyRelu(x, config.leakyReluSlope));
        attentionScores.set(key, math.dot(params.a_attention, activated));
      }
    }

    // Softmax per parent node (over children in that parent)
    const attentionCE = new Map<number, number>();

    for (const [p, children] of conn.targetToSources) {
      if (children.length === 0) continue;

      const scores = children.map((c) => attentionScores.get(edgeKey(c, p, numTargetNodes))!);
      const softmaxed = math.softmax(scores);

      for (let i = 0; i < children.length; i++) {
        attentionCE.set(edgeKey(children[i], p, numTargetNodes), softmaxed[i]);
      }
    }

    // Aggregate: E^(k+1)_new[p] = ELU(Σ_c attention[c,p] * E_k_proj[c])
    const E_kPlus1_new: number[][] = [];
    const aggregated: number[][] = [];

    for (let p = 0; p < numTargetNodes; p++) {
      const agg = Array(hiddenDim).fill(0);
      const children = conn.targetToSources.get(p);
      if (children) {
        for (const c of children) {
          const alpha = attentionCE.get(edgeKey(c, p, numTargetNodes)) ?? 0;
          if (alpha > 0) {
            for (let d = 0; d < hiddenDim; d++) {
              agg[d] += alpha * E_k_proj[c][d];
            }
          }
        }
      }
      aggregated.push(agg);
      E_kPlus1_new.push(agg.map((x) => math.elu(x)));
    }

    // Build dense attention matrix for PhaseResult (backward compat)
    const attentionDense: number[][] = Array.from(
      { length: E_k.length },
      () => Array(numTargetNodes).fill(0),
    );
    for (const [key, val] of attentionCE) {
      const c = Math.floor(key / numTargetNodes);
      const p = key % numTargetNodes;
      attentionDense[c][p] = val;
    }

    const cache: EEForwardCache = {
      E_k,
      E_kPlus1,
      E_k_proj,
      E_kPlus1_proj,
      concatPreAct,
      aggregated,
      attention: attentionCE,
      connectivity: conn,
      leakyReluSlope: config.leakyReluSlope,
    };

    return { embeddings: E_kPlus1_new, attention: attentionDense, cache };
  }

  /**
   * Backward pass: compute gradients for W_source, W_target, a_attention
   *
   * @param dE_kPlus1_new - Gradient from next layer [numParent][headDim]
   * @param cache - Forward pass cache
   * @param params - Phase parameters (needed for chain rule)
   * @returns Gradients for all parameters and inputs
   */
  backward(
    dE_kPlus1_new: number[][],
    cache: EEForwardCache,
    params: PhaseParameters,
  ): EEGradients {
    const { E_k, E_kPlus1, E_k_proj, concatPreAct, aggregated, attention, connectivity: conn, leakyReluSlope } = cache;
    const numSourceNodes = E_k.length;
    const numTargetNodes = E_kPlus1.length;
    const headDim = E_k_proj[0]?.length ?? 0;
    const embDim = E_k[0]?.length ?? 0;

    // Initialize gradients
    const dW_source: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const dW_target: number[][] = Array.from({ length: headDim }, () => Array(embDim).fill(0));
    const da_attention: number[] = Array(2 * headDim).fill(0);
    const dE_k: number[][] = Array.from({ length: numSourceNodes }, () => Array(embDim).fill(0));
    const dE_kPlus1: number[][] = Array.from({ length: numTargetNodes }, () => Array(embDim).fill(0));

    // Intermediate gradients
    const dE_k_proj: number[][] = Array.from({ length: numSourceNodes }, () => Array(headDim).fill(0));
    const dE_kPlus1_proj: number[][] = Array.from({ length: numTargetNodes }, () => Array(headDim).fill(0));

    // Step 1: Through ELU activation
    const dAggregated: number[][] = [];
    for (let p = 0; p < numTargetNodes; p++) {
      const dAgg = dE_kPlus1_new[p].map((grad, d) => {
        const x = aggregated[p][d];
        const eluDeriv = x >= 0 ? 1 : Math.exp(x);
        return grad * eluDeriv;
      });
      dAggregated.push(dAgg);
    }

    // Step 2: Through aggregation (sparse)
    // aggregated[p] = Σ_c attention[c,p] * E_k_proj[c]
    const dAttention = new Map<number, number>();

    for (const [p, children] of conn.targetToSources) {
      for (const c of children) {
        const key = edgeKey(c, p, numTargetNodes);
        const alpha = attention.get(key) ?? 0;
        if (alpha > 0) {
          // dAttention[c,p] = dot(dAggregated[p], E_k_proj[c])
          dAttention.set(key, math.dot(dAggregated[p], E_k_proj[c]));

          // dE_k_proj[c] += attention[c,p] * dAggregated[p]
          for (let d = 0; d < headDim; d++) {
            dE_k_proj[c][d] += alpha * dAggregated[p][d];
          }
        }
      }
    }

    // Step 3: Through softmax (per parent)
    const dScore = new Map<number, number>();

    for (const [p, children] of conn.targetToSources) {
      if (children.length === 0) continue;

      let sumAttnDAttn = 0;
      for (const c of children) {
        const key = edgeKey(c, p, numTargetNodes);
        sumAttnDAttn += (attention.get(key) ?? 0) * (dAttention.get(key) ?? 0);
      }

      for (const c of children) {
        const key = edgeKey(c, p, numTargetNodes);
        const alpha = attention.get(key) ?? 0;
        dScore.set(key, alpha * ((dAttention.get(key) ?? 0) - sumAttnDAttn));
      }
    }

    // Step 4 & 5: Through attention computation and LeakyReLU
    for (const [p, children] of conn.targetToSources) {
      for (const c of children) {
        const key = edgeKey(c, p, numTargetNodes);
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
          dE_k_proj[c][d] += dConcat[d];
          dE_kPlus1_proj[p][d] += dConcat[headDim + d];
        }
      }
    }

    // Step 6: Through projection matrices (BLAS-accelerated matrix multiplications)
    // dW_source = dE_k_proj.T @ E_k (BLAS-accelerated)
    const dW_source_contrib = math.matmul(math.transpose(dE_k_proj), E_k);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_source[i][j] += dW_source_contrib[i]?.[j] ?? 0;
      }
    }

    // dW_target = dE_kPlus1_proj.T @ E_kPlus1 (BLAS-accelerated)
    const dW_target_contrib = math.matmul(math.transpose(dE_kPlus1_proj), E_kPlus1);
    for (let i = 0; i < headDim; i++) {
      for (let j = 0; j < embDim; j++) {
        dW_target[i][j] += dW_target_contrib[i]?.[j] ?? 0;
      }
    }

    // dE_k = dE_k_proj @ W_source (BLAS-accelerated)
    const dE_k_contrib = math.matmul(dE_k_proj, params.W_source);
    for (let c = 0; c < numSourceNodes; c++) {
      for (let j = 0; j < embDim; j++) {
        dE_k[c][j] += dE_k_contrib[c]?.[j] ?? 0;
      }
    }

    // dE_kPlus1 = dE_kPlus1_proj @ W_target (BLAS-accelerated)
    const dE_kPlus1_contrib = math.matmul(dE_kPlus1_proj, params.W_target);
    for (let p = 0; p < numTargetNodes; p++) {
      for (let j = 0; j < embDim; j++) {
        dE_kPlus1[p][j] += dE_kPlus1_contrib[p]?.[j] ?? 0;
      }
    }

    return { dW_source, dW_target, da_attention, dE_k, dE_kPlus1 };
  }
}
