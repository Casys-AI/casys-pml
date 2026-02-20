/**
 * Paper-style Two-Phase Message Passing (n-SuHGAT / Fujita)
 *
 * Implements the HGAT attention from:
 *   "SuperHyperGraph Attention Networks" (Fujita et al.)
 *
 * Phase 1 (V→E): Vertex-to-hyperedge aggregation
 *   A = A^(n) ⊙ softmax(LeakyReLU(H W (E W)^T))
 *   E^(l+1) = σ(A^T H)
 *
 * Phase 2 (E→V): Hyperedge-to-vertex aggregation
 *   B = (A^(n))^T ⊙ softmax(LeakyReLU(E W₁ (H W₁)^T))
 *   H^(l+1) = σ(B^T E)
 *
 * Key differences from the existing multi-head SHGATAdapter:
 * - Single shared W per phase (not multi-head, not K-head)
 * - Dot-product attention in projected space (not concat+a^T)
 * - ~2 * (d * d') params total (~500K for d=1024, d'=256) vs 7.35M
 *
 * @module shgat-for-gru/paper-mp
 */

import type { GraphNode, GraphStructure, EnrichedEmbeddings } from "./types.ts";

// ==========================================================================
// Forward cache types (for backward pass)
// ==========================================================================

/** Per-parent phase 1 cache */
interface P1ParentCache {
  childIndices: number[];
  rawScores: number[];   // leakyReLU inputs (before activation)
  attn: number[];        // softmax output
  aggPreAct: number[];   // weighted sum before activation
}

/** Per-child phase 2 cache */
interface P2ChildCache {
  parentIndices: number[];
  rawScores: number[];
  attn: number[];
  aggPreAct: number[];
}

/** Per-level forward cache */
interface LevelCache {
  level: number;
  conn: LevelConnectivity;
  // Phase 1
  childEmbs_p1: number[][];     // child embeddings input to phase 1
  parentEmbs_saved: number[][];  // parent embeddings before phase 1
  childProjW: number[][];        // W @ childEmbs
  parentProjW: number[][];       // W @ parentEmbs
  p1Caches: P1ParentCache[];     // per-parent attention caches
  parentEmbs_after_p1: number[][]; // parent embeddings after phase 1
  // Phase 2
  childEmbs_saved_p2: number[][]; // child embeddings before phase 2
  childProjW1: number[][];
  parentProjW1: number[][];
  p2Caches: P2ChildCache[];      // per-child attention caches
}

/** Full forward cache for backward pass */
export interface PaperMPForwardCache {
  levelCaches: LevelCache[];
  l0Ids: string[];
  embDim: number;
  projDim: number;
  residualAlpha: number;
  activation: "relu" | "leaky_relu";
  leakySlope: number;
}

/** Gradients returned by backward */
export interface PaperMPGradients {
  dW: number[][];   // [projDim x embDim]
  dW1: number[][];  // [projDim x embDim]
}

// ==========================================================================
// Config
// ==========================================================================

export interface PaperMPConfig {
  /** Input embedding dimension (1024 for BGE-M3) */
  embDim: number;
  /** Projection dimension d' (128 or 256) */
  projDim: number;
  /** Residual connection weight: H_out = (1-alpha)*σ(agg) + alpha*H_in */
  residualAlpha: number;
  /** Activation function */
  activation: "relu" | "leaky_relu";
  /** LeakyReLU negative slope (only used if activation = leaky_relu) */
  leakySlope?: number;
  /** PRNG seed */
  seed: number;
}

const DEFAULT_CONFIG: PaperMPConfig = {
  embDim: 1024,
  projDim: 256,
  residualAlpha: 0.3,
  activation: "leaky_relu",
  leakySlope: 0.2,
  seed: 42,
};

// ==========================================================================
// Seeded PRNG (mulberry32)
// ==========================================================================

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandn(rng: () => number): () => number {
  return () => {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  };
}

// ==========================================================================
// Math helpers
// ==========================================================================

/** Matrix-vector product: result[i] = sum_j M[i][j] * v[j] */
function matVec(M: number[][], v: number[]): number[] {
  const rows = M.length;
  const cols = v.length;
  const result = new Array<number>(rows);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    const row = M[i];
    for (let j = 0; j < cols; j++) sum += row[j] * v[j];
    result[i] = sum;
  }
  return result;
}

/** Dot product of two vectors */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** In-place activation: ReLU or LeakyReLU */
function activateInPlace(
  v: number[],
  activation: "relu" | "leaky_relu",
  slope: number,
): void {
  for (let i = 0; i < v.length; i++) {
    if (v[i] < 0) {
      v[i] = activation === "relu" ? 0 : slope * v[i];
    }
  }
}

