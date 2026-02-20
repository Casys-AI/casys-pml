/**
 * Training Utilities — DAG-aware example generation & K-fold CV
 *
 * P1: DAG Causal Ancestor Fix
 *   Uses static_structure edges (sequence + provides) from workflow_pattern
 *   to compute TRUE causal ancestors for each task. Falls back to layerIndex
 *   if no edges available, then to linear order for legacy traces.
 *
 *   Priority: edges > layerIndex > linear (each is strictly better)
 *
 * P0-2: K-fold Cross-Validation
 *   Splits traces into K folds (default 5) for robust evaluation.
 *   Reports mean +/- std for each metric.
 *
 * @module gru/training-utils
 */

import type { TransitionExample } from "./transition/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A task result with optional layerIndex and taskId for DAG-aware context. */
export interface TaskResultWithLayer {
  tool?: string;
  taskId?: string;
  task_id?: string;
  layer_index?: number;
  layerIndex?: number;
  [key: string]: unknown;
}

/** A static structure edge from workflow_pattern.dag_structure.static_structure */
export interface StaticEdge {
  from: string;
  to: string;
  type: string; // "sequence" | "provides" | "conditional" | "contains" | "loop_body"
}

/** Result of building examples from a single trace. */
export interface TraceExamples {
  examples: (TransitionExample & { _traceId: string })[];
  isSingleTool: boolean;
  isMultiTool: boolean;
  contextMode: "edges" | "layerIndex" | "linear";
}

/** K-fold evaluation result for a single fold. */
export interface FoldResult {
  fold: number;
  trainTraceIds: Set<string>;
  testTraceIds: Set<string>;
}

/** Aggregated K-fold metrics with mean and std. */
export interface KFoldMetrics {
  mean: number;
  std: number;
  perFold: number[];
}

// ---------------------------------------------------------------------------
// Causal edge types used for ancestor computation
// ---------------------------------------------------------------------------

/** Edge types that represent causal dependency (A must complete before B) */
const CAUSAL_EDGE_TYPES = new Set(["sequence", "provides"]);

/**
 * Build a reverse adjacency map from static structure edges.
 * For each nodeId, returns the set of nodeIds that are direct causal predecessors.
 * Only uses "sequence" and "provides" edges (not "contains", "loop_body").
 */
function buildReverseAdjacency(edges: StaticEdge[]): Map<string, string[]> {
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!CAUSAL_EDGE_TYPES.has(edge.type)) continue;
    let predecessors = reverseAdj.get(edge.to);
    if (!predecessors) {
      predecessors = [];
      reverseAdj.set(edge.to, predecessors);
    }
    if (predecessors.indexOf(edge.from) === -1) {
      predecessors.push(edge.from);
    }
  }
  return reverseAdj;
}

/**
 * Compute all causal ancestors of a node by BFS on reverse adjacency.
 * Returns the set of all node IDs that transitively precede the given node.
 */
function getCausalAncestors(
  nodeId: string,
  reverseAdj: Map<string, string[]>,
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const preds = reverseAdj.get(current);
    if (!preds) continue;
    for (let pi = 0; pi < preds.length; pi++) {
      const pred = preds[pi];
      if (!ancestors.has(pred)) {
        ancestors.add(pred);
        queue.push(pred);
      }
    }
  }
  return ancestors;
}

// ---------------------------------------------------------------------------
// P1: DAG-aware context extraction with edges
// ---------------------------------------------------------------------------

/**
 * Build TransitionExamples from a trace using true causal ancestors.
 *
 * Uses 3-tier fallback (each strictly better than the next):
 *   1. Static structure edges (sequence + provides) → true causal graph
 *   2. layerIndex → approximate (excludes same-layer, includes cross-branch)
 *   3. Linear order → naive (includes everything before)
 *
 * @param traceId - Unique trace identifier
 * @param intentEmbedding - Intent embedding for this trace
 * @param taskResults - Task results with optional layerIndex and taskId
 * @param validToolIds - Set of tool IDs in the vocabulary
 * @param singleToolSeen - Dedup set for single-tool traces (mutated)
 * @param embedHashFn - Function to hash embeddings for dedup
 * @param staticEdges - Optional edges from workflow_pattern.dag_structure.static_structure
 * @returns Examples and classification
 */
