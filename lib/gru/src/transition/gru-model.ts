/**
 * Compact Informed GRU — Transition Model (v0.3.0)
 *
 * Predicts next tools (or capabilities) step-by-step and detects goal termination,
 * leveraging structural signals from the hypergraph (Jaccard, bigram, capabilities).
 *
 * Architecture (5 Keras inputs, unified vocab, separate termination head):
 *
 *   contextInput[batch, maxSeqLen, 1024]  -> input_proj Dense(128, linear) -+
 *   transFeatsInput[batch, maxSeqLen, 5]  ------------------ concat[133] ---+
 *                                                            GRU(64, recurrentDropout=0.25)
 *                                                              |  gruOutput[batch, 64]
 *   intentInput[batch, 1024] -> intent_proj Dense(64, relu) --+
 *                                                              |
 *                                              +---------------+-----------------------------+
 *                                              |                                             |
 *                                   [gruOutput + intentProj] = 128D            capProj + compositeProj
 *                                              |                                             |
 *                                   term_hidden Dense(32, relu)              fusion_concat[152]
 *                                   term_head Dense(1, sigmoid)              fusion_dense Dense(64, relu)
 *                                                                            fusion_dropout(0.4)
 *                                                                                    |
 *                                                                         emb_proj Dense(1024)
 *                                                                         similarity_head Dense(vocabSize, softmax, frozen)
 *
 * Changes in v0.3.0:
 *   - Unified vocabulary with VocabNode hierarchy: similarity_head covers
 *     numTools + numVocabNodes items. Leaf nodes (level 0) are atomic tools.
 *     Non-leaf nodes (level 1+ = capabilities, meta-caps) are expanded to
 *     their leaf children when predicted.
 *   - Separate termination head: branched from [gruOutput, intentProj] = 128D,
 *     BEFORE fusion with cap/composite. MLP: Dense(128->32, relu) -> Dense(32->1, sigmoid).
 *   - Single optimizer: replaces the dual-optimizer that caused moment oscillation
 *     on shared parameters.
 *
 * @module gru/transition/gru-model
 */

import { dispose, tf } from "../tf/backend.ts";
import type {
  CompactGRUConfig,
  PredictionResult,
  RankedPrediction,
  StructuralBias,
  ToolCapabilityMap,
  TrainingMetrics,
  TransitionExample,
  VocabNode,
} from "./types.ts";
import { DEFAULT_CONFIG, EMPTY_COMPOSITE_FEATURES } from "./types.ts";
import { computeCapFingerprint, computeTransitionFeatures } from "./structural-bias.ts";

/**
 * Compact Informed GRU — Transition Model
 *
 * Learns to predict next tools and detect goal termination from execution traces.
 * Incorporates structural signals (Jaccard, bigram, capability fingerprints)
 * alongside learned representations.
 */
export class CompactInformedGRU {
  readonly config: CompactGRUConfig;
  private model: tf.LayersModel | null = null;
  private optimizer: tf.Optimizer | null = null;

  // Unified vocabulary: nodes indexed 0..vocabSize-1
  // Level 0 (leaf/tool) indices come first: 0..numTools-1
  // Level 1+ (caps, meta-caps) follow: numTools..vocabSize-1
  private nodeToIndex = new Map<string, number>();
  private indexToNode = new Map<number, VocabNode>();
  private toolEmbeddings = new Map<string, number[]>();

  /**
   * Total output vocabulary size = numTools + numVocabNodes.
   * Leaf nodes (level 0) occupy indices 0..numTools-1.
   * Higher-level nodes occupy numTools..vocabSize-1.
   */
  private get vocabSize(): number {
    return this.config.numTools + this.config.numVocabNodes;
  }

  // Structural bias
  private toolCapMap: ToolCapabilityMap | null = null;
  private jaccardMatrix: Float32Array | null = null;
  private bigramMatrix: Float32Array | null = null;

  // Hierarchy maps for soft labels (built in setToolVocabulary)
  // tool index → cap indices that contain this tool
  private toolIdxToCapIndices = new Map<number, number[]>();
  // cap index → child tool/cap indices
  private capIdxToChildIndices = new Map<number, number[]>();

  // Temperature state (mutated during annealing)
  private currentTemperature: number;

  constructor(config: Partial<CompactGRUConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentTemperature = this.config.temperatureStart;
  }

  // ---------------------------------------------------------------------------
  // Model construction
  // ---------------------------------------------------------------------------

