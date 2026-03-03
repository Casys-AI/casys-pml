/**
 * GRU Inference Types
 *
 * Types for the pure JS+BLAS GRU forward pass (no TF.js dependency).
 * Used by gru-inference.ts and gru-loader.ts.
 *
 * @module graphrag/algorithms/gru/types
 */

// ---------------------------------------------------------------------------
// Weight matrices (loaded from JSON)
// ---------------------------------------------------------------------------

/**
 * All weight matrices needed for the GRU forward pass.
 * Shapes follow the TF.js Keras export format (row-major, flat→reshaped).
 *
 * Layer layout (batch=1 inference):
 *   input_proj: [embDim, inputProjDim]   e.g. [1024, 128]
 *   GRU cell:   kernel [133, 192], recKernel [64, 192], bias [192]
 *   intent_proj: [1024, 64]
 *   cap_proj: [numCaps, 16]
 *   composite_proj: [3, 8]
 *   fusion_dense: [152, 64]
 *   emb_proj: [64, 1024]
 *   term_hidden: [128, 32]
 *   termination_head: [32, 1]
 *   similarity_head: [embDim, vocabSize] (frozen — vocab embeddings / temperature)
 */
export interface GRUWeights {
  inputProjKernel: number[][];   // [1024, 128]
  inputProjBias: number[];       // [128]

  gruKernel: number[][];         // [133, 192]  (input gates: Wz|Wr|Wh)
  gruRecurrentKernel: number[][]; // [64, 192]  (recurrent gates: Uz|Ur|Uh)
  gruBias: number[];             // [192]       (b_z|b_r|b_h, resetAfter=false)

  intentProjKernel: number[][];  // [1024, 64]
  intentProjBias: number[];      // [64]

  capProjKernel: number[][];     // [numCaps, 16]
  capProjBias: number[];         // [16]

  compositeProjKernel: number[][]; // [3, 8]
  compositeProjBias: number[];     // [8]

  fusionDenseKernel: number[][];   // [152, 64]
  fusionDenseBias: number[];       // [64]

  embProjKernel: number[][];       // [64, 1024]
  embProjBias: number[];           // [1024]

  termHiddenKernel: number[][];    // [128, 32]
  termHiddenBias: number[];        // [32]

  terminationHeadKernel: number[][]; // [32, 1]
  terminationHeadBias: number[];     // [1]

  similarityHeadKernel: number[][]; // [1024, vocabSize] (frozen)
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Unified vocabulary for GRU prediction.
 * Maps between string tool/capability IDs and integer indices.
 */
export interface GRUVocabulary {
  /** tool/cap ID → integer index */
  nodeToIndex: Map<string, number>;

  /** integer index → tool/cap ID */
  indexToNode: string[];

  /** Embedding matrix [vocabSize, embDim] — from similarity_head^T */
  embeddings: number[][];

  /** Number of L0 tools */
  numTools: number;

  /** Total vocab size (numTools + numVocabNodes) */
  vocabSize: number;

  /** Children map for non-leaf nodes: capId → toolId[] */
  children: Map<string, string[]>;

  /** Promotion map: L0 toolId → canonical cap ID (for 1-child caps with no ambiguity) */
  toolToCanonicalCap?: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Inference-time configuration. */
export interface GRUConfig {
  terminationThreshold: number;
  maxPathLength: number;
  stickyMaxRepeat: number;
  temperature: number;
  jaccardAlpha: number;
  bigramBeta: number;
  /** Beam search length normalization exponent (score / len^alpha). Default 0.7. */
  lengthAlpha: number;
}

/** Sensible defaults matching the training config. */
export const DEFAULT_GRU_CONFIG: GRUConfig = {
  terminationThreshold: 0.5,
  maxPathLength: 10,
  stickyMaxRepeat: 3,
  temperature: 0.12, // temperatureEnd from training
  jaccardAlpha: 0,
  bigramBeta: 0,
  lengthAlpha: 0.7,
};

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * GRU inference interface used by DAGSuggesterAdapter.
 */
export interface IGRUInference {
  /** Predict the most likely first tool given an intent embedding. */
  predictFirstTool(intentEmb: number[]): {
    toolId: string;
    score: number;
    ranked: { toolId: string; score: number }[];
  };

  /** Build a full tool path using greedy decoding. */
  buildPath(intentEmb: number[], firstToolId: string): string[];

  /** Build paths using beam search. */
  buildPathBeam(
    intentEmb: number[],
    firstToolId: string,
    beamWidth?: number,
  ): { path: string[]; score: number }[];

  /** Whether weights are loaded and ready for inference. */
  isReady(): boolean;
}

// ---------------------------------------------------------------------------
// Structural bias (reused from lib/gru)
// ---------------------------------------------------------------------------

export interface ToolCapabilityMap {
  matrix: Float32Array;
  numTools: number;
  numCapabilities: number;
}

export interface StructuralMatrices {
  jaccardMatrix: Float32Array;
  bigramMatrix: Float32Array;
  numTools: number;
  /** Binary tool-capability matrix for transition features. Optional. */
  toolCapMap?: ToolCapabilityMap;
}

// ---------------------------------------------------------------------------
// Spawn training
// ---------------------------------------------------------------------------

export interface SpawnGRUTrainingInput {
  examples: Array<{
    intentEmbedding: number[];
    contextToolIds: string[];
    targetToolId: string;
    isTerminal: number;
    isSingleTool: boolean;
    compositeFeatures?: number[];
  }>;
  toolEmbeddings: Record<string, number[]>;
  /** Capability hierarchy data: each cap with its tool children (FQDN→short normalized) */
  capabilityData?: Array<{
    id: string;           // nom normalisé (ex: "meta:personWithAddress")
    embedding: number[];
    toolChildren: string[];
    level: number;        // 1, 2, 3...
  }>;
  /** Test examples for periodic evaluation (not used for training) */
  testExamples?: SpawnGRUTrainingInput["examples"];
  /** Evaluate on test set every N epochs (default: no eval) */
  evalEvery?: number;
  existingWeightsPath?: string;
  databaseUrl?: string;
  epochs?: number;
  learningRate?: number;
}

export interface SpawnGRUTrainingResult {
  success: boolean;
  finalLoss?: number;
  finalAccuracy?: number;
  savedToDb?: boolean;
  error?: string;
}
