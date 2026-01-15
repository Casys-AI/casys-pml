/**
 * Batched K-Head Training Module
 *
 * Batched versions of K-head scoring and backprop for efficient training.
 * Instead of processing examples one-by-one, we batch all intent embeddings
 * and use BLAS matrix operations for massive speedup.
 *
 * Key insight: Message passing (graph structure) is the SAME for all examples.
 * Only the intent embeddings differ. So we:
 * 1. Run message passing ONCE to get capability embeddings
 * 2. Batch all intent projections: [batch × hidden] = [batch × 1024] @ W_intent^T
 * 3. Batch K-head forward: Q_batch = [batch × scoringDim] = IntentBatch @ W_q^T
 * 4. Score all caps for all intents using batched matmuls
 *
 * @module graphrag/algorithms/shgat/training/batched-khead
 */

import type { HeadParams } from "../initialization/parameters.ts";
import type { SHGATConfig } from "../types.ts";
import * as math from "../utils/math.ts";
import type { KHeadGradientAccumulators } from "./multi-level-trainer-khead.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Cache for batched K-head forward pass
 */
export interface BatchedKHeadCache {
  /** Batched Q vectors: [batch × scoringDim] */
  Q_batch: number[][];
  /** K vectors per capability: capId → [scoringDim] */
  K_caps: Map<string, number[]>;
  /** Projected intents: [batch × hidden] */
  intentsBatched: number[][];
}

/**
 * Batched scoring result
 */
export interface BatchedScoringResult {
  /** Scores per example per capability: [batch][capIdx] */
  scores: number[][];
  /** Logits per example per capability: [batch][capIdx] */
  logits: number[][];
  /** Cache for backward pass */
  cache: BatchedKHeadCache;
}

/**
 * Entry for batched backward accumulation
 * Collects all gradient info to do ONE matmul per head instead of many outer products
 */
export interface BackwardEntry {
  /** Gradient w.r.t. logit (scaled by IS weight and temperature) */
  dLogit: number;
  /** Example index (to get Q from cache) */
  exIdx: number;
  /** Capability ID (to get K from cache) */
  capId: string;
  /** Capability index (for dE_accum routing) */
  capIdx: number;
}

// ============================================================================
// Batched Forward Pass
// ============================================================================

/**
 * Project batch of intents through W_intent
 *
 * @param intents Batch of intent embeddings: [batch × embeddingDim]
 * @param W_intent Projection matrix: [hiddenDim × embeddingDim]
 * @returns Projected intents: [batch × hiddenDim]
 */
export function batchProjectIntents(
  intents: number[][],
  W_intent: number[][],
): number[][] {
  // [batch × embedding] @ [embedding × hidden]^T = [batch × hidden]
  // Using matmulTranspose: A @ B^T where B = W_intent
  return math.matmulTranspose(intents, W_intent);
}

/**
 * Compute batched Q vectors for one head
 *
 * Q_batch = IntentsBatched @ W_q^T
 *
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param W_q Query projection: [scoringDim × hidden]
 * @returns Q_batch: [batch × scoringDim]
 */
export function batchComputeQ(
  intentsBatched: number[][],
  W_q: number[][],
): number[][] {
  // [batch × hidden] @ [hidden × scoringDim]^T = [batch × scoringDim]
  return math.matmulTranspose(intentsBatched, W_q);
}

/**
 * Compute K vector for a capability
 *
 * K = W_k @ capEmbedding
 *
 * @param capEmbedding Capability embedding: [hidden]
 * @param W_k Key projection: [scoringDim × hidden]
 * @returns K: [scoringDim]
 */
export function computeK(
  capEmbedding: number[],
  W_k: number[][],
): number[] {
  return math.matVecBlas(W_k, capEmbedding);
}

/**
 * Score batch of intents against one capability
 *
 * scores = sigmoid(Q_batch @ K / sqrt(dim))
 *
 * @param Q_batch Batched Q vectors: [batch × scoringDim]
 * @param K Key vector for capability: [scoringDim]
 * @returns Scores and logits: [batch]
 */
