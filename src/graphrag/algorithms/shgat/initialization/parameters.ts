/**
 * SHGAT Parameter Initialization Module
 *
 * Functions for initializing all learnable parameters in SHGAT:
 * - Layer parameters (W_v, W_e, attention vectors)
 * - Head parameters (W_q, W_k, W_v for each head)
 * - V2 parameters (W_proj, b_proj, fusionMLP, W_stats, b_stats)
 * - Intent projection (W_intent)
 *
 * Uses Xavier/He initialization for proper gradient flow.
 *
 * @module graphrag/algorithms/shgat/initialization/parameters
 */

import type { SHGATConfig } from "../../shgat-types.ts";
import { DEFAULT_FUSION_WEIGHTS, DEFAULT_FEATURE_WEIGHTS, NUM_TRACE_STATS } from "../../shgat-types.ts";
import type { FusionWeights, FeatureWeights } from "../../shgat-types.ts";

// ============================================================================
// Parameter Types
// ============================================================================

/**
 * Layer parameters for message passing
 */
export interface LayerParams {
  // Vertex→Edge phase
  W_v: number[][][]; // [head][hiddenDim][inputDim]
  W_e: number[][][]; // [head][hiddenDim][inputDim]
  a_ve: number[][]; // [head][2*hiddenDim]

  // Edge→Vertex phase
  W_e2: number[][][]; // [head][hiddenDim][hiddenDim]
  W_v2: number[][][]; // [head][hiddenDim][hiddenDim]
  a_ev: number[][]; // [head][2*hiddenDim]
}

/**
 * Per-head attention parameters
 */
export interface HeadParams {
  W_q: number[][];
  W_k: number[][];
  W_v: number[][];
  a: number[];
}

/**
 * Fusion MLP parameters
 */
export interface FusionMLPParams {
  W1: number[][];
  b1: number[];
  W2: number[];
  b2: number;
}

/**
 * All SHGAT parameters
 */
export interface SHGATParams {
  // Layer parameters (v1)
  layerParams: LayerParams[];
  headParams: HeadParams[];

  // Legacy weights (v1)
  fusionWeights: FusionWeights;
  featureWeights: FeatureWeights;
  W_intent: number[][];

  // V2 parameters
  W_proj: number[][];
  b_proj: number[];
  fusionMLP: FusionMLPParams;
  W_stats: number[][];
  b_stats: number[];
}

/**
 * V2 gradient accumulators
 */
export interface V2GradientAccumulators {
  W_proj: number[][];
  b_proj: number[];
  fusionMLP: {
    W1: number[][];
    b1: number[];
    W2: number[];
    b2: number;
  };
}

// ============================================================================
// Tensor Initialization
// ============================================================================

/**
 * Initialize 3D tensor with Xavier scaling
 */
export function initTensor3D(d1: number, d2: number, d3: number): number[][][] {
  const scale = Math.sqrt(2.0 / (d2 + d3));
  return Array.from(
    { length: d1 },
    () =>
      Array.from(
        { length: d2 },
        () => Array.from({ length: d3 }, () => (Math.random() - 0.5) * 2 * scale),
      ),
  );
}

/**
 * Initialize 2D matrix with Xavier scaling
 */
export function initMatrix(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols));
  return Array.from(
    { length: rows },
    () => Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale),
  );
}

/**
 * Initialize 1D vector
 */
export function initVector(size: number): number[] {
  const scale = Math.sqrt(1.0 / size);
  return Array.from({ length: size }, () => (Math.random() - 0.5) * 2 * scale);
}

/**
 * Create zeros matrix with same shape as input
 */
export function zerosLike2D(matrix: number[][]): number[][] {
  return matrix.map((row) => row.map(() => 0));
}

/**
 * Create zeros tensor with same shape as input
 */
export function zerosLike3D(tensor: number[][][]): number[][][] {
  return tensor.map((m) => m.map((r) => r.map(() => 0)));
}

// ============================================================================
// Parameter Initialization
// ============================================================================

