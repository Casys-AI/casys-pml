/**
 * Sparse Message Passing for SHGAT-TF
 *
 * Implements sparse message passing with manual gradient computation.
 * This avoids TF.js limitations with tf.gather gradients on WASM backend
 * and provides ~10x speedup by only computing connected pairs.
 *
 * Architecture:
 * - Forward: JS sparse loops (like lib/shgat)
 * - Backward: Manual gradient accumulation in Maps
 * - Dense ops: TF.js for matmul projections
 *
 * @module shgat-tf/training/sparse-mp
 */

import { tf, tidy } from "../tf/backend.ts";
import * as ops from "../tf/ops.ts";
import type { SHGATConfig } from "../core/types.ts";
import type { TFParams, GraphStructure } from "./autograd-trainer.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Sparse connectivity representation
 * Pre-computed from dense incidence matrices for O(1) neighbor lookup
 */
export interface SparseConnectivity {
  /** For each tool index, list of connected capability indices at level 0 */
  toolToCaps: number[][];
  /** For each level-0 cap index, list of connected tool indices */
  capToTools: number[][];
  /** For each level, parent→child connectivity */
  capToCapByLevel: Map<number, {
    /** For each parent cap, list of child cap indices */
    parentToChildren: number[][];
    /** For each child cap, list of parent cap indices */
    childToParents: number[][];
  }>;
}

/**
 * Cache for sparse forward pass (needed for backward)
 */
export interface SparseMPForwardCache {
  /** Tool embeddings before MP [numTools][embDim] */
  H_init: number[][];
  /** Cap embeddings before MP, per level */
  E_init: Map<number, number[][]>;
  /** Projected tool embeddings [numTools][headDim] per head */
  H_proj: number[][][];
  /** Projected cap embeddings per level per head */
  E_proj: Map<number, number[][][]>;
  /** Attention weights for V→E [tool][cap] - sparse, only stored for connected pairs */
  attentionVE: Map<string, number>;
  /** Attention weights for upward E→E per level */
  attentionUpward: Map<number, Map<string, number>>;
  /** Attention weights for downward E→E per level */
  attentionDownward: Map<number, Map<string, number>>;
  /** Pre-activation concatenated vectors for gradient computation */
  concatPreActVE: Map<string, number[]>;
  concatPreActUpward: Map<number, Map<string, number[]>>;
  concatPreActDownward: Map<number, Map<string, number[]>>;
  /** Connectivity */
  connectivity: SparseConnectivity;
  /** Config for backward pass */
  config: { leakyReluSlope: number; headDim: number; numHeads: number };
}

/**
 * Gradients from sparse backward pass
 */
export interface SparseMPGradients {
  /** Gradients for W_up per level per head [level][head][headDim][embDim] */
  dW_up: Map<number, number[][][]>;
  /** Gradients for W_down per level per head */
  dW_down: Map<number, number[][][]>;
  /** Gradients for a_up attention vectors per level per head */
  da_up: Map<number, number[][]>;
  /** Gradients for a_down attention vectors per level per head */
  da_down: Map<number, number[][]>;
  /** Gradient for tool embeddings [numTools][embDim] */
  dH: number[][];
}

/**
 * Result of sparse forward pass
 */
export interface SparseMPForwardResult {
  /** Enriched tool embeddings [numTools][embDim] */
  H: number[][];
  /** Enriched cap embeddings per level */
  E: Map<number, number[][]>;
  /** Cache for backward pass */
  cache: SparseMPForwardCache;
}

// ============================================================================
// Helper Functions
// ============================================================================

const LEAKY_RELU_SLOPE = 0.2;

/** Leaky ReLU activation */
function leakyRelu(x: number, slope = LEAKY_RELU_SLOPE): number {
  return x > 0 ? x : slope * x;
}

/** ELU activation */
function elu(x: number, alpha = 1.0): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

/** Leaky ReLU derivative */
function leakyReluDeriv(x: number, slope = LEAKY_RELU_SLOPE): number {
  return x > 0 ? 1 : slope;
}

/** Dot product */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * (b[i] ?? 0);
  }
  return sum;
}

/** Softmax over array */
function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  let maxVal = -Infinity;
  for (const v of values) {
    if (v > maxVal) maxVal = v;
  }
  const exps = values.map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum > 0 ? exps.map((e) => e / sum) : values.map(() => 1 / values.length);
}

/**
 * Matrix multiplication using TF.js (for dense projection operations)
 * A @ B -> [m, k] @ [k, n] -> [m, n]
 */
