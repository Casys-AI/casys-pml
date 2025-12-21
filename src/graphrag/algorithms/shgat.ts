/**
 * SHGAT (SuperHyperGraph Attention Networks)
 *
 * POC implementation of learned attention for capability scoring.
 * Inspired by GAT (Graph Attention Networks) extended to hypergraphs.
 *
 * Key concepts:
 * - Multi-head attention: Multiple attention heads for diversity
 * - Learnable weights: W_i, W_j, attention vector a
 * - Context-conditioned: Score depends on intent + current context
 * - Recursive: Propagates through meta-capabilities via contains edges
 *
 * Training:
 * - Supervised on episodic_events outcomes (success/failure)
 * - Features: intent embedding, context tool embeddings, candidate capability
 * - Label: outcome (1=success, 0=failure)
 *
 * @module graphrag/algorithms/shgat
 */

import { getLogger } from "../../telemetry/logger.ts";

const log = getLogger("default");

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for SHGAT
 */
export interface SHGATConfig {
  /** Number of attention heads */
  numHeads: number;
  /** Hidden dimension for projections */
  hiddenDim: number;
  /** Embedding dimension (should match BGE-M3: 1024) */
  embeddingDim: number;
  /** Decay factor for recursive depth */
  depthDecay: number;
  /** Learning rate for training */
  learningRate: number;
  /** LeakyReLU negative slope */
  leakyReluSlope: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SHGAT_CONFIG: SHGATConfig = {
  numHeads: 4,
  hiddenDim: 64,
  embeddingDim: 1024,
  depthDecay: 0.8,
  learningRate: 0.001,
  leakyReluSlope: 0.2,
};

/**
 * Training example from episodic events
 */
export interface TrainingExample {
  /** Intent embedding (1024-dim) */
  intentEmbedding: number[];
  /** Context tool IDs that were active */
  contextTools: string[];
  /** Candidate capability ID */
  candidateId: string;
  /** Outcome: 1 = success, 0 = failure */
  outcome: number;
}

/**
 * Capability node for attention computation
 */
export interface CapabilityNode {
  id: string;
  /** Embedding (from description or aggregated tools) */
  embedding: number[];
  /** Tools in this capability */
  toolsUsed: string[];
  /** Success rate from history */
  successRate: number;
  /** Parent capabilities (via contains) */
  parents: string[];
  /** Child capabilities (via contains) */
  children: string[];
}

/**
 * Attention result for a capability
 */
export interface AttentionResult {
  capabilityId: string;
  /** Final attention score (0-1) */
  score: number;
  /** Per-head attention weights */
  headWeights: number[];
  /** Contribution from recursive parents */
  recursiveContribution: number;
}

// ============================================================================
// SHGAT Implementation
// ============================================================================

/**
 * SuperHyperGraph Attention Networks
 *
 * Computes context-aware attention scores for capabilities.
 */
export class SHGAT {
  private config: SHGATConfig;

  // Learnable parameters (initialized randomly, trained via gradient descent)
  private W_query: number[][]; // [hiddenDim, embeddingDim]
  private W_key: number[][]; // [hiddenDim, embeddingDim]
  private W_value: number[][]; // [hiddenDim, embeddingDim]
  private attention_a: number[]; // [2 * hiddenDim] for concat attention

  // Per-head parameters
  private headParams: Array<{
    W_q: number[][];
    W_k: number[][];
    W_v: number[][];
    a: number[];
  }>;

  // Capability embeddings cache
  private capabilityEmbeddings: Map<string, number[]> = new Map();
  private capabilityNodes: Map<string, CapabilityNode> = new Map();