// ==========================================================================
// Internal sparse connectivity
// ==========================================================================

/**
 * Sparse representation of V↔E connectivity at one level.
 * parentChildren[pIdx] = array of child indices connected to parent pIdx.
 * childParents[cIdx] = array of parent indices connected to child cIdx.
 */
interface LevelConnectivity {
  numParents: number;
  numChildren: number;
  parentChildren: number[][]; // parentChildren[pIdx] = [cIdx, ...]
  childParents: number[][]; // childParents[cIdx] = [pIdx, ...]
}

function buildLevelConnectivity(
  matrix: number[][],
  numChildren: number,
): LevelConnectivity {
  const numParents = matrix.length;
  const parentChildren: number[][] = Array.from(
    { length: numParents },
    () => [],
  );
  const childParents: number[][] = Array.from(
    { length: numChildren },
    () => [],
  );

  for (let pi = 0; pi < numParents; pi++) {
    const row = matrix[pi];
    for (let ci = 0; ci < row.length; ci++) {
      if (row[ci] > 0) {
        parentChildren[pi].push(ci);
        childParents[ci].push(pi);
      }
    }
  }

  return { numParents, numChildren, parentChildren, childParents };
}

// ==========================================================================
// PaperMP class
// ==========================================================================

export class PaperMP {
  private config: PaperMPConfig;

  /** Phase 1 projection W: [projDim x embDim] */
  private W: number[][] = [];
  /** Phase 2 projection W1: [projDim x embDim] */
  private W1: number[][] = [];

  // Graph state
  private graph: GraphStructure | null = null;
  private nodeEmbeddings: Map<string, number[]> = new Map();
  private enrichedEmbs: Map<string, number[]> | null = null;

  constructor(config?: Partial<PaperMPConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initParams(this.config.seed);
  }

  // ---------- Init ----------