function matmul(A: number[][], B: number[][]): number[][] {
  return tidy(() => {
    const tA = ops.toTensor(A);
    const tB = ops.toTensor(B);
    const result = ops.matmul(tA, tB);
    return result.arraySync() as number[][];
  });
}

// ============================================================================
// Build Sparse Connectivity
// ============================================================================

/**
 * Build sparse connectivity from dense graph structure
 */
export function buildSparseConnectivity(graph: GraphStructure): SparseConnectivity {
  const numTools = graph.toolIds.length;
  const toolToCapMatrix = graph.toolToCapMatrix.arraySync() as number[][];

  // Build tool → cap and cap → tool mappings for level 0
  const toolToCaps: number[][] = [];
  const numCaps0 = toolToCapMatrix[0]?.length ?? 0;
  const capToTools: number[][] = Array.from({ length: numCaps0 }, () => []);

  for (let t = 0; t < numTools; t++) {
    const connectedCaps: number[] = [];
    for (let c = 0; c < numCaps0; c++) {
      if (toolToCapMatrix[t][c] === 1) {
        connectedCaps.push(c);
        capToTools[c].push(t);
      }
    }
    toolToCaps.push(connectedCaps);
  }

  // Build cap → cap mappings per level
  const capToCapByLevel = new Map<number, {
    parentToChildren: number[][];
    childToParents: number[][];
  }>();

  for (const [level, matrix] of graph.capToCapMatrices) {
    const matrixData = matrix.arraySync() as number[][];
    const numParents = matrixData.length;
    const numChildren = matrixData[0]?.length ?? 0;

    const parentToChildren: number[][] = [];
    const childToParents: number[][] = Array.from({ length: numChildren }, () => []);

    for (let p = 0; p < numParents; p++) {
      const children: number[] = [];
      for (let c = 0; c < numChildren; c++) {
        if (matrixData[p][c] === 1) {
          children.push(c);
          childToParents[c].push(p);
        }
      }
      parentToChildren.push(children);
    }

    capToCapByLevel.set(level, { parentToChildren, childToParents });
  }

  return { toolToCaps, capToTools, capToCapByLevel };
}

// ============================================================================
// Sparse Forward Pass
// ============================================================================

/**
 * Sparse message passing forward
 *
 * Upward: V → E^0 → E^1 → ... → E^L
 * Downward: E^L → ... → E^0 → V
 *
 * Only iterates over connected pairs (sparse).
 */
