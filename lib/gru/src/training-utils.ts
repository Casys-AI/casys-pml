/**
 * Training Utilities — DAG-aware example generation & K-fold CV
 *
 * P0-1: DAG Ancestor Fix
 *   Uses layerIndex from task_results to build causal context.
 *   Instead of contextToolIds = toolSequence.slice(0, i) (linear),
 *   contextToolIds = tools from layers 0..L-1 of current node.
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

/** A task result with optional layerIndex for DAG-aware context. */
export interface TaskResultWithLayer {
  tool?: string;
  layer_index?: number;
  layerIndex?: number;
  [key: string]: unknown;
}

/** Result of building examples from a single trace. */
export interface TraceExamples {
  examples: (TransitionExample & { _traceId: string })[];
  isSingleTool: boolean;
  isMultiTool: boolean;
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
// P0-1: DAG-aware context extraction
// ---------------------------------------------------------------------------

/**
 * Build TransitionExamples from a trace using DAG-aware context.
 *
 * Instead of treating task_results as a linear sequence, uses layerIndex
 * to determine causal ancestors: for a task at layer L, only tasks from
 * layers 0..L-1 are included in the context.
 *
 * If no layerIndex is available (older traces), falls back to linear order
 * but logs a warning.
 *
 * @param traceId - Unique trace identifier
 * @param intentEmbedding - Intent embedding for this trace
 * @param taskResults - Task results with optional layerIndex
 * @param validToolIds - Set of tool IDs in the vocabulary
 * @param singleToolSeen - Dedup set for single-tool traces (mutated)
 * @param embedHashFn - Function to hash embeddings for dedup
 * @returns Examples and classification
 */
export function buildDAGAwareExamples(
  traceId: string,
  intentEmbedding: number[],
  taskResults: TaskResultWithLayer[],
  validToolIds: Set<string>,
  singleToolSeen: Set<string>,
  embedHashFn: (emb: number[]) => string,
): TraceExamples {
  const result: TraceExamples = {
    examples: [],
    isSingleTool: false,
    isMultiTool: false,
  };

  // Filter to valid tools and collect layer info
  const validTasks: Array<{ tool: string; layerIndex: number }> = [];
  for (const task of taskResults) {
    const tool = task.tool;
    if (!tool || !validToolIds.has(tool)) continue;
    // Support both camelCase and snake_case
    const layer = task.layerIndex ?? task.layer_index ?? -1;
    validTasks.push({ tool, layerIndex: layer });
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

  // Multi-tool trace: use DAG-aware context
  const hasLayerInfo = validTasks.some((t) => t.layerIndex >= 0);

  if (hasLayerInfo) {
    // DAG-aware: group tools by layer, build context from ancestor layers
    for (let i = 0; i < validTasks.length; i++) {
      const current = validTasks[i];
      const currentLayer = current.layerIndex;

      // Context = all tools from layers strictly before this one
      // (causal ancestors, not parallel branches)
      let contextToolIds: string[];

      if (currentLayer >= 0) {
        contextToolIds = validTasks
          .filter((t, idx) => idx < i && t.layerIndex >= 0 && t.layerIndex < currentLayer)
          .map((t) => t.tool);
      } else {
        // This specific task has no layerIndex — fall back to linear for it
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
  } else {
    // Fallback: no layerIndex at all — use linear order (legacy traces)
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
  }

  result.isMultiTool = true;
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