export function buildDAGAwareExamples(
  traceId: string,
  intentEmbedding: number[],
  taskResults: TaskResultWithLayer[],
  validToolIds: Set<string>,
  singleToolSeen: Set<string>,
  embedHashFn: (emb: number[]) => string,
  staticEdges?: StaticEdge[],
): TraceExamples {
  const result: TraceExamples = {
    examples: [],
    isSingleTool: false,
    isMultiTool: false,
    contextMode: "linear",
  };

  // Filter to valid tools and collect taskId + layer info
  const validTasks: Array<{ tool: string; taskId: string; layerIndex: number }> = [];
  for (const task of taskResults) {
    let tool = task.tool;
    if (!tool) continue;
    // Normalize FQDN → short: "pml.mcp.std.psql_query.db48" → "std:psql_query"
    if (!validToolIds.has(tool)) {
      const parts = tool.split(".");
      if (parts.length >= 4 && (parts[0] === "pml" || parts[0] === "local")) {
        tool = `${parts[2]}:${parts[3]}`;
      }
    }
    if (!validToolIds.has(tool)) continue;
    const taskId = task.taskId ?? task.task_id ?? "";
    const layer = task.layerIndex ?? task.layer_index ?? -1;
    validTasks.push({ tool, taskId, layerIndex: layer });
  }

  if (validTasks.length === 0) return result;

  // Single-tool trace: dedup
  if (validTasks.length === 1) {
    const key = embedHashFn(intentEmbedding) + ":" + validTasks[0].tool;
    if (singleToolSeen.has(key)) return result;
    singleToolSeen.add(key);

    result.examples.push({
      intentEmbedding,
      contextToolIds: [],
      targetToolId: validTasks[0].tool,
      isTerminal: 1,
      isSingleTool: true,
      _traceId: traceId,
    });
    result.isSingleTool = true;
    return result;
  }

  // --- Tier 1: Use static structure edges for true causal ancestors ---
  const hasEdges = staticEdges && staticEdges.length > 0;
  const hasTaskIds = validTasks.every((t) => t.taskId.length > 0);

  if (hasEdges && hasTaskIds) {
    const reverseAdj = buildReverseAdjacency(staticEdges);
    // Map taskId → execution order index for sorting ancestors
    const taskIdToExecIdx = new Map<string, number>();
    for (let ti = 0; ti < validTasks.length; ti++) {
      taskIdToExecIdx.set(validTasks[ti].taskId, ti);
    }

    for (let i = 0; i < validTasks.length; i++) {
      const current = validTasks[i];
      const ancestors = getCausalAncestors(current.taskId, reverseAdj);

      // Context = ancestor tools, sorted by EXECUTION ORDER (not BFS order)
      // BFS order would reverse the sequence, breaking GRU temporal patterns
      const contextToolIds: string[] = [];
      for (let ti = 0; ti < validTasks.length; ti++) {
        if (ti >= i) break; // only tasks before current in execution order
        if (ancestors.has(validTasks[ti].taskId)) {
          contextToolIds.push(validTasks[ti].tool);
        }
      }

      result.examples.push({
        intentEmbedding,
        contextToolIds,
        targetToolId: current.tool,
        isTerminal: i === validTasks.length - 1 ? 1 : 0,
        isSingleTool: false,
        _traceId: traceId,
      });
    }
    result.isMultiTool = true;
    result.contextMode = "edges";
    return result;
  }

  // --- Tier 2: Use layerIndex (approximate) ---
  const hasLayerInfo = validTasks.some((t) => t.layerIndex >= 0);

  if (hasLayerInfo) {
    for (let i = 0; i < validTasks.length; i++) {
      const current = validTasks[i];
      const currentLayer = current.layerIndex;

      let contextToolIds: string[];
      if (currentLayer >= 0) {
        contextToolIds = validTasks
          .filter((t, idx) => idx < i && t.layerIndex >= 0 && t.layerIndex < currentLayer)
          .map((t) => t.tool);
      } else {
        contextToolIds = validTasks.slice(0, i).map((t) => t.tool);
      }

      result.examples.push({
        intentEmbedding,
        contextToolIds,
        targetToolId: current.tool,
        isTerminal: i === validTasks.length - 1 ? 1 : 0,
        isSingleTool: false,
        _traceId: traceId,
      });
    }
    result.isMultiTool = true;
    result.contextMode = "layerIndex";
    return result;
  }

  // --- Tier 3: Linear fallback (legacy traces without layerIndex) ---
  for (let i = 0; i < validTasks.length; i++) {
    result.examples.push({
      intentEmbedding,
      contextToolIds: validTasks.slice(0, i).map((t) => t.tool),
      targetToolId: validTasks[i].tool,
      isTerminal: i === validTasks.length - 1 ? 1 : 0,
      isSingleTool: false,
      _traceId: traceId,
    });
  }
  result.isMultiTool = true;
  result.contextMode = "linear";
  return result;
}

// ---------------------------------------------------------------------------
// P0-2: K-fold Cross-Validation
// ---------------------------------------------------------------------------

/**
 * Generate K-fold splits from trace IDs.
 *
 * Splits are done BY TRACE (not by example) to avoid contamination.
 * Uses a seeded PRNG for reproducibility.
 *
 * @param traceIds - All unique trace IDs
 * @param k - Number of folds (default 5)
 * @param shuffleFn - Seeded shuffle function
 * @returns Array of K FoldResult objects
 */
export function generateKFolds(
  traceIds: string[],
  k: number,
  shuffleFn: <T>(arr: T[]) => T[],
): FoldResult[] {
  const shuffled = shuffleFn([...traceIds]);
  const foldSize = Math.ceil(shuffled.length / k);
  const folds: FoldResult[] = [];

  for (let fold = 0; fold < k; fold++) {
    const testStart = fold * foldSize;
    const testEnd = Math.min(testStart + foldSize, shuffled.length);
    const testIds = new Set(shuffled.slice(testStart, testEnd));
    const trainIds = new Set(shuffled.filter((id) => !testIds.has(id)));

    folds.push({
      fold,
      trainTraceIds: trainIds,
      testTraceIds: testIds,
    });
  }

  return folds;
}

/**
 * Compute mean and standard deviation of an array of numbers.
 */
export function computeStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Format K-fold metric results as a string.
 */
export function formatKFoldMetric(
  name: string,
  perFold: number[],
  unit = "%",
): string {
  const { mean, std } = computeStats(perFold);
  const foldStr = perFold.map((v) => v.toFixed(1)).join(", ");
  return `${name}: ${mean.toFixed(1)}${unit} +/- ${std.toFixed(1)}${unit} [${foldStr}]`;
}