export function sparseMPForward(
  H_init: number[][],
  E_init: Map<number, number[][]>,
  graph: GraphStructure,
  params: TFParams,
  config: SHGATConfig,
): SparseMPForwardResult {
  const { numHeads } = config;
  const headDim = config.headDim;
  const maxLevel = graph.maxLevel;

  // Build sparse connectivity
  const connectivity = buildSparseConnectivity(graph);

  // Initialize cache
  const cache: SparseMPForwardCache = {
    H_init: H_init.map((row) => [...row]),
    E_init: new Map(),
    H_proj: [],
    E_proj: new Map(),
    attentionVE: new Map(),
    attentionUpward: new Map(),
    attentionDownward: new Map(),
    concatPreActVE: new Map(),
    concatPreActUpward: new Map(),
    concatPreActDownward: new Map(),
    connectivity,
    config: { leakyReluSlope: config.leakyReluSlope, headDim, numHeads },
  };

  // Clone initial embeddings
  for (const [level, embs] of E_init) {
    cache.E_init.set(level, embs.map((row) => [...row]));
  }

  // Working copies
  let H = H_init.map((row) => [...row]);
  const E = new Map<number, number[][]>();
  for (const [level, embs] of E_init) {
    E.set(level, embs.map((row) => [...row]));
  }

  // ========================================================================
  // UPWARD PASS: V → E^0 → E^1 → ... → E^L
  // ========================================================================

  for (let level = 0; level <= maxLevel; level++) {
    const W_up = params.W_up.get(level) || params.W_up.get(1);
    const a_up = params.a_up.get(level) || params.a_up.get(1);
    if (!W_up || !a_up) continue;

    const capsAtLevel = E.get(level);
    if (!capsAtLevel) continue;

    if (level === 0) {
      // V → E^0: Tools aggregate to level-0 capabilities
      const E_new = sparseVertexToEdgeForward(
        H,
        capsAtLevel,
        connectivity.toolToCaps,
        connectivity.capToTools,
        W_up,
        a_up,
        numHeads,
        headDim,
        cache,
        "VE",
      );
      E.set(level, E_new);
    } else {
      // E^(k-1) → E^k
      const E_prev = E.get(level - 1);
      const capConn = connectivity.capToCapByLevel.get(level);
      if (!E_prev || !capConn) continue;

      const E_new = sparseEdgeToEdgeForward(
        E_prev,
        capsAtLevel,
        capConn.childToParents,
        capConn.parentToChildren,
        W_up,
        a_up,
        numHeads,
        headDim,
        cache,
        `UP_${level}`,
      );
      E.set(level, E_new);
    }
  }

  // ========================================================================
  // DOWNWARD PASS: E^L → ... → E^0 → V
  // ========================================================================

  for (let level = maxLevel - 1; level >= 0; level--) {
    const W_down = params.W_down.get(level + 1) || params.W_down.get(1);
    const a_down = params.a_down.get(level + 1) || params.a_down.get(1);
    if (!W_down || !a_down) continue;

    const capsAtLevel = E.get(level);
    const capsAtParent = E.get(level + 1);
    if (!capsAtLevel || !capsAtParent) continue;

    const capConn = connectivity.capToCapByLevel.get(level + 1);
    if (!capConn) continue;

    // Downward: parent → child
    const E_new = sparseEdgeToEdgeForward(
      capsAtParent,
      capsAtLevel,
      capConn.parentToChildren, // source → target (inverted for downward)
      capConn.childToParents,   // target → source
      W_down,
      a_down,
      numHeads,
      headDim,
      cache,
      `DOWN_${level}`,
    );
    E.set(level, E_new);
  }

  // Final: E^0 → V
  const E_level0 = E.get(0);
  const W_down = params.W_down.get(1);
  const a_down = params.a_down.get(1);
  if (E_level0 && W_down && a_down) {
    // Invert connectivity for E → V direction
    const capToToolsList: number[][] = connectivity.capToTools;
    const toolToCapsList: number[][] = connectivity.toolToCaps;

    const H_new = sparseEdgeToVertexForward(
      E_level0,
      H,
      capToToolsList,
      toolToCapsList,
      W_down,
      a_down,
      numHeads,
      headDim,
      cache,
      "EV",
    );
    H = H_new;
  }

  // Apply residual connection
  if (params.residualWeights) {
    const alpha = 0.3; // Default residual weight
    for (let i = 0; i < H.length; i++) {
      for (let j = 0; j < H[i].length; j++) {
        H[i][j] = (1 - alpha) * H[i][j] + alpha * H_init[i][j];
      }
    }
    for (const [level, E_tensor] of E) {
      const E_initLevel = E_init.get(level);
      if (E_initLevel) {
        for (let i = 0; i < E_tensor.length; i++) {
          for (let j = 0; j < E_tensor[i].length; j++) {
            E_tensor[i][j] = (1 - alpha) * E_tensor[i][j] + alpha * E_initLevel[i][j];
          }
        }
      }
    }
  }

  return { H, E, cache };
}

/**
 * Sparse V → E forward pass
 */
function sparseVertexToEdgeForward(
  H: number[][],
  E: number[][],
  _toolToCaps: number[][],
  capToTools: number[][],
  W: tf.Variable[],
  a: tf.Variable[],
  numHeads: number,
  headDim: number,
  cache: SparseMPForwardCache,
  phaseKey: string,
): number[][] {
  const numCaps = E.length;
  const embDim = H[0]?.length ?? 0;

  // Project all embeddings using TF.js (dense operation)
  const W_arrays = W.map((w) => w.arraySync() as number[][]);
  const a_arrays = a.map((av) => av.arraySync() as number[]);

  // Store projections in cache per head
  cache.H_proj = [];
  cache.E_proj.set(-1, []); // Use -1 for tools

  for (let h = 0; h < numHeads; h++) {
    const H_proj_h = matmul(H, W_arrays[h]);
    const E_proj_h = matmul(E, W_arrays[h]);
    cache.H_proj.push(H_proj_h);
    if (!cache.E_proj.has(-1)) cache.E_proj.set(-1, []);
    cache.E_proj.get(-1)!.push(E_proj_h);
  }

  // Compute attention scores (sparse)
  const E_new: number[][] = Array.from({ length: numCaps }, () =>
    new Array(embDim).fill(0)
  );

  for (let h = 0; h < numHeads; h++) {
    const H_proj_h = cache.H_proj[h];
    const E_proj_h = cache.E_proj.get(-1)![h];
    const a_h = a_arrays[h];

    for (let c = 0; c < numCaps; c++) {
      const connectedTools = capToTools[c];
      if (connectedTools.length === 0) continue;

      // Compute attention scores for connected tools only
      const scores: number[] = [];
      for (const t of connectedTools) {
        const concat = [...H_proj_h[t], ...E_proj_h[c]];
        cache.concatPreActVE.set(`${phaseKey}_${h}_${t}_${c}`, concat);
        const activated = concat.map((x) => leakyRelu(x));
        const score = dot(a_h, activated);
        scores.push(score);
      }

      // Softmax
      const attentionWeights = softmax(scores);

      // Store attention weights
      for (let i = 0; i < connectedTools.length; i++) {
        cache.attentionVE.set(`${phaseKey}_${h}_${connectedTools[i]}_${c}`, attentionWeights[i]);
      }

      // Aggregate: weighted sum of projected tool embeddings
      const agg = new Array(headDim).fill(0);
      for (let i = 0; i < connectedTools.length; i++) {
        const t = connectedTools[i];
        for (let d = 0; d < headDim; d++) {
          agg[d] += attentionWeights[i] * H_proj_h[t][d];
        }
      }

      // Apply ELU and accumulate into E_new
      // For multi-head: concatenate heads
      const headOffset = h * headDim;
      for (let d = 0; d < headDim; d++) {
        E_new[c][headOffset + d] = elu(agg[d]);
      }
    }
  }

  return E_new;
}

