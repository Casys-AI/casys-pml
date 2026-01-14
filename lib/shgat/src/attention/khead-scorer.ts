/**
 * K-Head Attention Scoring
 *
 * Optimized batch scoring functions for multi-head attention.
 * Extracted from shgat.ts for modularity.
 *
 * @module shgat/attention/khead-scorer
 */

import * as math from "../utils/math.ts";
import type { SHGATConfig, AttentionResult, CapabilityNode } from "../core/types.ts";
import type { HeadParams } from "../initialization/index.ts";

// ==========================================================================
// Intent Projection
// ==========================================================================

/**
 * Project intent embedding via W_intent matrix
 */
export function projectIntent(
  intentEmbedding: number[],
  W_intent: number[][],
): number[] {
  const propagatedDim = W_intent.length;
  const result = new Array(propagatedDim).fill(0);

  for (let i = 0; i < propagatedDim; i++) {
    for (let j = 0; j < intentEmbedding.length; j++) {
      result[i] += W_intent[i][j] * intentEmbedding[j];
    }
  }

  return result;
}

// ==========================================================================
// Q/K Precomputation
// ==========================================================================

/**
 * Pre-compute Q = W_q @ intent for all heads
 *
 * OPTIMIZATION: Q only depends on intent (same for all capabilities)
 * Pre-computing saves numCaps-1 redundant matrix multiplications per head
 *
 * @returns Array of Q vectors, one per head
 */
export function precomputeQForAllHeads(
  intentProjected: number[],
  headParams: HeadParams[],
  config: SHGATConfig,
): number[][] {
  const { numHeads, hiddenDim } = config;
  const precomputedQ: number[][] = [];

  for (let h = 0; h < numHeads; h++) {
    const hp = headParams[h];
    const outputDim = hp.W_q.length;
    const wqCols = hp.W_q[0]?.length || hiddenDim;
    const inputDim = Math.min(intentProjected.length, wqCols);

    const Q = new Array(outputDim).fill(0);
    for (let i = 0; i < outputDim; i++) {
      for (let j = 0; j < inputDim; j++) {
        Q[i] += hp.W_q[i][j] * intentProjected[j];
      }
    }
    precomputedQ.push(Q);
  }

  return precomputedQ;
}

/**
 * Batch compute K vectors for all embeddings in one matmul per head
 *
 * Instead of: 105× (W_k @ cap)  → 105 small matmuls
 * We do:      E @ W_k.T         → 1 large matmul [numCaps×embDim] @ [embDim×hiddenDim]
 *
 * @param E - Capability embeddings matrix [numCaps][embDim]
 * @returns K_all[numHeads][numCaps][hiddenDim] - K vectors for all caps, all heads
 */
export function batchComputeKForAllHeads(
  E: number[][],
  headParams: HeadParams[],
  numHeads: number,
): number[][][] {
  const K_all: number[][][] = [];

  for (let h = 0; h < numHeads; h++) {
    const hp = headParams[h];
    // W_k is [hiddenDim][embDim], we need W_k.T which is [embDim][hiddenDim]
    const W_k_T = math.transpose(hp.W_k);
    // E @ W_k.T: [numCaps×embDim] @ [embDim×hiddenDim] = [numCaps×hiddenDim]
    K_all.push(math.matmul(E, W_k_T));
  }

  return K_all;
}

/**
 * Batch compute scores for all capabilities using precomputed Q and K
 *
 * @param precomputedQ - Q vectors [numHeads][hiddenDim]
 * @param K_all - K vectors [numHeads][numCaps][hiddenDim]
 * @returns scores[numCaps][numHeads]
 */
export function batchComputeScores(
  precomputedQ: number[][],
  K_all: number[][][],
  numHeads: number,
): number[][] {
  const numCaps = K_all[0]?.length || 0;
  const scores: number[][] = new Array(numCaps);

  for (let c = 0; c < numCaps; c++) {
    scores[c] = new Array(numHeads);
    for (let h = 0; h < numHeads; h++) {
      const Q = precomputedQ[h];
      const K = K_all[h][c];
      const scale = Math.sqrt(Q.length);
      scores[c][h] = math.dot(Q, K) / scale;
    }
  }

  return scores;
}

// ==========================================================================
// Single-Item Scoring (Legacy/Fallback)
// ==========================================================================

/**
 * Compute attention score for a single head (v1)
 *
 * Uses Query-Key attention:
 * - Q = W_q @ intentProjected
 * - K = W_k @ capEmbedding
 * - logit = Q·K / √dim (raw, no sigmoid - softmax at discover level)
 */
export function computeHeadScoreV1(
  intentProjected: number[],
  capEmbedding: number[],
  headIdx: number,
  headParams: HeadParams[],
  config: SHGATConfig,
): number {
  const hp = headParams[headIdx];
  const { hiddenDim } = config;

  const outputDim = hp.W_q.length;
  const wqCols = hp.W_q[0]?.length || hiddenDim;
  const inputDim = Math.min(intentProjected.length, capEmbedding.length, wqCols);

  const Q = new Array(outputDim).fill(0);
  const K = new Array(outputDim).fill(0);

  for (let i = 0; i < outputDim; i++) {
    for (let j = 0; j < inputDim; j++) {
      Q[i] += hp.W_q[i][j] * intentProjected[j];
      K[i] += hp.W_k[i][j] * capEmbedding[j];
    }
  }

  const scale = Math.sqrt(outputDim);
  return math.dot(Q, K) / scale;
}

/**
 * Compute multi-head scores using pre-computed Q vectors (per-item, legacy)
 *
 * @deprecated Use batchComputeKForAllHeads + batchComputeScores for ~30% speedup
 */