/**
 * Initialize all SHGAT parameters
 */
export function initializeParameters(config: SHGATConfig): SHGATParams {
  const { numLayers, numHeads, hiddenDim, embeddingDim, mlpHiddenDim } = config;

  // Initialize layer parameters
  const layerParams: LayerParams[] = [];
  for (let l = 0; l < numLayers; l++) {
    const layerInputDim = l === 0 ? embeddingDim : hiddenDim * numHeads;

    layerParams.push({
      W_v: initTensor3D(numHeads, hiddenDim, layerInputDim),
      W_e: initTensor3D(numHeads, hiddenDim, layerInputDim),
      a_ve: initMatrix(numHeads, 2 * hiddenDim),

      W_e2: initTensor3D(numHeads, hiddenDim, hiddenDim),
      W_v2: initTensor3D(numHeads, hiddenDim, hiddenDim),
      a_ev: initMatrix(numHeads, 2 * hiddenDim),
    });
  }

  // Initialize head parameters
  const headParams: HeadParams[] = [];
  for (let h = 0; h < numHeads; h++) {
    headParams.push({
      W_q: initMatrix(hiddenDim, embeddingDim),
      W_k: initMatrix(hiddenDim, embeddingDim),
      W_v: initMatrix(hiddenDim, embeddingDim),
      a: initVector(2 * hiddenDim),
    });
  }

  // Initialize intent projection matrix
  const propagatedDim = numHeads * hiddenDim;
  const W_intent = initMatrix(propagatedDim, embeddingDim);

  // Initialize V2 parameters
  const numTraceStats = NUM_TRACE_STATS;
  const projInputDim = 3 * embeddingDim + numTraceStats;

  const W_proj = initMatrix(hiddenDim, projInputDim);
  const b_proj = initVector(hiddenDim);

  const W_stats = initMatrix(hiddenDim, numTraceStats);
  const b_stats = initVector(hiddenDim);

  const fusionMLP: FusionMLPParams = {
    W1: initMatrix(mlpHiddenDim, numHeads),
    b1: initVector(mlpHiddenDim),
    W2: initVector(mlpHiddenDim),
    b2: 0,
  };

  return {
    layerParams,
    headParams,
    fusionWeights: { ...DEFAULT_FUSION_WEIGHTS },
    featureWeights: { ...DEFAULT_FEATURE_WEIGHTS },
    W_intent,
    W_proj,
    b_proj,
    fusionMLP,
    W_stats,
    b_stats,
  };
}

/**
 * Initialize V2 gradient accumulators (used in training)
 */
export function initializeV2GradientAccumulators(config: SHGATConfig): V2GradientAccumulators {
  const { hiddenDim, mlpHiddenDim, embeddingDim, numHeads } = config;
  const numTraceStats = NUM_TRACE_STATS;
  const projInputDim = 3 * embeddingDim + numTraceStats;

  return {
    W_proj: Array.from({ length: hiddenDim }, () => Array(projInputDim).fill(0)),
    b_proj: new Array(hiddenDim).fill(0),
    fusionMLP: {
      W1: Array.from({ length: mlpHiddenDim }, () => Array(numHeads).fill(0)),
      b1: new Array(mlpHiddenDim).fill(0),
      W2: new Array(mlpHiddenDim).fill(0),
      b2: 0,
    },
  };
}

/**
 * Reset V2 gradient accumulators to zero
 */