  /**
   * Build the Keras functional model with 5 inputs and 2 outputs.
   *
   * Inputs:
   *   1. contextInput    [batch, maxSeqLen, embeddingDim]
   *   2. transFeatsInput [batch, maxSeqLen, numTransitionFeatures]
   *   3. intentInput     [batch, embeddingDim]
   *   4. capInput        [batch, numCapabilities]
   *   5. compositeInput  [batch, compositeFeatureDim]
   *
   * Outputs:
   *   1. nextToolProbs  [batch, vocabSize] (softmax) — unified vocabulary (all levels)
   *   2. terminationProb [batch, 1] (sigmoid)
   *
   * Architecture changes (v0.3.0):
   *   - similarity_head output = vocabSize (numTools + numVocabNodes)
   *   - termination_head branched from concat([gruOutput, intentProj]) = 128D
   *     BEFORE fusion with cap/composite. MLP: Dense(128→32, ReLU) → Dense(32→1, sigmoid)
   *   - Single optimizer (no more dual-optimizer oscillation)
   *   - Unified VocabNode hierarchy (level-based, not type-based)
   */
  private buildModel(): void {
    const {
      embeddingDim,
      inputProjDim,
      hiddenDim,
      intentProjDim,
      capProjDim,
      compositeFeatureDim,
      compositeProjDim,
      numTransitionFeatures,
      numCapabilities,
      numTools,
      dropout,
      recurrentDropout,
      maxSeqLen,
    } = this.config;

    const outputVocabSize = this.vocabSize;

    if (numTools === 0) {
      throw new Error(
        "[CompactInformedGRU] numTools is 0. Call setToolVocabulary() before buildModel().",
      );
    }

    // --- Input layers ---

    const contextInput = tf.input({
      shape: [maxSeqLen, embeddingDim],
      name: "context_input",
    });

    const transFeatsInput = tf.input({
      shape: [maxSeqLen, numTransitionFeatures],
      name: "trans_feats_input",
    });

    const intentInput = tf.input({
      shape: [embeddingDim],
      name: "intent_input",
    });

    const capInput = tf.input({
      shape: [numCapabilities],
      name: "cap_input",
    });

    const compositeInput = tf.input({
      shape: [compositeFeatureDim],
      name: "composite_input",
    });

    // --- Context branch: project + concat features + GRU ---

    // Project tool embeddings 1024 -> 128 (linear, no activation)
    const projectedContext = tf.layers
      .dense({
        units: inputProjDim,
        activation: "linear",
        name: "input_proj",
      })
      .apply(contextInput) as tf.SymbolicTensor;

    // Concat projected context [batch, maxSeqLen, 128] + transition features [batch, maxSeqLen, 5]
    // = [batch, maxSeqLen, 133]
    const gruInput = tf.layers
      .concatenate({ axis: -1, name: "context_concat" })
      .apply([projectedContext, transFeatsInput]) as tf.SymbolicTensor;

    // GRU: [batch, maxSeqLen, 133] -> [batch, 64]
    // Note: no Masking layer — tf.any() used internally by Masking has no gradient
    // on the native Node.js backend (tfjs-node). Zero-padded timesteps produce
    // near-zero GRU contributions which the model learns to handle.
    const gruOutput = tf.layers
      .gru({
        units: hiddenDim,
        returnSequences: false,
        returnState: false,
        recurrentDropout,
        name: "gru",
      })
      .apply(gruInput) as tf.SymbolicTensor;

    // --- Static branch: intent + capability fingerprint ---

    const intentProj = tf.layers
      .dense({
        units: intentProjDim,
        activation: "relu",
        name: "intent_proj",
      })
      .apply(intentInput) as tf.SymbolicTensor;

    const capProj = tf.layers
      .dense({
        units: capProjDim,
        activation: "relu",
        name: "cap_proj",
      })
      .apply(capInput) as tf.SymbolicTensor;

    // Composite features: [batch, 3] -> [batch, 8]
    const compositeProj = tf.layers
      .dense({
        units: compositeProjDim,
        activation: "relu",
        name: "composite_proj",
      })
      .apply(compositeInput) as tf.SymbolicTensor;

    // --- Termination head (SEPARATE branch, before fusion with cap/composite) ---
    // concat([gruOutput[64], intentProj[64]]) = [128]
    // → Dense(128→32, relu) → Dense(32→1, sigmoid)
    // Rationale: termination depends on sequence progress + intent match,
    // NOT on capability fingerprint or composite scoring (which serve next-tool).
    // Isolated gradient path eliminates dual-optimizer oscillation.

    const termInput = tf.layers
      .concatenate({ name: "term_input_concat" })
      .apply([gruOutput, intentProj]) as tf.SymbolicTensor;

    const termHidden = tf.layers
      .dense({
        units: 32,
        activation: "relu",
        name: "term_hidden",
      })
      .apply(termInput) as tf.SymbolicTensor;

    const terminationOutput = tf.layers
      .dense({
        units: 1,
        activation: "sigmoid",
        name: "termination_head",
      })
      .apply(termHidden) as tf.SymbolicTensor;

    // --- Fusion: concat GRU[64] + intent[64] + cap[16] + composite[8] = [152] ---

    const fused = tf.layers
      .concatenate({ name: "fusion_concat" })
      .apply([gruOutput, intentProj, capProj, compositeProj]) as tf.SymbolicTensor;

    const fusionDense = tf.layers
      .dense({
        units: hiddenDim,
        activation: "relu",
        name: "fusion_dense",
      })
      .apply(fused) as tf.SymbolicTensor;

    const fusionDropout = tf.layers
      .dropout({ rate: dropout, name: "fusion_dropout" })
      .apply(fusionDense) as tf.SymbolicTensor;

    // --- Next-tool output head ---

    // Embedding projection: [batch, 64] -> [batch, 1024]
    const embProj = tf.layers
      .dense({
        units: embeddingDim,
        activation: "linear",
        name: "emb_proj",
      })
      .apply(fusionDropout) as tf.SymbolicTensor;

    // Similarity head: frozen dot-product with node embeddings (all levels) / temperature
    // kernel = embeddings^T / temperature, shape [embeddingDim, vocabSize]
    const nextToolOutput = tf.layers
      .dense({
        units: outputVocabSize,
        activation: "softmax",
        useBias: false,
        trainable: false,
        name: "similarity_head",
      })
      .apply(embProj) as tf.SymbolicTensor;

    // --- Assemble model ---

    this.model = tf.model({
      inputs: [contextInput, transFeatsInput, intentInput, capInput, compositeInput],
      outputs: [nextToolOutput, terminationOutput],
      name: "CompactInformedGRU",
    });
  }

  // ---------------------------------------------------------------------------
  // Tool vocabulary and structural initialization
  // ---------------------------------------------------------------------------

  /**
   * Set tool vocabulary and embeddings. Rebuilds the model.
   *
   * @param tools - Map of tool ID -> embedding vector (1024-d). These become level-0 leaf nodes.
   * @param toolCapMap - Binary tool-to-capability mapping (for structural bias).
   * @param higherLevelNodes - Optional array of VocabNode with level > 0 (capabilities, meta-caps).
   *   When provided, these are appended to the output vocabulary after leaf tools.
   *   Nodes whose children are not all in the tools map are silently skipped.
   *   The similarity_head covers [numTools + accepted_higher_nodes] output units.
   */
  setToolVocabulary(
    tools: Map<string, number[]>,
    toolCapMap: ToolCapabilityMap,
    higherLevelNodes?: VocabNode[],
  ): void {
    this.toolEmbeddings = tools;
    this.toolCapMap = toolCapMap;
    this.nodeToIndex.clear();
    this.indexToNode.clear();

    // Register leaf nodes (level 0) — indices 0..numTools-1
    let idx = 0;
    for (const [toolId, embedding] of tools) {
      const node: VocabNode = { id: toolId, level: 0, embedding };
      this.nodeToIndex.set(toolId, idx);
      this.indexToNode.set(idx, node);
      idx++;
    }

    // Update dynamic config
    (this.config as { numTools: number }).numTools = tools.size;
    (this.config as { numCapabilities: number }).numCapabilities = toolCapMap.numCapabilities;

    // Register higher-level nodes (level 1+) — indices numTools..vocabSize-1
    // Iterate until stable: L1 caps (children=tools) first, then L2 (children=L1), etc.
    let numVocabNodes = 0;
    if (higherLevelNodes && higherLevelNodes.length > 0) {
      const pending = higherLevelNodes.filter(n => n.level > 0);
      let prevSize = -1;
      while (this.nodeToIndex.size !== prevSize) {
        prevSize = this.nodeToIndex.size;
        for (const node of pending) {
          if (this.nodeToIndex.has(node.id)) continue;

          const allChildrenKnown = (node.children ?? []).every(
            (cid) => this.nodeToIndex.has(cid),
          );
          if (!allChildrenKnown) continue;

          this.nodeToIndex.set(node.id, idx);
          this.indexToNode.set(idx, node);
          idx++;
          numVocabNodes++;
        }
      }
    }
    (this.config as { numVocabNodes: number }).numVocabNodes = numVocabNodes;

    // Build hierarchy maps for soft labels
    this.toolIdxToCapIndices.clear();
    this.capIdxToChildIndices.clear();
    // Pass 1: direct parent→child edges
    for (const [nodeIdx, node] of this.indexToNode) {
      if (node.level > 0 && node.children && node.children.length > 0) {
        const childIndices: number[] = [];
        for (const childId of node.children) {
          const childIdx = this.nodeToIndex.get(childId);
          if (childIdx === undefined) continue;
          childIndices.push(childIdx);
          const existing = this.toolIdxToCapIndices.get(childIdx) ?? [];
          existing.push(nodeIdx);
          this.toolIdxToCapIndices.set(childIdx, existing);
        }
        if (childIndices.length > 0) {
          this.capIdxToChildIndices.set(nodeIdx, childIndices);
        }
      }
    }
    // Pass 2 transitive propagation DISABLED — champion used direct parents only.
    // Transitive walk dilutes soft labels across too many ancestors.

    // Rebuild model with correct dimensions
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.optimizer) {
      this.optimizer.dispose();
      this.optimizer = null;
    }
    this.buildModel();

