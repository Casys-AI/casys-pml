/**
 * SHGAT-for-GRU Adapter
 *
 * Replaces the ~800 lines of SHGAT glue code in benchmark-e2e.ts with a
 * clean, reusable module. No TF.js dependency — uses pure JS + optional BLAS.
 *
 * Responsibilities:
 * 1. Load OB-trained SHGAT params (JSON from train-ob.ts)
 * 2. Build graph connectivity from node list
 * 3. Enrich L0 node embeddings via message passing (V↔E forward)
 * 4. K-head scoring for node retrieval (intent → top-K nodes)
 *
 * Usage:
 *   const adapter = new SHGATAdapter();
 *   adapter.loadParams("path/to/shgat-params-ob-xxx.json");
 *   adapter.buildGraph(nodes);
 *   const enriched = adapter.enrichEmbeddings(rawToolEmbeddings);
 *   const topK = adapter.scoreNodes(intentEmbedding, 5);
 *
 * @module shgat-for-gru/adapter
 */

import { readFileSync } from "node:fs";
import type {
  OBTrainedParams,
  HeadParams,
  LevelParams,
  GraphNode,
  GraphStructure,
  EnrichedEmbeddings,
  ScoringResult,
  NodeScore,
  SHGATExportConfig,
} from "./types.ts";

// ==========================================================================
// Math helpers (inlined to avoid shgat-tf dependency)
// ==========================================================================

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

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function leakyRelu(x: number, slope = 0.2): number {
  return x >= 0 ? x : slope * x;
}

function vecAdd(a: number[], b: number[], alpha = 1): number[] {
  const result = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) result[i] = a[i] + alpha * b[i];
  return result;
}

function vecScale(a: number[], s: number): number[] {
  const result = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) result[i] = a[i] * s;
  return result;
}

// ==========================================================================
// SHGATAdapter
// ==========================================================================

export class SHGATAdapter {
  private params: OBTrainedParams | null = null;
  private graph: GraphStructure | null = null;
  private nodeEmbeddings: Map<string, number[]> = new Map();
  private enrichedEmbs: Map<string, number[]> | null = null;
  private enrichedCapEmbs: Map<string, number[]> | null = null;

  // Pre-computed K projections cache: K_cached[h] = allNodeEmbs @ W_k[h]^T
  // Shape: K_cached[h][l0Idx] = number[headDim]
  // Invalidated when params or embeddings change.
  private kCache: { l0Ids: string[]; K_h: number[][][] } | null = null;

  // ---------- 1. Load params ----------

  /**
   * Load SHGAT params from JSON file, auto-detecting format.
   *
   * Supports:
   * - **OB format** (from train-ob.ts): `{ headParams, W_intent, levelParams, config }`
   * - **Autograd format** (from exportParams): `{ W_up, W_down, W_k, W_q, W_intent, config }`
   *
   * The autograd format is automatically converted (W matrices transposed).
   */
  loadParams(path: string): SHGATExportConfig {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if ("W_up" in raw) {
      this.params = SHGATAdapter.convertAutogradToOB(raw);
    } else {
      this.params = raw as OBTrainedParams;
    }
    this.enrichedEmbs = null;
    this.enrichedCapEmbs = null;
    this.kCache = null;
    return this.params.config;
  }

  /** Load params from an already-parsed object (OB format). */
  setParams(params: OBTrainedParams): void {
    this.params = params;
    this.enrichedEmbs = null;
    this.enrichedCapEmbs = null;
    this.kCache = null;
  }

  getConfig(): SHGATExportConfig {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded. Call loadParams() first.");
    return this.params.config;
  }

  /** Check if graph has been built (useful for conditional scoring). */
  hasGraph(): boolean {
    return this.graph !== null;
  }