export function batchScoreAgainstCap(
  Q_batch: number[][],
  K: number[],
): { scores: number[]; logits: number[] } {
  const scoringDim = K.length;
  const scale = Math.sqrt(scoringDim);

  const scores: number[] = [];
  const logits: number[] = [];

  for (const Q of Q_batch) {
    const dotQK = math.dot(Q, K);
    const logit = dotQK / scale;
    const score = math.sigmoid(logit);
    logits.push(logit);
    scores.push(score);
  }

  return { scores, logits };
}

/**
 * Batched K-head forward pass for one head
 *
 * OPTIMIZED: Uses single matmul for all K computations + batched scoring.
 * Instead of 127 separate matVecs, does ONE matmul [numCaps × hidden] @ [hidden × scoringDim]^T
 *
 * Performance: ~50x speedup vs per-cap matVec (BLAS matmul vs JS loops)
 *
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param capEmbeddings Map of capId → embedding
 * @param headParams Head parameters (W_q, W_k)
 * @returns Scores and caches
 */
export function batchedKHeadForwardOneHead(
  intentsBatched: number[][],
  capEmbeddings: Map<string, number[]>,
  headParams: HeadParams,
): {
  scores: Map<string, number[]>; // capId → [batch scores]
  logits: Map<string, number[]>; // capId → [batch logits]
  Q_batch: number[][];
  K_caps: Map<string, number[]>;
} {
  // Compute Q for all examples: [batch × scoringDim]
  const Q_batch = batchComputeQ(intentsBatched, headParams.W_q);
  const scoringDim = headParams.W_k.length;
  const scale = Math.sqrt(scoringDim);

  // Stack all cap embeddings into matrix for batched K computation
  const capIds = Array.from(capEmbeddings.keys());
  const numCaps = capIds.length;
  const E_matrix: number[][] = new Array(numCaps);
  for (let i = 0; i < numCaps; i++) {
    E_matrix[i] = capEmbeddings.get(capIds[i])!;
  }

  // Compute ALL K vectors at once: [numCaps × hidden] @ [hidden × scoringDim]^T = [numCaps × scoringDim]
  const K_all = math.matmulTranspose(E_matrix, headParams.W_k);

  // Compute ALL scores at once: [batch × scoringDim] @ [scoringDim × numCaps]^T = [batch × numCaps]
  // Q_batch @ K_all^T / sqrt(dim)
  const logitsMatrix = math.matmulTranspose(Q_batch, K_all);

  // Build result maps
  const scores = new Map<string, number[]>();
  const logits = new Map<string, number[]>();
  const K_caps = new Map<string, number[]>();

  const batchSize = Q_batch.length;
  for (let c = 0; c < numCaps; c++) {
    const capId = capIds[c];
    K_caps.set(capId, K_all[c]);

    // Extract scores/logits for this cap from batched result
    const capLogits: number[] = new Array(batchSize);
    const capScores: number[] = new Array(batchSize);
    for (let b = 0; b < batchSize; b++) {
      const logit = logitsMatrix[b][c] / scale;
      capLogits[b] = logit;
      capScores[b] = math.sigmoid(logit);
    }
    logits.set(capId, capLogits);
    scores.set(capId, capScores);
  }

  return { scores, logits, Q_batch, K_caps };
}

/**
 * Full batched K-head forward pass (all heads)
 *
 * @param intents Original intent embeddings: [batch × embeddingDim]
 * @param W_intent Intent projection: [hidden × embedding]
 * @param capEmbeddings Map of capId → embedding (from message passing)
 * @param headParams Array of head parameters
 * @param config SHGAT config
 * @returns Average scores across heads and cache for backward
 */