    // Inject frozen similarity weights
    this.initSimilarityWeights();
  }

  /**
   * Inject pre-computed structural bias matrices.
   *
   * @param bias - Jaccard + bigram matrices.
   */
  setStructuralBias(bias: StructuralBias): void {
    if (bias.numTools !== this.config.numTools) {
      throw new Error(
        `[CompactInformedGRU] StructuralBias numTools (${bias.numTools}) does not match ` +
          `config numTools (${this.config.numTools}). Call setToolVocabulary first.`,
      );
    }
    this.jaccardMatrix = bias.jaccardMatrix;
    this.bigramMatrix = bias.bigramMatrix;
  }

  /**
   * Initialize the frozen similarity_head kernel with node embeddings / temperature.
   * kernel shape = [embeddingDim, vocabSize]
   * All nodes (all levels) are placed at their index position in the matrix.
   */
  private initSimilarityWeights(): void {
    if (!this.model) return;

    const embDim = this.config.embeddingDim;
    const vs = this.vocabSize;
    const T = this.currentTemperature;

    // Build embedding matrix [vocabSize, embDim] from unified node registry
    const embData = new Float32Array(vs * embDim);

    for (const [nodeIdx, node] of this.indexToNode) {
      const base = nodeIdx * embDim;
      for (let d = 0; d < embDim; d++) {
        embData[base + d] = node.embedding[d];
      }
    }

    // kernel = embeddings^T / T -> [embDim, vocabSize]
    tf.tidy(() => {
      const embMatrix = tf.tensor2d(embData, [vs, embDim]);
      const transposed = embMatrix.transpose(); // [embDim, vocabSize]
      const kernel = transposed.div(tf.scalar(T));

      const simLayer = this.model!.getLayer("similarity_head");
      simLayer.setWeights([kernel]);
    });
  }

  // ---------------------------------------------------------------------------
  // Temperature annealing
  // ---------------------------------------------------------------------------

  /**
   * Anneal temperature using cosine schedule with early stop.
   * Call once per epoch.
   *
   * @param epoch - Current epoch (0-based).
   * @param totalEpochs - Total number of epochs.
   */
  annealTemperature(epoch: number, totalEpochs: number): void {
    const { temperatureStart, temperatureEnd, annealingStopRatio } = this.config;

    const effectiveEpochs = annealingStopRatio * totalEpochs;
    const progress = Math.min(epoch / Math.max(effectiveEpochs, 1), 1.0);

    // Cosine annealing: T(t) = T_end + (T_start - T_end) * 0.5 * (1 + cos(pi * progress))
    this.currentTemperature = temperatureEnd +
      (temperatureStart - temperatureEnd) *
        0.5 *
        (1 + Math.cos(Math.PI * progress));

    // Re-inject scaled embeddings with new temperature
    if (this.model && this.toolEmbeddings.size > 0) {
      this.initSimilarityWeights();
    }
  }

  // ---------------------------------------------------------------------------
  // Input preparation helpers
  // ---------------------------------------------------------------------------

  /**
   * Look up embedding for a tool ID. Returns zero vector for unknown tools.
   */
  private getToolEmbedding(toolId: string): number[] {
    const emb = this.toolEmbeddings.get(toolId);
    if (emb) return emb;
    // Check higher-level nodes (caps L1+) registered via setToolVocabulary
    const idx = this.nodeToIndex.get(toolId);
    if (idx !== undefined) {
      const node = this.indexToNode.get(idx);
      if (node?.embedding) return node.embedding;
    }
    return new Array(this.config.embeddingDim).fill(0);
  }

  /**
   * Resolve tool ID to integer index. Returns -1 for unknown tools.
   * Works for any node level, but primarily used for leaf (L0) tools.
   */
  private getToolIndex(toolId: string): number {
    return this.nodeToIndex.get(toolId) ?? -1;
  }

  /**
   * Resolve a unified vocabulary index to a VocabNode.
   * Returns null for out-of-range indices.
   */
  private resolveVocabIndex(idx: number): VocabNode | null {
    return this.indexToNode.get(idx) ?? null;
  }

  /**
   * Resolve a tool/cap ID to its L0 tool indices (for structural features).
   *
   * - L0 tool → [idx]
   * - L1 cap → indices of its L0 children
   * - L2 cap → BFS down to L0 children (through L1 intermediaries)
   * - Unknown → []
   *
   * Used by prepareBatchInputs (cap fingerprint, transition features)
   * and applyStructuralBias (Jaccard/bigram row resolution).
   */
  private resolveToL0Indices(toolId: string): number[] {
    const idx = this.nodeToIndex.get(toolId);
    if (idx === undefined) return [];
    if (idx < this.config.numTools) return [idx];
    const node = this.indexToNode.get(idx);
    if (!node?.children) return [];
    const result: number[] = [];
    const queue = [...node.children];
    while (queue.length > 0) {
      const childId = queue.shift()!;
      const childIdx = this.nodeToIndex.get(childId);
      if (childIdx === undefined) continue;
      if (childIdx < this.config.numTools) {
        result.push(childIdx);
      } else {
        const childNode = this.indexToNode.get(childIdx);
        if (childNode?.children) queue.push(...childNode.children);
      }
    }
    return result;
  }

  /**
   * Expand a prediction: if the predicted node is a leaf (level 0),
   * return [nodeId]. If it is a higher-level node (level 1+),
   * return its children (leaf tool IDs).
   * This is used by buildPath to expand non-leaf predictions into the context.
   */
  private expandPrediction(idx: number): string[] {
    const node = this.resolveVocabIndex(idx);
    if (!node) return [];
    if (node.level === 0) return [node.id];
    // Non-leaf → expand to its leaf children
    return node.children ?? [];
  }

  /**
   * Prepare the 5 input tensors for a batch of examples.
   *
   * @returns Object with 5 tensors, caller must dispose.
   */
  private prepareBatchInputs(examples: TransitionExample[]): {
    contextTensor: tf.Tensor3D;
    transFeatsTensor: tf.Tensor3D;
    intentTensor: tf.Tensor2D;
    capTensor: tf.Tensor2D;
    compositeTensor: tf.Tensor2D;
  } {
    const {
      embeddingDim,
      numTransitionFeatures,
      numCapabilities,
      compositeFeatureDim,
      maxSeqLen,
    } = this.config;
    const batchSize = examples.length;

    // Pre-allocate flat arrays
    const contextData = new Float32Array(
      batchSize * maxSeqLen * embeddingDim,
    );
    const transFeatsData = new Float32Array(
      batchSize * maxSeqLen * numTransitionFeatures,
    );
    const intentData = new Float32Array(batchSize * embeddingDim);
    const capData = new Float32Array(batchSize * numCapabilities);
    const compositeData = new Float32Array(batchSize * compositeFeatureDim);

    for (let b = 0; b < batchSize; b++) {
      const ex = examples[b];

      // --- Intent input (flat copy) ---
      const intentBase = b * embeddingDim;
      for (let d = 0; d < embeddingDim; d++) {
        intentData[intentBase + d] = ex.intentEmbedding[d] ?? 0;
      }

      // --- Context tool indices (resolve caps to their L0 children) ---
      // toolCapMap is numTools × numCaps, so we need L0 indices.
      // Caps in context are resolved to their L0 children via BFS.
      const contextIdxs: number[] = [];
      for (const tid of ex.contextToolIds) {
        const l0 = this.resolveToL0Indices(tid);
        for (const i of l0) contextIdxs.push(i);
      }

      // --- Cap fingerprint (skip if noCapFingerprint) ---
      if (this.toolCapMap && !this.config.noCapFingerprint) {
        const fingerprint = computeCapFingerprint(
          contextIdxs,
          this.toolCapMap,
        );
        const capBase = b * numCapabilities;
        for (let c = 0; c < numCapabilities; c++) {
          capData[capBase + c] = fingerprint[c];
        }
      }

      // --- Composite features (from SHGAT scoreNodes, defaults to zeros) ---
      const compFeats = ex.compositeFeatures ?? EMPTY_COMPOSITE_FEATURES;
      const compBase = b * compositeFeatureDim;
      for (let f = 0; f < compositeFeatureDim; f++) {
        compositeData[compBase + f] = compFeats[f] ?? 0;
      }

      // --- Context embeddings + transition features (padded) ---
      // Take last maxSeqLen tools
      const seqToolIds = ex.contextToolIds.slice(-maxSeqLen);
      const seqLen = seqToolIds.length;
      const padOffset = maxSeqLen - seqLen;

      for (let t = 0; t < seqLen; t++) {
        const toolId = seqToolIds[t];
        const emb = this.getToolEmbedding(toolId);
        const embBase = (b * maxSeqLen + (padOffset + t)) * embeddingDim;
        for (let d = 0; d < embeddingDim; d++) {
          contextData[embBase + d] = emb[d];
        }

        // Transition features at this timestep (skip if noTransitionFeatures)
        if (this.toolCapMap && !this.config.noTransitionFeatures) {
          // Resolve current tool to L0 (caps → first L0 child, not arbitrary index 0)
          const l0Indices = this.resolveToL0Indices(toolId);
          const toolIdx = l0Indices.length > 0 ? l0Indices[0] : -1;
          // Context up to and including this timestep (resolve caps to L0 children)
          const ctxUpToT: number[] = [];
          for (let tt = 0; tt <= t; tt++) {
            const l0 = this.resolveToL0Indices(seqToolIds[tt]);
            for (const i of l0) ctxUpToT.push(i);
          }
          if (toolIdx >= 0) {
            const feats = computeTransitionFeatures(
              toolIdx,
              ctxUpToT,
              this.toolCapMap,
            );
            const featBase = (b * maxSeqLen + (padOffset + t)) * numTransitionFeatures;
            for (let f = 0; f < numTransitionFeatures; f++) {
              transFeatsData[featBase + f] = feats[f];
            }
          }
          // If toolIdx === -1, features stay zero (no fake index 0 noise)
        }
      }
      // Padded positions remain zero (Float32Array default)
    }

    return {
      contextTensor: tf.tensor3d(contextData, [
        batchSize,
        maxSeqLen,
        embeddingDim,
      ]),
      transFeatsTensor: tf.tensor3d(transFeatsData, [
        batchSize,
        maxSeqLen,
        numTransitionFeatures,
      ]),
      intentTensor: tf.tensor2d(intentData, [batchSize, embeddingDim]),
      capTensor: tf.tensor2d(capData, [batchSize, numCapabilities]),
      compositeTensor: tf.tensor2d(compositeData, [batchSize, compositeFeatureDim]),
    };
  }

  /**
   * Prepare single-example inputs for inference.
   *
   * @param compositeFeatures - Optional composite scoring features from SHGAT.
   *   When provided, enables the continuous spectrum routing (no binary threshold).
   */
  private prepareSingleInput(
    intentEmb: number[],
    contextToolIds: string[],
    compositeFeatures?: number[],
  ): {
    contextTensor: tf.Tensor3D;
    transFeatsTensor: tf.Tensor3D;
    intentTensor: tf.Tensor2D;
    capTensor: tf.Tensor2D;
    compositeTensor: tf.Tensor2D;
  } {
    return this.prepareBatchInputs([
      {
        intentEmbedding: intentEmb,
        contextToolIds,
        targetToolId: "",
        isTerminal: 0,
        isSingleTool: false,
        compositeFeatures,
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Training
  // ---------------------------------------------------------------------------

  /**
   * Train on a batch of examples.
   *
   * Loss (single pass, single optimizer):
   *   L = L_nextTool + n8nWeight * L_KL + terminationLossWeight * L_termination
   *
   * The termination head is branched from [gruOutput, intentProj] (128D) BEFORE
   * the next-tool fusion, giving it an isolated feature space. A single Adam
   * optimizer replaces the previous dual-optimizer approach, eliminating
   * moment oscillation on shared parameters.
   *
   * @param examples - Batch of transition examples.
   * @returns Per-step training metrics.
   */
  trainStep(examples: TransitionExample[]): TrainingMetrics {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }
    if (!this.optimizer) {
      this.optimizer = tf.train.adam(this.config.learningRate);
    }

    const batchSize = examples.length;
    const {
      focalGamma,
      labelSmoothingEpsilon: eps,
      terminationLossWeight,
      n8nLossWeight,
    } = this.config;
    const vs = this.vocabSize;

    // Prepare batch data
    const inputs = this.prepareBatchInputs(examples);

    // Prepare targets
    const targetIndices: number[] = [];
    const termTargets: number[] = [];
    const singleToolMask: number[] = []; // 0 if single-tool (skip next-tool loss), 1 otherwise
    const n8nMaskArr: number[] = []; // 1 if n8n example (has softTargetProbs), 0 if production
    const softTargetsArr: number[][] = []; // [batch, vocabSize] soft target distributions

    for (const ex of examples) {
      // WARN: If targetToolId is not in vocab, it falls back to index 0 (wrong label).
      // Callers SHOULD filter examples upstream (see train-worker-prod.ts).
      // This fallback exists only to avoid a crash mid-batch — it is NOT silent,
      // the worker logs filtered count before calling trainStep.
      const targetIdx = this.nodeToIndex.get(ex.targetToolId);
      targetIndices.push(targetIdx ?? 0);
      termTargets.push(ex.isTerminal);
      singleToolMask.push(ex.isSingleTool ? 0 : 1);

      // n8n vs production routing
      // n8n softTargetProbs may be numTools-sized (no caps) — pad to vocabSize
      const hasN8n = ex.softTargetProbs && ex.softTargetProbs.length > 0;
      n8nMaskArr.push(hasN8n ? 1 : 0);
      if (hasN8n) {
        const padded = new Array(vs).fill(0);
        for (let i = 0; i < Math.min(ex.softTargetProbs!.length, vs); i++) {
          padded[i] = ex.softTargetProbs![i];
        }
        softTargetsArr.push(padded);
      } else {
        softTargetsArr.push(new Array(vs).fill(0));
      }
    }

    const targetIdxTensor = tf.tensor1d(targetIndices, "int32");
    const termTargetTensor = tf.tensor2d(
      termTargets.map((t) => [t]),
      [batchSize, 1],
    );
    const singleToolMaskTensor = tf.tensor1d(singleToolMask);
    const n8nMaskTensor = tf.tensor1d(n8nMaskArr);
    const prodMaskTensor = tf.sub(tf.scalar(1), n8nMaskTensor);
    const softTargetsTensor = tf.tensor2d(softTargetsArr, [batchSize, vs]);

    // Termination class weights (balance positive/negative, prod examples only)
    let prodTermPos = 0;
    let prodCount = 0;
    for (let i = 0; i < batchSize; i++) {
      if (n8nMaskArr[i] === 0) {
        prodCount++;
        if (termTargets[i] === 1) prodTermPos++;
      }
    }
    const prodTermNeg = prodCount - prodTermPos;
    const wPos = prodTermPos > 0 ? prodTermNeg / Math.max(prodCount, 1) : 1.0;
    const wNeg = prodTermNeg > 0 ? prodTermPos / Math.max(prodCount, 1) : 1.0;

    const model = this.model;
    const trainableVars = model.trainableWeights.map(
      // deno-lint-ignore no-explicit-any
      (w: any) => w.val as tf.Variable,
    );

    // --- Build hierarchy soft targets (asymmetric alpha) ---
    // Tool target → spread alphaUp to parent caps (teaches caps from L0 data)
    // Cap target → spread alphaDown to child tools (mild, L0 already has signal)
    const alphaUp = this.config.hierarchyAlphaUp;
    const alphaDown = this.config.hierarchyAlphaDown;
    let hierarchyTargetTensor: tf.Tensor2D | null = null;
    if ((alphaUp > 0 || alphaDown > 0) && (this.toolIdxToCapIndices.size > 0 || this.capIdxToChildIndices.size > 0)) {
      const hierArr = new Float32Array(batchSize * vs);
      for (let b = 0; b < batchSize; b++) {
        const tIdx = targetIndices[b];
        const offset = b * vs;

        // Check if this target has hierarchy neighbors
        const parentCaps = this.toolIdxToCapIndices.get(tIdx);
        const childTools = this.capIdxToChildIndices.get(tIdx);

        if (parentCaps && parentCaps.length > 0 && alphaUp > 0) {
          // Target is a tool with parent caps: spread alphaUp to parents
          hierArr[offset + tIdx] = 1 - alphaUp;
          const share = alphaUp / parentCaps.length;
          for (const capIdx of parentCaps) {
            hierArr[offset + capIdx] += share;
          }
        } else if (childTools && childTools.length > 0 && alphaDown > 0) {
          // Target is a cap with child tools: spread alphaDown to children
          hierArr[offset + tIdx] = 1 - alphaDown;
          const share = alphaDown / childTools.length;
          for (const childIdx of childTools) {
            hierArr[offset + childIdx] += share;
          }
        } else {
          // No hierarchy info — pure one-hot
          hierArr[offset + tIdx] = 1;
        }
      }
      hierarchyTargetTensor = tf.tensor2d(hierArr, [batchSize, vs]);
    }

    let lossVal = 0;
    let nextToolLossVal = 0;
    let terminationLossVal = 0;

    // --- Single pass: combined loss → single optimizer ---
    const combinedCostFn = () => {
      const outputs = model.apply(
        [
          inputs.contextTensor,
          inputs.transFeatsTensor,
          inputs.intentTensor,
          inputs.capTensor,
          inputs.compositeTensor,
        ],
        { training: true },
      ) as tf.Tensor[];
      const probs = outputs[0];
      const termProbs = outputs[1];

      // --- (a) Focal CE with label smoothing, masked for single-tool ---
      const clipped = probs.clipByValue(1e-7, 1 - 1e-7);

      // One-hot for focal weight (always based on primary target, not softened)
      const oneHot = tf.oneHot(targetIdxTensor, vs).toFloat();
      // Hierarchy-aware target: spreads probability to parent/child nodes
      const baseTarget = hierarchyTargetTensor ?? oneHot;
      const smoothedLabels = baseTarget.mul(1 - eps).add(eps / vs);

      // Focal weight uses primary target probability (not hierarchy-softened)
      const pTarget = tf.sum(tf.mul(clipped, oneHot), -1);
      const focalWeight = focalGamma > 0
        ? tf.pow(tf.sub(1, pTarget), focalGamma)
        : tf.onesLike(pTarget);

      const logProbs = tf.log(clipped);
      const perExampleCE = tf.neg(
        tf.sum(tf.mul(smoothedLabels, logProbs), -1),
      );

      const weightedCE = tf.mul(focalWeight, perExampleCE);

      const prodFocalMask = tf.mul(singleToolMaskTensor, prodMaskTensor);
      const maskedFocalCE = tf.mul(weightedCE, prodFocalMask);
      const prodActiveSamples = tf.sum(prodFocalMask);
      const nextToolLoss = tf.div(
        tf.sum(maskedFocalCE),
        tf.maximum(prodActiveSamples, tf.scalar(1)),
      );

      // --- (b) KL divergence for n8n soft-target examples ---
      let n8nLoss: tf.Scalar;
      const n8nCount = tf.sum(n8nMaskTensor);
      const hasN8n = n8nLossWeight > 0 && n8nMaskArr.some((v) => v === 1);

      if (hasN8n) {
        const softClipped = softTargetsTensor.clipByValue(1e-10, 1);
        const klPerExample = tf.sum(
          tf.mul(softClipped, tf.log(tf.div(softClipped, clipped.add(1e-10)))),
          -1,
        );
        const maskedKL = tf.mul(klPerExample, n8nMaskTensor);
        n8nLoss = tf.div(
          tf.sum(maskedKL),
          tf.maximum(n8nCount, tf.scalar(1)),
        ) as tf.Scalar;
      } else {
        n8nLoss = tf.scalar(0);
      }

      // --- (c) Termination BCE (prod-only, class-weighted) ---
      const termClipped = termProbs.clipByValue(1e-7, 1 - 1e-7);
      const perExampleTermBCE = tf.neg(
        tf.add(
          tf.mul(
            tf.scalar(wPos),
            tf.mul(termTargetTensor, tf.log(termClipped)),
          ),
          tf.mul(
            tf.scalar(wNeg),
            tf.mul(
              tf.sub(tf.scalar(1), termTargetTensor),
              tf.log(tf.sub(tf.scalar(1), termClipped)),
            ),
          ),
        ),
      );
      const termMask = prodMaskTensor.reshape([batchSize, 1]);
      const maskedTermBCE = tf.mul(perExampleTermBCE, termMask);
      const prodTermCount = tf.sum(termMask);
      const termBCE = tf.div(
        tf.sum(maskedTermBCE),
        tf.maximum(prodTermCount, tf.scalar(1)),
      );

      nextToolLossVal = (nextToolLoss as tf.Tensor).dataSync()[0];
      terminationLossVal = (termBCE as tf.Tensor).dataSync()[0];

      // Combined loss: L = L_nextTool + w_n8n * L_KL + w_term * L_term
      const totalLoss = tf.add(
        tf.add(
          nextToolLoss,
          tf.mul(tf.scalar(n8nLossWeight), n8nLoss),
        ),
        tf.mul(tf.scalar(terminationLossWeight), termBCE),
      );

      return totalLoss as tf.Scalar;
    };

    // Single gradient pass → single optimizer
    const { value: totalValue, grads: allGrads } = tf.variableGrads(combinedCostFn, trainableVars);
    this.optimizer.applyGradients(allGrads);
    lossVal = totalValue.dataSync()[0];
    totalValue.dispose();
    for (const key of Object.keys(allGrads)) {
      allGrads[key].dispose();
    }

    // Compute accuracy metrics (inference mode, no dropout)
    let nextToolAcc = 0;
    let termAcc = 0;

    tf.tidy(() => {
      const predictions = model.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
        inputs.compositeTensor,
      ]) as tf.Tensor[];

      const predNextIdx = predictions[0].argMax(-1).dataSync();
      const predTermProb = predictions[1].dataSync();

      let correctNext = 0;
      let nextTotal = 0;
      let correctTerm = 0;

      for (let i = 0; i < batchSize; i++) {
        // Next-tool accuracy (skip single-tool AND n8n examples — n8n targets are approximate)
        if (!examples[i].isSingleTool && !examples[i].softTargetProbs) {
          nextTotal++;
          if (predNextIdx[i] === targetIndices[i]) correctNext++;
        }
        // Termination accuracy
        const predTermBool = predTermProb[i] > 0.5 ? 1 : 0;
        if (predTermBool === termTargets[i]) correctTerm++;
      }

      nextToolAcc = nextTotal > 0 ? correctNext / nextTotal : 0;
      termAcc = correctTerm / batchSize;
    });

    // Cleanup
    const tensorsToDispose = [
      inputs.contextTensor,
      inputs.transFeatsTensor,
      inputs.intentTensor,
      inputs.capTensor,
      inputs.compositeTensor,
      targetIdxTensor,
      termTargetTensor,
      singleToolMaskTensor,
      n8nMaskTensor,
      prodMaskTensor,
      softTargetsTensor,
    ];
    if (hierarchyTargetTensor) tensorsToDispose.push(hierarchyTargetTensor);
    dispose(tensorsToDispose);

    return {
      loss: lossVal,
      nextToolLoss: nextToolLossVal,
      terminationLoss: terminationLossVal,
      nextToolAccuracy: nextToolAcc,
      terminationAccuracy: termAcc,
      temperature: this.currentTemperature,
      numTensors: tf.memory().numTensors,
    };
  }

  // ---------------------------------------------------------------------------
  // Inference
  // ---------------------------------------------------------------------------

  /**
   * Predict next tool for a single step.
   *
   * @param intentEmb - Intent embedding [embeddingDim].
   * @param contextToolIds - Tool IDs in the current context.
   * @param compositeFeatures - Optional SHGAT composite scoring features.
   *   Enables continuous spectrum routing (the termination head decides
   *   whether the best composite is sufficient, instead of a binary threshold).
   * @returns Predicted tool, termination flag, and confidence.
   *   If a non-leaf node is predicted, toolId is the first child.
   */
  predictNext(
    intentEmb: number[],
    contextToolIds: string[],
    compositeFeatures?: number[],
  ): PredictionResult {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    return tf.tidy(() => {
      const inputs = this.prepareSingleInput(intentEmb, contextToolIds, compositeFeatures);

      const outputs = this.model!.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
        inputs.compositeTensor,
      ]) as tf.Tensor[];

      const scores = outputs[0].dataSync() as Float32Array;
      const termProb = outputs[1].dataSync() as Float32Array;

      // Apply structural bias in log-space (only to tool indices)
      const adjustedScores = this.applyStructuralBias(
        scores,
        contextToolIds,
      );

      // Argmax over full vocabulary (all levels)
      let maxIdx = 0;
      let maxScore = adjustedScores[0];
      for (let i = 1; i < adjustedScores.length; i++) {
        if (adjustedScores[i] > maxScore) {
          maxScore = adjustedScores[i];
          maxIdx = i;
        }
      }

      // Resolve: could be a leaf tool or higher-level node
      const node = this.resolveVocabIndex(maxIdx);
      const nodeId = node?.id ?? "";
      const toolId = node ? (node.level === 0 ? node.id : (node.children?.[0] ?? "")) : "";

      return {
        toolId,
        nodeId,
        shouldTerminate: termProb[0] > this.config.terminationThreshold,
        confidence: maxScore,
      };
    });
  }

  /**
   * Predict next tool with full ranking (for Hit@K / MRR evaluation).
   *
   * Returns ranked tools (non-leaf nodes are resolved to their first child
   * for backward compatibility with evaluation code).
   *
   * @param intentEmb - Intent embedding.
   * @param contextToolIds - Current context.
   * @param k - Number of top results.
   * @returns Ranked predictions + termination info.
   */
  predictNextTopK(
    intentEmb: number[],
    contextToolIds: string[],
    k = 10,
    compositeFeatures?: number[],
  ): RankedPrediction {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    return tf.tidy(() => {
      const inputs = this.prepareSingleInput(intentEmb, contextToolIds, compositeFeatures);

      const outputs = this.model!.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
        inputs.compositeTensor,
      ]) as tf.Tensor[];

      const scores = outputs[0].dataSync() as Float32Array;
      const termProb = outputs[1].dataSync() as Float32Array;

      const adjustedScores = this.applyStructuralBias(
        scores,
        contextToolIds,
      );

      // Build ranked list from full vocabulary (all levels)
      // nodeId = original vocab node ID (cap name for non-leaf)
      // toolId = resolved first child for non-leaf (backward compat with prod inference)
      const ranked: Array<{ toolId: string; nodeId: string; score: number }> = [];
      for (let i = 0; i < adjustedScores.length; i++) {
        const node = this.resolveVocabIndex(i);
        if (!node) continue;
        const resolvedId = node.level === 0 ? node.id : (node.children?.[0] ?? node.id);
        ranked.push({ toolId: resolvedId, nodeId: node.id, score: adjustedScores[i] });
      }
      ranked.sort((a, b) => b.score - a.score);

      return {
        ranked: ranked.slice(0, k),
        shouldTerminate: termProb[0] > this.config.terminationThreshold,
        terminationProb: termProb[0],
      };
    });
  }

  /**
   * Apply Jaccard + bigram structural bias to probabilities in log-space.
   *
   * Bias is applied only to leaf nodes (level 0, indices 0..numTools-1).
   * Non-leaf nodes (level 1+, indices numTools..vocabSize-1) keep their raw probabilities.
   * Final distribution is renormalized over the full vocabulary.
   *
   * log_probs[L0]  = log(probs[L0]) + alpha * jaccard[lastTool, L0] + beta * bigram[lastTool, L0]
   * log_probs[L1+] = log(probs[L1+])  (no structural bias for non-leaf)
   * adjusted = softmax(log_probs)
   *
   * @param probs - Raw softmax probabilities [vocabSize].
   * @param contextToolIds - Current context (to find last tool).
   * @returns Adjusted probability distribution [vocabSize].
   */
  private applyStructuralBias(
    probs: Float32Array,
    contextToolIds: string[],
  ): Float32Array {
    const numTools = this.config.numTools;
    const vs = this.vocabSize;

    // If no bias matrices or empty context, return raw probs
    if (
      (!this.jaccardMatrix && !this.bigramMatrix) ||
      contextToolIds.length === 0
    ) {
      return probs;
    }

    const lastToolId = contextToolIds[contextToolIds.length - 1];
    // Resolve last context item to L0 indices (caps → their L0 children)
    const lastL0Indices = this.resolveToL0Indices(lastToolId);
    if (lastL0Indices.length === 0) return probs;

    const { jaccardAlpha, bigramBeta } = this.config;

    // Work in log-space over the full vocabulary
    const logProbs = new Float32Array(vs);
    for (let i = 0; i < vs; i++) {
      logProbs[i] = Math.log(Math.max(probs[i], 1e-10));
    }

    // Add Jaccard bias — average rows of L0 children if cap
    if (this.jaccardMatrix) {
      const scale = jaccardAlpha / lastL0Indices.length;
      for (const l0Idx of lastL0Indices) {
        const rowBase = l0Idx * numTools;
        for (let i = 0; i < numTools; i++) {
          logProbs[i] += scale * this.jaccardMatrix[rowBase + i];
        }
      }
    }

    // Add bigram bias — average rows of L0 children if cap
    if (this.bigramMatrix) {
      const scale = bigramBeta / lastL0Indices.length;
      for (const l0Idx of lastL0Indices) {
        const rowBase = l0Idx * numTools;
        for (let i = 0; i < numTools; i++) {
          logProbs[i] += scale * this.bigramMatrix[rowBase + i];
        }
      }
    }

    // Softmax to renormalize over full vocabulary
    let maxLogProb = -Infinity;
    for (let i = 0; i < vs; i++) {
      if (logProbs[i] > maxLogProb) maxLogProb = logProbs[i];
    }

    const adjusted = new Float32Array(vs);
    let sum = 0;
    for (let i = 0; i < vs; i++) {
      adjusted[i] = Math.exp(logProbs[i] - maxLogProb);
      sum += adjusted[i];
    }
    if (sum > 0) {
      for (let i = 0; i < vs; i++) {
        adjusted[i] /= sum;
      }
    }

    return adjusted;
  }

  // ---------------------------------------------------------------------------
  // Path building
  // ---------------------------------------------------------------------------

  /**
   * Build complete tool path from a starting tool using greedy decoding.
   *
   * At each step:
   * 1. Prepare the 5 inputs from the current context
   * 2. Forward pass (model.predict)
   * 3. Apply structural bias (Jaccard + bigram) in log-space
   * 4. Apply sticky bias: if repeat >= stickyMaxRepeat, suppress the repeated tool
   * 5. Argmax -> next node (any level)
   * 6. If non-leaf predicted (level > 0), expand its children into the path
   * 7. Check termination
   *
   * @param intentEmb - Intent embedding.
   * @param firstToolId - Starting tool (typically from SHGAT or GRU autostart).
   * @returns Array of tool IDs forming the path (non-leaf nodes are expanded to children).
   */
  buildPath(intentEmb: number[], firstToolId: string, compositeFeatures?: number[]): string[] {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    const path: string[] = [firstToolId];
    const { maxPathLength, terminationThreshold, stickyMaxRepeat } = this.config;
    const vs = this.vocabSize;

    for (let step = 0; step < maxPathLength - 1; step++) {
      const result = tf.tidy(() => {
        const inputs = this.prepareSingleInput(intentEmb, path, compositeFeatures);

        const outputs = this.model!.predict([
          inputs.contextTensor,
          inputs.transFeatsTensor,
          inputs.intentTensor,
          inputs.capTensor,
          inputs.compositeTensor,
        ]) as tf.Tensor[];

        const probs = outputs[0].dataSync() as Float32Array;
        const termProb = outputs[1].dataSync() as Float32Array;

        // Apply structural bias
        const adjusted = this.applyStructuralBias(probs, path);

        // Sticky bias: penalize excessive repetition
        const lastToolId = path[path.length - 1];
        const lastToolIdx = this.nodeToIndex.get(lastToolId);
        if (lastToolIdx !== undefined) {
          let repeatCount = 0;
          for (let i = path.length - 1; i >= 0; i--) {
            if (path[i] === lastToolId) repeatCount++;
            else break;
          }
          if (repeatCount >= stickyMaxRepeat) {
            adjusted[lastToolIdx] = 0; // Suppress repeated node
          }
        }

        // Argmax over full vocabulary
        let maxIdx = 0;
        let maxScore = adjusted[0];
        for (let i = 1; i < vs; i++) {
          if (adjusted[i] > maxScore) {
            maxScore = adjusted[i];
            maxIdx = i;
          }
        }

        return {
          predictedIdx: maxIdx,
          shouldTerminate: termProb[0] > terminationThreshold,
        };
      });

      // Expand prediction: leaf → [toolId], non-leaf → [child1, child2, ...]
      const expandedTools = this.expandPrediction(result.predictedIdx);
      for (const tid of expandedTools) {
        if (path.length < maxPathLength) {
          path.push(tid);
        }
      }

      // Check termination after adding the tool(s)
      if (result.shouldTerminate || expandedTools.length === 0) {
        break;
      }
    }

    return path;
  }

  /**
   * Build complete tool path using beam search with length normalization.
   *
   * At each step, every active candidate is expanded into two branches:
   *   (a) TERMINATE: path is done, score includes log(termProb)
   *   (b) CONTINUE: expand with top-B next items (tools or caps), score includes log(1 - termProb)
   * Both branches compete on length-normalized score: logProb / length^alpha.
   *
   * Non-leaf nodes are expanded inline: if a level-1+ node is in the top-K,
   * its leaf children are appended to the candidate path.
   *
   * @param intentEmb - Intent embedding.
   * @param firstToolId - Starting tool (typically from SHGAT).
   * @param beamWidth - Number of candidates to keep at each step (default: 3).
   * @param lengthAlpha - Length normalization exponent (default: 0.7).
   * @returns Array of beam results sorted by normalized score (best first).
   */
  buildPathBeam(
    intentEmb: number[],
    firstToolId: string,
    beamWidth: number = 3,
    lengthAlpha: number = 0.7,
    compositeFeatures?: number[],
  ): Array<{ path: string[]; score: number }> {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    const { maxPathLength, stickyMaxRepeat } = this.config;
    const vs = this.vocabSize;

    const normalize = (logProb: number, len: number) => logProb / Math.pow(len, lengthAlpha);

    let candidates: Array<{
      path: string[];
      logProb: number;
    }> = [{ path: [firstToolId], logProb: 0 }];

    const completed: Array<{ path: string[]; logProb: number }> = [];

    for (let step = 0; step < maxPathLength - 1; step++) {
      const nextCandidates: typeof candidates = [];

      for (const candidate of candidates) {
        // Forward pass for this candidate
        const expansions = tf.tidy(() => {
          const inputs = this.prepareSingleInput(intentEmb, candidate.path, compositeFeatures);

          const outputs = this.model!.predict([
            inputs.contextTensor,
            inputs.transFeatsTensor,
            inputs.intentTensor,
            inputs.capTensor,
            inputs.compositeTensor,
          ]) as tf.Tensor[];

          const probs = outputs[0].dataSync() as Float32Array;
          const termProb = outputs[1].dataSync() as Float32Array;

          // Apply structural bias
          const adjusted = this.applyStructuralBias(probs, candidate.path);

          // Sticky bias: suppress excessive repetition
          const lastToolId = candidate.path[candidate.path.length - 1];
          const lastToolIdx = this.nodeToIndex.get(lastToolId);
          if (lastToolIdx !== undefined) {
            let repeatCount = 0;
            for (let i = candidate.path.length - 1; i >= 0; i--) {
              if (candidate.path[i] === lastToolId) repeatCount++;
              else break;
            }
            if (repeatCount >= stickyMaxRepeat) {
              adjusted[lastToolIdx] = 0;
            }
          }

          // Find top-beamWidth items from full vocabulary
          const topK: Array<{ idx: number; prob: number }> = [];
          for (let i = 0; i < vs; i++) {
            if (adjusted[i] > 1e-10) {
              topK.push({ idx: i, prob: adjusted[i] });
            }
          }
          topK.sort((a, b) => b.prob - a.prob);

          return {
            topItems: topK.slice(0, beamWidth),
            termProb: termProb[0],
          };
        });

        const tp = Math.max(expansions.termProb, 1e-10);

        // Branch A: TERMINATE here (only if path has >= 2 tools)
        if (candidate.path.length >= 2) {
          completed.push({
            path: candidate.path,
            logProb: candidate.logProb + Math.log(tp),
          });
        }

        // Branch B: CONTINUE with each top item (leaf or expanded non-leaf)
        const continueLogProb = candidate.logProb + Math.log(1 - tp + 1e-10);
        for (const item of expansions.topItems) {
          const expanded = this.expandPrediction(item.idx);
          if (expanded.length === 0) continue;

          const newPath = [...candidate.path, ...expanded];
          // Truncate to maxPathLength
          const trimmed = newPath.slice(0, maxPathLength);

          nextCandidates.push({
            path: trimmed,
            logProb: continueLogProb + Math.log(Math.max(item.prob, 1e-10)),
          });
        }
      }

      if (nextCandidates.length === 0) break;

      // Keep top-beamWidth candidates by length-normalized score
      nextCandidates.sort(
        (a, b) => normalize(b.logProb, b.path.length) - normalize(a.logProb, a.path.length),
      );
      candidates = nextCandidates.slice(0, beamWidth);
    }

    // Add remaining active candidates to completed
    for (const c of candidates) {
      completed.push({ path: c.path, logProb: c.logProb });
    }

    // Sort by length-normalized score
    completed.sort(
      (a, b) => normalize(b.logProb, b.path.length) - normalize(a.logProb, a.path.length),
    );

    // Deduplicate paths (keep best score)
    const seen = new Set<string>();
    const deduped: typeof completed = [];
    for (const c of completed) {
      const key = c.path.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    return deduped.slice(0, beamWidth * 2).map((c) => ({
      path: c.path,
      score: normalize(c.logProb, c.path.length),
    }));
  }

  /**
   * Build path where GRU itself picks the first tool (context = []).
   * Uses predictNextTopK with empty context, then buildPath from top-1.
   */
  buildPathAutoStart(
    intentEmb: number[],
    compositeFeatures?: number[],
  ): { path: string[]; firstToolRanked: Array<{ toolId: string; score: number }> } {
    const pred = this.predictNextTopK(intentEmb, [], 10, compositeFeatures);
    const firstToolId = pred.ranked[0]?.toolId;
    if (!firstToolId) return { path: [], firstToolRanked: pred.ranked };

    const path = this.buildPath(intentEmb, firstToolId, compositeFeatures);
    return { path, firstToolRanked: pred.ranked };
  }

  /**
   * Multi-start beam: launch beams from each of the top-K first tools
   * (picked by GRU with empty context) and return the best overall path.
   */
  buildPathBeamMultiStart(
    intentEmb: number[],
    numStarts: number = 3,
    beamWidth: number = 3,
    lengthAlpha: number = 0.7,
    compositeFeatures?: number[],
  ): Array<{ path: string[]; score: number; startTool: string }> {
    const pred = this.predictNextTopK(intentEmb, [], numStarts, compositeFeatures);
    const allResults: Array<{ path: string[]; score: number; startTool: string }> = [];

    for (const { toolId } of pred.ranked) {
      const beamResults = this.buildPathBeam(
        intentEmb,
        toolId,
        beamWidth,
        lengthAlpha,
        compositeFeatures,
      );
      for (const r of beamResults) {
        allResults.push({ ...r, startTool: toolId });
      }
    }

    // Sort all paths by score (best first), deduplicate
    allResults.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const deduped: typeof allResults = [];
    for (const r of allResults) {
      const key = r.path.join("|");
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    return deduped.slice(0, beamWidth * numStarts);
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Get current temperature value. */
  getTemperature(): number {
    return this.currentTemperature;
  }

  /** Get node-to-index mapping (all levels). */
  getNodeToIndex(): ReadonlyMap<string, number> {
    return this.nodeToIndex;
  }

  /** Get index-to-node mapping (all levels). */
  getIndexToNode(): ReadonlyMap<number, VocabNode> {
    return this.indexToNode;
  }

  /**
   * Get tool-to-index mapping (leaf nodes only, backward compat).
   * Filters nodeToIndex to only include level-0 nodes.
   */
  getToolToIndex(): ReadonlyMap<string, number> {
    return this.nodeToIndex;
  }

  /**
   * Get index-to-tool mapping (leaf nodes only, backward compat).
   * Returns a view over indexToNode filtered to level-0 nodes, mapped to id strings.
   */
  getIndexToTool(): ReadonlyMap<number, string> {
    const result = new Map<number, string>();
    for (const [idx, node] of this.indexToNode) {
      if (node.level === 0) result.set(idx, node.id);
    }
    return result;
  }

  /** Print model summary to console. */
  summary(): void {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }
    this.model.summary();
  }

  // ---------------------------------------------------------------------------
  // Weight persistence
  // ---------------------------------------------------------------------------

  /**
   * Export all trainable weights as plain JS arrays (JSON-serializable).
   * The similarity_head kernel is excluded (it's derived from embeddings, not learned).
   */
  exportWeights(): { names: string[]; weights: number[][] } {
    if (!this.model) {
      throw new Error("[CompactInformedGRU] Model not built.");
    }
    // deno-lint-ignore no-explicit-any
    const names: string[] = this.model.weights.map((w: any) => w.name as string);
    const tensors = this.model.getWeights();
    const weights: number[][] = tensors.map((t: tf.Tensor) => Array.from(t.dataSync()));
    return { names, weights };
  }

  /**
   * Load weights previously exported by `exportWeights()`.
   * The model must already be built (call setToolVocabulary first) and
   * weight shapes must match. similarity_head is re-injected from embeddings.
   */
  loadWeights(data: { names: string[]; weights: number[][] }): void {
    if (!this.model) {
      throw new Error("[CompactInformedGRU] Model not built. Call setToolVocabulary() first.");
    }
    const currentWeights = this.model.getWeights();
    if (data.weights.length !== currentWeights.length) {
      throw new Error(
        `[CompactInformedGRU] Weight count mismatch: saved=${data.weights.length}, model=${currentWeights.length}`,
      );
    }
    const tensors: tf.Tensor[] = [];
    for (let i = 0; i < currentWeights.length; i++) {
      const shape = currentWeights[i].shape;
      tensors.push(tf.tensor(data.weights[i], shape));
    }
    this.model.setWeights(tensors);
    for (const t of tensors) t.dispose();

    // Re-inject similarity head from current embeddings (overrides saved value)
    this.initSimilarityWeights();
  }

  /** Dispose all TF resources. */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.optimizer) {
      this.optimizer.dispose();
      this.optimizer = null;
    }
  }
}
