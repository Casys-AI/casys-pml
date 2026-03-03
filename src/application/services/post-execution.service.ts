/**
 * Post-Execution Service
 *
 * Handles all post-execution tasks that were previously in execute-handler.ts:
 * - updateDRDSP: Add hyperedges for capability routing
 * - registerSHGATNodes: Register capability/tool nodes in SHGAT
 * - learnFromTaskResults: Learn fan-in/fan-out edges
 * - runPERBatchTraining: PER training with traceStore
 *
 * Phase 3.2: Migrated from monolithic execute-handler.ts to Clean Architecture
 *
 * @module application/services/post-execution
 */

import * as log from "@std/log";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import type { SHGAT } from "../../graphrag/algorithms/shgat.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { EmbeddingModelInterface } from "../../vector/embeddings.ts";
import type { ExecutionTraceStore } from "../../capabilities/execution-trace-store.ts";
import type { DbClient } from "../../db/types.ts";
import type { StaticStructure, TraceTaskResult } from "../../capabilities/types/mod.ts";
import { trainSHGATOnPathTracesSubprocess } from "../../graphrag/learning/mod.ts";
import { trainingLock } from "../../graphrag/learning/mod.ts";
import type { AlgorithmInitializer } from "../../mcp/algorithm-init/initializer.ts";
import { type AdaptiveThresholdManager, updateThompsonSampling } from "../../mcp/adaptive-threshold.ts";
import { enrichToolOutputSchema } from "../../capabilities/output-schema-inferrer.ts";
import { normalizeToolId } from "../../capabilities/routing-resolver.ts";
import { dedupTracesByIntent } from "../../../lib/gru/src/data-prep/intent-dedup.ts";
import { capExamplesPerTarget } from "../../../lib/gru/src/data-prep/cap-frequency-cap.ts";
import { canonicalizeCaps, type CapData } from "../../../lib/gru/src/data-prep/cap-cleanup.ts";
import { buildRenameChain } from "../../../lib/gru/src/data-prep/resolve-tool-name.ts";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Task result with layer index for fan-in/fan-out learning
 */
export interface TaskResultWithLayer extends TraceTaskResult {
  layerIndex: number;
}

/**
 * Capability row from database query
 */
interface CapabilityRow {
  id: string;
  embedding: number[] | string;
  tools_used: string[] | null;
  success_rate: number;
}

/**
 * Parsed capability with validated embedding
 */
interface ParsedCapability {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
  parents?: string[];
  children?: string[];
}

/**
 * Parse capability row and validate embedding format
 */
