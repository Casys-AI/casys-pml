/**
 * Compact Informed GRU — Transition Model
 *
 * Predicts next tools step-by-step and detects goal termination,
 * leveraging structural signals from the hypergraph (Jaccard, bigram, capabilities).
 *
 * Architecture (4 Keras inputs):
 *   contextInput[batch, maxSeqLen, 1024]  -> input_proj Dense(128, linear) -+
 *   transFeatsInput[batch, maxSeqLen, 5]  ------------------ concat[133] ---+
 *                                                            Masking(0)
 *                                                            GRU(64, recurrentDropout=0.25)
 *                                                              |  [batch, 64]
 *   intentInput[batch, 1024] -> intent_proj Dense(64, relu) --+
 *   capInput[batch, numCaps] -> cap_proj Dense(16, relu) -----+-> concat[144]
 *                                                              |
 *                                                        Dense(64, relu)
 *                                                        Dropout(0.4)
 *                                                              |
 *                                              +---------------+---------------+
 *                                     emb_proj Dense(1024)         term_head Dense(1, sigmoid)
 *                                     similarity_head Dense(numTools, softmax, frozen)
 *
 * ~257K trainable parameters (vs 1.64M previous, -84%).
 *
 * @module gru/transition/gru-model
 */

import { tf, dispose } from "../tf/backend.ts";
import type {
  CompactGRUConfig,
  TransitionExample,
  TrainingMetrics,
  PredictionResult,
  RankedPrediction,
  StructuralBias,
  ToolCapabilityMap,
} from "./types.ts";
import { DEFAULT_CONFIG } from "./types.ts";
import {
  computeTransitionFeatures,
  computeCapFingerprint,
} from "./structural-bias.ts";

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
  private termOptimizer: tf.Optimizer | null = null;

  // Tool index mappings
  private toolToIndex = new Map<string, number>();
  private indexToTool = new Map<number, string>();
  private toolEmbeddings = new Map<string, number[]>();

  // Structural bias
  private toolCapMap: ToolCapabilityMap | null = null;
  private jaccardMatrix: Float32Array | null = null;
  private bigramMatrix: Float32Array | null = null;

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
   * Build the Keras functional model with 4 inputs and 2 outputs.
   *
   * Inputs:
   *   1. contextInput  [batch, maxSeqLen, embeddingDim]
   *   2. transFeatsInput [batch, maxSeqLen, numTransitionFeatures]
   *   3. intentInput   [batch, embeddingDim]
   *   4. capInput      [batch, numCapabilities]
   *
   * Outputs:
   *   1. nextToolProbs  [batch, numTools] (softmax)
   *   2. terminationProb [batch, 1] (sigmoid)
   */
  private buildModel(): void {
    const {
      embeddingDim,
      inputProjDim,
      hiddenDim,
      intentProjDim,
      capProjDim,
      numTransitionFeatures,
      numCapabilities,
      numTools,
      dropout,
      recurrentDropout,
      maxSeqLen,
    } = this.config;

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

    // --- Fusion: concat GRU[64] + intent[64] + cap[16] = [144] ---

    const fused = tf.layers
      .concatenate({ name: "fusion_concat" })
      .apply([gruOutput, intentProj, capProj]) as tf.SymbolicTensor;

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

    // --- Output heads ---

    // Embedding projection: [batch, 64] -> [batch, 1024]
    const embProj = tf.layers
      .dense({
        units: embeddingDim,
        activation: "linear",
        name: "emb_proj",
      })
      .apply(fusionDropout) as tf.SymbolicTensor;

    // Similarity head: frozen dot-product with tool embeddings / temperature
    // kernel = toolEmbeddings^T / temperature, shape [embeddingDim, numTools]
    const nextToolOutput = tf.layers
      .dense({
        units: numTools,
        activation: "softmax",
        useBias: false,
        trainable: false,
        name: "similarity_head",
      })
      .apply(embProj) as tf.SymbolicTensor;

    // Termination head: [batch, 64] -> [batch, 1]
    const terminationOutput = tf.layers
      .dense({
        units: 1,
        activation: "sigmoid",
        name: "termination_head",
      })
      .apply(fusionDropout) as tf.SymbolicTensor;

    // --- Assemble model ---

    this.model = tf.model({
      inputs: [contextInput, transFeatsInput, intentInput, capInput],
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
   * @param tools - Map of tool ID -> embedding vector (1024-d).
   * @param toolCapMap - Binary tool-to-capability mapping.
   */
  setToolVocabulary(
    tools: Map<string, number[]>,
    toolCapMap: ToolCapabilityMap,
  ): void {
    this.toolEmbeddings = tools;
    this.toolCapMap = toolCapMap;
    this.toolToIndex.clear();
    this.indexToTool.clear();

    let idx = 0;
    for (const toolId of tools.keys()) {
      this.toolToIndex.set(toolId, idx);
      this.indexToTool.set(idx, toolId);
      idx++;
    }

    // Update dynamic config
    (this.config as { numTools: number }).numTools = tools.size;
    (this.config as { numCapabilities: number }).numCapabilities =
      toolCapMap.numCapabilities;

    // Rebuild model with correct dimensions
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.optimizer) {
      this.optimizer.dispose();
      this.optimizer = null;
    }
    if (this.termOptimizer) {
      this.termOptimizer.dispose();
      this.termOptimizer = null;
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
   * Initialize the frozen similarity_head kernel with tool embeddings / temperature.
   * kernel shape = [embeddingDim, numTools]
   */
  private initSimilarityWeights(): void {
    if (!this.model) return;

    const embDim = this.config.embeddingDim;
    const numTools = this.config.numTools;
    const T = this.currentTemperature;

    // Build embedding matrix [numTools, embDim]
    const embData = new Float32Array(numTools * embDim);
    for (const [toolId, embedding] of this.toolEmbeddings) {
      const toolIdx = this.toolToIndex.get(toolId)!;
      const base = toolIdx * embDim;
      for (let d = 0; d < embDim; d++) {
        embData[base + d] = embedding[d];
      }
    }

    // kernel = embeddings^T / T -> [embDim, numTools]
    tf.tidy(() => {
      const embMatrix = tf.tensor2d(embData, [numTools, embDim]);
      const transposed = embMatrix.transpose(); // [embDim, numTools]
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
    const { temperatureStart, temperatureEnd, annealingStopRatio } =
      this.config;

    const effectiveEpochs = annealingStopRatio * totalEpochs;
    const progress = Math.min(epoch / Math.max(effectiveEpochs, 1), 1.0);

    // Cosine annealing: T(t) = T_end + (T_start - T_end) * 0.5 * (1 + cos(pi * progress))
    this.currentTemperature =
      temperatureEnd +
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
    return new Array(this.config.embeddingDim).fill(0);
  }

  /**
   * Resolve tool ID to integer index. Returns -1 for unknown tools.
   */
  private getToolIndex(toolId: string): number {
    return this.toolToIndex.get(toolId) ?? -1;
  }

  /**
   * Prepare the 4 input tensors for a batch of examples.
   *
   * @returns Object with 4 tensors, caller must dispose.
   */
  private prepareBatchInputs(examples: TransitionExample[]): {
    contextTensor: tf.Tensor3D;
    transFeatsTensor: tf.Tensor3D;
    intentTensor: tf.Tensor2D;
    capTensor: tf.Tensor2D;
  } {
    const {
      embeddingDim,
      numTransitionFeatures,
      numCapabilities,
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

    for (let b = 0; b < batchSize; b++) {
      const ex = examples[b];

      // --- Intent input (flat copy) ---
      const intentBase = b * embeddingDim;
      for (let d = 0; d < embeddingDim; d++) {
        intentData[intentBase + d] = ex.intentEmbedding[d] ?? 0;
      }

      // --- Context tool indices ---
      const contextIdxs: number[] = [];
      for (const tid of ex.contextToolIds) {
        const idx = this.getToolIndex(tid);
        if (idx >= 0) contextIdxs.push(idx);
      }

      // --- Cap fingerprint ---
      if (this.toolCapMap) {
        const fingerprint = computeCapFingerprint(
          contextIdxs,
          this.toolCapMap,
        );
        const capBase = b * numCapabilities;
        for (let c = 0; c < numCapabilities; c++) {
          capData[capBase + c] = fingerprint[c];
        }
      }

      // --- Context embeddings + transition features (padded) ---
      // Take last maxSeqLen tools
      const seqToolIds = ex.contextToolIds.slice(-maxSeqLen);
      const seqLen = seqToolIds.length;
      const padOffset = maxSeqLen - seqLen;

      for (let t = 0; t < seqLen; t++) {
        const toolId = seqToolIds[t];
        const emb = this.getToolEmbedding(toolId);
        const embBase =
          (b * maxSeqLen + (padOffset + t)) * embeddingDim;
        for (let d = 0; d < embeddingDim; d++) {
          contextData[embBase + d] = emb[d];
        }

        // Transition features at this timestep
        if (this.toolCapMap) {
          const toolIdx = this.getToolIndex(toolId);
          // Context up to and including this timestep
          const ctxUpToT: number[] = [];
          for (let tt = 0; tt <= t; tt++) {
            const idx = this.getToolIndex(seqToolIds[tt]);
            if (idx >= 0) ctxUpToT.push(idx);
          }
          const feats = computeTransitionFeatures(
            toolIdx >= 0 ? toolIdx : 0,
            ctxUpToT,
            this.toolCapMap,
          );
          const featBase =
            (b * maxSeqLen + (padOffset + t)) * numTransitionFeatures;
          for (let f = 0; f < numTransitionFeatures; f++) {
            transFeatsData[featBase + f] = feats[f];
          }
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
    };
  }

  /**
   * Prepare single-example inputs for inference.
   */
  private prepareSingleInput(
    intentEmb: number[],
    contextToolIds: string[],
  ): {
    contextTensor: tf.Tensor3D;
    transFeatsTensor: tf.Tensor3D;
    intentTensor: tf.Tensor2D;
    capTensor: tf.Tensor2D;
  } {
    return this.prepareBatchInputs([
      {
        intentEmbedding: intentEmb,
        contextToolIds,
        targetToolId: "",
        isTerminal: 0,
        isSingleTool: false,
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Training
  // ---------------------------------------------------------------------------

  /**
   * Train on a batch of examples.
   *
   * Loss:
   *   a) Focal CE with label smoothing (masked for isSingleTool=true)
   *   b) Weighted BCE for termination
   *   c) total = nextToolLoss + terminationLossWeight * terminationLoss
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
    if (!this.termOptimizer) {
      this.termOptimizer = tf.train.adam(this.config.learningRate);
    }

    const batchSize = examples.length;
    const {
      focalGamma,
      labelSmoothingEpsilon: eps,
      terminationLossWeight,
      n8nLossWeight,
    } = this.config;
    const numTools = this.config.numTools;

    // Prepare batch data
    const inputs = this.prepareBatchInputs(examples);

    // Prepare targets
    const targetIndices: number[] = [];
    const termTargets: number[] = [];
    const singleToolMask: number[] = []; // 0 if single-tool (skip next-tool loss), 1 otherwise
    const n8nMaskArr: number[] = []; // 1 if n8n example (has softTargetProbs), 0 if production
    const softTargetsArr: number[][] = []; // [batch, numTools] soft target distributions

    let termPositiveCount = 0;
    for (const ex of examples) {
      targetIndices.push(this.toolToIndex.get(ex.targetToolId) ?? 0);
      termTargets.push(ex.isTerminal);
      singleToolMask.push(ex.isSingleTool ? 0 : 1);
      if (ex.isTerminal === 1) termPositiveCount++;

      // n8n vs production routing
      const hasN8n = ex.softTargetProbs && ex.softTargetProbs.length === numTools;
      n8nMaskArr.push(hasN8n ? 1 : 0);
      softTargetsArr.push(hasN8n ? ex.softTargetProbs! : new Array(numTools).fill(0));
    }

    const targetIdxTensor = tf.tensor1d(targetIndices, "int32");
    const termTargetTensor = tf.tensor2d(
      termTargets.map((t) => [t]),
      [batchSize, 1],
    );
    const singleToolMaskTensor = tf.tensor1d(singleToolMask);
    const n8nMaskTensor = tf.tensor1d(n8nMaskArr);
    const prodMaskTensor = tf.sub(tf.scalar(1), n8nMaskTensor);
    const softTargetsTensor = tf.tensor2d(softTargetsArr, [batchSize, numTools]);

    // Termination class weights (balance positive/negative, prod examples only)
    // n8n examples have different terminal ratios that bias the termination head
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

    // Split variables: termination_head vs everything else.
    // The n8n KL gradient should NOT flow through the termination head or
    // distort shared representations used by termination. We use two
    // gradient passes:
    //   Pass 1 (nextToolCost): focal CE + KL → all vars EXCEPT termination_head
    //   Pass 2 (termCost): BCE → ALL vars (termination_head + shared)
    const termHeadVarNames = new Set<string>();
    for (const w of model.getLayer("termination_head").trainableWeights) {
      termHeadVarNames.add(w.originalName);
    }
    const nextToolVars = trainableVars.filter(
      (v) => !termHeadVarNames.has(v.name),
    );

    let lossVal = 0;
    let nextToolLossVal = 0;
    let terminationLossVal = 0;

    // Shared forward pass tensors (reused across both gradient passes)
    // We cache probs/termProbs to avoid double forward pass
    let cachedProbs: tf.Tensor | null = null;
    let cachedTermProbs: tf.Tensor | null = null;

    const forwardPass = () => {
      const outputs = model.apply(
        [
          inputs.contextTensor,
          inputs.transFeatsTensor,
          inputs.intentTensor,
          inputs.capTensor,
        ],
        { training: true },
      ) as tf.Tensor[];
      return { probs: outputs[0], termProbs: outputs[1] };
    };

    // --- Pass 1: next-tool loss (focal CE + n8n KL) → excludes termination_head ---
    const nextToolCostFn = () => {
      const { probs, termProbs } = forwardPass();

      // Cache termProbs for pass 2
      cachedTermProbs = termProbs;

      // --- (a) Focal CE with label smoothing, masked for single-tool ---
      const clipped = probs.clipByValue(1e-7, 1 - 1e-7);

      const oneHot = tf.oneHot(targetIdxTensor, numTools).toFloat();
      const smoothedLabels = oneHot.mul(1 - eps).add(eps / numTools);

      const pTarget = tf.sum(tf.mul(clipped, oneHot), -1);
      const focalWeight =
        focalGamma > 0
          ? tf.pow(tf.sub(1, pTarget), focalGamma)
          : tf.onesLike(pTarget);

      const logProbs = tf.log(clipped);
      const perExampleCE = tf.neg(
        tf.sum(tf.mul(smoothedLabels, logProbs), -1),
      );
      const focalCE = tf.mul(focalWeight, perExampleCE);

      const prodFocalMask = tf.mul(singleToolMaskTensor, prodMaskTensor);
      const maskedFocalCE = tf.mul(focalCE, prodFocalMask);
      const prodActiveSamples = tf.sum(prodFocalMask);
      const nextToolLoss = tf.div(
        tf.sum(maskedFocalCE),
        tf.maximum(prodActiveSamples, tf.scalar(1)),
      );

      // --- (a2) KL divergence for n8n soft-target examples ---
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

      const nextToolTotal = tf.add(
        nextToolLoss,
        tf.mul(tf.scalar(n8nLossWeight), n8nLoss),
      );

      nextToolLossVal = (nextToolLoss as tf.Tensor).dataSync()[0];

      return nextToolTotal as tf.Scalar;
    };

    // Pass 1: gradients for next-tool branch (excludes termination_head)
    const { value: nextToolValue, grads: nextToolGrads } =
      tf.variableGrads(nextToolCostFn, nextToolVars);
    this.optimizer.applyGradients(nextToolGrads);
    const nextToolLossTotal = nextToolValue.dataSync()[0];
    nextToolValue.dispose();
    for (const key of Object.keys(nextToolGrads)) {
      nextToolGrads[key].dispose();
    }

    // --- Pass 2: termination loss (BCE) → ALL trainable vars ---
    const termCostFn = () => {
      const { termProbs } = forwardPass();

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

      terminationLossVal = (termBCE as tf.Tensor).dataSync()[0];

      return tf.mul(tf.scalar(terminationLossWeight), termBCE) as tf.Scalar;
    };

    // Pass 2: gradients for termination branch (all vars, separate optimizer)
    const { value: termValue, grads: termGrads } =
      tf.variableGrads(termCostFn, trainableVars);
    this.termOptimizer!.applyGradients(termGrads);
    const termLossTotal = termValue.dataSync()[0];
    termValue.dispose();
    for (const key of Object.keys(termGrads)) {
      termGrads[key].dispose();
    }

    lossVal = nextToolLossTotal + termLossTotal;

    // Compute accuracy metrics (inference mode, no dropout)
    let nextToolAcc = 0;
    let termAcc = 0;

    tf.tidy(() => {
      const predictions = model.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
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
    dispose([
      inputs.contextTensor,
      inputs.transFeatsTensor,
      inputs.intentTensor,
      inputs.capTensor,
      targetIdxTensor,
      termTargetTensor,
      singleToolMaskTensor,
      n8nMaskTensor,
      prodMaskTensor,
      softTargetsTensor,
    ]);

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
   * @returns Predicted tool, termination flag, and confidence.
   */
  predictNext(
    intentEmb: number[],
    contextToolIds: string[],
  ): PredictionResult {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    return tf.tidy(() => {
      const inputs = this.prepareSingleInput(intentEmb, contextToolIds);

      const outputs = this.model!.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
      ]) as tf.Tensor[];

      const scores = outputs[0].dataSync() as Float32Array;
      const termProb = outputs[1].dataSync() as Float32Array;

      // Apply structural bias in log-space
      const adjustedScores = this.applyStructuralBias(
        scores,
        contextToolIds,
      );

      // Argmax
      let maxIdx = 0;
      let maxScore = adjustedScores[0];
      for (let i = 1; i < adjustedScores.length; i++) {
        if (adjustedScores[i] > maxScore) {
          maxScore = adjustedScores[i];
          maxIdx = i;
        }
      }

      return {
        toolId: this.indexToTool.get(maxIdx) ?? "",
        shouldTerminate: termProb[0] > this.config.terminationThreshold,
        confidence: maxScore,
      };
    });
  }

  /**
   * Predict next tool with full ranking (for Hit@K / MRR evaluation).
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
  ): RankedPrediction {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    return tf.tidy(() => {
      const inputs = this.prepareSingleInput(intentEmb, contextToolIds);

      const outputs = this.model!.predict([
        inputs.contextTensor,
        inputs.transFeatsTensor,
        inputs.intentTensor,
        inputs.capTensor,
      ]) as tf.Tensor[];

      const scores = outputs[0].dataSync() as Float32Array;
      const termProb = outputs[1].dataSync() as Float32Array;

      const adjustedScores = this.applyStructuralBias(
        scores,
        contextToolIds,
      );

      // Build ranked list
      const ranked: Array<{ toolId: string; score: number }> = [];
      for (let i = 0; i < adjustedScores.length; i++) {
        const toolId = this.indexToTool.get(i);
        if (toolId) ranked.push({ toolId, score: adjustedScores[i] });
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
   * log_probs = log(probs) + alpha * jaccard[lastTool, :] + beta * bigram[lastTool, :]
   * adjusted = softmax(log_probs)
   *
   * @param probs - Raw softmax probabilities [numTools].
   * @param contextToolIds - Current context (to find last tool).
   * @returns Adjusted probability distribution.
   */
  private applyStructuralBias(
    probs: Float32Array,
    contextToolIds: string[],
  ): Float32Array {
    const numTools = this.config.numTools;

    // If no bias matrices or empty context, return raw probs
    if (
      (!this.jaccardMatrix && !this.bigramMatrix) ||
      contextToolIds.length === 0
    ) {
      return probs;
    }

    const lastToolId = contextToolIds[contextToolIds.length - 1];
    const lastToolIdx = this.toolToIndex.get(lastToolId);
    if (lastToolIdx === undefined) return probs;

    const { jaccardAlpha, bigramBeta } = this.config;

    // Work in log-space
    const logProbs = new Float32Array(numTools);
    for (let i = 0; i < numTools; i++) {
      logProbs[i] = Math.log(Math.max(probs[i], 1e-10));
    }

    // Add Jaccard bias
    if (this.jaccardMatrix) {
      const rowBase = lastToolIdx * numTools;
      for (let i = 0; i < numTools; i++) {
        logProbs[i] += jaccardAlpha * this.jaccardMatrix[rowBase + i];
      }
    }

    // Add bigram bias
    if (this.bigramMatrix) {
      const rowBase = lastToolIdx * numTools;
      for (let i = 0; i < numTools; i++) {
        logProbs[i] += bigramBeta * this.bigramMatrix[rowBase + i];
      }
    }

    // Softmax to renormalize
    let maxLogProb = -Infinity;
    for (let i = 0; i < numTools; i++) {
      if (logProbs[i] > maxLogProb) maxLogProb = logProbs[i];
    }

    const adjusted = new Float32Array(numTools);
    let sum = 0;
    for (let i = 0; i < numTools; i++) {
      adjusted[i] = Math.exp(logProbs[i] - maxLogProb);
      sum += adjusted[i];
    }
    if (sum > 0) {
      for (let i = 0; i < numTools; i++) {
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
   * 1. Prepare the 4 inputs from the current context
   * 2. Forward pass (model.predict)
   * 3. Apply structural bias (Jaccard + bigram) in log-space
   * 4. Apply sticky bias: if repeat >= stickyMaxRepeat, suppress the repeated tool
   * 5. Argmax -> next tool
   * 6. Check termination
   *
   * @param intentEmb - Intent embedding.
   * @param firstToolId - Starting tool (typically from SHGAT).
   * @returns Array of tool IDs forming the path.
   */
  buildPath(intentEmb: number[], firstToolId: string): string[] {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    const path: string[] = [firstToolId];
    const { maxPathLength, terminationThreshold, stickyMaxRepeat } =
      this.config;
    const numTools = this.config.numTools;

    for (let step = 0; step < maxPathLength - 1; step++) {
      const result = tf.tidy(() => {
        const inputs = this.prepareSingleInput(intentEmb, path);

        const outputs = this.model!.predict([
          inputs.contextTensor,
          inputs.transFeatsTensor,
          inputs.intentTensor,
          inputs.capTensor,
        ]) as tf.Tensor[];

        const probs = outputs[0].dataSync() as Float32Array;
        const termProb = outputs[1].dataSync() as Float32Array;

        // Apply structural bias
        const adjusted = this.applyStructuralBias(probs, path);

        // Sticky bias: penalize excessive repetition
        const lastToolId = path[path.length - 1];
        const lastToolIdx = this.toolToIndex.get(lastToolId);
        if (lastToolIdx !== undefined) {
          let repeatCount = 0;
          for (let i = path.length - 1; i >= 0; i--) {
            if (path[i] === lastToolId) repeatCount++;
            else break;
          }
          if (repeatCount >= stickyMaxRepeat) {
            adjusted[lastToolIdx] = 0; // Suppress repeated tool
          }
        }

        // Argmax
        let maxIdx = 0;
        let maxScore = adjusted[0];
        for (let i = 1; i < numTools; i++) {
          if (adjusted[i] > maxScore) {
            maxScore = adjusted[i];
            maxIdx = i;
          }
        }

        return {
          nextToolId: this.indexToTool.get(maxIdx) ?? "",
          shouldTerminate: termProb[0] > terminationThreshold,
        };
      });

      // Add predicted tool
      if (result.nextToolId) {
        path.push(result.nextToolId);
      }

      // Check termination after adding the tool
      if (result.shouldTerminate) {
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
   *   (b) CONTINUE: expand with top-B next tools, score includes log(1 - termProb)
   * Both branches compete on length-normalized score: logProb / length^alpha.
   *
   * This prevents short paths from dominating due to fewer probability decay steps.
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
  ): Array<{ path: string[]; score: number }> {
    if (!this.model) {
      throw new Error(
        "[CompactInformedGRU] Model not built. Call setToolVocabulary() first.",
      );
    }

    const { maxPathLength, stickyMaxRepeat } = this.config;
    const numTools = this.config.numTools;

    const normalize = (logProb: number, len: number) =>
      logProb / Math.pow(len, lengthAlpha);

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
          const inputs = this.prepareSingleInput(intentEmb, candidate.path);

          const outputs = this.model!.predict([
            inputs.contextTensor,
            inputs.transFeatsTensor,
            inputs.intentTensor,
            inputs.capTensor,
          ]) as tf.Tensor[];

          const probs = outputs[0].dataSync() as Float32Array;
          const termProb = outputs[1].dataSync() as Float32Array;

          // Apply structural bias
          const adjusted = this.applyStructuralBias(probs, candidate.path);

          // Sticky bias: suppress excessive repetition
          const lastToolId = candidate.path[candidate.path.length - 1];
          const lastToolIdx = this.toolToIndex.get(lastToolId);
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

          // Find top-beamWidth tools
          const topK: Array<{ idx: number; prob: number }> = [];
          for (let i = 0; i < numTools; i++) {
            if (adjusted[i] > 1e-10) {
              topK.push({ idx: i, prob: adjusted[i] });
            }
          }
          topK.sort((a, b) => b.prob - a.prob);

          return {
            topTools: topK.slice(0, beamWidth),
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

        // Branch B: CONTINUE with each top tool
        const continueLogProb = candidate.logProb + Math.log(1 - tp + 1e-10);
        for (const tool of expansions.topTools) {
          const toolId = this.indexToTool.get(tool.idx);
          if (!toolId) continue;

          nextCandidates.push({
            path: [...candidate.path, toolId],
            logProb: continueLogProb + Math.log(Math.max(tool.prob, 1e-10)),
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

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Get current temperature value. */
  getTemperature(): number {
    return this.currentTemperature;
  }

  /** Get tool-to-index mapping. */
  getToolToIndex(): ReadonlyMap<string, number> {
    return this.toolToIndex;
  }

  /** Get index-to-tool mapping. */
  getIndexToTool(): ReadonlyMap<number, string> {
    return this.indexToTool;
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
    if (this.termOptimizer) {
      this.termOptimizer.dispose();
      this.termOptimizer = null;
    }
  }
}
