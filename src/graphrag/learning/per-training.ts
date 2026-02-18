/**
 * PER Training - SHGAT Training with Prioritized Experience Replay (Story 11.6)
 *
 * Implements path-level SHGAT training using PER-weighted sampling from execution_trace.
 * Part of the TD + PER + SHGAT architecture (style DQN/Rainbow).
 *
 * Flow:
 * 1. Sample traces weighted by priority (PER - Schaul et al. 2015)
 * 2. Flatten hierarchical paths (meta → cap → tools)
 * 3. Generate multi-example per trace (one per node in path)
 * 4. Train SHGAT batch
 * 5. Update trace priorities (TD error recalculated)
 *
 * @module graphrag/learning/per-training
 */

import type { SHGAT, TrainingExample } from "../algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../algorithms/shgat/types.ts";
import type { ExecutionTraceStore } from "../../capabilities/execution-trace-store.ts";
import type { ExecutionTrace } from "../../capabilities/types.ts";
import {
  batchUpdatePrioritiesFromTDErrors,
  type EmbeddingProvider,
} from "../../capabilities/per-priority.ts";
import { extractPathLevelFeatures, type PathLevelFeatures } from "./path-level-features.ts";
import { spawnSHGATTraining } from "../algorithms/shgat/spawn-training.ts";
import { getLogger } from "../../telemetry/logger.ts";
import type { DbClient } from "../../db/types.ts";

const log = getLogger("default");

// ============================================================================
// Constants
// ============================================================================

/** Default minimum traces required for path-level training */
export const DEFAULT_MIN_TRACES = 20;

/** Default maximum traces to process per batch */
export const DEFAULT_MAX_TRACES = 100;

/** Default batch size for SHGAT training */
export const DEFAULT_BATCH_SIZE = 32;

/** Default minimum priority to consider (skip near-zero) */
export const DEFAULT_MIN_PRIORITY = 0.1;

/** Default PER alpha exponent */
export const DEFAULT_PER_ALPHA = 0.6;

/** UUID pattern for distinguishing capability IDs from tool IDs */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Check if a string is a UUID (capability ID) vs tool ID (has colon like "code:filter")
 */
function isUUID(s: string): boolean {
  return UUID_PATTERN.test(s);
}

/** UUID prefix pattern (matches v4 and v7) for path cleanup */
const UUID_PREFIX_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * Filter UUIDs from a path for pathKey lookup.
 * Must match the logic in path-level-features.ts cleanExecutedPath().
 */
function cleanPathForLookup(path: string[]): string[] {
  return path.filter((t) => !UUID_PREFIX_PATTERN.test(t));
}

/**
 * Select negatives from the middle tier for semi-hard negative mining
 *
 * Divides candidates into 3 tiers (hard/medium/easy) and selects from middle.
 * Falls back gracefully when insufficient candidates available.
 */
function selectMiddleTierNegatives(sortedIds: string[], count: number): string[] {
  const total = sortedIds.length;

  // Not enough negatives: use all available
  if (total < count) {
    return sortedIds;
  }

  // Not enough for 3 tiers: use middle slice
  if (total < count * 3) {
    const start = Math.floor((total - count) / 2);
    return sortedIds.slice(start, start + count);
  }

  // Enough for 3 tiers: use middle third
  const tierSize = Math.floor(total / 3);
  return sortedIds.slice(tierSize, tierSize + count);
}

/**
 * Parse embedding from database row (handles array, string, or pgvector format)
 *
 * @returns Parsed embedding array, or null if parsing fails
 */
