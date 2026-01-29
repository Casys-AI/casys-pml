/**
 * GRU-based Transition Model
 *
 * Predicts the next tool in a workflow and detects when to terminate.
 * Replaces DR-DSP for path building.
 *
 * Architecture:
 * - GRU encodes sequence of tool embeddings (context)
 * - Intent embedding combined with GRU hidden state
 * - Two output heads: next tool scores (softmax) + termination prob (sigmoid)
 *
 * Uses TF.js Keras API with tf.model() for proper gradient tracking.
 *
 * @module gru/transition/gru-model
 */

import { tf, dispose } from "../tf/backend.ts";
import type {
  TransitionModelConfig,
  TransitionExample,
  TransitionMetrics,
} from "./types.ts";
import { DEFAULT_TRANSITION_CONFIG } from "./types.ts";

/**
 * GRU-based TransitionModel
 *
 * Learns to predict next tools and detect goal termination from execution traces.
 * Uses TF.js LayersModel for automatic gradient computation.
 */
export class TransitionModel {
  readonly config: TransitionModelConfig;

  // Keras functional model
  private model: tf.LayersModel | null = null;

  // Tool index mapping
  private toolToIndex: Map<string, number> = new Map();
  private indexToTool: Map<number, string> = new Map();

  // Embedding lookup (shared with SHGAT)
  private toolEmbeddings: Map<string, number[]> = new Map();

  // Max sequence length for padding
  private maxSeqLen = 20;

  // Training state
  private compiled = false;

  constructor(config: Partial<TransitionModelConfig> = {}) {
    this.config = { ...DEFAULT_TRANSITION_CONFIG, ...config };
  }

  /**
   * Build the Keras functional model
   */
  private buildModel(): void {
    const { embeddingDim, hiddenDim, numTools, dropout } = this.config;

    // Input layers
    // Context: [batchSize, maxSeqLen, embeddingDim]
    const contextInput = tf.input({
      shape: [this.maxSeqLen, embeddingDim],
      name: "context_input",
    });

    // Intent: [batchSize, embeddingDim]
    const intentInput = tf.input({
      shape: [embeddingDim],
      name: "intent_input",
    });

    // Masking layer to handle padded sequences (zeros)
    const maskedContext = tf.layers.masking({
      maskValue: 0,
    }).apply(contextInput) as tf.SymbolicTensor;

    // GRU layer - returns only final state
    const gruOutput = tf.layers.gru({
      units: hiddenDim,
      returnSequences: false,
      returnState: false,
      dropout: dropout,
      recurrentDropout: dropout,
      name: "gru",
    }).apply(maskedContext) as tf.SymbolicTensor;

    // Intent projection
    const intentProj = tf.layers.dense({
      units: hiddenDim,
      activation: "relu",
      name: "intent_proj",
    }).apply(intentInput) as tf.SymbolicTensor;

    // Combine GRU output + projected intent
    const combined = tf.layers.concatenate({
      name: "combine",
    }).apply([gruOutput, intentProj]) as tf.SymbolicTensor;

    // Hidden projection
    const hidden = tf.layers.dense({
      units: hiddenDim,
      activation: "relu",
      name: "hidden_proj",
    }).apply(combined) as tf.SymbolicTensor;

    // Dropout for regularization
    const hiddenDropout = tf.layers.dropout({
      rate: dropout,
      name: "hidden_dropout",
    }).apply(hidden) as tf.SymbolicTensor;

    // Output heads
    const nextToolOutput = tf.layers.dense({
      units: numTools,
      activation: "softmax",
      name: "next_tool_head",
    }).apply(hiddenDropout) as tf.SymbolicTensor;

    const terminationOutput = tf.layers.dense({
      units: 1,
      activation: "sigmoid",
      name: "termination_head",
    }).apply(hiddenDropout) as tf.SymbolicTensor;

    // Create the model
    this.model = tf.model({
      inputs: [contextInput, intentInput],
      outputs: [nextToolOutput, terminationOutput],
      name: "TransitionModel",
    });
  }

