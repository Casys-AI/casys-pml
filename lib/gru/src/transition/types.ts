/**
 * TransitionModel Types
 *
 * Types for the GRU-based transition model that predicts
 * next tools and detects goal termination.
 *
 * @module gru/transition/types
 */

/**
 * Configuration for TransitionModel
 */
export interface TransitionModelConfig {
  /** Embedding dimension (must match SHGAT: 1024) */
  embeddingDim: number;

  /** GRU hidden dimension */
  hiddenDim: number;

  /** Number of tools in vocabulary */
  numTools: number;

  /** Termination probability threshold */
  terminationThreshold: number;

  /** Maximum path length (safety limit) */
  maxPathLength: number;

  /** Dropout rate for training */
  dropout: number;

  /** Learning rate */
  learningRate: number;
}

/**
 * Default configuration
 */
export const DEFAULT_TRANSITION_CONFIG: TransitionModelConfig = {
  embeddingDim: 1024,
  hiddenDim: 256,
  numTools: 100, // Will be updated based on actual tool count
  terminationThreshold: 0.7,
  maxPathLength: 10,
  dropout: 0.1,
  learningRate: 0.001,
};

/**
 * Result of a single prediction step (for inference)
 */
export interface TransitionPredictionResult {
  /** Predicted tool ID */
  toolId: string;

  /** Whether the sequence should terminate */
  shouldTerminate: boolean;

  /** Confidence score for the predicted tool */
  confidence: number;
}

/**
 * Training example for TransitionModel
 *
 * Derived from execution traces:
 * - contextTools: tools executed so far in the trace
 * - targetToolId: the next tool that was executed
 * - isTerminal: 1 if this was the last tool in the trace, 0 otherwise
 */
export interface TransitionExample {
  /** Intent embedding [embeddingDim] */
  intentEmbedding: number[];

  /** Tool IDs executed so far (can be empty for first step) */
  contextToolIds: string[];

  /** Target tool ID (the correct next tool) */
  targetToolId: string;

  /** 1 if this is the terminal state, 0 otherwise */
  isTerminal: number;
}

/**
 * Training metrics
 */
export interface TransitionMetrics {
  /** Total loss */
  loss: number;

  /** Next tool prediction loss */
  nextToolLoss: number;

  /** Termination prediction loss */
  terminationLoss: number;

  /** Next tool prediction accuracy */
  nextToolAccuracy: number;

  /** Termination prediction accuracy */
  terminationAccuracy: number;
}

/**
 * Serialized model weights
 */
export interface TransitionModelWeights {
  /** GRU weights (from TF.js save) */
  gruWeights: ArrayBuffer;

  /** Intent projection weights */
  intentProj: number[][];

  /** Combined projection weights */
  combinedProj: number[][];

  /** Next tool head weights */
  nextToolHead: number[][];

  /** Termination head weights */
  terminationHead: number[][];

  /** Tool ID to index mapping */
  toolIndex: Record<string, number>;

  /** Config used */
  config: TransitionModelConfig;
}
