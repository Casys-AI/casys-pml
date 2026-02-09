/**
 * Compact Informed GRU — Types
 *
 * Types for the Compact Informed GRU transition model.
 * Predicts next tools step-by-step and detects goal termination,
 * leveraging structural signals from the hypergraph (Jaccard, bigram, capabilities).
 *
 * @module gru/transition/types
 */

// ---------------------------------------------------------------------------
// Model Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the Compact Informed GRU.
 *
 * Architecture:
 *   tool_emb[1024] → input_proj(1024→128) ─┐
 *   transition_features[5] ─────────────────┤→ concat[133] → GRU(133,64)
 *                                           │
 *   intent_emb[1024] → intent_proj(1024→64)─┤
 *   cap_fingerprint[numCaps] → cap_proj(C→16)┤→ concat[144] → dense(144→64)
 *                                            │
 *                          ┌─────────────────┘
 *                 emb_proj(64→1024)        term_head(64→1)
 *                 similarity_head(frozen)
 *                 + jaccard_bias + bigram_bias
 */
export interface CompactGRUConfig {
  // -- Dimensions -----------------------------------------------------------

  /** Embedding dimension — must match SHGAT / BGE-M3 (1024). */
  embeddingDim: number;

  /** Projection dim before GRU (compresses 1024-d tool embedding). */
  inputProjDim: number;

  /** GRU hidden state dimension. */
  hiddenDim: number;

  /** Intent projection dimension. */
  intentProjDim: number;

  /** Capability conditioning projection dimension. */
  capProjDim: number;

  /** Number of structural transition features per timestep. */
  numTransitionFeatures: number;

  /** Number of L0 capabilities (for cap fingerprint input). Set by setToolVocabulary. */
  numCapabilities: number;

  /** Number of tools in vocabulary. Set by setToolVocabulary. */
  numTools: number;

  // -- Inference ------------------------------------------------------------

  /** Termination sigmoid threshold for buildPath. */
  terminationThreshold: number;

  /** Safety limit on path length. */
  maxPathLength: number;

  /** Max consecutive repeats before sticky-bias penalty. */
  stickyMaxRepeat: number;

  /** Max context sequence length (padding target). */
  maxSeqLen: number;

  // -- Training -------------------------------------------------------------

  /** Dense dropout rate. */
  dropout: number;

  /** GRU recurrent dropout rate. */
  recurrentDropout: number;

  /** Adam learning rate. */
  learningRate: number;

  /** Label smoothing epsilon for next-tool CE. 0 = disabled. */
  labelSmoothingEpsilon: number;

  /**
   * Weight for termination BCE relative to next-tool CE.
   * Computed dynamically when "auto" strategy is used.
   */
  terminationLossWeight: number;

  /** Focal loss gamma. 0 = standard CE, 2.0 = focus on hard examples. */
  focalGamma: number;

  // -- Temperature annealing ------------------------------------------------

  /** Start temperature (soft / exploratory). */
  temperatureStart: number;

  /** End temperature (sharp / discriminative). */
  temperatureEnd: number;

  /** Fraction of total epochs at which annealing stops (plateau). */
  annealingStopRatio: number;

  // -- Logit bias -----------------------------------------------------------

  /** Jaccard logit bias scaling factor. */
  jaccardAlpha: number;

  /** Bigram logit bias scaling factor. */
  bigramBeta: number;

  /** Weight for n8n KL divergence loss (0 = disabled, 0.3 recommended). */
  n8nLossWeight: number;
}

/**
 * Default configuration — Compact Informed GRU.
 */
export const DEFAULT_CONFIG: CompactGRUConfig = {
  // Dimensions
  embeddingDim: 1024,
  inputProjDim: 128,
  hiddenDim: 64,
  intentProjDim: 64,
  capProjDim: 16,
  numTransitionFeatures: 5,
  numCapabilities: 212,
  numTools: 0, // Set by setToolVocabulary

  // Inference
  terminationThreshold: 0.5,
  maxPathLength: 10,
  stickyMaxRepeat: 3,
  maxSeqLen: 20,

  // Training
  dropout: 0.4,
  recurrentDropout: 0.25,
  learningRate: 0.001,
  labelSmoothingEpsilon: 0.1,
  terminationLossWeight: 10.0,
  focalGamma: 2.0,

  // Temperature annealing
  temperatureStart: 0.20,
  temperatureEnd: 0.12,
  annealingStopRatio: 0.7,

  // Logit bias
  jaccardAlpha: 0.5,
  bigramBeta: 0.3,

  // n8n augmentation
  n8nLossWeight: 0.3,
};