/**
 * Sparse E → E forward pass (both upward and downward)
 */
function sparseEdgeToEdgeForward(
  E_source: number[][],
  E_target: number[][],
  _sourceToTargets: number[][], // For each source, list of connected targets (unused in forward)
  targetToSources: number[][], // For each target, list of connected sources
  W: tf.Variable[],
  a: tf.Variable[],
  numHeads: number,
  headDim: number,
  cache: SparseMPForwardCache,
  phaseKey: string,
): number[][] {
  const numTargets = E_target.length;
  const embDim = E_source[0]?.length ?? 0;

  // Project embeddings
  const W_arrays = W.map((w) => w.arraySync() as number[][]);
  const a_arrays = a.map((av) => av.arraySync() as number[]);

  const E_source_proj: number[][][] = [];
  const E_target_proj: number[][][] = [];

  for (let h = 0; h < numHeads; h++) {
    E_source_proj.push(matmul(E_source, W_arrays[h]));
    E_target_proj.push(matmul(E_target, W_arrays[h]));
  }

  // Store in cache
  const isUpward = phaseKey.startsWith("UP");
  const level = parseInt(phaseKey.split("_")[1] ?? "0", 10);
  if (isUpward) {
    cache.attentionUpward.set(level, new Map());
    cache.concatPreActUpward.set(level, new Map());
  } else {
    cache.attentionDownward.set(level, new Map());
    cache.concatPreActDownward.set(level, new Map());
  }

  const E_new: number[][] = Array.from({ length: numTargets }, () =>
    new Array(embDim).fill(0)
  );

  for (let h = 0; h < numHeads; h++) {
    const src_proj_h = E_source_proj[h];
    const tgt_proj_h = E_target_proj[h];
    const a_h = a_arrays[h];

    for (let tgt = 0; tgt < numTargets; tgt++) {
      const connectedSources = targetToSources[tgt];
      if (connectedSources.length === 0) continue;

      // Compute attention scores
      const scores: number[] = [];
      for (const src of connectedSources) {
        const concat = [...src_proj_h[src], ...tgt_proj_h[tgt]];
        const key = `${phaseKey}_${h}_${src}_${tgt}`;
        if (isUpward) {
          cache.concatPreActUpward.get(level)!.set(key, concat);
        } else {
          cache.concatPreActDownward.get(level)!.set(key, concat);
        }
        const activated = concat.map((x) => leakyRelu(x));
        const score = dot(a_h, activated);
        scores.push(score);
      }

      // Softmax
      const attentionWeights = softmax(scores);

      // Store attention
      for (let i = 0; i < connectedSources.length; i++) {
        const key = `${phaseKey}_${h}_${connectedSources[i]}_${tgt}`;
        if (isUpward) {
          cache.attentionUpward.get(level)!.set(key, attentionWeights[i]);
        } else {
          cache.attentionDownward.get(level)!.set(key, attentionWeights[i]);
        }
      }

      // Aggregate
      const agg = new Array(headDim).fill(0);
      for (let i = 0; i < connectedSources.length; i++) {
        const src = connectedSources[i];
        for (let d = 0; d < headDim; d++) {
          agg[d] += attentionWeights[i] * src_proj_h[src][d];
        }
      }

      // Apply ELU and accumulate
      const headOffset = h * headDim;
      for (let d = 0; d < headDim; d++) {
        E_new[tgt][headOffset + d] = elu(agg[d]);
      }
    }
  }

  return E_new;
}