function parseCapabilityWithEmbedding(row: CapabilityRow): ParsedCapability | null {
  let embedding: number[];

  if (Array.isArray(row.embedding)) {
    embedding = row.embedding;
  } else if (typeof row.embedding === "string") {
    try {
      embedding = JSON.parse(row.embedding);
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!Array.isArray(embedding) || embedding.length === 0) {
    return null;
  }

  return {
    id: row.id,
    embedding,
    // Normalize FQDN → short format (task_results may store FQDN)
    toolsUsed: (row.tools_used ?? []).map(normalizeToolId).filter(Boolean),
    successRate: row.success_rate,
  };
}


/**
 * Dependencies for PostExecutionService
 */
export interface PostExecutionServiceDeps {
  drdsp?: DRDSP;
  shgat?: SHGAT;
  graphEngine?: GraphRAGEngine;
  embeddingModel?: EmbeddingModelInterface;
  traceStore?: ExecutionTraceStore;
  db?: DbClient;
  /** Adaptive threshold manager for Thompson Sampling */
  adaptiveThresholdManager?: AdaptiveThresholdManager;
  /** Callback to save SHGAT params after training */
  onSHGATParamsUpdated?: () => Promise<void>;
  /** AlgorithmInitializer for GRU training + hot reload */
  algorithmInitializer?: AlgorithmInitializer;
}

/**
 * Input for post-execution processing
 */
export interface PostExecutionInput {
  capability: {
    id: string;
    successRate: number;
    toolsUsed?: string[];
    children?: string[];
    parents?: string[];
    hierarchyLevel?: number;
  };
  staticStructure: StaticStructure;
  toolsCalled: string[];
  taskResults: TraceTaskResult[];
  intent: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Post-Execution Service
 *
 * Handles all learning and graph updates after successful execution.
 */
export class PostExecutionService {
  constructor(private readonly deps: PostExecutionServiceDeps) {}

  /**
   * Run all post-execution tasks
   *
   * Called after successful direct mode execution.
   * All tasks are non-blocking (fire and forget with error handling).
   */
  async process(input: PostExecutionInput): Promise<void> {
    const { capability, staticStructure, toolsCalled, taskResults, intent } = input;

    // 1. Update DR-DSP with new capability (sync, fast)
    this.updateDRDSP(capability, staticStructure);

    // 2. Register capability in SHGAT graph (async, generates embeddings)
    await this.registerSHGATNodes(capability, toolsCalled, intent);

    // 3. Update Thompson Sampling with execution outcomes (Story 10.7c)
    this.updateThompsonSampling(taskResults);

    // 4. Learn fan-in/fan-out edges from task results
    await this.learnFromTaskResults(taskResults);

    // 5. Enrich tool output schemas from execution results (ADR-061)
    this.enrichToolOutputSchemas(taskResults).catch((err) =>
      log.warn("[PostExecutionService] Schema enrichment failed", { error: String(err) })
    );

    // 6. PER batch training (background, non-blocking)
    // GRU training is chained after SHGAT (inside runPERBatchTraining)
    this.runPERBatchTraining().catch((err) => {
      const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      log.warn(`[PostExecutionService] PER training failed: ${errMsg}`);
    });
  }

  // ==========================================================================
  // Thompson Sampling Update
  // ==========================================================================

  /**
   * Update Thompson Sampling with execution outcomes
   *
   * Story 10.7c: Records success/failure for per-tool adaptive thresholds.
   */
  private updateThompsonSampling(taskResults: TraceTaskResult[]): void {
    updateThompsonSampling(this.deps.adaptiveThresholdManager, taskResults);
  }

  // ==========================================================================
  // DR-DSP Update
  // ==========================================================================

  /**
   * Update DR-DSP with a newly created capability
   *
   * Adds hyperedge: sources (prerequisites) → targets (what it provides)
   */
  private updateDRDSP(
    capability: { id: string; successRate: number },
    staticStructure: StaticStructure,
  ): void {
    const { drdsp } = this.deps;
    if (!drdsp || staticStructure.nodes.length === 0) return;

    try {
      const tools = staticStructure.nodes
        .filter((n): n is typeof n & { type: "task"; tool: string } => n.type === "task" && !!n.tool)
        .map((n) => n.tool);

      // Hyperedge: sources (prerequisites) → targets (what it provides)
      drdsp.applyUpdate({
        type: "edge_add",
        hyperedgeId: `cap__${capability.id}`,
        newEdge: {
          id: `cap__${capability.id}`,
          sources: tools.length > 0 ? [tools[0]] : ["intent"],
          targets: tools.length > 1 ? tools.slice(1) : [`cap__${capability.id}`],
          weight: 1.0 - capability.successRate,
          metadata: {
            capabilityId: capability.id,
            tools,
            successRate: capability.successRate,
          },
        },
      });
      log.debug("[PostExecutionService] DR-DSP updated", { capabilityId: capability.id });
    } catch (error) {
      log.warn("[PostExecutionService] Failed to update DR-DSP", { error: String(error) });
    }
  }

  // ==========================================================================
  // SHGAT Node Registration
  // ==========================================================================

  /**
   * Register capability and tools in SHGAT graph
   *
   * Adds new nodes to the graph. Training is done separately via PER.
   * Also includes children (contained capabilities) for hierarchy.
   */
  private async registerSHGATNodes(
    capability: {
      id: string;
      toolsUsed?: string[];
      successRate: number;
      children?: string[];
      parents?: string[];
      hierarchyLevel?: number;
    },
    toolsCalled: string[],
    intent: string,
  ): Promise<void> {
    const { shgat, embeddingModel } = this.deps;
    if (!shgat || !embeddingModel) return;

    try {
      // Generate embedding for the capability from intent
      const embedding = await embeddingModel.encode(intent);

      // Register any new tools (with generated embeddings)
      // Normalize FQDN → short format for consistency with tool_embedding IDs
      const normalizedToolsCalled = toolsCalled.map(normalizeToolId).filter(Boolean);
      for (const toolId of normalizedToolsCalled) {
        if (!shgat.hasToolNode(toolId)) {
          const toolEmbedding = await embeddingModel.encode(toolId.replace(":", " "));
          shgat.registerTool({ id: toolId, embedding: toolEmbedding });
        }
      }

      // Build members: tools + child capabilities
      const normalizedToolsUsed = (capability.toolsUsed ?? normalizedToolsCalled).map(normalizeToolId).filter(Boolean);
      const toolMembers = normalizedToolsUsed.map((id) => ({
        type: "tool" as const,
        id,
      }));
      const capabilityMembers = (capability.children ?? []).map((id) => ({
        type: "capability" as const,
        id,
      }));
      const allMembers = [...toolMembers, ...capabilityMembers];

      // Register the capability with hierarchy info
      shgat.registerCapability({
        id: capability.id,
        embedding,
        members: allMembers,
        hierarchyLevel: capability.hierarchyLevel ?? 0,
        successRate: capability.successRate,
        children: capability.children,
        parents: capability.parents,
        toolsUsed: normalizedToolsUsed,
      });

      log.debug("[PostExecutionService] SHGAT nodes registered", {
        capabilityId: capability.id,
        toolsCount: toolsCalled.length,
        childrenCount: capability.children?.length ?? 0,
        hierarchyLevel: capability.hierarchyLevel ?? 0,
      });
    } catch (error) {
      log.warn("[PostExecutionService] Failed to register SHGAT nodes", { error: String(error) });
    }
  }

  // ==========================================================================
  // Tool Output Schema Enrichment (ADR-061)
  // ==========================================================================

  /**
   * Enrich tool output schemas from execution results
   *
   * ADR-061: Automatically infer output schemas from observed tool outputs.
   * This populates tool_schema.output_schema which enables provides edge calculation.
   */
  private async enrichToolOutputSchemas(taskResults: TraceTaskResult[]): Promise<void> {
    const { db } = this.deps;
    if (!db) return;

    let enriched = 0;
    let edgesCreated = 0;

    for (const task of taskResults) {
      // Skip failed tasks or tasks without result
      if (!task.success || task.result === undefined || task.result === null) {
        continue;
      }

      // Get tool ID from task.tool field
      const toolId = task.tool;
      if (!toolId || toolId.startsWith("$cap:")) continue; // Skip capability references

      try {
        // Enrich schema (async, non-blocking per tool)
        // syncEdges=false to batch edge sync at the end
        const result = await enrichToolOutputSchema(db, toolId, task.result, false);
        if (result.updated) {
          enriched++;
        }
      } catch (error) {
        // Non-critical: continue with other tools
        log.debug("[PostExecutionService] Failed to enrich schema for tool", {
          toolId,
          error: String(error),
        });
      }
    }

    // Batch sync provides edges if any schemas were updated
    if (enriched > 0) {
      try {
        const { syncAllProvidesEdges } = await import("../../graphrag/provides-edge-calculator.ts");
        edgesCreated = await syncAllProvidesEdges(db);
      } catch (error) {
        log.warn("[PostExecutionService] Failed to sync provides edges", { error: String(error) });
      }

      log.info("[PostExecutionService] Enriched tool output schemas", {
        toolsEnriched: enriched,
        edgesCreated,
      });
    }
  }

  // ==========================================================================
  // Fan-in/Fan-out Learning
  // ==========================================================================

  /**
   * Learn fan-in/fan-out edges from task results
   *
   * Story 11.4 AC11: Uses layerIndex to learn parallel execution patterns.
   */
  private async learnFromTaskResults(taskResults: TraceTaskResult[]): Promise<void> {
    const { graphEngine } = this.deps;
    if (!graphEngine) return;

    try {
      const tasksWithLayer = taskResults
        .filter((t): t is TaskResultWithLayer => t.layerIndex !== undefined);

      if (tasksWithLayer.length > 0) {
        await graphEngine.learnFromTaskResults(tasksWithLayer);
        log.debug("[PostExecutionService] Learned from task results", {
          tasksCount: tasksWithLayer.length,
        });
      }
    } catch (error) {
      log.warn("[PostExecutionService] Failed to learn from task results", { error: String(error) });
    }
  }

  // ==========================================================================
  // PER Batch Training
  // ==========================================================================

  /**
   * Run PER (Prioritized Experience Replay) batch training
   *
   * Story 11.6: Trains SHGAT on high-priority traces from database.
   * Uses subprocess for non-blocking execution.
   * Skips if another training is already in progress.
   */
  async runPERBatchTraining(): Promise<void> {
    const { shgat, traceStore, embeddingModel, db } = this.deps;

    // Skip if training already in progress
    if (!trainingLock.acquire("PER")) {
      log.debug("[PostExecutionService] Skipping PER training - lock held", {
        owner: trainingLock.owner,
      });
      return;
    }

    // Check required dependencies
    if (!shgat || !traceStore || !embeddingModel || !db) {
      log.debug("[PostExecutionService] Skipping PER training - missing dependencies", {
        hasShgat: !!shgat,
        hasTraceStore: !!traceStore,
        hasEmbeddingModel: !!embeddingModel,
        hasDb: !!db,
      });
      trainingLock.release("PER");
      return;
    }

    try {
      // Create embedding provider wrapper
      const embeddingProvider = {
        getEmbedding: async (text: string) => await embeddingModel.encode(text),
      };

      // Fetch capabilities with embeddings for subprocess (negative mining)
      // Source of truth: task_results from execution_trace (actual runtime data)
      // aligned with tools/train-shgat-standalone.ts
      const rows = await db.query(
        `SELECT
          pattern_id as id,
          COALESCE(shgat_embedding, intent_embedding) as embedding,
          ARRAY(
            SELECT DISTINCT tr->>'tool'
            FROM execution_trace et,
                 jsonb_array_elements(et.task_results) tr
            WHERE et.capability_id = wp.pattern_id
              AND et.task_results IS NOT NULL
              AND jsonb_typeof(et.task_results) = 'array'
              AND jsonb_array_length(et.task_results) >= 1
              AND tr->>'tool' IS NOT NULL
          ) as tools_used,
          success_rate
        FROM workflow_pattern wp
        WHERE code_snippet IS NOT NULL
          AND intent_embedding IS NOT NULL`,
      ) as unknown as CapabilityRow[];

      // Parse embeddings (handle pgvector string format)
      const capabilities = rows
        .map((c) => parseCapabilityWithEmbedding(c))
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (capabilities.length === 0) {
        log.debug("[PostExecutionService] No capabilities with embeddings for PER training");
        return;
      }

      // Load hierarchy edges (parent → child cap relationships) for multi-level MP
      try {
        const depRows = await db.query(
          `SELECT from_capability_id, to_capability_id
           FROM capability_dependency
           WHERE edge_type = 'contains'`,
        ) as unknown as Array<{ from_capability_id: string; to_capability_id: string }>;

        if (depRows.length > 0) {
          const childrenMap = new Map<string, string[]>();
          const parentsMap = new Map<string, string[]>();
          for (const row of depRows) {
            if (!childrenMap.has(row.from_capability_id)) childrenMap.set(row.from_capability_id, []);
            childrenMap.get(row.from_capability_id)!.push(row.to_capability_id);
            if (!parentsMap.has(row.to_capability_id)) parentsMap.set(row.to_capability_id, []);
            parentsMap.get(row.to_capability_id)!.push(row.from_capability_id);
          }
          for (const cap of capabilities) {
            cap.children = childrenMap.get(cap.id);
            cap.parents = parentsMap.get(cap.id);
          }
          log.debug(`[PostExecutionService] Loaded ${depRows.length} hierarchy edges for live SHGAT training`);
        }
      } catch (e) {
        log.warn(`[PostExecutionService] Failed to load hierarchy edges: ${e}`);
      }

      // Run path-level training with PER sampling in subprocess
      log.info("[PostExecutionService] Starting PER batch training", {
        capabilitiesCount: capabilities.length,
      });

      const result = await trainSHGATOnPathTracesSubprocess(
        shgat,
        traceStore,
        embeddingProvider,
        {
          capabilities,
          minTraces: 1,
          maxTraces: 50,
          batchSize: 16,
          epochs: 1,           // Live: 1 epoch for fast updates
          temperature: 0.07,   // Live: fixed τ (no annealing)
          usePER: false,       // Live: no PER (overhead not worth 1 epoch)
          useCurriculum: false, // Live: no curriculum (no time)
          learningRate: 0.03,  // Live: conservative LR
        },
        this.deps.db, // For loading real tool embeddings
      );

      if (!result.fallback && result.tracesProcessed > 0) {
        log.info("[PostExecutionService] PER training completed", {
          traces: result.tracesProcessed,
          examples: result.examplesGenerated,
          loss: result.loss.toFixed(4),
          priorities: result.prioritiesUpdated,
        });

        // Reload trained params from DB into in-memory SHGAT instance.
        // The worker saves directly to DB (msgpack+gzip+base64). We must reload
        // so the in-memory instance has fresh params for inference and embedding persistence.
        // NOTE: Do NOT call onSHGATParamsUpdated (saveSHGATParams) here — that would
        // overwrite the worker's fresh DB params with the stale in-memory params.
        if (this.deps.algorithmInitializer) {
          await this.deps.algorithmInitializer.loadSHGATParams();
        }

        // Persist SHGAT-enriched cap embeddings to workflow_pattern.shgat_embedding
        // Must complete BEFORE GRU training starts (GRU reads these via COALESCE)
        if (shgat && db) {
          try {
            const capEmbs = shgat.getCapEmbeddings();
            if (capEmbs.size > 0) {
              const entries = [...capEmbs.entries()];
              for (let i = 0; i < entries.length; i += 50) {
                const batch = entries.slice(i, i + 50);
                await Promise.all(batch.map(([patternId, emb]) =>
                  db.exec(
                    `UPDATE workflow_pattern SET shgat_embedding = $1::vector WHERE pattern_id = $2`,
                    [`[${emb.join(",")}]`, patternId]
                  )
                ));
              }
              log.info(`[PostExecutionService] Persisted ${capEmbs.size} SHGAT cap embeddings to workflow_pattern`);
            }

            // Also persist SHGAT-enriched tool embeddings to tool_embedding.shgat_embedding
            const toolEmbs = shgat.getToolEmbeddings();
            if (toolEmbs.size > 0) {
              const toolEntries = [...toolEmbs.entries()];
              for (let i = 0; i < toolEntries.length; i += 50) {
                const batch = toolEntries.slice(i, i + 50);
                await Promise.all(batch.map(([toolId, emb]) =>
                  db.exec(
                    `UPDATE tool_embedding SET shgat_embedding = $1::vector WHERE tool_id = $2`,
                    [`[${emb.join(",")}]`, toolId]
                  )
                ));
              }
              log.info(`[PostExecutionService] Persisted ${toolEmbs.size} SHGAT tool embeddings to tool_embedding`);
            }
          } catch (e) {
            log.warn(`[PostExecutionService] Failed to persist embeddings: ${e}`);
          }
        }
      } else if (result.fallback) {
        log.debug("[PostExecutionService] PER training fallback", {
          reason: result.fallbackReason,
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      log.warn(`[PostExecutionService] PER training failed: ${errMsg}`);
    } finally {
      trainingLock.release("PER");

      // Chain: GRU trains AFTER SHGAT + cap persistence, every trace (background, non-blocking)
      this.runGRUBatchTraining().catch((err) => {
        log.warn(`[PostExecutionService] GRU training (post-SHGAT) failed: ${err}`);
      });
    }
  }

  /**
   * Run GRU batch training via Node subprocess.
   *
   * Aligned with scripts/train-gru-with-caps.ts:
   * - Cap-as-terminal examples
   * - Cap canonicalization (toolset dedup)
   * - exec_hash resolution
   * - L2+ hierarchy walk
   * - Consecutive dedup + intent dedup
   * - Test split 80/20 with early stopping
   * - L2 normalize embeddings
   */
  async runGRUBatchTraining(): Promise<void> {
    const { algorithmInitializer, db } = this.deps;

    if (!algorithmInitializer?.getGRU()?.isReady() || !db) {
      return;
    }

    if (!trainingLock.acquire("GRU")) {
      log.debug("[PostExecutionService] Skipping GRU training - lock held");
      return;
    }

    try {
      // ================================================================
      // 1. Load reference data
      // ================================================================

      // 1a. Load recent traces with intent embeddings + cap_name
      const traces = await db.query(`
        SELECT
          et.task_results,
          et.intent_embedding,
          et.success,
          cr.namespace || ':' || cr.action as cap_name
        FROM execution_trace et
        LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
        LEFT JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
        WHERE et.task_results IS NOT NULL
          AND jsonb_typeof(et.task_results) = 'array'
          AND jsonb_array_length(et.task_results) >= 1
          AND et.intent_embedding IS NOT NULL
        ORDER BY et.executed_at DESC
        LIMIT 2000
      `) as unknown as Array<{
        task_results: string | Array<{ tool?: string }>;
        intent_embedding: number[] | string;
        success: boolean;
        cap_name: string | null;
      }>;

      if (traces.length < 20) {
        log.debug(`[PostExecutionService] GRU: not enough traces (${traces.length} < 20)`);
        return;
      }

      // 1b. Load rename history (centralized)
      let renameMap = new Map<string, string>();
      try {
        const renameRows = await db.query(
          "SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC",
        ) as Array<{ old_name: string; new_name: string; old_fqdn?: string | null }>;
        renameMap = buildRenameChain(renameRows);
      } catch {
        renameMap = new Map();
      }

      // 1c. Load all tool embeddings (prefer SHGAT-enriched if available, fallback to raw BGE-M3)
      const toolEmbeddings: Record<string, number[]> = {};
      const embRows = await db.query(
        `SELECT tool_id, COALESCE(shgat_embedding, embedding) as embedding FROM tool_embedding ORDER BY tool_id`,
      ) as Array<{ tool_id: string; embedding: number[] | string }>;
      for (const row of embRows) {
        const emb = Array.isArray(row.embedding) ? row.embedding
          : typeof row.embedding === "string" ? (() => { try { return JSON.parse(row.embedding); } catch { return null; } })()
          : null;
        if (emb) toolEmbeddings[row.tool_id] = emb;
      }

      const shgat = this.deps.shgat;
      if (shgat) {
        const shgatEmbs = shgat.getToolEmbeddings();
        let shgatCount = 0;
        for (const [toolId, emb] of shgatEmbs) {
          if (toolEmbeddings[toolId]) {
            toolEmbeddings[toolId] = emb;
            shgatCount++;
          }
        }
        if (shgatCount > 0) {
          log.debug(`[PostExecutionService] GRU: ${shgatCount} tools enriched with SHGAT embeddings`);
        }
      }

      const allToolIds = new Set(Object.keys(toolEmbeddings));

      // 1d. Load capability data with usage_count
      const capabilityData: Array<{
        id: string; embedding: number[]; toolChildren: string[];
        level: number; usageCount: number;
      }> = [];
      const capChildrenMap = new Map<string, string[]>();
      try {
        const capRows = await db.query(
          `SELECT DISTINCT ON (cr.namespace, cr.action)
            cr.namespace || ':' || cr.action as cap_name,
            COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding,
            wp.shgat_embedding IS NOT NULL as has_shgat,
            ARRAY(
              SELECT DISTINCT tr->>'tool'
              FROM execution_trace et,
                   jsonb_array_elements(et.task_results) tr
              WHERE et.capability_id = wp.pattern_id
                AND et.task_results IS NOT NULL
                AND jsonb_typeof(et.task_results) = 'array'
                AND jsonb_array_length(et.task_results) >= 1
                AND tr->>'tool' IS NOT NULL
            ) as tools_used,
            COALESCE(wp.hierarchy_level, 1) as level,
            COALESCE(wp.usage_count, 0) as usage_count
          FROM workflow_pattern wp
          JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
          WHERE wp.code_snippet IS NOT NULL
            AND wp.intent_embedding IS NOT NULL
          ORDER BY cr.namespace, cr.action, wp.last_used DESC`,
        ) as unknown as Array<{
          cap_name: string; embedding: number[] | string; has_shgat: boolean;
          tools_used: string[] | null; level: number; usage_count: number;
        }>;

        let shgatCapCount = 0;
        for (const row of capRows) {
          let emb: number[];
          if (Array.isArray(row.embedding)) {
            emb = row.embedding;
          } else if (typeof row.embedding === "string") {
            try { emb = JSON.parse(row.embedding); } catch { continue; }
          } else { continue; }
          if (!Array.isArray(emb) || emb.length === 0) continue;

          const toolChildren = (row.tools_used ?? [])
            .map(normalizeToolId)
            .filter(Boolean) as string[];
          if (toolChildren.length === 0) continue;

          capabilityData.push({
            id: row.cap_name, embedding: emb, toolChildren,
            level: row.level, usageCount: row.usage_count,
          });
          capChildrenMap.set(row.cap_name, toolChildren);
          if (row.has_shgat) shgatCapCount++;
        }

        if (capabilityData.length > 0) {
          if (shgatCapCount === 0) {
            log.warn(`[PostExecutionService] GRU caps: all ${capabilityData.length} using intent_embedding fallback — run SHGAT training first`);
          } else {
            log.info(`[PostExecutionService] GRU caps: ${shgatCapCount}/${capabilityData.length} with shgat_embedding`);
          }
        }
      } catch (e) {
        log.debug(`[PostExecutionService] GRU: could not load capability data: ${e}`);
      }

      // ================================================================
      // 2. Preprocessing (exec_hash, canonicalization, L2+, L2 norm)
      // ================================================================

      // 2a. Resolve stale code:exec_HASH references in cap toolChildren
      const execHashToCapName = new Map<string, string>();
      try {
        const codeHashRows = await db.query(
          `SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name
           FROM workflow_pattern wp
           JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
           WHERE wp.code_hash IS NOT NULL`,
        ) as Array<{ code_hash: string; cap_name: string }>;
        for (const row of codeHashRows) {
          execHashToCapName.set(row.code_hash.substring(0, 8), row.cap_name);
        }
      } catch { /* table may not exist */ }

      const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;
      let execResolved = 0;
      for (const cap of capabilityData) {
        cap.toolChildren = cap.toolChildren.map(child => {
          const m = child.match(execPattern);
          if (m) {
            const resolved = execHashToCapName.get(m[1]);
            if (resolved) { execResolved++; return resolved; }
          }
          return child;
        });
      }
      for (const [key, children] of capChildrenMap) {
        capChildrenMap.set(key, children.map(child => {
          const m = child.match(execPattern);
          return m ? (execHashToCapName.get(m[1]) ?? child) : child;
        }));
      }
      if (execResolved > 0) {
        log.info(`[PostExecutionService] GRU: resolved ${execResolved} stale code:exec_* refs`);
      }

      // 2b. Cap canonicalization by toolset (centralized, level-aware)
      let capCanonicalMap = new Map<string, string>();
      {
        const capDataForCanon: CapData[] = capabilityData.map(c => ({
          id: c.id,
          embedding: c.embedding,
          toolChildren: c.toolChildren,
          level: c.level,
          usageCount: c.usageCount,
        }));
        const before = capDataForCanon.length;
        const { canonicalMap, groupCount, remapped } = canonicalizeCaps(capDataForCanon);
        capCanonicalMap = canonicalMap;

        if (remapped > 0) {
          // canonicalizeCaps mutates in-place — rebuild capabilityData from surviving entries
          const canonicalIds = new Set(capDataForCanon.map(c => c.id));
          for (let i = capabilityData.length - 1; i >= 0; i--) {
            if (!canonicalIds.has(capabilityData[i].id)) {
              capabilityData.splice(i, 1);
            }
          }
          for (const nonCanon of canonicalMap.keys()) capChildrenMap.delete(nonCanon);
          for (const cap of capabilityData) {
            cap.toolChildren = cap.toolChildren.map(c => canonicalMap.get(c) ?? c);
          }
          for (const [key, children] of capChildrenMap) {
            capChildrenMap.set(key, children.map(c => canonicalMap.get(c) ?? c));
          }
          log.info(`[PostExecutionService] GRU: canonicalize: ${groupCount} toolset groups, ${remapped} caps remapped → ${capabilityData.length} canonical (was ${before})`);
        }
      }

      // 2c. Resolve L2+ caps transitively to L0 tools
      let l2Resolved = 0;
      for (const cap of capabilityData) {
        if (cap.level < 2) continue;
        const resolvedTools = new Set<string>();
        const queue = [...cap.toolChildren];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const child = queue.shift()!;
          if (visited.has(child)) continue;
          visited.add(child);
          if (allToolIds.has(child)) {
            resolvedTools.add(child);
          } else {
            const gc = capChildrenMap.get(child);
            if (gc) queue.push(...gc);
          }
        }
        if (resolvedTools.size > 0) {
          cap.toolChildren = [...resolvedTools];
          l2Resolved++;
        }
      }
      if (l2Resolved > 0) {
        log.info(`[PostExecutionService] GRU: resolved ${l2Resolved} L2+ caps to L0 tools`);
      }

      // 2d. L2 normalize embeddings (SHGAT MP output is not unit-normalized)
      {
        let toolsNormalized = 0;
        let capsNormalized = 0;
        for (const toolId of Object.keys(toolEmbeddings)) {
          const emb = toolEmbeddings[toolId];
          let norm = 0;
          for (let j = 0; j < emb.length; j++) norm += emb[j] * emb[j];
          norm = Math.sqrt(norm);
          if (Math.abs(norm - 1.0) > 0.001) {
            const inv = 1.0 / norm;
            toolEmbeddings[toolId] = emb.map(v => v * inv);
            toolsNormalized++;
          }
        }
        for (const cap of capabilityData) {
          let norm = 0;
          for (let j = 0; j < cap.embedding.length; j++) norm += cap.embedding[j] * cap.embedding[j];
          norm = Math.sqrt(norm);
          if (Math.abs(norm - 1.0) > 0.001) {
            const inv = 1.0 / norm;
            cap.embedding = cap.embedding.map(v => v * inv);
            capsNormalized++;
          }
        }
        if (toolsNormalized > 0 || capsNormalized > 0) {
          log.info(`[PostExecutionService] GRU: L2 norm: ${toolsNormalized} tools, ${capsNormalized} caps re-normalized`);
        }
      }

      // 2e. Build resolveToolName (exec_hash → rename → canonical)
      const resolveToolName = (name: string): string => {
        let resolved = name;
        const m = name.match(execPattern);
        if (m) resolved = execHashToCapName.get(m[1]) ?? name;
        const renamed = renameMap.get(resolved) ?? resolved;
        return capCanonicalMap.get(renamed) ?? renamed;
      };

      // ================================================================
      // 3. Build examples (tool-to-tool + cap-as-terminal)
      // ================================================================

      const capIdSet = new Set(capabilityData.map(c => c.id));
      const examples: Array<{
        intentEmbedding: number[];
        contextToolIds: string[];
        targetToolId: string;
        isTerminal: number;
        isSingleTool: boolean;
      }> = [];
      let skippedConsecutive = 0;
      let capTerminalAdded = 0;

      for (const trace of traces) {
        let taskResults: Array<{ tool?: string }> = [];
        try {
          taskResults = typeof trace.task_results === "string"
            ? JSON.parse(trace.task_results)
            : trace.task_results;
        } catch { continue; }

        const tools = taskResults
          .map(t => t.tool)
          .filter((t): t is string => !!t)
          .map(normalizeToolId)
          .filter(Boolean)
          .map(t => resolveToolName(t!)) as string[];

        if (tools.length < 1) continue;

        let intentEmb: number[];
        if (Array.isArray(trace.intent_embedding)) {
          intentEmb = trace.intent_embedding;
        } else if (typeof trace.intent_embedding === "string") {
          try { intentEmb = JSON.parse(trace.intent_embedding); } catch { continue; }
        } else { continue; }

        // Tool-to-tool examples with consecutive dedup
        for (let i = 0; i < tools.length; i++) {
          if (i > 0 && tools[i] === tools[i - 1]) {
            skippedConsecutive++;
            continue;
          }
          examples.push({
            intentEmbedding: intentEmb,
            contextToolIds: tools.slice(0, i),
            targetToolId: tools[i],
            isTerminal: i === tools.length - 1 ? 1 : 0,
            isSingleTool: tools.length === 1,
          });
        }

        // Cap-as-terminal example
        const capName = trace.cap_name ? resolveToolName(trace.cap_name) : null;
        if (capName && capIdSet.has(capName)) {
          examples.push({
            intentEmbedding: intentEmb,
            contextToolIds: tools,
            targetToolId: capName,
            isTerminal: 1,
            isSingleTool: false,
          });
          capTerminalAdded++;
        }
      }

      if (skippedConsecutive > 0) {
        log.debug(`[PostExecutionService] GRU: skipped ${skippedConsecutive} consecutive duplicate examples`);
      }
      if (capTerminalAdded > 0) {
        log.info(`[PostExecutionService] GRU: ${capTerminalAdded} cap-as-terminal examples`);
      }

      // 3b. Intent dedup (centralized, full embedding, precision=6)
      const beforeDedup = examples.length;
      {
        const { deduped } = dedupTracesByIntent(
          examples,
          (ex) => ex.contextToolIds.join("|") + ">>" + ex.targetToolId,
          (ex) => ex.intentEmbedding,
        );
        examples.length = 0;
        examples.push(...deduped);
      }
      if (examples.length < beforeDedup) {
        log.info(`[PostExecutionService] GRU: dedup ${beforeDedup} → ${examples.length} examples`);
      }

      // 3c. Frequency cap (FPS, max 50 per target — aligned with offline script)
      {
        const { capped, stats } = capExamplesPerTarget(examples, 50);
        if (stats.cappedTargets > 0) {
          log.info(`[PostExecutionService] GRU: freq cap ${stats.before} → ${stats.after} (${stats.cappedTargets} targets capped)`);
          examples.length = 0;
          examples.push(...capped);
        }
      }

      if (examples.length < 50) {
        log.debug(`[PostExecutionService] GRU: not enough examples (${examples.length} < 50)`);
        return;
      }

      // ================================================================
      // 4. Split train/test 80/20 + train
      // ================================================================

      const splitIdx = Math.floor(examples.length * 0.8);
      const trainExamples = examples.slice(0, splitIdx);
      const testExamples = examples.slice(splitIdx);

      log.info(`[PostExecutionService] GRU training: ${trainExamples.length} train, ${testExamples.length} test, ${Object.keys(toolEmbeddings).length} tool embeddings, ${capabilityData.length} caps`);

      const result = await algorithmInitializer.triggerGRUTraining(
        trainExamples,
        toolEmbeddings,
        capabilityData.length > 0 ? capabilityData : undefined,
        testExamples,
      );

      if (result.success) {
        log.info(`[PostExecutionService] GRU training done: loss=${result.finalLoss?.toFixed(4)}, acc=${result.finalAccuracy?.toFixed(2)}`);
      } else {
        log.warn(`[PostExecutionService] GRU training failed: ${result.error}`);
      }
    } catch (error) {
      log.warn(`[PostExecutionService] GRU training error: ${error}`);
    } finally {
      trainingLock.release("GRU");
    }
  }
}