// ---------------------------------------------------------------------------
// Inference types
// ---------------------------------------------------------------------------

/** Result of a single next-tool prediction. */
export interface PredictionResult {
  toolId: string;
  shouldTerminate: boolean;
  confidence: number;
}

/** Top-K prediction result with ranking. */
export interface RankedPrediction {
  ranked: Array<{ toolId: string; score: number }>;
  shouldTerminate: boolean;
  terminationProb: number;
}

// ---------------------------------------------------------------------------
// Training types
// ---------------------------------------------------------------------------

/**
 * Single training example derived from an execution trace.
 *
 * For a trace [tool_A, tool_B, tool_C]:
 *   step 0: context=[], target=tool_A, isTerminal=0
 *   step 1: context=[tool_A], target=tool_B, isTerminal=0
 *   step 2: context=[tool_A, tool_B], target=tool_C, isTerminal=1
 *
 * For a single-tool trace [tool_X]:
 *   step 0: context=[], target=tool_X, isTerminal=1, isSingleTool=true
 */
export interface TransitionExample {
  /** Intent embedding [embeddingDim]. */
  intentEmbedding: number[];

  /** Tool IDs executed so far (empty for first step). */
  contextToolIds: string[];

  /** Ground-truth next tool ID. */
  targetToolId: string;

  /** 1 if this is the terminal step, 0 otherwise. */
  isTerminal: number;

  /**
   * True if this example comes from a single-tool trace.
   * When true, next-tool loss is masked (only termination head learns).
   */
  isSingleTool: boolean;

  /**
   * Soft target probability distribution over all tools [numTools].
   * When present, KL divergence loss is used instead of focal CE for this example.
   * Used for n8n augmentation examples where the target is approximate.
   */
  softTargetProbs?: number[];
}

/** Per-epoch training metrics. */
export interface TrainingMetrics {
  /** Total weighted loss. */
  loss: number;

  /** Next-tool focal CE loss (excludes single-tool examples). */
  nextToolLoss: number;

  /** Termination BCE loss (includes single-tool examples). */
  terminationLoss: number;

  /** Next-tool Hit@1 accuracy (excludes single-tool). */
  nextToolAccuracy: number;

  /** Termination binary accuracy. */
  terminationAccuracy: number;

  /** Current temperature. */
  temperature: number;

  /** Number of active tensors (for leak detection). */
  numTensors: number;
}

// ---------------------------------------------------------------------------
// Structural bias types
// ---------------------------------------------------------------------------

/**
 * Pre-computed structural bias matrices.
 * Passed to CompactInformedGRU via setStructuralBias().
 */
export interface StructuralBias {
  /** Jaccard similarity matrix [numTools, numTools], row-major Float32Array. */
  jaccardMatrix: Float32Array;

  /** Bigram transition frequency matrix [numTools, numTools], row-normalized. */
  bigramMatrix: Float32Array;

  /** Number of tools (matrix dimension). */
  numTools: number;
}

/**
 * Tool-to-capability mapping, used for:
 * - Jaccard matrix computation
 * - Capability fingerprint at each timestep
 * - Transition features (shared caps, novelty)
 */
export interface ToolCapabilityMap {
  /**
   * Binary matrix [numTools, numCapabilities], row-major Float32Array.
   * toolToCapMatrix[toolIdx * numCaps + capIdx] = 1 if tool has capability.
   */
  matrix: Float32Array;

  /** Number of tools. */
  numTools: number;

  /** Number of L0 capabilities. */
  numCapabilities: number;
}

// ---------------------------------------------------------------------------
// Serialization types
// ---------------------------------------------------------------------------

/** Serialized model state for save/load. */
export interface SerializedModel {
  /** Model config. */
  config: CompactGRUConfig;

  /** Tool ID → index mapping. */
  toolIndex: Record<string, number>;

  /** Keras model weights as ArrayBuffers. */
  modelWeights: ArrayBuffer[];

  /** Structural bias matrices (optional — can be recomputed). */
  structuralBias?: {
    jaccardMatrix: ArrayBuffer;
    bigramMatrix: ArrayBuffer;
  };

  /** Format version for forward compatibility. */
  version: "0.2.0";
}