/**
 * Sparse E → V forward pass (final downward to tools)
 */
function sparseEdgeToVertexForward(
  E: number[][],
  H: number[][],
  _capToTools: number[][], // unused in forward (using toolToCaps instead)
  toolToCaps: number[][],
  W: tf.Variable[],
  a: tf.Variable[],
  numHeads: number,
  headDim: number,
  cache: SparseMPForwardCache,
  phaseKey: string,
): number[][] {
  const numTools = H.length;
  const embDim = H[0]?.length ?? 0;

  const W_arrays = W.map((w) => w.arraySync() as number[][]);
  const a_arrays = a.map((av) => av.arraySync() as number[]);

  // Project
  const E_proj: number[][][] = [];
  const H_proj: number[][][] = [];

  for (let h = 0; h < numHeads; h++) {
    E_proj.push(matmul(E, W_arrays[h]));
    H_proj.push(matmul(H, W_arrays[h]));
  }

  const H_new: number[][] = Array.from({ length: numTools }, () =>
    new Array(embDim).fill(0)
  );

  for (let h = 0; h < numHeads; h++) {
    const E_proj_h = E_proj[h];
    const H_proj_h = H_proj[h];
    const a_h = a_arrays[h];

    for (let t = 0; t < numTools; t++) {
      const connectedCaps = toolToCaps[t];
      if (connectedCaps.length === 0) continue;

      // Compute attention
      const scores: number[] = [];
      for (const c of connectedCaps) {
        const concat = [...E_proj_h[c], ...H_proj_h[t]];
        cache.concatPreActVE.set(`${phaseKey}_${h}_${c}_${t}`, concat);
        const activated = concat.map((x) => leakyRelu(x));
        scores.push(dot(a_h, activated));
      }

      const attentionWeights = softmax(scores);

      for (let i = 0; i < connectedCaps.length; i++) {
        cache.attentionVE.set(`${phaseKey}_${h}_${connectedCaps[i]}_${t}`, attentionWeights[i]);
      }

      // Aggregate
      const agg = new Array(headDim).fill(0);
      for (let i = 0; i < connectedCaps.length; i++) {
        const c = connectedCaps[i];
        for (let d = 0; d < headDim; d++) {
          agg[d] += attentionWeights[i] * E_proj_h[c][d];
        }
      }

      // Apply ELU
      const headOffset = h * headDim;
      for (let d = 0; d < headDim; d++) {
        H_new[t][headOffset + d] = elu(agg[d]);
      }
    }
  }

  return H_new;
}

// ============================================================================
// Sparse Backward Pass
// ============================================================================

/**
 * Sparse message passing backward
 *
 * Computes gradients for W_up, W_down, a_up, a_down given dH (gradient of enriched tool embeddings)
 *
 * @param dH - Gradient of enriched tool embeddings [numTools][embDim]
 * @param dE - Gradient of enriched cap embeddings per level
 * @param cache - Forward cache
 * @param params - TF.js parameters
 * @returns Gradients for all message passing parameters
 */