export function batchedKHeadForward(
  intents: number[][],
  W_intent: number[][],
  capEmbeddings: Map<string, number[]>,
  headParams: HeadParams[],
  config: SHGATConfig,
): {
  scores: Map<string, number[]>; // capId → [batch avg scores]
  logits: Map<string, number[]>; // capId → [batch avg logits]
  cache: {
    intentsBatched: number[][];
    Q_batches: number[][][]; // [head][batch][scoringDim]
    K_caps: Map<string, number[][]>; // capId → [head][scoringDim]
  };
} {
  const batchSize = intents.length;
  const { numHeads } = config;

  // Project all intents: [batch × hidden]
  const intentsBatched = batchProjectIntents(intents, W_intent);

  // Store per-head results
  const perHeadScores: Map<string, number[][]> = new Map(); // capId → [head][batch]
  const perHeadLogits: Map<string, number[][]> = new Map();
  const Q_batches: number[][][] = [];
  const K_caps_all: Map<string, number[][]> = new Map();

  // Initialize maps
  for (const capId of capEmbeddings.keys()) {
    perHeadScores.set(capId, []);
    perHeadLogits.set(capId, []);
    K_caps_all.set(capId, []);
  }

  // Forward through all heads
  for (let h = 0; h < numHeads; h++) {
    const { scores, logits, Q_batch, K_caps } = batchedKHeadForwardOneHead(
      intentsBatched,
      capEmbeddings,
      headParams[h],
    );

    Q_batches.push(Q_batch);

    for (const [capId, capScores] of scores) {
      perHeadScores.get(capId)!.push(capScores);
      perHeadLogits.get(capId)!.push(logits.get(capId)!);
      K_caps_all.get(capId)!.push(K_caps.get(capId)!);
    }
  }

  // Average across heads
  const avgScores = new Map<string, number[]>();
  const avgLogits = new Map<string, number[]>();

  for (const [capId, headScoresArr] of perHeadScores) {
    const avgS: number[] = new Array(batchSize).fill(0);
    const avgL: number[] = new Array(batchSize).fill(0);
    const headLogitsArr = perHeadLogits.get(capId)!;

    for (let h = 0; h < numHeads; h++) {
      for (let b = 0; b < batchSize; b++) {
        avgS[b] += headScoresArr[h][b] / numHeads;
        avgL[b] += headLogitsArr[h][b] / numHeads;
      }
    }

    avgScores.set(capId, avgS);
    avgLogits.set(capId, avgL);
  }

  return {
    scores: avgScores,
    logits: avgLogits,
    cache: {
      intentsBatched,
      Q_batches,
      K_caps: K_caps_all,
    },
  };
}

// ============================================================================
// Batched Backward Pass
// ============================================================================

/**
 * Backward through K-head scoring (InfoNCE path)
 *
 * Accumulates gradients for W_q, W_k across examples.
 * Optimized for small batches (typical: batch=1 per call).
 *
 * @param dLogits Gradient of loss w.r.t. logits: [batch]
 * @param Q_batch Q vectors: [batch × scoringDim]
 * @param K K vector for this cap: [scoringDim]
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param capEmbedding Capability embedding: [hidden]
 * @param headParams Head parameters
 * @param grads Gradient accumulators
 * @param headIdx Head index
 * @returns Gradients w.r.t. intentsBatched and capEmbedding
 */
export function batchedBackpropKHeadLogit(
  dLogits: number[],
  Q_batch: number[][],
  K: number[],
  intentsBatched: number[][],
  capEmbedding: number[],
  headParams: HeadParams,
  grads: KHeadGradientAccumulators,
  headIdx: number,
): {
  dIntentsBatched: number[][];
  dCapEmbedding: number[];
} {
  const scoringDim = K.length;
  const scale = Math.sqrt(scoringDim);
  const batchSize = dLogits.length;
  const hiddenDim = intentsBatched[0]?.length ?? 0;

  const dIntentsBatched: number[][] = [];
  const dCapEmbeddingAccum = new Array(hiddenDim).fill(0);

  for (let b = 0; b < batchSize; b++) {
    const dLogit = dLogits[b];
    const Q = Q_batch[b];
    const intent = intentsBatched[b];

    // dLoss/d(Q·K) = dLogit / √dim
    const dDotQK = dLogit / scale;

    // Gradients w.r.t. Q and K
    const dQ = K.map((k) => dDotQK * k);
    const dK = Q.map((q) => dDotQK * q);

    // Accumulate W_q gradient: dW_q += dQ ⊗ intent
    math.outerProductAdd(grads.dW_q[headIdx], dQ, intent);

    // Accumulate W_k gradient: dW_k += dK ⊗ capEmb
    math.outerProductAdd(grads.dW_k[headIdx], dK, capEmbedding);

    // Gradient w.r.t. intentProjected: dIntent = W_q^T @ dQ
    const dIntent = math.matVecTransposeBlas(headParams.W_q, dQ);
    dIntentsBatched.push(dIntent);

    // Accumulate gradient w.r.t. capEmbedding: dCap = W_k^T @ dK
    const dCap = math.matVecTransposeBlas(headParams.W_k, dK);
    for (let j = 0; j < hiddenDim; j++) {
      dCapEmbeddingAccum[j] += dCap[j] ?? 0;
    }
  }

  return {
    dIntentsBatched,
    dCapEmbedding: dCapEmbeddingAccum,
  };
}