export function resetV2GradientAccumulators(
  accum: V2GradientAccumulators,
  config: SHGATConfig,
): void {
  const { hiddenDim, mlpHiddenDim, embeddingDim, numHeads } = config;
  const numTraceStats = NUM_TRACE_STATS;
  const projInputDim = 3 * embeddingDim + numTraceStats;

  accum.W_proj = Array.from({ length: hiddenDim }, () => Array(projInputDim).fill(0));
  accum.b_proj = new Array(hiddenDim).fill(0);
  accum.fusionMLP = {
    W1: Array.from({ length: mlpHiddenDim }, () => Array(numHeads).fill(0)),
    b1: new Array(mlpHiddenDim).fill(0),
    W2: new Array(mlpHiddenDim).fill(0),
    b2: 0,
  };
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Export parameters to JSON-serializable object
 */
export function exportParams(
  config: SHGATConfig,
  params: SHGATParams,
): Record<string, unknown> {
  return {
    config,
    layerParams: params.layerParams,
    headParams: params.headParams,
    fusionWeights: params.fusionWeights,
    featureWeights: params.featureWeights,
    W_intent: params.W_intent,
    W_proj: params.W_proj,
    b_proj: params.b_proj,
    fusionMLP: params.fusionMLP,
    W_stats: params.W_stats,
    b_stats: params.b_stats,
  };
}

/**
 * Import parameters from JSON object
 */
export function importParams(
  data: Record<string, unknown>,
  currentParams: SHGATParams,
): { config?: SHGATConfig; params: SHGATParams } {
  const params = { ...currentParams };
  let config: SHGATConfig | undefined;

  if (data.config) {
    config = data.config as SHGATConfig;
  }
  if (data.layerParams) {
    params.layerParams = data.layerParams as LayerParams[];
  }
  if (data.headParams) {
    params.headParams = data.headParams as HeadParams[];
  }
  if (data.fusionWeights) {
    params.fusionWeights = data.fusionWeights as FusionWeights;
  }
  if (data.featureWeights) {
    params.featureWeights = data.featureWeights as FeatureWeights;
  }
  if (data.W_intent) {
    params.W_intent = data.W_intent as number[][];
  }
  if (data.W_proj) {
    params.W_proj = data.W_proj as number[][];
  }
  if (data.b_proj) {
    params.b_proj = data.b_proj as number[];
  }
  if (data.fusionMLP) {
    params.fusionMLP = data.fusionMLP as FusionMLPParams;
  }
  if (data.W_stats) {
    params.W_stats = data.W_stats as number[][];
  }
  if (data.b_stats) {
    params.b_stats = data.b_stats as number[];
  }

  return { config, params };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Count total parameters in the model
 */
export function countParameters(config: SHGATConfig): {
  v1ParamCount: number;
  v2ParamCount: number;
  total: number;
} {
  const { numHeads, hiddenDim, embeddingDim, numLayers, mlpHiddenDim } = config;
  const numTraceStats = NUM_TRACE_STATS;

  // V1 param count
  let v1ParamCount = 0;
  for (let l = 0; l < numLayers; l++) {
    const layerInputDim = l === 0 ? embeddingDim : hiddenDim * numHeads;
    v1ParamCount += numHeads * hiddenDim * layerInputDim * 2; // W_v, W_e
    v1ParamCount += numHeads * 2 * hiddenDim; // a_ve
    v1ParamCount += numHeads * hiddenDim * hiddenDim * 2; // W_e2, W_v2
    v1ParamCount += numHeads * 2 * hiddenDim; // a_ev
  }
  v1ParamCount += 3; // fusionWeights
  v1ParamCount += 3; // featureWeights
  v1ParamCount += numHeads * hiddenDim * embeddingDim; // W_intent

  // V2 param count
  const projInputDim = 3 * embeddingDim + numTraceStats;
  let v2ParamCount = 0;
  v2ParamCount += hiddenDim * projInputDim + hiddenDim; // W_proj, b_proj
  v2ParamCount += hiddenDim * numTraceStats + hiddenDim; // W_stats, b_stats
  v2ParamCount += numHeads * 3 * hiddenDim * hiddenDim; // headParams (W_q, W_k, W_v per head)
  v2ParamCount += mlpHiddenDim * numHeads + mlpHiddenDim; // fusionMLP W1, b1
  v2ParamCount += mlpHiddenDim + 1; // fusionMLP W2, b2

  return {
    v1ParamCount,
    v2ParamCount,
    total: v1ParamCount + v2ParamCount,
  };
}