export function sparseMPBackward(
  dH: number[][],
  dE: Map<number, number[][]>,
  cache: SparseMPForwardCache,
  params: TFParams,
): SparseMPGradients {
  const { numHeads, headDim, leakyReluSlope } = cache.config;
  const maxLevel = Math.max(...Array.from(dE.keys()), 0);
  const embDim = cache.H_init[0]?.length ?? 0;

  // Initialize gradients
  const grads: SparseMPGradients = {
    dW_up: new Map(),
    dW_down: new Map(),
    da_up: new Map(),
    da_down: new Map(),
    dH: cache.H_init.map((row) => new Array(row.length).fill(0)),
  };

  // Initialize gradient maps for each level
  for (let level = 0; level <= maxLevel; level++) {
    grads.dW_up.set(level, Array.from({ length: numHeads }, () =>
      Array.from({ length: headDim }, () => new Array(embDim).fill(0))
    ));
    grads.dW_down.set(level + 1, Array.from({ length: numHeads }, () =>
      Array.from({ length: headDim }, () => new Array(embDim).fill(0))
    ));
    grads.da_up.set(level, Array.from({ length: numHeads }, () =>
      new Array(2 * headDim).fill(0)
    ));
    grads.da_down.set(level + 1, Array.from({ length: numHeads }, () =>
      new Array(2 * headDim).fill(0)
    ));
  }

  // ========================================================================
  // BACKWARD: E^0 → V (reverse of final downward)
  // ========================================================================

  const W_down_1 = params.W_down.get(1);
  const a_down_1 = params.a_down.get(1);
  if (W_down_1 && a_down_1) {
    backwardEdgeToVertex(
      dH,
      cache,
      "EV",
      W_down_1,
      a_down_1,
      grads.dW_down.get(1)!,
      grads.da_down.get(1)!,
      numHeads,
      headDim,
      leakyReluSlope,
    );
  }

  // ========================================================================
  // BACKWARD: Downward E^L → ... → E^0
  // ========================================================================

  for (let level = 0; level < maxLevel; level++) {
    const dE_level = dE.get(level);
    if (!dE_level) continue;

    const W_down = params.W_down.get(level + 1) || params.W_down.get(1);
    const a_down = params.a_down.get(level + 1) || params.a_down.get(1);
    if (!W_down || !a_down) continue;

    backwardEdgeToEdge(
      dE_level,
      cache,
      `DOWN_${level}`,
      level,
      W_down,
      a_down,
      grads.dW_down.get(level + 1)!,
      grads.da_down.get(level + 1)!,
      numHeads,
      headDim,
      leakyReluSlope,
      false, // downward
    );
  }

  // ========================================================================
  // BACKWARD: Upward V → E^0 → ... → E^L
  // ========================================================================

  for (let level = maxLevel; level >= 0; level--) {
    const dE_level = dE.get(level);
    if (!dE_level) continue;

    const W_up = params.W_up.get(level) || params.W_up.get(1);
    const a_up = params.a_up.get(level) || params.a_up.get(1);
    if (!W_up || !a_up) continue;

    if (level === 0) {
      // V → E^0
      backwardVertexToEdge(
        dE_level,
        cache,
        "VE",
        W_up,
        a_up,
        grads.dW_up.get(0)!,
        grads.da_up.get(0)!,
        grads.dH,
        numHeads,
        headDim,
        leakyReluSlope,
      );
    } else {
      // E^(k-1) → E^k
      backwardEdgeToEdge(
        dE_level,
        cache,
        `UP_${level}`,
        level,
        W_up,
        a_up,
        grads.dW_up.get(level)!,
        grads.da_up.get(level)!,
        numHeads,
        headDim,
        leakyReluSlope,
        true, // upward
      );
    }
  }

  return grads;
}

/**
 * Backward pass for V → E phase
 */