export function computeMultiHeadScoresWithPrecomputedQ(
  precomputedQ: number[][],
  capEmbedding: number[],
  headParams: HeadParams[],
  config: SHGATConfig,
): number[] {
  const { numHeads, hiddenDim } = config;
  const scores: number[] = [];

  for (let h = 0; h < numHeads; h++) {
    const hp = headParams[h];
    const Q = precomputedQ[h];
    const outputDim = hp.W_k.length;
    const wkCols = hp.W_k[0]?.length || hiddenDim;
    const inputDim = Math.min(capEmbedding.length, wkCols);

    const K = new Array(outputDim).fill(0);
    for (let i = 0; i < outputDim; i++) {
      for (let j = 0; j < inputDim; j++) {
        K[i] += hp.W_k[i][j] * capEmbedding[j];
      }
    }

    const scale = Math.sqrt(outputDim);
    scores.push(math.dot(Q, K) / scale);
  }

  return scores;
}

// ==========================================================================
// High-Level Scoring Functions
// ==========================================================================

/**
 * Score all capabilities using K-head attention
 *
 * @param E - Propagated capability embeddings [numCaps][embDim]
 * @param intentEmbedding - User intent embedding
 * @param capabilityNodes - Map of capability nodes
 * @param headParams - K-head parameters
 * @param W_intent - Intent projection matrix
 * @param config - SHGAT config
 * @param getToolAttention - Function to get tool attention for a cap index
 * @returns Sorted array of attention results
 */
export function scoreAllCapabilities(
  E: number[][],
  intentEmbedding: number[],
  capabilityNodes: Map<string, CapabilityNode>,
  headParams: HeadParams[],
  W_intent: number[][],
  config: SHGATConfig,
  getToolAttention?: (capIdx: number) => number[],
): AttentionResult[] {
  const results: AttentionResult[] = [];
  const { numHeads } = config;

  // PreserveDim mode: use raw intent (1024-dim) directly with W_q
  // Standard mode: project intent via W_intent (1024 → hiddenDim)
  const intentForScoring = config.preserveDim
    ? intentEmbedding
    : projectIntent(intentEmbedding, W_intent);

  // 1. Pre-compute Q for all heads
  const precomputedQ = precomputeQForAllHeads(intentForScoring, headParams, config);

  // 2. Batch compute K for all capabilities
  const K_all = batchComputeKForAllHeads(E, headParams, numHeads);

  // 3. Batch compute scores
  const allScores = batchComputeScores(precomputedQ, K_all, numHeads);

  // 4. Build results with capability metadata
  let capIdx = 0;
  for (const [capId, cap] of capabilityNodes) {
    const headScores = allScores[capIdx];

    // Fusion: simple average of head logits
    const avgScore = headScores.reduce((a, b) => a + b, 0) / numHeads;

    // Reliability multiplier based on success rate
    const reliabilityMult = cap.successRate < 0.5 ? 0.5 : (cap.successRate > 0.9 ? 1.2 : 1.0);
    const finalScore = avgScore * reliabilityMult;

    results.push({
      capabilityId: capId,
      score: finalScore,
      headWeights: new Array(numHeads).fill(1 / numHeads),
      headScores,
      recursiveContribution: 0,
      toolAttention: getToolAttention?.(capIdx) ?? [],
    });

    capIdx++;
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Score all tools using K-head attention
 *
 * @param H - Propagated tool embeddings [numTools][embDim]
 * @param intentEmbedding - User intent embedding
 * @param toolIds - Array of tool IDs (in same order as H)
 * @param headParams - K-head parameters
 * @param W_intent - Intent projection matrix
 * @param config - SHGAT config
 * @returns Array of tool scores
 */
export function scoreAllTools(
  H: number[][],
  intentEmbedding: number[],
  toolIds: string[],
  headParams: HeadParams[],
  W_intent: number[][],
  config: SHGATConfig,
): Array<{ toolId: string; score: number; headScores: number[] }> {
  const results: Array<{ toolId: string; score: number; headScores: number[] }> = [];
  const { numHeads } = config;

  const intentForScoring = config.preserveDim
    ? intentEmbedding
    : projectIntent(intentEmbedding, W_intent);

  const precomputedQ = precomputeQForAllHeads(intentForScoring, headParams, config);
  const K_all = batchComputeKForAllHeads(H, headParams, numHeads);
  const allScores = batchComputeScores(precomputedQ, K_all, numHeads);

  for (let i = 0; i < toolIds.length; i++) {
    const headScores = allScores[i];
    const avgScore = headScores.reduce((a, b) => a + b, 0) / numHeads;

    results.push({
      toolId: toolIds[i],
      score: avgScore,
      headScores,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Predict success probability for a path of capabilities
 */
export function predictPathSuccess(
  intentEmbedding: number[],
  path: string[],
  capabilityNodes: Map<string, CapabilityNode>,
  headParams: HeadParams[],
  W_intent: number[][],
  config: SHGATConfig,
  depthDecay: number,
): number {
  if (path.length === 0) return 0;

  const intentForScoring = config.preserveDim
    ? intentEmbedding
    : projectIntent(intentEmbedding, W_intent);

  const precomputedQ = precomputeQForAllHeads(intentForScoring, headParams, config);

  let totalScore = 0;
  let totalWeight = 0;

  for (let i = 0; i < path.length; i++) {
    const cap = capabilityNodes.get(path[i]);
    if (!cap) continue;

    const scores = computeMultiHeadScoresWithPrecomputedQ(
      precomputedQ,
      cap.embedding,
      headParams,
      config,
    );
    const avgScore = scores.reduce((a, b) => a + b, 0) / config.numHeads;
    const weight = Math.pow(depthDecay, i);

    totalScore += avgScore * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