function parseEmbeddingFromRow(embedding: number[] | string): number[] | null {
  if (Array.isArray(embedding)) {
    return embedding;
  }

  if (typeof embedding === "string") {
    try {
      return JSON.parse(embedding);
    } catch {
      return null;
    }
  }

  return null;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Options for PER-based SHGAT training
 */
export interface PERTrainingOptions {
  /** Minimum traces required to trigger path-level training (default: 20) */
  minTraces?: number;
  /** Maximum traces to process (default: 100) */
  maxTraces?: number;
  /** Batch size for SHGAT.trainBatchV1KHeadBatched() (default: 32) */
  batchSize?: number;
  /** Minimum priority threshold (default: 0.1) */
  minPriority?: number;
  /** PER alpha exponent (default: 0.6) */
  alpha?: number;
  /** Capability ID to filter traces (optional, all if not provided) */
  capabilityId?: string;
}

/**
 * Result of PER-based training
 */
export interface PERTrainingResult {
  /** Average loss across batches */
  loss: number;
  /** Accuracy (correct predictions / total) */
  accuracy: number;
  /** Number of traces processed */
  tracesProcessed: number;
  /** Number of high priority traces (> 0.7) */
  highPriorityCount: number;
  /** Number of trace priorities updated after training */
  prioritiesUpdated: number;
  /** Total training examples generated (multi-example per trace) */
  examplesGenerated: number;
  /** Whether fallback to tool-level was triggered */
  fallback?: "tool-level";
  /** Reason for fallback if triggered */
  fallbackReason?: string;
}

// ============================================================================
// Path Flattening (AC13)
// ============================================================================

/**
 * Flatten a hierarchical execution path
 *
 * Recursively expands capabilities in the path to their underlying tools/sub-capabilities.
 * Ensures consistency with SHGAT.collectTransitiveTools() incidence matrix flattening.
 *
 * @param trace - The execution trace to flatten
 * @param traceStore - Store to look up child traces
 * @returns Flattened path with all nested nodes expanded
 *
 * @example
 * ```typescript
 * // Trace: meta_cap → [cap_A, cap_B]
 * //   └── cap_A → [fs:read, json:parse]
 * //   └── cap_B → [slack:send]
 * //
 * // Result: ["meta_cap", "cap_A", "fs:read", "json:parse", "cap_B", "slack:send"]
 * ```
 */
export async function flattenExecutedPath(
  trace: ExecutionTrace,
  traceStore: ExecutionTraceStore,
): Promise<string[]> {
  const executedPath = trace.executedPath ?? [];

  if (executedPath.length === 0) {
    return [];
  }

  // Get child traces for this trace
  const childTraces = await traceStore.getChildTraces(trace.id);

  if (childTraces.length === 0) {
    // No children, return as-is
    return executedPath;
  }

  // Build a map of capability ID → child trace for efficient lookup
  const childTraceMap = new Map<string, ExecutionTrace>();
  for (const child of childTraces) {
    if (child.capabilityId) {
      childTraceMap.set(child.capabilityId, child);
    }
  }

  // Flatten path by expanding each node
  const flatPath: string[] = [];

  for (const nodeId of executedPath) {
    // Add the node itself
    flatPath.push(nodeId);

    // Check if this node has a child trace (nested capability)
    const childTrace = childTraceMap.get(nodeId);
    if (childTrace) {
      // Recursively flatten child
      const childFlat = await flattenExecutedPath(childTrace, traceStore);
      flatPath.push(...childFlat);
    }
  }

  return flatPath;
}

// ============================================================================
// Multi-Example Generation (AC11)
// ============================================================================

/**
 * Convert a trace to multiple training examples (one per node in path)
 *
 * This fixes the "dead contextTools" issue by creating examples where:
 * - contextTools = nodes executed BEFORE this point
 * - candidateId = current node
 *
 * This enables SHGAT to learn sequential dependencies.
 *
 * @param trace - The execution trace
 * @param flatPath - Flattened path (from flattenExecutedPath)
 * @param intentEmbedding - Pre-computed intent embedding
 * @param pathFeatures - Path-level features map
 * @returns Array of training examples
 *
 * @example
 * ```typescript
 * // Path: ["fs:read", "json:parse", "slack:send"]
 * // Generates 3 examples:
 * // 1. contextTools=[], candidateId="fs:read"
 * // 2. contextTools=["fs:read"], candidateId="json:parse"
 * // 3. contextTools=["fs:read", "json:parse"], candidateId="slack:send"
 * ```
 */
export function traceToTrainingExamples(
  trace: ExecutionTrace,
  flatPath: string[],
  intentEmbedding: number[],
  pathFeatures: Map<string, PathLevelFeatures>,
  allEmbeddings?: Map<string, number[]>, // Optional: for semi-hard negative mining (caps + tools)
  capToTools?: Map<string, Set<string>>, // Optional: capability → toolsUsed for exclusion
  toolClusters?: Map<string, Set<string>>, // Optional: tool → community members (Louvain)
  _semiHardMin: number = 0.15, // @deprecated - kept for backward compatibility
  _semiHardMax: number = 0.65, // @deprecated - kept for backward compatibility
): TrainingExample[] {
  if (flatPath.length === 0) {
    return [];
  }

  const examples: TrainingExample[] = [];
  const outcome = trace.success ? 1 : 0;

  // Get path-level features for weighting (optional enhancement)
  const pathKey = cleanPathForLookup(trace.executedPath ?? []).join("->");
  const features = pathFeatures.get(pathKey);

  // Apply outcome weighting based on path features
  // Dominant paths with high success rates have stronger positive signal
  let adjustedOutcome = outcome;
  if (features) {
    // Weight by path success rate: reinforce successful paths more
    const weight = features.pathSuccessRate;
    adjustedOutcome = outcome * (0.5 + 0.5 * weight);
  }

  // Note: semiHardMin/Max params are kept for backward compatibility but no longer used
  // Curriculum learning now uses allNegativesSorted sorted by similarity (hard → easy)
  // train-worker selects slice based on accuracy instead of filtering by thresholds

  // Pre-compute negatives for the whole trace (same intent for all examples)
  // Curriculum learning: store 24 sorted negatives, select 8 based on accuracy
  let semiHardNegativeCapIds: string[] | undefined;
  let allNegativesSortedIds: string[] | undefined;
  if (allEmbeddings && allEmbeddings.size > NUM_NEGATIVES) {
    // Get tools to exclude: anchor capability's toolsUsed (they're related, not negatives)
    const anchorTools = trace.capabilityId ? (capToTools?.get(trace.capabilityId) ?? new Set<string>()) : new Set<string>();

    // Build expanded exclusion set: anchor tools + their community members (cosine clusters)
    const excludedTools = new Set<string>();
    for (const toolId of anchorTools) {
      excludedTools.add(toolId);
      const cluster = toolClusters?.get(toolId);
      if (cluster) {
        for (const member of cluster) {
          excludedTools.add(member);
        }
      }
    }

    // Compute similarity to INTENT for all candidates
    const candidatesWithSim: Array<{ id: string; sim: number }> = [];
    for (const [itemId, emb] of allEmbeddings) {
      // Skip items in the executed path
      if (flatPath.includes(itemId)) continue;
      // Skip tools in the exclusion cluster (anchor's tools + community members)
      if (excludedTools.has(itemId)) continue;
      const sim = cosineSimilarity(intentEmbedding, emb);
      candidatesWithSim.push({ id: itemId, sim });
    }

    // Sort ALL candidates by similarity descending (hard → easy)
    // Store ALL negatives for curriculum learning (train-worker samples from dynamic tiers)
    const allSorted = [...candidatesWithSim].sort((a, b) => b.sim - a.sim);
    allNegativesSortedIds = allSorted.map(c => c.id);

    // Select semi-hard negatives from middle tier for backward compatibility
    semiHardNegativeCapIds = selectMiddleTierNegatives(allNegativesSortedIds, NUM_NEGATIVES);
  }

  // Generate one example per node in the path
  for (let i = 0; i < flatPath.length; i++) {
    const candidateId = flatPath[i];

    examples.push({
      intentEmbedding,
      contextTools: flatPath.slice(0, i), // Nodes before this point
      candidateId,
      outcome: adjustedOutcome,
      negativeCapIds: semiHardNegativeCapIds,
      // Curriculum learning: ALL negatives sorted hard → easy
      // train-worker samples from dynamic tier based on accuracy
      allNegativesSorted: allNegativesSortedIds,
    });
  }

  return examples;
}

// ============================================================================
// Training Trigger Logic
// ============================================================================

/**
 * Execution counter for periodic batch training
 *
 * NOTE: This is global mutable state shared across all sessions/workers in the
 * same process. This means:
 * - In tests: counter may be affected by parallel tests (use resetExecutionCounter)
 * - In prod with multiple workers: each worker has its own counter (not synchronized)
 *
 * This is acceptable because:
 * - Training is idempotent (running more/less often is fine)
 * - The interval is approximate, not a strict requirement
 * - trainingLock prevents concurrent training runs
 */
let executionCounter = 0;

/**
 * Check if batch training should run
 *
 * @param interval - Run every N executions (default: 10)
 * @param force - Force run regardless of counter
 * @returns Whether to run batch training
 */
export function shouldRunBatchTraining(interval = 10, force = false): boolean {
  executionCounter++;
  return force || executionCounter % interval === 0;
}

/**
 * Reset execution counter (for testing)
 */
export function resetExecutionCounter(): void {
  executionCounter = 0;
}

/**
 * Get current execution count (for testing/debugging)
 */
export function getExecutionCount(): number {
  return executionCounter;
}

// ============================================================================
// Subprocess PER Training
// ============================================================================

/**
 * Capability data needed for subprocess training
 */
interface CapabilityForTraining {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
  /** Parent capability IDs (for multi-level hierarchy) */
  parents?: string[];
  /** Child capability IDs (for multi-level hierarchy) */
  children?: string[];
}

/**
 * Options for subprocess PER training
 */
export interface SubprocessPEROptions extends PERTrainingOptions {
  /** Capabilities with embeddings for SHGAT initialization */
  capabilities: CapabilityForTraining[];
  /** Number of epochs (default: 1 for live, 40 for batch) */
  epochs?: number;
  /** Fixed temperature for InfoNCE (default: uses cosine annealing for batch) */
  temperature?: number;
  /** Use PER sampling (default: true for batch, false for live) */
  usePER?: boolean;
  /** Use curriculum learning (default: true for batch, false for live) */
  useCurriculum?: boolean;
  /** Learning rate (default: 0.05 for batch, 0.03 for live) */
  learningRate?: number;
}

/**
 * Train SHGAT on path traces using subprocess (non-blocking)
 *
 * Train SHGAT on path traces using subprocess (non-blocking, production path).
 * Uses TD errors from subprocess to update priorities.
 *
 * @param shgat - SHGAT instance (will import returned params)
 * @param traceStore - ExecutionTraceStore for traces and priority updates
 * @param embeddingProvider - Provider for intent embeddings
 * @param options - Training options including capabilities
 * @returns Training results with metrics
 */
export async function trainSHGATOnPathTracesSubprocess(
  shgat: SHGAT,
  traceStore: ExecutionTraceStore,
  _embeddingProvider: EmbeddingProvider, // Unused since migration 030 (embeddings from JOIN)
  options: SubprocessPEROptions,
  dbClient?: DbClient, // Optional: for loading real tool embeddings
): Promise<PERTrainingResult> {
  const {
    minTraces = DEFAULT_MIN_TRACES,
    maxTraces = DEFAULT_MAX_TRACES,
    batchSize = DEFAULT_BATCH_SIZE,
    minPriority = DEFAULT_MIN_PRIORITY,
    alpha = DEFAULT_PER_ALPHA,
    capabilityId,
    capabilities,
    epochs = 1,
    // Live learning config (Story 11.6)
    temperature,      // undefined = use annealing
    usePER,           // undefined = default true
    useCurriculum,    // undefined = default true
    learningRate,     // undefined = default 0.05
  } = options;

  const startTime = performance.now();

  // Step 1: Check trace availability
  const traceCount = await traceStore.getTraceCount(capabilityId);

  if (traceCount < minTraces) {
    log.debug("[PER-Subprocess] Insufficient traces", {
      available: traceCount,
      required: minTraces,
    });
    return {
      loss: 0,
      accuracy: 0,
      tracesProcessed: 0,
      highPriorityCount: 0,
      prioritiesUpdated: 0,
      examplesGenerated: 0,
      fallback: "tool-level",
      fallbackReason: `insufficient traces (${traceCount} < ${minTraces})`,
    };
  }

  // Step 2: Sample traces using PER
  const traces = await traceStore.sampleByPriority(maxTraces, minPriority, alpha);

  if (traces.length === 0) {
    log.debug("[PER-Subprocess] No traces sampled", { minPriority });
    return {
      loss: 0,
      accuracy: 0,
      tracesProcessed: 0,
      highPriorityCount: 0,
      prioritiesUpdated: 0,
      examplesGenerated: 0,
      fallback: "tool-level",
      fallbackReason: "no traces above minPriority threshold",
    };
  }

  // Step 3: Extract path-level features
  const pathFeatures = extractPathLevelFeatures(traces);

  // Step 4: Get ALL embeddings (capabilities + tools) for negative mining
  const allEmbeddings = new Map<string, number[]>();

  // Add capability embeddings from options and build capToTools map
  const capToTools = new Map<string, Set<string>>();
  for (const cap of capabilities) {
    if (cap.embedding) allEmbeddings.set(cap.id, cap.embedding);
    capToTools.set(cap.id, new Set(cap.toolsUsed ?? []));
  }

  // Note: tools are NOT added to allEmbeddings for negative sampling
  // Only capabilities are used as negatives to avoid mixing entity types

  // Step 5: Generate training examples
  const allExamples: TrainingExample[] = [];
  const exampleToTraceId: string[] = [];

  // Intent embeddings: COALESCE(trace.intent_embedding, workflow_pattern.intent_embedding)
  // - trace.intent_embedding = real user intent at execution time (diverse, per-trace)
  // - wp.intent_embedding = capability description embedding (fallback for pre-047 traces)

  // Generate examples for each trace
  for (const trace of traces) {
    const intentEmbedding = trace.intentEmbedding;
    if (!intentEmbedding || intentEmbedding.length === 0) {
      log.debug("[PER-Subprocess] Skipping trace without intent embedding", {
        traceId: trace.id,
        capabilityId: trace.capabilityId,
      });
      continue;
    }

    const flatPath = await flattenExecutedPath(trace, traceStore);
    // Pass capToTools to exclude anchor capability's tools from negatives
    const examples = traceToTrainingExamples(trace, flatPath, intentEmbedding, pathFeatures, allEmbeddings, capToTools);

    for (const _ex of examples) {
      exampleToTraceId.push(trace.id);
    }
    allExamples.push(...examples);
  }

  if (allExamples.length === 0) {
    log.warn("[PER-Subprocess] No training examples generated");
    return {
      loss: 0,
      accuracy: 0,
      tracesProcessed: traces.length,
      highPriorityCount: traces.filter((t) => t.priority > 0.7).length,
      prioritiesUpdated: 0,
      examplesGenerated: 0,
      fallback: "tool-level",
      fallbackReason: "no valid training examples could be generated",
    };
  }

  // Step 5: Find additional tools from examples not in any capability
  const toolsInCaps = new Set<string>();
  for (const cap of capabilities) {
    for (const tool of cap.toolsUsed) {
      toolsInCaps.add(tool);
    }
  }

  const additionalToolIds: string[] = [];
  for (const ex of allExamples) {
    for (const tool of ex.contextTools) {
      // Skip UUIDs (capability IDs) - they have embeddings in workflow_pattern, not tool_embedding
      if (isUUID(tool)) continue;
      if (!toolsInCaps.has(tool) && !additionalToolIds.includes(tool)) {
        additionalToolIds.push(tool);
      }
    }
  }

  // Load real embeddings for additional tools if dbClient available
  const toolEmbeddingsMap = new Map<string, number[]>();
  if (dbClient && additionalToolIds.length > 0) {
    // Debug: log what tools we're searching for
    log.info(`[PER-Subprocess] Searching for additionalToolIds: ${JSON.stringify(additionalToolIds.slice(0, 10))}${additionalToolIds.length > 10 ? '...' : ''}`);
    try {
      // CRITICAL-8 Fix: pgvector can't cast directly to float8[], select as-is
      const rows = await dbClient.query(
        `SELECT tool_id, embedding
         FROM tool_embedding
         WHERE tool_id = ANY($1)`,
        [additionalToolIds],
      ) as Array<{ tool_id: string; embedding: number[] | string }>;
      for (const row of rows) {
        const emb = parseEmbeddingFromRow(row.embedding);
        if (emb === null) {
          log.warn(`[PER-Subprocess] Failed to parse embedding for ${row.tool_id}`);
          continue;
        }
        toolEmbeddingsMap.set(row.tool_id, emb);
      }
      log.info(
        `[PER-Subprocess] Loaded ${toolEmbeddingsMap.size}/${additionalToolIds.length} tool embeddings from DB`,
      );
    } catch (e) {
      log.warn(`[PER-Subprocess] Failed to load tool embeddings: ${e}`);
    }
  }

  // Build additional tools with embeddings (real if available, null for fallback)
  const additionalToolsWithEmbeddings = additionalToolIds.map((id) => ({
    id,
    embedding: toolEmbeddingsMap.get(id) ?? null,
  }));

  // Capabilities keep their original toolsUsed (no hack)
  // Include parents/children for multi-level hierarchy training
  const capsForWorker = capabilities.map((c) => ({
    id: c.id,
    embedding: c.embedding,
    toolsUsed: c.toolsUsed,
    successRate: c.successRate,
    parents: c.parents,
    children: c.children,
  }));

  // Step 6: Train in subprocess
  log.info(`[PER-Subprocess] Spawning training with ${allExamples.length} examples...`);

  const result = await spawnSHGATTraining({
    capabilities: capsForWorker,
    examples: allExamples,
    epochs,
    batchSize,
    existingParams: shgat.exportParams(),
    additionalToolsWithEmbeddings, // Real embeddings when available
    // Live learning config (Story 11.6)
    temperature,      // undefined = use annealing
    usePER,           // undefined = default true
    useCurriculum,    // undefined = default true
    learningRate,     // undefined = default 0.05
  });

  if (!result.success) {
    log.error(`[PER-Subprocess] Training failed: ${result.error}`);
    return {
      loss: 0,
      accuracy: 0,
      tracesProcessed: traces.length,
      highPriorityCount: traces.filter((t) => t.priority > 0.7).length,
      prioritiesUpdated: 0,
      examplesGenerated: allExamples.length,
      fallback: "tool-level",
      fallbackReason: `subprocess failed: ${result.error}`,
    };
  }

  // Step 7: Import trained params
  if (result.params) {
    shgat.importParams(result.params);
  }

  // Step 8: Update priorities using TD errors
  let prioritiesUpdated = 0;
  if (result.tdErrors && result.tdErrors.length > 0) {
    // Aggregate TD errors per trace (max |TD error| per trace)
    const tdErrorsPerTrace = new Map<string, number>();
    for (let i = 0; i < result.tdErrors.length && i < exampleToTraceId.length; i++) {
      const traceId = exampleToTraceId[i];
      if (!traceId) continue;
      const absError = Math.abs(result.tdErrors[i]);
      const current = tdErrorsPerTrace.get(traceId) ?? 0;
      if (absError > current) {
        tdErrorsPerTrace.set(traceId, absError);
      }
    }

    prioritiesUpdated = await batchUpdatePrioritiesFromTDErrors(
      traceStore,
      traces,
      tdErrorsPerTrace,
    );
  }

  const elapsed = performance.now() - startTime;

  log.info("[PER-Subprocess] Training completed", {
    tracesProcessed: traces.length,
    examplesGenerated: allExamples.length,
    epochs,
    loss: result.finalLoss?.toFixed(4),
    accuracy: result.finalAccuracy?.toFixed(4),
    prioritiesUpdated,
    elapsedMs: elapsed.toFixed(1),
  });

  return {
    loss: result.finalLoss ?? 0,
    accuracy: result.finalAccuracy ?? 0,
    tracesProcessed: traces.length,
    highPriorityCount: traces.filter((t) => t.priority > 0.7).length,
    prioritiesUpdated,
    examplesGenerated: allExamples.length,
  };
}