  constructor(config: Partial<SHGATConfig> = {}) {
    this.config = { ...DEFAULT_SHGAT_CONFIG, ...config };

    // Initialize parameters
    this.W_query = this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim);
    this.W_key = this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim);
    this.W_value = this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim);
    this.attention_a = this.initializeVector(2 * this.config.hiddenDim);

    // Initialize per-head parameters
    this.headParams = [];
    for (let h = 0; h < this.config.numHeads; h++) {
      this.headParams.push({
        W_q: this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim),
        W_k: this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim),
        W_v: this.initializeMatrix(this.config.hiddenDim, this.config.embeddingDim),
        a: this.initializeVector(2 * this.config.hiddenDim),
      });
    }
  }

  /**
   * Initialize a random matrix (Xavier initialization)
   */
  private initializeMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2.0 / (rows + cols));
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale)
    );
  }

  /**
   * Initialize a random vector
   */
  private initializeVector(size: number): number[] {
    const scale = Math.sqrt(1.0 / size);
    return Array.from({ length: size }, () => (Math.random() - 0.5) * 2 * scale);
  }

  /**
   * Matrix-vector multiplication
   */
  private matVec(matrix: number[][], vector: number[]): number[] {
    return matrix.map((row) => row.reduce((sum, val, i) => sum + val * (vector[i] || 0), 0));
  }

  /**
   * LeakyReLU activation
   */
  private leakyRelu(x: number): number {
    return x > 0 ? x : this.config.leakyReluSlope * x;
  }

  /**
   * Softmax over array
   */
  private softmax(values: number[]): number[] {
    const maxVal = Math.max(...values);
    const exps = values.map((v) => Math.exp(v - maxVal));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  /**
   * Dot product
   */
  private dot(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  }

  /**
   * Register a capability for attention computation
   */
  registerCapability(node: CapabilityNode): void {
    this.capabilityNodes.set(node.id, node);
    this.capabilityEmbeddings.set(node.id, node.embedding);
  }

  /**
   * Compute single-head attention score
   */
  private computeHeadAttention(
    headIdx: number,
    queryEmbedding: number[],
    keyEmbedding: number[],
  ): number {
    const params = this.headParams[headIdx];

    // Project query and key
    const q = this.matVec(params.W_q, queryEmbedding);
    const k = this.matVec(params.W_k, keyEmbedding);

    // Concatenate [q || k]
    const concat = [...q, ...k];

    // Attention score: a^T * LeakyReLU(concat)
    const activated = concat.map((x) => this.leakyRelu(x));
    const score = this.dot(params.a, activated);

    return score;
  }

  /**
   * Compute multi-head attention for a capability given context
   */
  computeAttention(
    intentEmbedding: number[],
    contextToolEmbeddings: number[][],
    capabilityId: string,
  ): AttentionResult {
    const capNode = this.capabilityNodes.get(capabilityId);
    if (!capNode) {
      return {
        capabilityId,
        score: 0,
        headWeights: new Array(this.config.numHeads).fill(0),
        recursiveContribution: 0,
      };
    }

    const capEmbedding = capNode.embedding;

    // Compute attention for each head
    const headScores: number[] = [];

    for (let h = 0; h < this.config.numHeads; h++) {
      // Intent-to-capability attention
      const intentScore = this.computeHeadAttention(h, intentEmbedding, capEmbedding);

      // Context-to-capability attention (average over context tools)
      let contextScore = 0;
      if (contextToolEmbeddings.length > 0) {
        const contextScores = contextToolEmbeddings.map((ctxEmb) =>
          this.computeHeadAttention(h, ctxEmb, capEmbedding)
        );
        contextScore = contextScores.reduce((a, b) => a + b, 0) / contextScores.length;
      }

      // Combine intent and context scores
      const headScore = 0.6 * intentScore + 0.4 * contextScore;
      headScores.push(headScore);
    }

    // Normalize head scores via softmax
    const normalizedHeadWeights = this.softmax(headScores);

    // Weighted average of head scores
    let baseScore = 0;
    for (let h = 0; h < this.config.numHeads; h++) {
      baseScore += normalizedHeadWeights[h] * headScores[h];
    }

    // Recursive contribution from parent capabilities
    let recursiveContribution = 0;
    if (capNode.parents.length > 0) {
      for (const parentId of capNode.parents) {
        const parentResult = this.computeAttention(
          intentEmbedding,
          contextToolEmbeddings,
          parentId,
        );
        recursiveContribution += this.config.depthDecay * parentResult.score;
      }
      recursiveContribution /= capNode.parents.length;
    }

    // Combine base score with recursive contribution
    const finalScore = this.sigmoid(baseScore + recursiveContribution);

    return {
      capabilityId,
      score: finalScore,
      headWeights: normalizedHeadWeights,
      recursiveContribution,
    };
  }

  /**
   * Sigmoid activation
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Score all registered capabilities
   */
  scoreAllCapabilities(
    intentEmbedding: number[],
    contextToolEmbeddings: number[][],
  ): AttentionResult[] {
    const results: AttentionResult[] = [];

    for (const capId of this.capabilityNodes.keys()) {
      const result = this.computeAttention(intentEmbedding, contextToolEmbeddings, capId);
      results.push(result);
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  // ==========================================================================
  // Training
  // ==========================================================================

  /**
   * Compute loss for a single example (binary cross-entropy)
   */
  private computeLoss(predicted: number, actual: number): number {
    const eps = 1e-7;
    const p = Math.max(eps, Math.min(1 - eps, predicted));
    return -actual * Math.log(p) - (1 - actual) * Math.log(1 - p);
  }

  /**
   * Train on a batch of examples
   *
   * Uses simple gradient descent with finite differences.
   * In production, would use proper backpropagation.
   */
  trainBatch(
    examples: TrainingExample[],
    getEmbedding: (id: string) => number[] | null,
  ): { loss: number; accuracy: number } {
    let totalLoss = 0;
    let correct = 0;
    const gradients = this.initializeGradients();

    for (const example of examples) {
      // Get embeddings
      const contextEmbeddings = example.contextTools
        .map((id) => getEmbedding(id))
        .filter((e): e is number[] => e !== null);

      // Forward pass
      const result = this.computeAttention(
        example.intentEmbedding,
        contextEmbeddings,
        example.candidateId,
      );

      // Compute loss
      const loss = this.computeLoss(result.score, example.outcome);
      totalLoss += loss;

      // Track accuracy
      const predicted = result.score > 0.5 ? 1 : 0;
      if (predicted === example.outcome) correct++;

      // Accumulate gradients (simplified: just use loss direction)
      const error = result.score - example.outcome;
      this.accumulateGradients(gradients, error, example, result);
    }

    // Apply gradients
    this.applyGradients(gradients, examples.length);

    return {
      loss: totalLoss / examples.length,
      accuracy: correct / examples.length,
    };
  }

  /**
   * Initialize gradient accumulators
   */
  private initializeGradients(): Map<string, number[][]> {
    const gradients = new Map<string, number[][]>();

    for (let h = 0; h < this.config.numHeads; h++) {
      gradients.set(`W_q_${h}`, this.zeroMatrix(this.config.hiddenDim, this.config.embeddingDim));
      gradients.set(`W_k_${h}`, this.zeroMatrix(this.config.hiddenDim, this.config.embeddingDim));
      gradients.set(`a_${h}`, [this.zeroVector(2 * this.config.hiddenDim)]);
    }

    return gradients;
  }

  private zeroMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  private zeroVector(size: number): number[] {
    return Array(size).fill(0);
  }

  /**
   * Accumulate gradients from an example
   */
  private accumulateGradients(
    gradients: Map<string, number[][]>,
    error: number,
    _example: TrainingExample,
    result: AttentionResult,
  ): void {
    // Simplified gradient: update attention vector proportionally to error
    for (let h = 0; h < this.config.numHeads; h++) {
      const aGrad = gradients.get(`a_${h}`)![0];
      const headContribution = result.headWeights[h] * error;

      for (let i = 0; i < aGrad.length; i++) {
        aGrad[i] += headContribution * this.headParams[h].a[i];
      }
    }
  }

  /**
   * Apply accumulated gradients
   */
  private applyGradients(gradients: Map<string, number[][]>, batchSize: number): void {
    const lr = this.config.learningRate / batchSize;

    for (let h = 0; h < this.config.numHeads; h++) {
      const aGrad = gradients.get(`a_${h}`)![0];

      for (let i = 0; i < this.headParams[h].a.length; i++) {
        this.headParams[h].a[i] -= lr * aGrad[i];
      }
    }
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Export model parameters
   */
  exportParams(): Record<string, unknown> {
    return {
      config: this.config,
      headParams: this.headParams,
      W_query: this.W_query,
      W_key: this.W_key,
      W_value: this.W_value,
      attention_a: this.attention_a,
    };
  }

  /**
   * Import model parameters
   */
  importParams(params: Record<string, unknown>): void {
    if (params.config) {
      this.config = params.config as SHGATConfig;
    }
    if (params.headParams) {
      this.headParams = params.headParams as typeof this.headParams;
    }
    if (params.W_query) {
      this.W_query = params.W_query as number[][];
    }
    if (params.W_key) {
      this.W_key = params.W_key as number[][];
    }
    if (params.W_value) {
      this.W_value = params.W_value as number[][];
    }
    if (params.attention_a) {
      this.attention_a = params.attention_a as number[];
    }
  }

  /**
   * Get model statistics
   */
  getStats(): {
    numHeads: number;
    hiddenDim: number;
    paramCount: number;
    registeredCapabilities: number;
  } {
    const paramCount =
      this.config.numHeads * (
        this.config.hiddenDim * this.config.embeddingDim * 3 + // W_q, W_k, W_v
        2 * this.config.hiddenDim // a
      );

    return {
      numHeads: this.config.numHeads,
      hiddenDim: this.config.hiddenDim,
      paramCount,
      registeredCapabilities: this.capabilityNodes.size,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create SHGAT from capability store
 */
export function createSHGATFromCapabilities(
  capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
    parents?: string[];
    children?: string[];
  }>,
  config?: Partial<SHGATConfig>,
): SHGAT {
  const shgat = new SHGAT(config);

  for (const cap of capabilities) {
    shgat.registerCapability({
      id: cap.id,
      embedding: cap.embedding,
      toolsUsed: cap.toolsUsed,
      successRate: cap.successRate,
      parents: cap.parents || [],
      children: cap.children || [],
    });
  }

  return shgat;
}

/**
 * Train SHGAT on episodic events
 */
export async function trainSHGATOnEpisodes(
  shgat: SHGAT,
  episodes: TrainingExample[],
  getEmbedding: (id: string) => number[] | null,
  options: {
    epochs?: number;
    batchSize?: number;
    onEpoch?: (epoch: number, loss: number, accuracy: number) => void;
  } = {},
): Promise<{ finalLoss: number; finalAccuracy: number }> {
  const epochs = options.epochs || 10;
  const batchSize = options.batchSize || 32;

  let finalLoss = 0;
  let finalAccuracy = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle episodes
    const shuffled = [...episodes].sort(() => Math.random() - 0.5);

    let epochLoss = 0;
    let epochAccuracy = 0;
    let batchCount = 0;

    // Train in batches
    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      const result = shgat.trainBatch(batch, getEmbedding);

      epochLoss += result.loss;
      epochAccuracy += result.accuracy;
      batchCount++;
    }

    epochLoss /= batchCount;
    epochAccuracy /= batchCount;

    finalLoss = epochLoss;
    finalAccuracy = epochAccuracy;

    if (options.onEpoch) {
      options.onEpoch(epoch, epochLoss, epochAccuracy);
    }
  }

  return { finalLoss, finalAccuracy };
}
