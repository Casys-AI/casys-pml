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
 *   tool_emb[1024] → input_proj(1024→128) ──┐
 *   transition_features[5] ──────────────────┤→ concat[133] → GRU(133,64)
 *                                            │
 *   intent_emb[1024] → intent_proj(1024→64)──┤
 *   cap_fingerprint[numCaps] → cap_proj(C→16)┤
 *   composite_feats[3] → comp_proj(3→8) ─────┤→ concat[152] → dense(152→64)
 *                                             │
 *                          ┌──────────────────┘
 *                 emb_proj(64→1024)         term_head(128→1)
 *                 similarity_head(frozen, vocabSize = numTools + numVocabNodes)
 *                 + jaccard_bias + bigram_bias (L0 nodes only)
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

  /** Number of composite scoring features (bestScore, coverage, level). */
  compositeFeatureDim: number;

  /** Projection dim for composite features. */
  compositeProjDim: number;

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

  /**
   * Number of non-leaf vocabulary nodes (level > 0) in the unified vocabulary.
   * Set automatically by setToolVocabulary when higher-level nodes are provided.
   * vocabSize = numTools + numVocabNodes.
   */
  numVocabNodes: number;
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
  compositeFeatureDim: 3,
  compositeProjDim: 8,

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

  // Non-leaf vocabulary nodes (caps, meta-caps)
  numVocabNodes: 0,
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

  /**
   * Composite scoring features from SHGAT scoreNodes().
   * Replaces the binary "composite threshold" with a continuous spectrum.
   * The termination head learns when a composite is sufficient.
   *
   * [0] bestCompositeScore: float [0,1] — SHGAT score of best matching composite
   * [1] compositeCoverage:  float [0,1] — semantic overlap (intent vs composite embedding)
   * [2] compositeLevel:     float [0,1] — normalized hierarchy level (0=L0, 0.5=L1, 1.0=L2)
   *
   * When absent, defaults to zeros (backward compatible).
   */
  compositeFeatures?: number[];
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
// Composite scoring types
// ---------------------------------------------------------------------------

/**
 * Composite scoring features passed from SHGAT to GRU.
 *
 * Instead of a binary threshold ("if composite score > X → use it"),
 * these features are fed as a continuous input to the GRU model.
 * The termination head learns WHEN a composite is sufficient, eliminating
 * the fragile cliff-edge of threshold-based routing.
 *
 * Expert panel consensus (2026-02-10):
 *   "Pas de seuil binaire, mais un spectre continu où le score du composite
 *    est une feature du GRU, qui décide lui-même du degré de complétion."
 */
export interface CompositeScoring {
  /** SHGAT score of the best matching composite node [0, 1]. */
  bestCompositeScore: number;

  /** Semantic coverage: cosine(intent, bestComposite) [0, 1]. */
  compositeCoverage: number;

  /**
   * Normalized hierarchy level of the best composite.
   * 0.0 = L0 (atomic tool), 0.5 = L1 (capability), 1.0 = L2 (meta-capability).
   */
  compositeLevel: number;
}

/**
 * Convert CompositeScoring to a fixed-size feature vector.
 */
export function compositeToFeatures(c: CompositeScoring): number[] {
  return [c.bestCompositeScore, c.compositeCoverage, c.compositeLevel];
}

/**
 * Default composite features (no composite available = zeros).
 */
export const EMPTY_COMPOSITE_FEATURES: number[] = [0, 0, 0];

// ---------------------------------------------------------------------------
// Unified vocabulary node types
// ---------------------------------------------------------------------------

/**
 * A node in the unified vocabulary hierarchy.
 *
 * Level 0 = leaf (atomic tool), Level 1 = capability, Level 2 = meta-capability, etc.
 * When the GRU predicts a non-leaf node (level > 0), its children are expanded
 * into the path context.
 *
 * Replaces the former tool/capability dichotomy with a generic hierarchy
 * that can accommodate arbitrary depth (L0, L1, L2, ...).
 */
export interface VocabNode {
  /** Unique identifier (tool ID or capability ID). */
  id: string;

  /**
   * Hierarchy level: 0 = leaf (atomic tool), 1 = capability, 2 = meta-cap, etc.
   * Structural bias (Jaccard, bigram) is applied only to level-0 nodes.
   * Prediction of level > 0 triggers expansion to leaf children in buildPath.
   */
  level: number;

  /** BGE-M3 embedding (1024D, same space for all levels). */
  embedding: number[];

  /**
   * Child node IDs (leaf tool IDs for L1+).
   * Absent for level-0 (leaf) nodes.
   * When the GRU predicts this node, children are added to the path.
   */
  children?: string[];
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

  /** Tool ID → index mapping (leaf nodes only, for backward compat). */
  toolIndex: Record<string, number>;

  /** Full vocabulary node registry (all levels). */
  vocabNodes?: Array<{ id: string; level: number; children?: string[] }>;

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