  /**
   * Initialize random orthogonal projections (no training needed).
   * Per the ADR (2026-02-08): JL lemma guarantees distance preservation.
   * Uses seeded PRNG for reproducibility.
   *
   * @param embDim - Embedding dimension (e.g. 1024 for BGE-M3)
   * @param numHeads - Number of attention heads (default 16)
   * @param headDim - Dimension per head (default 64, numHeads*headDim should = embDim)
   * @param levels - Number of hierarchy levels to create params for (default 2: L0→L1, L1→L2)
   * @param seed - PRNG seed for reproducibility
   */
  initRandomParams(
    embDim: number,
    numHeads = 16,
    headDim = 64,
    levels = 2,
    seed = 42,
  ): SHGATExportConfig {
    // Seeded PRNG (mulberry32)
    let s = seed | 0;
    const rng = () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // Random normal via Box-Muller
    const randn = () => {
      const u1 = rng(), u2 = rng();
      return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    };

    // Generate random matrix [rows × cols] with glorot scale
    const randomMatrix = (rows: number, cols: number): number[][] => {
      const scale = Math.sqrt(2.0 / (rows + cols));
      return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => randn() * scale),
      );
    };

    // Generate random attention vector [2 * headDim]
    const randomAttention = (dim: number): number[] =>
      Array.from({ length: dim }, () => randn() * 0.01);

    // Build level params
    const levelParams: Record<string, LevelParams> = {};
    for (let level = 0; level < levels; level++) {
      const W_child: number[][][] = [];
      const W_parent: number[][][] = [];
      const a_upward: number[][] = [];
      const a_downward: number[][] = [];
      for (let h = 0; h < numHeads; h++) {
        W_child.push(randomMatrix(headDim, embDim));
        W_parent.push(randomMatrix(headDim, embDim));
        a_upward.push(randomAttention(2 * headDim));
        a_downward.push(randomAttention(2 * headDim));
      }
      levelParams[String(level)] = { W_child, W_parent, a_upward, a_downward };
    }

    // Build head params (K-head scoring — random projections)
    const headParams: HeadParams[] = [];
    for (let h = 0; h < numHeads; h++) {
      headParams.push({
        W_q: randomMatrix(headDim, embDim),
        W_k: randomMatrix(headDim, embDim),
        W_v: [],
        a: [],
      });
    }

    // W_intent: [embDim × embDim] — random orthogonal-ish projection
    const W_intent = randomMatrix(embDim, embDim);

    const config: SHGATExportConfig = {
      numHeads,
      headDim,
      embeddingDim: embDim,
    };

    this.params = { headParams, W_intent, levelParams, config };
    this.enrichedEmbs = null;
    this.enrichedCapEmbs = null;
    this.kCache = null;

    return config;
  }

  // ---------- Static converters ----------

  /** Transpose a 2D matrix [R×C] → [C×R] */
  private static transpose(M: number[][]): number[][] {
    if (M.length === 0) return [];
    const rows = M.length, cols = M[0].length;
    return Array.from({ length: cols }, (_, j) =>
      Array.from({ length: rows }, (_, i) => M[i][j]),
    );
  }

  /**
   * Convert "autograd" format params to OB format.
   *
   * Autograd format stores weight matrices as [embDim × headDim] (for tf.matMul).
   * OB format stores them as [headDim × embDim] (for matVec).
   *
   * Keys expected: W_up, W_down, a_up, a_down, W_k, W_q (optional), W_intent, config.
   */
  // deno-lint-ignore no-explicit-any
  static convertAutogradToOB(raw: Record<string, any>): OBTrainedParams {
    const config = raw.config as SHGATExportConfig;
    const numHeads = config.numHeads;

    // Convert level params
    const levelParams: Record<string, LevelParams> = {};
    const W_up = raw.W_up as Record<string, number[][][]>;
    const W_down = raw.W_down as Record<string, number[][][]>;
    const aUp = raw.a_up as Record<string, number[][]>;
    const aDown = raw.a_down as Record<string, number[][]>;

    for (const level of Object.keys(W_up)) {
      levelParams[level] = {
        W_child: W_up[level].map((h) => SHGATAdapter.transpose(h)),
        W_parent: W_down[level].map((h) => SHGATAdapter.transpose(h)),
        a_upward: aUp[level],
        a_downward: aDown[level],
      };
    }

    // Convert K-head params
    const wkData = raw.W_k as number[][][] | undefined;
    const wqData = raw.W_q as number[][][] | undefined;
    const wiData = raw.W_intent as number[][] | undefined;

    const headParams: HeadParams[] = [];
    for (let h = 0; h < numHeads; h++) {
      headParams.push({
        W_q: wqData ? SHGATAdapter.transpose(wqData[h]) : [],
        W_k: wkData ? SHGATAdapter.transpose(wkData[h]) : [],
        W_v: [], // not exported in autograd format
        a: [],   // not exported in autograd format
      });
    }

    return {
      headParams,
      W_intent: wiData ?? [],
      levelParams,
      config,
    };
  }

  // ---------- 2. Build graph ----------

  /**
   * Build graph connectivity from a flat list of nodes.
   * Nodes with children=[] are leaf tools. Others are capabilities.
   * Levels are inferred from the hierarchy.
   */
  buildGraph(nodes: GraphNode[]): GraphStructure {
    const idToNode = new Map<string, GraphNode>();
    for (const n of nodes) {
      idToNode.set(n.id, n);
      this.nodeEmbeddings.set(n.id, n.embedding);
    }

    // Identify L0 leaves = nodes with no children
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

    // Group non-L0 nodes by orchestration level
    const nodeIdsByLevel = new Map<number, string[]>();
    for (const id of higherNodeIds) {
      const node = idToNode.get(id)!;
      const level = node.level;
      if (!nodeIdsByLevel.has(level)) nodeIdsByLevel.set(level, []);
      nodeIdsByLevel.get(level)!.push(id);
    }

    // Build connectivity matrices
    // L0→L1: l0ToL1Matrix[l1Idx][l0Idx] = 1
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
      for (let i = 0; i < childNodes.length; i++) childIdxMap.set(childNodes[i], i);

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

    this.graph = { l0Ids, l0IdxMap, nodeIdsByLevel, l0ToL1Matrix, interLevelMatrices, maxLevel };
    this.enrichedEmbs = null;
    this.enrichedCapEmbs = null;
    this.kCache = null;
    return this.graph;
  }

  // ---------- 3. Enrich embeddings (MP forward) ----------

  /**
   * Enrich L0 node embeddings via SHGAT message passing.
   *
   * Implements the upward (V→E) and downward (E→V) phases using the
   * trained W_child, W_parent, a_upward, a_downward parameters.
   *
   * Returns enriched L0 embeddings (post-MP).
   */
  enrichEmbeddings(): EnrichedEmbeddings {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built.");

    const t0 = Date.now();
    const { headParams, levelParams: levelParamsObj, config } = this.params;
    const { l0Ids, nodeIdsByLevel, l0ToL1Matrix, interLevelMatrices } = this.graph;
    const { numHeads, headDim, embeddingDim } = config;

    // Collect initial L0 embeddings
    const H: number[][] = l0Ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]);

    // Higher-level node embeddings by level
    const E = new Map<number, number[][]>();
    for (const [level, ids] of nodeIdsByLevel) {
      E.set(level, ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]));
    }

    // Parse levelParams (keys are strings in JSON)
    const lpMap = new Map<number, LevelParams>();
    for (const [key, lp] of Object.entries(levelParamsObj)) {
      lpMap.set(parseInt(key, 10), lp);
    }

    // --- Upward phase: L0 → level-0 nodes → level-1 nodes → ... ---
    const levels = [...nodeIdsByLevel.keys()].sort((a, b) => a - b);

    for (const level of levels) {
      const lp = lpMap.get(level);
      if (!lp) continue;

      const parentEmbs = E.get(level)!;
      const childEmbs = level === levels[0] ? H : (E.get(levels[levels.indexOf(level) - 1]) ?? []);
      const connectivity = level === levels[0]
        ? l0ToL1Matrix
        : (interLevelMatrices.get(level) ?? []);

      // For each parent, aggregate children via attention
      for (let pi = 0; pi < parentEmbs.length; pi++) {
        const parentEmb = parentEmbs[pi];
        const childIndices: number[] = [];
        for (let ci = 0; ci < connectivity[pi].length; ci++) {
          if (connectivity[pi][ci] > 0) childIndices.push(ci);
        }
        if (childIndices.length === 0) continue;

        // Multi-head attention aggregation
        const headOutputs: number[][] = [];
        for (let h = 0; h < numHeads; h++) {
          const W_c = lp.W_child[h]; // [headDim × embDim]
          const W_p = lp.W_parent[h];
          const a_up = lp.a_upward[h]; // [2 * headDim]

          const parentProj = matVec(W_p, parentEmb); // [headDim]

          // Attention over children
          const childProjs: number[][] = [];
          const attentionLogits: number[] = [];
          for (const ci of childIndices) {
            const childProj = matVec(W_c, childEmbs[ci]); // [headDim]
            childProjs.push(childProj);

            // LeakyReLU attention: a^T [child || parent]
            let logit = 0;
            for (let d = 0; d < headDim; d++) logit += a_up[d] * childProj[d];
            for (let d = 0; d < headDim; d++) logit += a_up[headDim + d] * parentProj[d];
            attentionLogits.push(leakyRelu(logit));
          }

          // Softmax
          let maxLogit = -Infinity;
          for (const l of attentionLogits) if (l > maxLogit) maxLogit = l;
          const expLogits = attentionLogits.map((l) => Math.exp(l - maxLogit));
          const sumExp = expLogits.reduce((a, b) => a + b, 0);

          // Weighted sum of child projections
          const aggr = new Array<number>(headDim).fill(0);
          for (let i = 0; i < childIndices.length; i++) {
            const w = expLogits[i] / sumExp;
            for (let d = 0; d < headDim; d++) aggr[d] += w * childProjs[i][d];
          }
          headOutputs.push(aggr);
        }

        // Concat heads → [numHeads * headDim] = [embDim] (preserveDim)
        const concat = new Array<number>(embeddingDim).fill(0);
        for (let h = 0; h < numHeads; h++) {
          for (let d = 0; d < headDim; d++) {
            concat[h * headDim + d] = headOutputs[h][d];
          }
        }

        // Residual: parent += concat (with optional scaling)
        for (let d = 0; d < embeddingDim; d++) {
          parentEmbs[pi][d] = parentEmbs[pi][d] + concat[d];
        }
      }
    }

    // --- Downward phase: highest caps → ... → level-0 caps → tools ---
    for (let li = levels.length - 1; li >= 0; li--) {
      const level = levels[li];
      const lp = lpMap.get(level);
      if (!lp) continue;

      const parentEmbs = E.get(level)!;
      const childEmbs = level === levels[0] ? H : (E.get(levels[li - 1]) ?? []);
      const connectivity = level === levels[0]
        ? l0ToL1Matrix
        : (interLevelMatrices.get(level) ?? []);

      // For each child, aggregate from parents
      const numChildren = childEmbs.length;
      for (let ci = 0; ci < numChildren; ci++) {
        const childEmb = childEmbs[ci];
        const parentIndices: number[] = [];
        for (let pi = 0; pi < connectivity.length; pi++) {
          if (connectivity[pi][ci] > 0) parentIndices.push(pi);
        }
        if (parentIndices.length === 0) continue;

        const headOutputs: number[][] = [];
        for (let h = 0; h < numHeads; h++) {
          const W_c = lp.W_child[h];
          const W_p = lp.W_parent[h];
          const a_down = lp.a_downward[h];

          const childProj = matVec(W_c, childEmb);

          const parentProjs: number[][] = [];
          const attentionLogits: number[] = [];
          for (const pi of parentIndices) {
            const parentProj = matVec(W_p, parentEmbs[pi]);
            parentProjs.push(parentProj);

            let logit = 0;
            for (let d = 0; d < headDim; d++) logit += a_down[d] * parentProj[d];
            for (let d = 0; d < headDim; d++) logit += a_down[headDim + d] * childProj[d];
            attentionLogits.push(leakyRelu(logit));
          }

          let maxLogit = -Infinity;
          for (const l of attentionLogits) if (l > maxLogit) maxLogit = l;
          const expLogits = attentionLogits.map((l) => Math.exp(l - maxLogit));
          const sumExp = expLogits.reduce((a, b) => a + b, 0);

          const aggr = new Array<number>(headDim).fill(0);
          for (let i = 0; i < parentIndices.length; i++) {
            const w = expLogits[i] / sumExp;
            for (let d = 0; d < headDim; d++) aggr[d] += w * parentProjs[i][d];
          }
          headOutputs.push(aggr);
        }

        const concat = new Array<number>(embeddingDim).fill(0);
        for (let h = 0; h < numHeads; h++) {
          for (let d = 0; d < headDim; d++) {
            concat[h * headDim + d] = headOutputs[h][d];
          }
        }

        for (let d = 0; d < embeddingDim; d++) {
          childEmbs[ci][d] = childEmbs[ci][d] + concat[d];
        }
      }
    }

    // Build result map (L0 tools)
    const result = new Map<string, number[]>();
    for (let i = 0; i < l0Ids.length; i++) {
      result.set(l0Ids[i], H[i]);
    }

    // Store enriched cap embeddings (all higher levels)
    const capResult = new Map<string, number[]>();
    for (const [level, embs] of E) {
      const nodeIds = nodeIdsByLevel.get(level);
      if (!nodeIds) continue;
      for (let i = 0; i < nodeIds.length; i++) {
        capResult.set(nodeIds[i], embs[i]);
      }
    }
    this.enrichedCapEmbs = capResult;

    this.enrichedEmbs = result;
    this.kCache = null; // Invalidate K cache — embeddings changed
    return { l0Embeddings: result, enrichmentMs: Date.now() - t0 };
  }

  // ---------- 4. K-head scoring ----------

  // ---------- K-projection cache ----------

  /**
   * Build or return cached K projections for all L0 nodes.
   * K_h[h][l0Idx] = W_k[h] @ nodeEmb  (shape: [numHeads][numL0][headDim])
   *
   * Pre-computing this avoids N × numHeads matVec calls per scoreNodes() call.
   * Instead, scoreNodes() only needs numHeads dot products per node (cheap).
   */
  private ensureKCache(): { l0Ids: string[]; K_h: number[][][] } {
    if (this.kCache) return this.kCache;
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");

    const embs = this.enrichedEmbs ?? this.buildRawEmbsMap();
    const { headParams, config } = this.params;
    const { numHeads } = config;

    // Ordered L0 node list for index-based lookup
    const l0Ids: string[] = [];
    const embMatrix: number[][] = [];
    for (const [nodeId, emb] of embs) {
      l0Ids.push(nodeId);
      embMatrix.push(emb);
    }

    const numNodes = l0Ids.length;
    // K_h[h] = embMatrix @ W_k[h]^T → [numNodes, headDim]
    const K_h: number[][][] = [];
    for (let h = 0; h < numHeads; h++) {
      const W_k = headParams[h].W_k; // [headDim, embDim]
      const headDim = W_k.length;
      const embDim = W_k[0].length;
      const K_head: number[][] = new Array(numNodes);

      for (let t = 0; t < numNodes; t++) {
        const nodeEmb = embMatrix[t];
        const k = new Array<number>(headDim);
        for (let d = 0; d < headDim; d++) {
          let sum = 0;
          const wRow = W_k[d];
          for (let j = 0; j < embDim; j++) sum += wRow[j] * nodeEmb[j];
          k[d] = sum;
        }
        K_head[t] = k;
      }
      K_h.push(K_head);
    }

    this.kCache = { l0Ids, K_h };
    return this.kCache;
  }

  /**
   * Score all L0 nodes for a given intent embedding using K-head multi-head attention.
   * Returns top-K nodes sorted by score descending.
   *
   * Uses pre-computed K projections (cached) — first call builds the cache (~1-2s),
   * subsequent calls are ~100x faster (just Q projection + dot products).
   */
  scoreNodes(intentEmbedding: number[], topK = 10): ScoringResult {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built.");

    const t0 = Date.now();
    const { headParams, W_intent, config } = this.params;
    const { numHeads, headDim } = config;
    const scale = 1.0 / Math.sqrt(headDim);

    // Project intent → Q per head (16 matVec, fast)
    const intentProjected = matVec(W_intent, intentEmbedding);
    const Q_h: number[][] = [];
    for (let h = 0; h < numHeads; h++) {
      Q_h.push(matVec(headParams[h].W_q, intentProjected));
    }

    // Get pre-computed K projections
    const { l0Ids: nodeIds, K_h } = this.ensureKCache();
    const numNodes = nodeIds.length;

    // Score: for each node, sum dot(Q_h, K_cached_h) across heads
    const scores: NodeScore[] = new Array(numNodes);
    for (let t = 0; t < numNodes; t++) {
      let totalScore = 0;
      for (let h = 0; h < numHeads; h++) {
        totalScore += dot(Q_h[h], K_h[h][t]) * scale;
      }
      scores[t] = { nodeId: nodeIds[t], score: totalScore / numHeads };
    }

    // Sort descending and take top-K
    scores.sort((a, b) => b.score - a.score);
    return { topK: scores.slice(0, topK), scoringMs: Date.now() - t0 };
  }

  /** @deprecated Use scoreNodes instead */
  scoreTools(intentEmbedding: number[], topK = 10): ScoringResult {
    return this.scoreNodes(intentEmbedding, topK);
  }

  /**
   * Score a specific set of node IDs (for sparse scoring, e.g., candidates only).
   * Uses K cache for consistency and speed when available.
   */
  scoreNodeIds(intentEmbedding: number[], nodeIdsToScore: string[]): NodeScore[] {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");

    const { headParams, W_intent, config } = this.params;
    const { numHeads, headDim } = config;
    const scale = 1.0 / Math.sqrt(headDim);

    const intentProjected = matVec(W_intent, intentEmbedding);
    const Q_h: number[][] = [];
    for (let h = 0; h < numHeads; h++) {
      Q_h.push(matVec(headParams[h].W_q, intentProjected));
    }

    // Use K cache if available, fall back to per-node matVec
    const cache = this.kCache;
    if (cache) {
      const idxMap = new Map<string, number>();
      for (let i = 0; i < cache.l0Ids.length; i++) idxMap.set(cache.l0Ids[i], i);

      const results: NodeScore[] = [];
      for (const nodeId of nodeIdsToScore) {
        const idx = idxMap.get(nodeId);
        if (idx === undefined) continue;
        let totalScore = 0;
        for (let h = 0; h < numHeads; h++) {
          totalScore += dot(Q_h[h], cache.K_h[h][idx]) * scale;
        }
        results.push({ nodeId, score: totalScore / numHeads });
      }
      return results.sort((a, b) => b.score - a.score);
    }

    // Fallback: compute K on the fly (no cache available)
    const embs = this.enrichedEmbs ?? this.buildRawEmbsMap();
    const results: NodeScore[] = [];
    for (const nodeId of nodeIdsToScore) {
      const nodeEmb = embs.get(nodeId);
      if (!nodeEmb) continue;
      let totalScore = 0;
      for (let h = 0; h < numHeads; h++) {
        const K_h = matVec(headParams[h].W_k, nodeEmb);
        totalScore += dot(Q_h[h], K_h) * scale;
      }
      results.push({ nodeId, score: totalScore / numHeads });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /** @deprecated Use scoreNodeIds instead */
  scoreToolIds(intentEmbedding: number[], toolIds: string[]): NodeScore[] {
    return this.scoreNodeIds(intentEmbedding, toolIds);
  }

  // ---------- Getters ----------

  getEnrichedEmbeddings(): Map<string, number[]> {
    if (!this.enrichedEmbs) throw new Error("[SHGATAdapter] No enriched embeddings. Call enrichEmbeddings() first.");
    return this.enrichedEmbs;
  }

  /**
   * Get enriched capability embeddings (all higher levels) after enrichEmbeddings().
   * Keys are cap IDs as passed to buildGraph() (e.g. "namespace:action").
   */
  getEnrichedCapEmbeddings(): Map<string, number[]> {
    if (!this.enrichedCapEmbs) throw new Error("[SHGATAdapter] No enriched cap embeddings. Call enrichEmbeddings() first.");
    return this.enrichedCapEmbs;
  }

  getGraph(): GraphStructure {
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built. Call buildGraph() first.");
    return this.graph;
  }

  getL0Ids(): string[] {
    return this.graph?.l0Ids ?? [];
  }

  /** @deprecated Use getL0Ids instead */
  getToolIds(): string[] {
    return this.getL0Ids();
  }

  // ---------- Private ----------

  private buildRawEmbsMap(): Map<string, number[]> {
    const map = new Map<string, number[]>();
    if (this.graph) {
      for (const id of this.graph.l0Ids) {
        const emb = this.nodeEmbeddings.get(id);
        if (emb) map.set(id, emb);
      }
    }
    return map;
  }
}