  /**
   * Initialize W and W1 with seeded Glorot normal.
   * W: [projDim x embDim], W1: [projDim x embDim]
   * Total params = 2 * projDim * embDim
   */
  initParams(seed: number): void {
    const { embDim, projDim } = this.config;
    const rng = mulberry32(seed);
    const randn = seededRandn(rng);

    const glorotMatrix = (rows: number, cols: number): number[][] => {
      const scale = Math.sqrt(2.0 / (rows + cols));
      return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => randn() * scale),
      );
    };

    this.W = glorotMatrix(projDim, embDim);
    this.W1 = glorotMatrix(projDim, embDim);
    this.enrichedEmbs = null;
  }

  /**
   * Replace W and W1 with externally provided params (e.g. from training).
   * W and W1 must be [projDim x embDim].
   */
  setParams(W: number[][], W1: number[][]): void {
    const { projDim, embDim } = this.config;
    if (W.length !== projDim || W[0]?.length !== embDim) {
      throw new Error(
        `[PaperMP] W must be [${projDim} x ${embDim}], got [${W.length} x ${W[0]?.length}]`,
      );
    }
    if (W1.length !== projDim || W1[0]?.length !== embDim) {
      throw new Error(
        `[PaperMP] W1 must be [${projDim} x ${embDim}], got [${W1.length} x ${W1[0]?.length}]`,
      );
    }
    this.W = W;
    this.W1 = W1;
    this.enrichedEmbs = null;
  }

  /**
   * Export current params for serialization.
   */
  exportParams(): { W: number[][]; W1: number[][]; config: PaperMPConfig } {
    return {
      W: this.W.map((row) => [...row]),
      W1: this.W1.map((row) => [...row]),
      config: { ...this.config },
    };
  }

  getConfig(): PaperMPConfig {
    return { ...this.config };
  }

  getParamCount(): number {
    return 2 * this.config.projDim * this.config.embDim;
  }

  // ---------- Build graph ----------

  /**
   * Build graph from flat node list (same format as SHGATAdapter).
   * Nodes with children=[] are L0 leaves (tools).
   * Others are hyperedge nodes (capabilities at various levels).
   */
  buildGraph(nodes: GraphNode[]): GraphStructure {
    const idToNode = new Map<string, GraphNode>();
    for (const n of nodes) {
      idToNode.set(n.id, n);
      this.nodeEmbeddings.set(n.id, n.embedding);
    }

    const l0Ids: string[] = [];
    const higherNodeIds: string[] = [];
    for (const n of nodes) {
      if (n.children.length === 0) {
        l0Ids.push(n.id);
      } else {
        higherNodeIds.push(n.id);
      }
    }

    const l0IdxMap = new Map<string, number>();
    for (let i = 0; i < l0Ids.length; i++) l0IdxMap.set(l0Ids[i], i);

    const nodeIdsByLevel = new Map<number, string[]>();
    for (const id of higherNodeIds) {
      const node = idToNode.get(id)!;
      const level = node.level;
      if (!nodeIdsByLevel.has(level)) nodeIdsByLevel.set(level, []);
      nodeIdsByLevel.get(level)!.push(id);
    }

    // L0→L1 connectivity matrix
    const l1Nodes = nodeIdsByLevel.get(0) ?? [];
    const l1IdxMap = new Map<string, number>();
    for (let i = 0; i < l1Nodes.length; i++) l1IdxMap.set(l1Nodes[i], i);

    const l0ToL1Matrix: number[][] = Array.from(
      { length: l1Nodes.length },
      () => new Array(l0Ids.length).fill(0),
    );

    for (const l1Id of l1Nodes) {
      const node = idToNode.get(l1Id)!;
      const l1Idx = l1IdxMap.get(l1Id)!;
      for (const childId of node.children) {
        const l0Idx = l0IdxMap.get(childId);
        if (l0Idx !== undefined) {
          l0ToL1Matrix[l1Idx][l0Idx] = 1;
        }
      }
    }

    // Higher-level inter-level matrices
    const interLevelMatrices = new Map<number, number[][]>();
    const levels = [...nodeIdsByLevel.keys()].sort((a, b) => a - b);
    for (let li = 1; li < levels.length; li++) {
      const parentLevel = levels[li];
      const childLevel = levels[li - 1];
      const parentNodes = nodeIdsByLevel.get(parentLevel)!;
      const childNodes = nodeIdsByLevel.get(childLevel)!;
      const childIdxMap = new Map<string, number>();
      for (let i = 0; i < childNodes.length; i++)
        childIdxMap.set(childNodes[i], i);

      const matrix: number[][] = Array.from(
        { length: parentNodes.length },
        () => new Array(childNodes.length).fill(0),
      );
      for (let pi = 0; pi < parentNodes.length; pi++) {
        const parent = idToNode.get(parentNodes[pi])!;
        for (const childId of parent.children) {
          const ci = childIdxMap.get(childId);
          if (ci !== undefined) matrix[pi][ci] = 1;
        }
      }
      interLevelMatrices.set(parentLevel, matrix);
    }

    const maxLevel = levels.length > 0 ? levels[levels.length - 1] : -1;

    this.graph = {
      l0Ids,
      l0IdxMap,
      nodeIdsByLevel,
      l0ToL1Matrix,
      interLevelMatrices,
      maxLevel,
    };
    this.enrichedEmbs = null;
    return this.graph;
  }

  // ---------- Two-phase MP ----------

  /**
   * Run two-phase message passing and return enriched L0 embeddings.
   *
   * Per-level, bottom-up:
   *   Phase 1 (V→E): children aggregate into parents
   *   Phase 2 (E→V): parents distribute back to children
   *
   * Each level uses the same W, W1 projections (shared across levels).
   */
  enrich(): EnrichedEmbeddings {
    if (!this.graph) {
      throw new Error("[PaperMP] No graph built. Call buildGraph() first.");
    }

    const t0 = Date.now();
    const { embDim, projDim, residualAlpha, activation, leakySlope } =
      this.config;
    const slope = leakySlope ?? 0.2;
    const {
      l0Ids,
      nodeIdsByLevel,
      l0ToL1Matrix,
      interLevelMatrices,
    } = this.graph;

    // Collect working copies of embeddings
    const H: number[][] = l0Ids.map((id) => [
      ...(this.nodeEmbeddings.get(id) ?? []),
    ]);
    const E = new Map<number, number[][]>();
    for (const [level, ids] of nodeIdsByLevel) {
      E.set(
        level,
        ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]),
      );
    }

    const levels = [...nodeIdsByLevel.keys()].sort((a, b) => a - b);
    if (levels.length === 0) {
      // No hierarchy — return raw embeddings
      const result = new Map<string, number[]>();
      for (let i = 0; i < l0Ids.length; i++) result.set(l0Ids[i], H[i]);
      return { l0Embeddings: result, enrichmentMs: Date.now() - t0 };
    }

    // Process each level bottom-up
    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      const parentEmbs = E.get(level)!;
      const childEmbs =
        level === levels[0] ? H : E.get(levels[li - 1])!;
      const matrix =
        level === levels[0]
          ? l0ToL1Matrix
          : interLevelMatrices.get(level) ?? [];

      const numChildren = childEmbs.length;
      const conn = buildLevelConnectivity(matrix, numChildren);

      // --- Phase 1 (V→E): aggregate children into parents ---
      // For each parent e_j, compute attention over its child vertices v_i:
      //   score(v_i, e_j) = LeakyReLU( (v_i W) · (e_j W) )
      //   alpha_ij = softmax_i(score)   (over children of e_j)
      //   e_j' = sigma( sum_i alpha_ij * v_i )   (aggregate in original space)
      //
      // Residual: e_j_out = (1 - alpha) * e_j' + alpha * e_j

      // Pre-project all children and parents with W: [projDim x embDim]
      const childProjW = this.batchProject(childEmbs, this.W);
      const parentProjW = this.batchProject(parentEmbs, this.W);

      const parentEmbsSaved = parentEmbs.map((row) => [...row]);

      for (let pj = 0; pj < conn.numParents; pj++) {
        const children = conn.parentChildren[pj];
        if (children.length === 0) continue;

        // Compute attention scores
        const scores = new Array<number>(children.length);
        for (let k = 0; k < children.length; k++) {
          const ci = children[k];
          const raw = dot(childProjW[ci], parentProjW[pj]);
          scores[k] =
            activation === "relu"
              ? Math.max(0, raw)
              : raw >= 0
                ? raw
                : slope * raw;
        }

        // Softmax over children
        const attn = this.softmax(scores);

        // Weighted sum of child embeddings in ORIGINAL space
        const agg = new Array<number>(embDim).fill(0);
        for (let k = 0; k < children.length; k++) {
          const ci = children[k];
          const w = attn[k];
          const emb = childEmbs[ci];
          for (let d = 0; d < embDim; d++) agg[d] += w * emb[d];
        }

        // Activation
        activateInPlace(agg, activation, slope);

        // Residual
        for (let d = 0; d < embDim; d++) {
          parentEmbs[pj][d] =
            (1 - residualAlpha) * agg[d] +
            residualAlpha * parentEmbsSaved[pj][d];
        }
      }

      // --- Phase 2 (E→V): distribute parents back to children ---
      // For each child v_i, compute attention over its parent hyperedges e_j:
      //   score(e_j, v_i) = LeakyReLU( (e_j W1) · (v_i W1) )
      //   beta_ji = softmax_j(score)   (over parents of v_i)
      //   v_i' = sigma( sum_j beta_ji * e_j )   (aggregate in original space)
      //
      // Residual: v_i_out = (1 - alpha) * v_i' + alpha * v_i

      // Re-project with W1 (using updated parent embeddings from Phase 1)
      const childProjW1 = this.batchProject(childEmbs, this.W1);
      const parentProjW1 = this.batchProject(parentEmbs, this.W1);

      const childEmbsSaved = childEmbs.map((row) => [...row]);

      for (let ci = 0; ci < conn.numChildren; ci++) {
        const parents = conn.childParents[ci];
        if (parents.length === 0) continue;

        // Compute attention scores
        const scores = new Array<number>(parents.length);
        for (let k = 0; k < parents.length; k++) {
          const pj = parents[k];
          const raw = dot(parentProjW1[pj], childProjW1[ci]);
          scores[k] =
            activation === "relu"
              ? Math.max(0, raw)
              : raw >= 0
                ? raw
                : slope * raw;
        }

        // Softmax over parents
        const attn = this.softmax(scores);

        // Weighted sum of parent embeddings in ORIGINAL space
        const agg = new Array<number>(embDim).fill(0);
        for (let k = 0; k < parents.length; k++) {
          const pj = parents[k];
          const w = attn[k];
          const emb = parentEmbs[pj];
          for (let d = 0; d < embDim; d++) agg[d] += w * emb[d];
        }

        // Activation
        activateInPlace(agg, activation, slope);

        // Residual
        for (let d = 0; d < embDim; d++) {
          childEmbs[ci][d] =
            (1 - residualAlpha) * agg[d] +
            residualAlpha * childEmbsSaved[ci][d];
        }
      }
    }

    // Build result (L0 = tools)
    const result = new Map<string, number[]>();
    for (let i = 0; i < l0Ids.length; i++) {
      result.set(l0Ids[i], H[i]);
    }

    this.enrichedEmbs = result;
    return { l0Embeddings: result, enrichmentMs: Date.now() - t0 };
  }

  // ---------- Forward with cache (for training) ----------

  /**
   * Run two-phase MP and return enriched L0 embeddings + cache for backward.
   * Only caches Level 0 (L0→L1) since higher levels don't affect H.
   */
  enrichWithCache(): { enriched: EnrichedEmbeddings; cache: PaperMPForwardCache } {
    if (!this.graph) {
      throw new Error("[PaperMP] No graph built. Call buildGraph() first.");
    }

    const t0 = Date.now();
    const { embDim, projDim, residualAlpha, activation, leakySlope } = this.config;
    const slope = leakySlope ?? 0.2;
    const { l0Ids, nodeIdsByLevel, l0ToL1Matrix, interLevelMatrices } = this.graph;

    // Working copies
    const H: number[][] = l0Ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]);
    const E = new Map<number, number[][]>();
    for (const [level, ids] of nodeIdsByLevel) {
      E.set(level, ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]));
    }

    const levels = [...nodeIdsByLevel.keys()].sort((a, b) => a - b);
    const levelCaches: LevelCache[] = [];

    if (levels.length === 0) {
      const result = new Map<string, number[]>();
      for (let i = 0; i < l0Ids.length; i++) result.set(l0Ids[i], H[i]);
      return {
        enriched: { l0Embeddings: result, enrichmentMs: Date.now() - t0 },
        cache: { levelCaches: [], l0Ids, embDim, projDim, residualAlpha, activation, leakySlope: slope },
      };
    }

    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      const parentEmbs = E.get(level)!;
      const childEmbs = level === levels[0] ? H : E.get(levels[li - 1])!;
      const matrix = level === levels[0] ? l0ToL1Matrix : interLevelMatrices.get(level) ?? [];
      const conn = buildLevelConnectivity(matrix, childEmbs.length);

      // === Phase 1 (V→E) ===
      const childProjW = this.batchProject(childEmbs, this.W);
      const parentProjW = this.batchProject(parentEmbs, this.W);
      const parentEmbsSaved = parentEmbs.map((row) => [...row]);
      const p1Caches: P1ParentCache[] = [];

      for (let pj = 0; pj < conn.numParents; pj++) {
        const children = conn.parentChildren[pj];
        if (children.length === 0) {
          p1Caches.push({ childIndices: [], rawScores: [], attn: [], aggPreAct: [] });
          continue;
        }

        const rawScores = new Array<number>(children.length);
        for (let k = 0; k < children.length; k++) {
          rawScores[k] = dot(childProjW[children[k]], parentProjW[pj]);
        }

        // LeakyReLU on scores
        const scores = rawScores.map((r) =>
          activation === "relu" ? Math.max(0, r) : r >= 0 ? r : slope * r,
        );
        const attn = this.softmax(scores);

        // Weighted sum in original space
        const agg = new Array<number>(embDim).fill(0);
        for (let k = 0; k < children.length; k++) {
          const w = attn[k];
          const emb = childEmbs[children[k]];
          for (let d = 0; d < embDim; d++) agg[d] += w * emb[d];
        }

        const aggPreAct = [...agg];
        activateInPlace(agg, activation, slope);

        for (let d = 0; d < embDim; d++) {
          parentEmbs[pj][d] = (1 - residualAlpha) * agg[d] + residualAlpha * parentEmbsSaved[pj][d];
        }

        p1Caches.push({ childIndices: children, rawScores, attn, aggPreAct });
      }

      const parentEmbs_after_p1 = parentEmbs.map((row) => [...row]);

      // === Phase 2 (E→V) ===
      const childProjW1 = this.batchProject(childEmbs, this.W1);
      const parentProjW1 = this.batchProject(parentEmbs, this.W1);
      const childEmbsSaved = childEmbs.map((row) => [...row]);
      const p2Caches: P2ChildCache[] = [];

      for (let ci = 0; ci < conn.numChildren; ci++) {
        const parents = conn.childParents[ci];
        if (parents.length === 0) {
          p2Caches.push({ parentIndices: [], rawScores: [], attn: [], aggPreAct: [] });
          continue;
        }

        const rawScores = new Array<number>(parents.length);
        for (let k = 0; k < parents.length; k++) {
          rawScores[k] = dot(parentProjW1[parents[k]], childProjW1[ci]);
        }

        const scores = rawScores.map((r) =>
          activation === "relu" ? Math.max(0, r) : r >= 0 ? r : slope * r,
        );
        const attn = this.softmax(scores);

        const agg = new Array<number>(embDim).fill(0);
        for (let k = 0; k < parents.length; k++) {
          const w = attn[k];
          const emb = parentEmbs[parents[k]];
          for (let d = 0; d < embDim; d++) agg[d] += w * emb[d];
        }

        const aggPreAct = [...agg];
        activateInPlace(agg, activation, slope);

        for (let d = 0; d < embDim; d++) {
          childEmbs[ci][d] = (1 - residualAlpha) * agg[d] + residualAlpha * childEmbsSaved[ci][d];
        }

        p2Caches.push({ parentIndices: parents, rawScores, attn, aggPreAct });
      }

      levelCaches.push({
        level,
        conn,
        childEmbs_p1: li === 0 ? l0Ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]) : childEmbs.map((r) => [...r]),
        parentEmbs_saved: parentEmbsSaved,
        childProjW,
        parentProjW,
        p1Caches,
        parentEmbs_after_p1,
        childEmbs_saved_p2: childEmbsSaved,
        childProjW1,
        parentProjW1,
        p2Caches,
      });
    }

    const result = new Map<string, number[]>();
    for (let i = 0; i < l0Ids.length; i++) result.set(l0Ids[i], H[i]);
    this.enrichedEmbs = result;

    return {
      enriched: { l0Embeddings: result, enrichmentMs: Date.now() - t0 },
      cache: { levelCaches, l0Ids, embDim, projDim, residualAlpha, activation, leakySlope: slope },
    };
  }

  // ---------- Backward pass ----------

  /**
   * Compute gradients dW, dW1 given gradient on enriched L0 embeddings.
   * Only backprops through Level 0 (L0→L1) since higher levels don't affect H.
   *
   * @param cache - Forward cache from enrichWithCache()
   * @param dH - Gradient on enriched L0 embeddings: Map<l0Id, number[embDim]>
   * @returns Gradients for W and W1
   */
  backward(cache: PaperMPForwardCache, dH: Map<string, number[]>): PaperMPGradients {
    const { embDim, projDim, residualAlpha, activation, leakySlope } = cache;
    const slope = leakySlope;

    // Initialize gradient accumulators
    const dW: number[][] = Array.from({ length: projDim }, () => new Array(embDim).fill(0));
    const dW1: number[][] = Array.from({ length: projDim }, () => new Array(embDim).fill(0));

    if (cache.levelCaches.length === 0) return { dW, dW1 };

    // Only backprop through Level 0 (L0→L1)
    const lc = cache.levelCaches[0];
    const { conn, p1Caches, p2Caches } = lc;

    // Convert dH map to array (indexed by L0 position)
    const dChildOut: number[][] = cache.l0Ids.map((id) => {
      const g = dH.get(id);
      return g ? [...g] : new Array(embDim).fill(0);
    });

    // ====== Backward Phase 2 (E→V) ======
    // childEmbs_out[ci] = (1-alpha) * act(agg2) + alpha * childEmbsSaved[ci]

    // Gradient accumulators for phase 2 outputs
    const dParentEmbs_p2 = Array.from({ length: conn.numParents }, () => new Array(embDim).fill(0));
    const dChildEmbsSaved_p2 = Array.from({ length: conn.numChildren }, () => new Array(embDim).fill(0));
    const dChildProjW1 = Array.from({ length: conn.numChildren }, () => new Array(projDim).fill(0));
    const dParentProjW1 = Array.from({ length: conn.numParents }, () => new Array(projDim).fill(0));

    for (let ci = 0; ci < conn.numChildren; ci++) {
      const pc = p2Caches[ci];
      if (pc.parentIndices.length === 0) continue;

      // Residual backward
      // dAct2 = (1-alpha) * dChildOut
      const dAct2 = new Array<number>(embDim);
      for (let d = 0; d < embDim; d++) {
        dAct2[d] = (1 - residualAlpha) * dChildOut[ci][d];
        dChildEmbsSaved_p2[ci][d] += residualAlpha * dChildOut[ci][d];
      }

      // Activation backward (LeakyReLU on aggPreAct)
      const dAgg2 = new Array<number>(embDim);
      for (let d = 0; d < embDim; d++) {
        const grad = pc.aggPreAct[d] >= 0 ? 1 : (activation === "relu" ? 0 : slope);
        dAgg2[d] = dAct2[d] * grad;
      }

      // Weighted sum backward: agg2 = sum_k attn[k] * parentEmbs_after_p1[parents[k]]
      const dAttn2 = new Array<number>(pc.parentIndices.length);
      for (let k = 0; k < pc.parentIndices.length; k++) {
        const pj = pc.parentIndices[k];
        // dAttn2[k] = dot(dAgg2, parentEmbs_after_p1[pj])
        let s = 0;
        for (let d = 0; d < embDim; d++) s += dAgg2[d] * lc.parentEmbs_after_p1[pj][d];
        dAttn2[k] = s;
        // dParentEmbs += attn[k] * dAgg2
        const w = pc.attn[k];
        for (let d = 0; d < embDim; d++) dParentEmbs_p2[pj][d] += w * dAgg2[d];
      }

      // Softmax backward: attn = softmax(scores)
      // dScores[k] = attn[k] * (dAttn[k] - sum_j attn[j] * dAttn[j])
      let dotAttnDattn = 0;
      for (let k = 0; k < pc.attn.length; k++) dotAttnDattn += pc.attn[k] * dAttn2[k];
      const dScores2 = new Array<number>(pc.attn.length);
      for (let k = 0; k < pc.attn.length; k++) {
        dScores2[k] = pc.attn[k] * (dAttn2[k] - dotAttnDattn);
      }

      // LeakyReLU backward on raw scores
      const dRawScores2 = new Array<number>(pc.rawScores.length);
      for (let k = 0; k < pc.rawScores.length; k++) {
        const grad = pc.rawScores[k] >= 0 ? 1 : (activation === "relu" ? 0 : slope);
        dRawScores2[k] = dScores2[k] * grad;
      }

      // Dot product backward: rawScore = dot(parentProjW1[pj], childProjW1[ci])
      for (let k = 0; k < pc.parentIndices.length; k++) {
        const pj = pc.parentIndices[k];
        const ds = dRawScores2[k];
        for (let d = 0; d < projDim; d++) {
          dParentProjW1[pj][d] += ds * lc.childProjW1[ci][d];
          dChildProjW1[ci][d] += ds * lc.parentProjW1[pj][d];
        }
      }
    }

    // Projection backward for W1:
    // childProjW1 = W1 @ childEmbsSaved_p2
    // parentProjW1 = W1 @ parentEmbs_after_p1
    for (let ci = 0; ci < conn.numChildren; ci++) {
      if (p2Caches[ci].parentIndices.length === 0) continue;
      for (let r = 0; r < projDim; r++) {
        const dProj = dChildProjW1[ci][r];
        if (dProj === 0) continue;
        const childEmb = lc.childEmbs_saved_p2[ci];
        for (let c = 0; c < embDim; c++) dW1[r][c] += dProj * childEmb[c];
      }
    }
    for (let pj = 0; pj < conn.numParents; pj++) {
      if (p1Caches[pj].childIndices.length === 0) continue;
      for (let r = 0; r < projDim; r++) {
        const dProj = dParentProjW1[pj][r];
        if (dProj === 0) continue;
        const parentEmb = lc.parentEmbs_after_p1[pj];
        for (let c = 0; c < embDim; c++) dW1[r][c] += dProj * parentEmb[c];
      }
    }

    // ====== Backward Phase 1 (V→E) ======
    // parentEmbs_after_p1[pj] = (1-alpha) * act(agg1) + alpha * parentEmbsSaved[pj]
    // Gradient on parentEmbs_after_p1 comes from Phase 2: dParentEmbs_p2

    const dChildProjW_acc = Array.from({ length: conn.numChildren }, () => new Array(projDim).fill(0));
    const dParentProjW_acc = Array.from({ length: conn.numParents }, () => new Array(projDim).fill(0));

    for (let pj = 0; pj < conn.numParents; pj++) {
      const pc = p1Caches[pj];
      if (pc.childIndices.length === 0) continue;

      // Also accumulate gradient from W1 projection on parentEmbs_after_p1
      // dParentEmbs_after_p1[pj] = dParentEmbs_p2[pj] + W1^T @ dParentProjW1[pj]
      const dParent = new Array<number>(embDim);
      for (let d = 0; d < embDim; d++) dParent[d] = dParentEmbs_p2[pj][d];
      // Add W1^T @ dParentProjW1[pj]
      for (let r = 0; r < projDim; r++) {
        const dp = dParentProjW1[pj][r];
        if (dp === 0) continue;
        for (let c = 0; c < embDim; c++) dParent[c] += this.W1[r][c] * dp;
      }

      // Residual backward
      const dAct1 = new Array<number>(embDim);
      for (let d = 0; d < embDim; d++) {
        dAct1[d] = (1 - residualAlpha) * dParent[d];
        // dParentEmbsSaved gradient (not needed for dW/dW1, but tracks correctly)
      }

      // Activation backward
      const dAgg1 = new Array<number>(embDim);
      for (let d = 0; d < embDim; d++) {
        const grad = pc.aggPreAct[d] >= 0 ? 1 : (activation === "relu" ? 0 : slope);
        dAgg1[d] = dAct1[d] * grad;
      }

      // Weighted sum backward: agg1 = sum_k attn[k] * childEmbs_p1[children[k]]
      const dAttn1 = new Array<number>(pc.childIndices.length);
      for (let k = 0; k < pc.childIndices.length; k++) {
        const ci = pc.childIndices[k];
        let s = 0;
        for (let d = 0; d < embDim; d++) s += dAgg1[d] * lc.childEmbs_p1[ci][d];
        dAttn1[k] = s;
      }

      // Softmax backward
      let dotAttnDattn1 = 0;
      for (let k = 0; k < pc.attn.length; k++) dotAttnDattn1 += pc.attn[k] * dAttn1[k];
      const dScores1 = new Array<number>(pc.attn.length);
      for (let k = 0; k < pc.attn.length; k++) {
        dScores1[k] = pc.attn[k] * (dAttn1[k] - dotAttnDattn1);
      }

      // LeakyReLU backward
      const dRawScores1 = new Array<number>(pc.rawScores.length);
      for (let k = 0; k < pc.rawScores.length; k++) {
        const grad = pc.rawScores[k] >= 0 ? 1 : (activation === "relu" ? 0 : slope);
        dRawScores1[k] = dScores1[k] * grad;
      }

      // Dot product backward: rawScore = dot(childProjW[ci], parentProjW[pj])
      for (let k = 0; k < pc.childIndices.length; k++) {
        const ci = pc.childIndices[k];
        const ds = dRawScores1[k];
        for (let d = 0; d < projDim; d++) {
          dChildProjW_acc[ci][d] += ds * lc.parentProjW[pj][d];
          dParentProjW_acc[pj][d] += ds * lc.childProjW[ci][d];
        }
      }
    }

    // Projection backward for W:
    // childProjW = W @ childEmbs_p1
    // parentProjW = W @ parentEmbsSaved
    for (let ci = 0; ci < conn.numChildren; ci++) {
      for (let r = 0; r < projDim; r++) {
        const dProj = dChildProjW_acc[ci][r];
        if (dProj === 0) continue;
        const childEmb = lc.childEmbs_p1[ci];
        for (let c = 0; c < embDim; c++) dW[r][c] += dProj * childEmb[c];
      }
    }
    for (let pj = 0; pj < conn.numParents; pj++) {
      for (let r = 0; r < projDim; r++) {
        const dProj = dParentProjW_acc[pj][r];
        if (dProj === 0) continue;
        const parentEmb = lc.parentEmbs_saved[pj];
        for (let c = 0; c < embDim; c++) dW[r][c] += dProj * parentEmb[c];
      }
    }

    return { dW, dW1 };
  }

  // ---------- Getters ----------

  getEnrichedEmbeddings(): Map<string, number[]> {
    if (!this.enrichedEmbs) {
      throw new Error(
        "[PaperMP] No enriched embeddings. Call enrich() first.",
      );
    }
    return this.enrichedEmbs;
  }

  getGraph(): GraphStructure {
    if (!this.graph) {
      throw new Error("[PaperMP] No graph built. Call buildGraph() first.");
    }
    return this.graph;
  }

  getL0Ids(): string[] {
    return this.graph?.l0Ids ?? [];
  }

  // ---------- Private helpers ----------

  /** Batch-project all embeddings through a [projDim x embDim] matrix */
  private batchProject(embs: number[][], M: number[][]): number[][] {
    const n = embs.length;
    const projDim = M.length;
    const embDim = M[0].length;
    const result: number[][] = new Array(n);

    for (let i = 0; i < n; i++) {
      const v = embs[i];
      const proj = new Array<number>(projDim);
      for (let r = 0; r < projDim; r++) {
        let sum = 0;
        const row = M[r];
        for (let c = 0; c < embDim; c++) sum += row[c] * v[c];
        proj[r] = sum;
      }
      result[i] = proj;
    }

    return result;
  }

  /** Numerically stable softmax */
  private softmax(values: number[]): number[] {
    if (values.length === 0) return [];
    if (values.length === 1) return [1.0];

    let maxVal = -Infinity;
    for (const v of values) {
      if (v > maxVal) maxVal = v;
    }
    const exps = new Array<number>(values.length);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      exps[i] = Math.exp(values[i] - maxVal);
      sum += exps[i];
    }
    if (sum === 0) {
      const uniform = 1 / values.length;
      return new Array(values.length).fill(uniform);
    }
    for (let i = 0; i < exps.length; i++) {
      exps[i] /= sum;
    }
    return exps;
  }
}