/**
 * Backward through W_intent projection
 *
 * dW_intent += Σ dIntentProjected[b] ⊗ intentOriginal[b]
 *
 * @param dIntentsBatched Gradients: [batch × hidden]
 * @param intentsOriginal Original intents: [batch × embedding]
 * @param dW_intent Gradient accumulator: [hidden × embedding]
 */
export function batchedBackpropWIntent(
  dIntentsBatched: number[][],
  intentsOriginal: number[][],
  dW_intent: number[][],
): void {
  // Use batched matmul: dW_intent += DIntents^T @ Intents
  // [hiddenDim × numUpdates] @ [numUpdates × embeddingDim] = [hiddenDim × embeddingDim]
  if (dIntentsBatched.length > 0) {
    const dIntentsT = math.transpose(dIntentsBatched);
    const update = math.matmul(dIntentsT, intentsOriginal);
    for (let i = 0; i < update.length; i++) {
      for (let j = 0; j < update[i].length; j++) {
        dW_intent[i][j] += update[i][j];
      }
    }
  }
}

// ============================================================================
// Truly Batched Backward Pass (16 matmuls instead of 576 outer products)
// ============================================================================

/**
 * Truly batched backward pass for K-head gradients
 *
 * Instead of 576 separate outer products, collects all gradient info and does:
 * - 16 matmuls for dW_q (one per head)
 * - 16 matmuls for dW_k (one per head)
 * - 16 matmuls for dIntent (one per head)
 *
 * Performance: ~36x fewer FFI calls, ~36x less allocation overhead
 *
 * @param entries All backward entries (from positive + negative caps)
 * @param kheadCache Cache from forward pass (Q_batches, K_caps)
 * @param intentsBatched Projected intents [numExamples × hiddenDim]
 * @param capEmbeddings Map of capId → embedding
 * @param headParams Array of head parameters
 * @param grads Gradient accumulators
 * @param config SHGAT config
 * @returns Map of capIdx → dCapEmbedding for routing to message passing backward
 */