  /**
   * Compile the model for training
   */
  private compileModel(): void {
    if (!this.model) {
      this.buildModel();
    }

    // Cast to any to use lossWeights (valid at runtime but not in types)
    this.model!.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: ["categoricalCrossentropy", "binaryCrossentropy"],
      lossWeights: [1.0, 1.0],
    } as tf.ModelCompileArgs);

    this.compiled = true;
  }

  /**
   * Set tool vocabulary and embeddings
   *
   * Must be called before training or inference.
   */
  setToolVocabulary(tools: Map<string, number[]>): void {
    this.toolEmbeddings = tools;
    this.toolToIndex.clear();
    this.indexToTool.clear();

    let idx = 0;
    for (const toolId of tools.keys()) {
      this.toolToIndex.set(toolId, idx);
      this.indexToTool.set(idx, toolId);
      idx++;
    }

    // Update config
    this.config.numTools = tools.size;

    // Rebuild model with correct output size
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.compiled = false;
    this.buildModel();
  }

  /**
   * Pad context embeddings to maxSeqLen
   */
  private padContext(contextEmbs: number[][]): number[][] {
    const padded: number[][] = [];
    const embDim = this.config.embeddingDim;

    // Take last maxSeqLen items if context is too long
    const startIdx = Math.max(0, contextEmbs.length - this.maxSeqLen);
    const trimmed = contextEmbs.slice(startIdx);

    // Pad with zeros at the beginning
    const padCount = this.maxSeqLen - trimmed.length;
    for (let i = 0; i < padCount; i++) {
      padded.push(new Array(embDim).fill(0));
    }

    // Add actual embeddings
    padded.push(...trimmed);

    return padded;
  }

  /**
   * Get context embeddings as padded array
   */
  private getContextEmbeddings(toolIds: string[]): number[][] {
    const embeddings: number[][] = [];

    for (const id of toolIds) {
      const emb = this.toolEmbeddings.get(id);
      if (emb) {
        embeddings.push(emb);
      } else {
        // Fallback to zeros for unknown tools
        embeddings.push(new Array(this.config.embeddingDim).fill(0));
      }
    }

    // If empty, return single zero vector (will be masked)
    if (embeddings.length === 0) {
      embeddings.push(new Array(this.config.embeddingDim).fill(0));
    }

    return this.padContext(embeddings);
  }

  /**
   * Forward pass for a single example (internal use)
   *
   * Returns raw tensors - caller is responsible for disposal.
   */
  private forward(
    contextTensor: tf.Tensor3D,
    intentTensor: tf.Tensor2D,
  ): { nextToolScores: tf.Tensor2D; terminationProb: tf.Tensor2D } {
    if (!this.model) {
      this.buildModel();
    }

    const outputs = this.model!.predict([contextTensor, intentTensor]) as tf.Tensor[];
    return {
      nextToolScores: outputs[0] as tf.Tensor2D,
      terminationProb: outputs[1] as tf.Tensor2D,
    };
  }

  /**
   * Predict next tool (inference mode)
   *
   * @param intentEmb - Intent embedding
   * @param contextToolIds - Current context
   * @returns Tool ID and termination flag
   */
  async predictNext(
    intentEmb: number[],
    contextToolIds: string[],
  ): Promise<{ toolId: string; shouldTerminate: boolean; confidence: number }> {
    // Prepare tensors
    const contextEmbs = this.getContextEmbeddings(contextToolIds);
    const contextTensor = tf.tensor3d([contextEmbs]);
    const intentTensor = tf.tensor2d([intentEmb]);

    // Forward pass
    const pred = this.forward(contextTensor, intentTensor);
    const argMaxTensor = pred.nextToolScores.argMax(-1);

    // Extract results
    const [scores, termProb, maxIdx] = await Promise.all([
      pred.nextToolScores.data() as Promise<Float32Array>,
      pred.terminationProb.data() as Promise<Float32Array>,
      argMaxTensor.data() as Promise<Int32Array>,
    ]);

    const toolId = this.indexToTool.get(maxIdx[0]) || "";
    const shouldTerminate = termProb[0] > this.config.terminationThreshold;
    const confidence = scores[maxIdx[0]];

    // Cleanup all tensors
    dispose([contextTensor, intentTensor, pred.nextToolScores, pred.terminationProb, argMaxTensor]);

    return { toolId, shouldTerminate, confidence };
  }

  /**
   * Build complete path from first tool
   *
   * @param intentEmb - Intent embedding
   * @param firstToolId - Starting tool (from SHGAT)
   * @returns Array of tool IDs forming the path
   */
  async buildPath(intentEmb: number[], firstToolId: string): Promise<string[]> {
    const path: string[] = [firstToolId];

    // Create intent tensor once (reused across iterations)
    const intentTensor = tf.tensor2d([intentEmb]);

    for (let step = 0; step < this.config.maxPathLength - 1; step++) {
      // Create fresh context tensor for each step
      const contextEmbs = this.getContextEmbeddings(path);
      const contextTensor = tf.tensor3d([contextEmbs]);

      const pred = this.forward(contextTensor, intentTensor);
      const argMaxTensor = pred.nextToolScores.argMax(-1);

      const [termProb, maxIdx] = await Promise.all([
        pred.terminationProb.data() as Promise<Float32Array>,
        argMaxTensor.data() as Promise<Int32Array>,
      ]);

      // Cleanup step tensors
      dispose([contextTensor, pred.nextToolScores, pred.terminationProb, argMaxTensor]);

      if (termProb[0] > this.config.terminationThreshold) {
        break;
      }

      const nextTool = this.indexToTool.get(maxIdx[0]);
      if (nextTool) {
        path.push(nextTool);
      }
    }

    // Cleanup intent tensor
    dispose(intentTensor);

    return path;
  }

  /**
   * Train on a batch of examples
   *
   * Uses model.trainOnBatch() for proper gradient tracking.
   */
  async trainStep(examples: TransitionExample[]): Promise<TransitionMetrics> {
    if (!this.compiled) {
      this.compileModel();
    }

    const batchSize = examples.length;

    // Prepare batch data
    const contextBatch: number[][][] = [];
    const intentBatch: number[][] = [];
    const nextToolTargets: number[][] = [];
    const termTargets: number[][] = [];

    for (const ex of examples) {
      contextBatch.push(this.getContextEmbeddings(ex.contextToolIds));
      intentBatch.push(ex.intentEmbedding);

      const targetIdx = this.toolToIndex.get(ex.targetToolId) ?? 0;
      const oneHot = new Array(this.config.numTools).fill(0);
      oneHot[targetIdx] = 1;
      nextToolTargets.push(oneHot);

      termTargets.push([ex.isTerminal]);
    }

    // Create tensors
    const contextTensor = tf.tensor3d(contextBatch);
    const intentTensor = tf.tensor2d(intentBatch);
    const nextToolTargetTensor = tf.tensor2d(nextToolTargets);
    const termTargetTensor = tf.tensor2d(termTargets);

    // Train on batch
    const result = await this.model!.trainOnBatch(
      [contextTensor, intentTensor],
      [nextToolTargetTensor, termTargetTensor],
    );

    // Compute accuracy
    const predictions = this.model!.predict([contextTensor, intentTensor]) as tf.Tensor[];
    const argMaxTensor = predictions[0].argMax(-1);

    const [predNextTool, predTerm] = await Promise.all([
      argMaxTensor.data() as Promise<Int32Array>,
      predictions[1].data() as Promise<Float32Array>,
    ]);

    let correctNext = 0;
    let correctTerm = 0;

    for (let i = 0; i < batchSize; i++) {
      const targetIdx = this.toolToIndex.get(examples[i].targetToolId) ?? 0;
      if (predNextTool[i] === targetIdx) correctNext++;

      const predTermBool = predTerm[i] > 0.5 ? 1 : 0;
      if (predTermBool === examples[i].isTerminal) correctTerm++;
    }

    // Cleanup all tensors
    dispose([
      contextTensor,
      intentTensor,
      nextToolTargetTensor,
      termTargetTensor,
      predictions[0],
      predictions[1],
      argMaxTensor,
    ]);

    // Build metrics
    const metrics: TransitionMetrics = {
      loss: Array.isArray(result) ? result[0] : result,
      nextToolLoss: Array.isArray(result) ? result[1] : 0,
      terminationLoss: Array.isArray(result) ? result[2] : 0,
      nextToolAccuracy: correctNext / batchSize,
      terminationAccuracy: correctTerm / batchSize,
    };

    return metrics;
  }

  /**
   * Get model summary
   */
  summary(): void {
    if (!this.model) {
      this.buildModel();
    }
    this.model!.summary();
  }

  /**
   * Get all trainable weights
   */
  getWeights(): tf.Tensor[] {
    if (!this.model) {
      this.buildModel();
    }
    return this.model!.getWeights();
  }

  /**
   * Set weights (for loading saved model)
   */
  setWeights(weights: tf.Tensor[]): void {
    if (!this.model) {
      this.buildModel();
    }
    this.model!.setWeights(weights);
  }

  /**
   * Serialize model for persistence
   */
  async serialize(): Promise<{
    config: TransitionModelConfig;
    toolIndex: Record<string, number>;
  }> {
    const toolIndex: Record<string, number> = {};
    for (const [id, idx] of this.toolToIndex) {
      toolIndex[id] = idx;
    }

    return {
      config: this.config,
      toolIndex,
    };
  }

  /**
   * Save model weights to files
   */
  async saveWeights(path: string): Promise<void> {
    if (!this.model) {
      throw new Error("Model not built yet");
    }
    await this.model.save(`file://${path}`);
  }

  /**
   * Load model weights from files
   */
  async loadWeights(path: string): Promise<void> {
    if (!this.model) {
      this.buildModel();
    }
    const loadedModel = await tf.loadLayersModel(`file://${path}/model.json`);
    this.model!.setWeights(loadedModel.getWeights());
    loadedModel.dispose();
  }

  /**
   * Dispose all tensors
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.compiled = false;
  }
}
