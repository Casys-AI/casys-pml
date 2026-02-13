/**
 * SHGAT-for-GRU Adapter
 *
 * Replaces the ~800 lines of SHGAT glue code in benchmark-e2e.ts with a
 * clean, reusable module. No TF.js dependency — uses pure JS + optional BLAS.
 *
 * Responsibilities:
 * 1. Load OB-trained SHGAT params (JSON from train-ob.ts)
 * 2. Build graph connectivity from node list
 * 3. Enrich tool embeddings via message passing (V↔E forward)
 * 4. K-head scoring for tool retrieval (intent → top-K tools)
 *
 * Usage:
 *   const adapter = new SHGATAdapter();
 *   adapter.loadParams("path/to/shgat-params-ob-xxx.json");
 *   adapter.buildGraph(nodes);
 *   const enriched = adapter.enrichEmbeddings(rawToolEmbeddings);
 *   const topK = adapter.scoreTools(intentEmbedding, 5);
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
  ToolScore,
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
    return this.params.config;
  }

  /** Load params from an already-parsed object (OB format). */
  setParams(params: OBTrainedParams): void {
    this.params = params;
    this.enrichedEmbs = null;
  }

  getConfig(): SHGATExportConfig {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded. Call loadParams() first.");
    return this.params.config;
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

    // Identify leaves (tools) = nodes with no children
    const toolIds: string[] = [];
    const capIds: string[] = [];
    for (const n of nodes) {
      if (n.children.length === 0) {
        toolIds.push(n.id);
      } else {
        capIds.push(n.id);
      }
    }

    const toolIdxMap = new Map<string, number>();
    for (let i = 0; i < toolIds.length; i++) toolIdxMap.set(toolIds[i], i);

    // Group capabilities by level
    const capIdsByLevel = new Map<number, string[]>();
    for (const id of capIds) {
      const node = idToNode.get(id)!;
      const level = node.level;
      if (!capIdsByLevel.has(level)) capIdsByLevel.set(level, []);
      capIdsByLevel.get(level)!.push(id);
    }

    // Build connectivity matrices
    // Level 0 caps → tools (toolToCapMatrix)
    const level0Caps = capIdsByLevel.get(0) ?? [];
    const level0CapIdx = new Map<string, number>();
    for (let i = 0; i < level0Caps.length; i++) level0CapIdx.set(level0Caps[i], i);

    const toolToCapMatrix: number[][] = Array.from(
      { length: level0Caps.length },
      () => new Array(toolIds.length).fill(0),
    );

    for (const capId of level0Caps) {
      const cap = idToNode.get(capId)!;
      const capIdx = level0CapIdx.get(capId)!;
      for (const childId of cap.children) {
        const toolIdx = toolIdxMap.get(childId);
        if (toolIdx !== undefined) {
          toolToCapMatrix[capIdx][toolIdx] = 1;
        }
      }
    }

    // Higher-level cap→cap matrices
    const capToCapMatrices = new Map<number, number[][]>();
    const levels = [...capIdsByLevel.keys()].sort((a, b) => a - b);
    for (let li = 1; li < levels.length; li++) {
      const parentLevel = levels[li];
      const childLevel = levels[li - 1];
      const parentCaps = capIdsByLevel.get(parentLevel)!;
      const childCaps = capIdsByLevel.get(childLevel)!;
      const childCapIdx = new Map<string, number>();
      for (let i = 0; i < childCaps.length; i++) childCapIdx.set(childCaps[i], i);

      const matrix: number[][] = Array.from(
        { length: parentCaps.length },
        () => new Array(childCaps.length).fill(0),
      );
      for (let pi = 0; pi < parentCaps.length; pi++) {
        const parent = idToNode.get(parentCaps[pi])!;
        for (const childId of parent.children) {
          const ci = childCapIdx.get(childId);
          if (ci !== undefined) matrix[pi][ci] = 1;
        }
      }
      capToCapMatrices.set(parentLevel, matrix);
    }

    const maxLevel = levels.length > 0 ? levels[levels.length - 1] : -1;

    this.graph = { toolIds, toolIdxMap, capIdsByLevel, toolToCapMatrix, capToCapMatrices, maxLevel };
    this.enrichedEmbs = null;
    return this.graph;
  }

  // ---------- 3. Enrich embeddings (MP forward) ----------

  /**
   * Enrich tool embeddings via SHGAT message passing.
   *
   * Implements the upward (V→E) and downward (E→V) phases using the
   * trained W_child, W_parent, a_upward, a_downward parameters.
   *
   * Returns enriched tool embeddings (post-MP).
   */
  enrichEmbeddings(): EnrichedEmbeddings {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built.");

    const t0 = Date.now();
    const { headParams, levelParams: levelParamsObj, config } = this.params;
    const { toolIds, capIdsByLevel, toolToCapMatrix, capToCapMatrices } = this.graph;
    const { numHeads, headDim, embeddingDim } = config;

    // Collect initial embeddings
    const H: number[][] = toolIds.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]);

    // Capability embeddings by level
    const E = new Map<number, number[][]>();
    for (const [level, ids] of capIdsByLevel) {
      E.set(level, ids.map((id) => [...(this.nodeEmbeddings.get(id) ?? [])]));
    }

    // Parse levelParams (keys are strings in JSON)
    const lpMap = new Map<number, LevelParams>();
    for (const [key, lp] of Object.entries(levelParamsObj)) {
      lpMap.set(parseInt(key, 10), lp);
    }

    // --- Upward phase: tools → level-0 caps → level-1 caps → ... ---
    const levels = [...capIdsByLevel.keys()].sort((a, b) => a - b);

    for (const level of levels) {
      const lp = lpMap.get(level);
      if (!lp) continue;

      const parentEmbs = E.get(level)!;
      const childEmbs = level === levels[0] ? H : (E.get(levels[levels.indexOf(level) - 1]) ?? []);
      const connectivity = level === levels[0]
        ? toolToCapMatrix
        : (capToCapMatrices.get(level) ?? []);

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
        ? toolToCapMatrix
        : (capToCapMatrices.get(level) ?? []);

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

    // Build result map
    const result = new Map<string, number[]>();
    for (let i = 0; i < toolIds.length; i++) {
      result.set(toolIds[i], H[i]);
    }

    this.enrichedEmbs = result;
    return { toolEmbeddings: result, enrichmentMs: Date.now() - t0 };
  }

  // ---------- 4. K-head scoring ----------

  /**
   * Score all tools for a given intent embedding using K-head multi-head attention.
   * Returns top-K tools sorted by score descending.
   */
  scoreTools(intentEmbedding: number[], topK = 10): ScoringResult {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built.");

    const embs = this.enrichedEmbs ?? this.buildRawEmbsMap();
    const t0 = Date.now();

    const { headParams, W_intent, config } = this.params;
    const { numHeads, headDim } = config;
    const scale = 1.0 / Math.sqrt(headDim);

    // Project intent
    const intentProjected = matVec(W_intent, intentEmbedding);

    // Q projections per head (computed once)
    const Q_h: number[][] = [];
    for (let h = 0; h < numHeads; h++) {
      Q_h.push(matVec(headParams[h].W_q, intentProjected));
    }

    // Score each tool
    const scores: ToolScore[] = [];
    for (const [toolId, toolEmb] of embs) {
      let totalScore = 0;
      for (let h = 0; h < numHeads; h++) {
        const K_h = matVec(headParams[h].W_k, toolEmb);
        totalScore += dot(Q_h[h], K_h) * scale;
      }
      scores.push({ toolId, score: totalScore / numHeads });
    }

    // Sort descending and take top-K
    scores.sort((a, b) => b.score - a.score);
    const topKResult = scores.slice(0, topK);

    return { topK: topKResult, scoringMs: Date.now() - t0 };
  }

  /**
   * Score a specific set of tool IDs (for sparse scoring, e.g., candidates only).
   */
  scoreToolIds(intentEmbedding: number[], toolIds: string[]): ToolScore[] {
    if (!this.params) throw new Error("[SHGATAdapter] No params loaded.");

    const embs = this.enrichedEmbs ?? this.buildRawEmbsMap();
    const { headParams, W_intent, config } = this.params;
    const { numHeads, headDim } = config;
    const scale = 1.0 / Math.sqrt(headDim);

    const intentProjected = matVec(W_intent, intentEmbedding);
    const Q_h: number[][] = [];
    for (let h = 0; h < numHeads; h++) {
      Q_h.push(matVec(headParams[h].W_q, intentProjected));
    }

    const results: ToolScore[] = [];
    for (const toolId of toolIds) {
      const toolEmb = embs.get(toolId);
      if (!toolEmb) continue;
      let totalScore = 0;
      for (let h = 0; h < numHeads; h++) {
        const K_h = matVec(headParams[h].W_k, toolEmb);
        totalScore += dot(Q_h[h], K_h) * scale;
      }
      results.push({ toolId, score: totalScore / numHeads });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // ---------- Getters ----------

  getEnrichedEmbeddings(): Map<string, number[]> {
    if (!this.enrichedEmbs) throw new Error("[SHGATAdapter] No enriched embeddings. Call enrichEmbeddings() first.");
    return this.enrichedEmbs;
  }

  getGraph(): GraphStructure {
    if (!this.graph) throw new Error("[SHGATAdapter] No graph built. Call buildGraph() first.");
    return this.graph;
  }

  getToolIds(): string[] {
    return this.graph?.toolIds ?? [];
  }

  // ---------- Private ----------

  private buildRawEmbsMap(): Map<string, number[]> {
    const map = new Map<string, number[]>();
    if (this.graph) {
      for (const id of this.graph.toolIds) {
        const emb = this.nodeEmbeddings.get(id);
        if (emb) map.set(id, emb);
      }
    }
    return map;
  }
}