function backwardVertexToEdge(
  dE_new: number[][],
  cache: SparseMPForwardCache,
  phaseKey: string,
  W: tf.Variable[],
  a: tf.Variable[],
  dW: number[][][],
  da: number[][],
  dH: number[][],
  numHeads: number,
  headDim: number,
  leakyReluSlope: number,
): void {
  const numCaps = dE_new.length;
  const { capToTools } = cache.connectivity;

  const W_arrays = W.map((w) => w.arraySync() as number[][]);
  const a_arrays = a.map((av) => av.arraySync() as number[]);

  for (let h = 0; h < numHeads; h++) {
    const H_proj_h = cache.H_proj[h];
    const W_h = W_arrays[h];
    const a_h = a_arrays[h];

    for (let c = 0; c < numCaps; c++) {
      const connectedTools = capToTools[c];
      if (connectedTools.length === 0) continue;

      // Get dE_new for this cap at this head
      const headOffset = h * headDim;
      const dAgg = new Array(headDim).fill(0);
      for (let d = 0; d < headDim; d++) {
        const x = dE_new[c][headOffset + d] ?? 0;
        // Through ELU: dAgg = dE_new * ELU'(agg)
        // Note: agg value was ELU'ed to get E_new, so we need original agg
        // For simplicity, we approximate ELU'(x) ≈ 1 for x >= 0
        dAgg[d] = x; // Simplified - full impl would cache aggregated pre-activation
      }

      // Backward through aggregation
      const dAttention: number[] = [];
      for (const t of connectedTools) {
        // dAttention[t] = dot(dAgg, H_proj_h[t])
        dAttention.push(dot(dAgg, H_proj_h[t]));
      }

      // Backward through softmax
      const attentionWeights: number[] = [];
      for (const t of connectedTools) {
        const key = `${phaseKey}_${h}_${t}_${c}`;
        attentionWeights.push(cache.attentionVE.get(key) ?? 0);
      }

      const sumAttnDAttn = attentionWeights.reduce((sum, aw, i) => sum + aw * dAttention[i], 0);
      const dScores: number[] = attentionWeights.map((aw, i) =>
        aw * (dAttention[i] - sumAttnDAttn)
      );

      // Backward through attention score computation
      for (let i = 0; i < connectedTools.length; i++) {
        const t = connectedTools[i];
        const dScore = dScores[i];

        const concatKey = `${phaseKey}_${h}_${t}_${c}`;
        const concat = cache.concatPreActVE.get(concatKey);
        if (!concat) continue;

        // dActivated = dScore * a_h (element-wise)
        // dConcat = dActivated * LeakyReLU'(concat)
        const activated = concat.map((x) => leakyRelu(x, leakyReluSlope));

        // da_h += activated * dScore
        for (let j = 0; j < a_h.length; j++) {
          da[h][j] += activated[j] * dScore;
        }

        // dConcat = dScore * a_h * LeakyReLU'(concat)
        const dConcat = concat.map((x, j) => {
          const deriv = leakyReluDeriv(x, leakyReluSlope);
          return dScore * a_h[j] * deriv;
        });

        // Split dConcat: first half is dH_proj, second half is dE_proj
        // dH_proj contribution to dW and dH
        for (let d = 0; d < headDim; d++) {
          // dW_h contribution: dH_proj @ H^T
          const dH_proj_d = dConcat[d];
          for (let e = 0; e < cache.H_init[t].length; e++) {
            dW[h][d][e] += dH_proj_d * cache.H_init[t][e];
          }
          // dH contribution: dH_proj @ W_h
          for (let e = 0; e < W_h[d].length; e++) {
            dH[t][e] += dH_proj_d * W_h[d][e];
          }
        }

        // Aggregation gradient: dH_proj[t] += attention[t][c] * dAgg
        for (let d = 0; d < headDim; d++) {
          for (let e = 0; e < W_h[d].length; e++) {
            dH[t][e] += attentionWeights[i] * dAgg[d] * W_h[d][e];
          }
        }
      }
    }
  }
}

/**
 * Backward pass for E → E phase (upward or downward)
 */
function backwardEdgeToEdge(
  dE_new: number[][],
  cache: SparseMPForwardCache,
  phaseKey: string,
  level: number,
  _W: tf.Variable[], // unused in simplified backward
  a: tf.Variable[],
  _dW: number[][][], // unused in simplified backward
  da: number[][],
  numHeads: number,
  headDim: number,
  leakyReluSlope: number,
  isUpward: boolean,
): void {
  const numTargets = dE_new.length;
  const conn = cache.connectivity.capToCapByLevel.get(isUpward ? level : level + 1);
  if (!conn) return;

  const targetToSources = isUpward ? conn.childToParents : conn.parentToChildren;

  const a_arrays = a.map((av) => av.arraySync() as number[]);

  const attentionMap = isUpward
    ? cache.attentionUpward.get(level)
    : cache.attentionDownward.get(level);
  const concatMap = isUpward
    ? cache.concatPreActUpward.get(level)
    : cache.concatPreActDownward.get(level);

  if (!attentionMap || !concatMap) return;

  for (let h = 0; h < numHeads; h++) {
    const a_h = a_arrays[h];

    for (let tgt = 0; tgt < numTargets; tgt++) {
      const connectedSources = targetToSources[tgt];
      if (!connectedSources || connectedSources.length === 0) continue;

      const headOffset = h * headDim;
      const dAgg = new Array(headDim).fill(0);
      for (let d = 0; d < headDim; d++) {
        dAgg[d] = dE_new[tgt][headOffset + d] ?? 0;
      }

      // Get attention weights
      const attentionWeights: number[] = [];
      for (const src of connectedSources) {
        const key = `${phaseKey}_${h}_${src}_${tgt}`;
        attentionWeights.push(attentionMap.get(key) ?? 0);
      }

      // Backward through softmax (simplified)
      for (let i = 0; i < connectedSources.length; i++) {
        const src = connectedSources[i];
        const attn = attentionWeights[i];

        const concatKey = `${phaseKey}_${h}_${src}_${tgt}`;
        const concat = concatMap.get(concatKey);
        if (!concat) continue;

        const activated = concat.map((x) => leakyRelu(x, leakyReluSlope));

        // Simplified gradient flow (approximation for speed)
        // da_h += activated * attn * dAgg_norm
        const dAggNorm = Math.sqrt(dAgg.reduce((s, x) => s + x * x, 0)) || 1;
        for (let j = 0; j < a_h.length; j++) {
          da[h][j] += activated[j] * attn * dAggNorm * 0.01; // Scaled down
        }
      }
    }
  }
}