export function batchedBackwardAllHeads(
  entries: BackwardEntry[],
  kheadCache: {
    Q_batches: number[][][]; // [head][batch][scoringDim]
    K_caps: Map<string, number[][]>; // capId → [head][scoringDim]
  },
  intentsBatched: number[][],
  capEmbeddings: Map<string, number[]>,
  headParams: HeadParams[],
  grads: KHeadGradientAccumulators,
  config: SHGATConfig,
): {
  dIntentsAccum: number[][]; // [numExamples × hiddenDim] accumulated across heads
  dCapEmbeddings: Map<number, number[]>; // capIdx → dCapEmbedding
} {
  const { numHeads } = config;
  const numEntries = entries.length;
  const scoringDim = headParams[0]?.W_q.length ?? 64;
  const hiddenDim = intentsBatched[0]?.length ?? 1024;

  if (numEntries === 0) {
    return {
      dIntentsAccum: intentsBatched.map(() => new Array(hiddenDim).fill(0)),
      dCapEmbeddings: new Map(),
    };
  }

  // Initialize accumulators
  const dIntentsAccum: number[][] = intentsBatched.map(() => new Array(hiddenDim).fill(0));
  const dCapEmbeddings = new Map<number, number[]>();

  // Process each head with batched operations
  for (let h = 0; h < numHeads; h++) {
    // Build matrices for this head:
    // DQ_all: [numEntries × scoringDim] - gradient w.r.t Q for each entry
    // DK_all: [numEntries × scoringDim] - gradient w.r.t K for each entry
    // Intents_all: [numEntries × hiddenDim] - intent for each entry
    // CapEmbs_all: [numEntries × hiddenDim] - cap embedding for each entry

    const DQ_all: number[][] = new Array(numEntries);
    const DK_all: number[][] = new Array(numEntries);
    const Intents_all: number[][] = new Array(numEntries);
    const CapEmbs_all: number[][] = new Array(numEntries);
    const scale = Math.sqrt(scoringDim);

    for (let i = 0; i < numEntries; i++) {
      const entry = entries[i];
      const Q = kheadCache.Q_batches[h][entry.exIdx];
      const K = kheadCache.K_caps.get(entry.capId)?.[h];

      if (!Q || !K) {
        DQ_all[i] = new Array(scoringDim).fill(0);
        DK_all[i] = new Array(scoringDim).fill(0);
        Intents_all[i] = intentsBatched[entry.exIdx] || new Array(hiddenDim).fill(0);
        CapEmbs_all[i] = capEmbeddings.get(entry.capId) || new Array(hiddenDim).fill(0);
        continue;
      }

      // dLoss/d(Q·K) = dLogit / √dim
      const dDotQK = entry.dLogit / scale;

      // dQ = dDotQK * K, dK = dDotQK * Q
      DQ_all[i] = K.map((k) => dDotQK * k);
      DK_all[i] = Q.map((q) => dDotQK * q);
      Intents_all[i] = intentsBatched[entry.exIdx];
      CapEmbs_all[i] = capEmbeddings.get(entry.capId)!;
    }

    // Batched gradient accumulation using matmul:
    // dW_q += DQ^T @ Intents : [scoringDim × numEntries] @ [numEntries × hiddenDim]
    const DQ_T = math.transpose(DQ_all);
    const dW_q_update = math.matmul(DQ_T, Intents_all);
    for (let i = 0; i < scoringDim; i++) {
      for (let j = 0; j < hiddenDim; j++) {
        grads.dW_q[h][i][j] += dW_q_update[i][j];
      }
    }

    // dW_k += DK^T @ CapEmbs : [scoringDim × numEntries] @ [numEntries × hiddenDim]
    const DK_T = math.transpose(DK_all);
    const dW_k_update = math.matmul(DK_T, CapEmbs_all);
    for (let i = 0; i < scoringDim; i++) {
      for (let j = 0; j < hiddenDim; j++) {
        grads.dW_k[h][i][j] += dW_k_update[i][j];
      }
    }

    // dIntent = W_q^T @ DQ : [hiddenDim × scoringDim] @ [scoringDim] for each entry
    // Batched: DIntents = DQ @ W_q : [numEntries × scoringDim] @ [scoringDim × hiddenDim]
    const DIntents_h = math.matmul(DQ_all, headParams[h].W_q);
    for (let i = 0; i < numEntries; i++) {
      const exIdx = entries[i].exIdx;
      for (let j = 0; j < hiddenDim; j++) {
        dIntentsAccum[exIdx][j] += DIntents_h[i][j];
      }
    }

    // dCapEmb = W_k^T @ DK : [hiddenDim × scoringDim] @ [scoringDim] for each entry
    // Batched: DCapEmbs = DK @ W_k : [numEntries × scoringDim] @ [scoringDim × hiddenDim]
    const DCapEmbs_h = math.matmul(DK_all, headParams[h].W_k);
    for (let i = 0; i < numEntries; i++) {
      const capIdx = entries[i].capIdx;
      if (!dCapEmbeddings.has(capIdx)) {
        dCapEmbeddings.set(capIdx, new Array(hiddenDim).fill(0));
      }
      const accum = dCapEmbeddings.get(capIdx)!;
      for (let j = 0; j < hiddenDim; j++) {
        accum[j] += DCapEmbs_h[i][j];
      }
    }
  }

  return { dIntentsAccum, dCapEmbeddings };
}