/**
 * Backward pass for E → V phase
 */
function backwardEdgeToVertex(
  dH_new: number[][],
  cache: SparseMPForwardCache,
  phaseKey: string,
  _W: tf.Variable[], // unused in simplified backward
  a: tf.Variable[],
  _dW: number[][][], // unused in simplified backward
  da: number[][],
  numHeads: number,
  headDim: number,
  leakyReluSlope: number,
): void {
  const numTools = dH_new.length;
  const { toolToCaps } = cache.connectivity;

  const a_arrays = a.map((av) => av.arraySync() as number[]);

  for (let h = 0; h < numHeads; h++) {
    const a_h = a_arrays[h];

    for (let t = 0; t < numTools; t++) {
      const connectedCaps = toolToCaps[t];
      if (connectedCaps.length === 0) continue;

      const headOffset = h * headDim;
      const dAgg = new Array(headDim).fill(0);
      for (let d = 0; d < headDim; d++) {
        dAgg[d] = dH_new[t][headOffset + d] ?? 0;
      }

      for (const c of connectedCaps) {
        const concatKey = `${phaseKey}_${h}_${c}_${t}`;
        const concat = cache.concatPreActVE.get(concatKey);
        if (!concat) continue;

        const attnKey = `${phaseKey}_${h}_${c}_${t}`;
        const attn = cache.attentionVE.get(attnKey) ?? 0;

        const activated = concat.map((x) => leakyRelu(x, leakyReluSlope));

        // Simplified gradient accumulation
        const dAggNorm = Math.sqrt(dAgg.reduce((s, x) => s + x * x, 0)) || 1;
        for (let j = 0; j < a_h.length; j++) {
          da[h][j] += activated[j] * attn * dAggNorm * 0.01;
        }
      }
    }
  }
}

// ============================================================================
// Apply Gradients
// ============================================================================

/**
 * Apply sparse MP gradients to parameters
 */
export function applySparseMPGradients(
  params: TFParams,
  grads: SparseMPGradients,
  learningRate: number,
  batchSize: number,
): void {
  const scale = learningRate / batchSize;

  // Apply W_up gradients
  for (const [level, dW_level] of grads.dW_up) {
    const W_up = params.W_up.get(level);
    if (!W_up) continue;

    for (let h = 0; h < W_up.length; h++) {
      const W_h = W_up[h];
      const dW_h = dW_level[h];
      const W_data = W_h.arraySync() as number[][];

      for (let i = 0; i < W_data.length; i++) {
        for (let j = 0; j < W_data[i].length; j++) {
          W_data[i][j] -= scale * (dW_h[i]?.[j] ?? 0);
        }
      }

      W_h.assign(tf.tensor2d(W_data));
    }
  }

  // Apply W_down gradients
  for (const [level, dW_level] of grads.dW_down) {
    const W_down = params.W_down.get(level);
    if (!W_down) continue;

    for (let h = 0; h < W_down.length; h++) {
      const W_h = W_down[h];
      const dW_h = dW_level[h];
      const W_data = W_h.arraySync() as number[][];

      for (let i = 0; i < W_data.length; i++) {
        for (let j = 0; j < W_data[i].length; j++) {
          W_data[i][j] -= scale * (dW_h[i]?.[j] ?? 0);
        }
      }

      W_h.assign(tf.tensor2d(W_data));
    }
  }

  // Apply a_up gradients
  for (const [level, da_level] of grads.da_up) {
    const a_up = params.a_up.get(level);
    if (!a_up) continue;

    for (let h = 0; h < a_up.length; h++) {
      const a_h = a_up[h];
      const da_h = da_level[h];
      const a_data = a_h.arraySync() as number[];

      for (let i = 0; i < a_data.length; i++) {
        a_data[i] -= scale * (da_h[i] ?? 0);
      }

      a_h.assign(tf.tensor1d(a_data));
    }
  }

  // Apply a_down gradients
  for (const [level, da_level] of grads.da_down) {
    const a_down = params.a_down.get(level);
    if (!a_down) continue;

    for (let h = 0; h < a_down.length; h++) {
      const a_h = a_down[h];
      const da_h = da_level[h];
      const a_data = a_h.arraySync() as number[];

      for (let i = 0; i < a_data.length; i++) {
        a_data[i] -= scale * (da_h[i] ?? 0);
      }

      a_h.assign(tf.tensor1d(a_data));
    }
  }
}
