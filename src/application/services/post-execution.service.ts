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
    // Normalize FQDN → short format (dag_structure.tools_used stores FQDN)
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
    const { shgat, traceStore, embeddingModel, db, onSHGATParamsUpdated } = this.deps;

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
        getEmbedding: async (text: string) => embeddingModel.encode(text),
      };

      // Fetch capabilities with embeddings for subprocess (negative mining)
      const rows = await db.query(
        `SELECT
          pattern_id as id,
          intent_embedding as embedding,
          dag_structure->'tools_used' as tools_used,
          success_rate
        FROM workflow_pattern
        WHERE code_snippet IS NOT NULL
          AND intent_embedding IS NOT NULL
        LIMIT 500`,
      ) as unknown as CapabilityRow[];

      // Parse embeddings (handle pgvector string format)
      const capabilities = rows
        .map((c) => parseCapabilityWithEmbedding(c))
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (capabilities.length === 0) {
        log.debug("[PostExecutionService] No capabilities with embeddings for PER training");
        return;
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

        // Save params after successful PER training
        if (onSHGATParamsUpdated) {
          await onSHGATParamsUpdated();
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

      // Chain: GRU trains AFTER SHGAT, every trace (background, non-blocking)
      this.runGRUBatchTraining().catch((err) => {
        log.warn(`[PostExecutionService] GRU training (post-SHGAT) failed: ${err}`);
      });
    }
  }

  /**
   * Run GRU batch training via Node subprocess.
   *
   * Collects recent execution traces as GRU TransitionExamples,
   * loads tool embeddings, and spawns training.
   * After training, hot-reloads weights into the running GRU.
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
      // 1. Load recent traces with intent embeddings
      const traces = await db.query(`
        SELECT
          et.task_results,
          et.intent_embedding,
          et.success
        FROM execution_trace et
        WHERE et.task_results IS NOT NULL
          AND jsonb_typeof(et.task_results) = 'array'
          AND jsonb_array_length(et.task_results) > 1
          AND et.intent_embedding IS NOT NULL
        ORDER BY et.executed_at DESC
        LIMIT 200
      `) as unknown as Array<{
        task_results: string | Array<{ tool?: string }>;
        intent_embedding: number[] | string;
        success: boolean;
      }>;

      if (traces.length < 20) {
        log.debug(`[PostExecutionService] GRU: not enough traces (${traces.length} < 20)`);
        return;
      }

      // 2. Load rename history to resolve old capability names in traces.
      // Traces contain tools in two formats:
      //   - short: "namespace:action" (old_name column)
      //   - FQDN: "org.project.namespace.action.hash" (old_fqdn column)
      // We index both formats so resolveToolName works regardless of input format.
      let renameMap = new Map<string, string>();
      try {
        const renameRows = await db.query(
          "SELECT old_name, new_name, old_fqdn, new_fqdn FROM capability_name_history ORDER BY renamed_at ASC",
        ) as Array<{ old_name: string; new_name: string; old_fqdn: string; new_fqdn: string }>;
        for (const row of renameRows) {
          renameMap.set(row.old_name, row.new_name);
          // Also map FQDN → new short name (normalizeToolId will produce short form)
          if (row.old_fqdn) renameMap.set(row.old_fqdn, row.new_name);
        }
        // Follow chains: A->B, B->C => A->C
        for (const [oldName, newName] of renameMap) {
          let current = newName;
          while (renameMap.has(current)) current = renameMap.get(current)!;
          if (current !== newName) renameMap.set(oldName, current);
        }
      } catch {
        // Table may not exist yet (migration pending) — proceed without
        renameMap = new Map();
      }
      const resolveToolName = (name: string): string => renameMap.get(name) ?? name;

      // 3. Build GRU TransitionExamples from traces
      const examples: Array<{
        intentEmbedding: number[];
        contextToolIds: string[];
        targetToolId: string;
        isTerminal: number;
        isSingleTool: boolean;
      }> = [];

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

        // One example per transition in the trace
        for (let i = 0; i < tools.length; i++) {
          examples.push({
            intentEmbedding: intentEmb,
            contextToolIds: tools.slice(0, i),
            targetToolId: tools[i],
            isTerminal: i === tools.length - 1 ? 1 : 0,
            isSingleTool: tools.length === 1,
          });
        }
      }

      if (examples.length < 50) {
        log.debug(`[PostExecutionService] GRU: not enough examples (${examples.length} < 50)`);
        return;
      }

      // 3. Load tool embeddings (prefer SHGAT-enriched over raw BGE-M3)
      const allToolIds = new Set<string>();
      for (const ex of examples) {
        allToolIds.add(ex.targetToolId);
        for (const t of ex.contextToolIds) allToolIds.add(t);
      }

      const toolEmbeddings: Record<string, number[]> = {};

      // Try SHGAT embeddings first (graph-enriched via message passing)
      const shgat = this.deps.shgat;
      if (shgat) {
        const shgatEmbs = shgat.getToolEmbeddings();
        for (const toolId of allToolIds) {
          const emb = shgatEmbs.get(toolId);
          if (emb) toolEmbeddings[toolId] = emb;
        }
        log.debug(`[PostExecutionService] GRU: ${Object.keys(toolEmbeddings).length}/${allToolIds.size} tools from SHGAT embeddings`);
      }

      // Fallback to DB for missing tools
      const missingToolIds = [...allToolIds].filter(id => !toolEmbeddings[id]);
      if (missingToolIds.length > 0) {
        const rows = await db.query(
          `SELECT tool_id, embedding FROM tool_embedding WHERE tool_id = ANY($1)`,
          [missingToolIds],
        ) as Array<{ tool_id: string; embedding: number[] | string }>;
        for (const row of rows) {
          const emb = Array.isArray(row.embedding) ? row.embedding
            : typeof row.embedding === "string" ? (() => { try { return JSON.parse(row.embedding); } catch { return null; } })()
            : null;
          if (emb) toolEmbeddings[row.tool_id] = emb;
        }
      }

      // 4. Load capability data (cap→tool hierarchy) with normalized names
      let capabilityData: Array<{ id: string; embedding: number[]; toolChildren: string[]; level: number }> | undefined;
      try {
        const capRows = await db.query(
          `SELECT DISTINCT ON (cr.namespace, cr.action)
            cr.namespace || ':' || cr.action as cap_name,
            wp.intent_embedding as embedding,
            wp.dag_structure->'tools_used' as tools_used,
            COALESCE(wp.hierarchy_level, 1) as level
          FROM workflow_pattern wp
          JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
          WHERE wp.code_snippet IS NOT NULL
            AND wp.intent_embedding IS NOT NULL
            AND wp.dag_structure->'tools_used' IS NOT NULL
          ORDER BY cr.namespace, cr.action, wp.last_used DESC
          LIMIT 500`,
        ) as unknown as Array<{ cap_name: string; embedding: number[] | string; tools_used: string[] | null; level: number }>;

        const parsed: Array<{ id: string; embedding: number[]; toolChildren: string[]; level: number }> = [];
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

          parsed.push({ id: row.cap_name, embedding: emb, toolChildren, level: row.level });
        }

        if (parsed.length > 0) {
          capabilityData = parsed;
        }
      } catch (e) {
        log.debug(`[PostExecutionService] GRU: could not load capability data: ${e}`);
      }

      log.info(`[PostExecutionService] GRU training: ${examples.length} examples, ${Object.keys(toolEmbeddings).length} tool embeddings, ${capabilityData?.length ?? 0} caps`);

      // 5. Train + hot reload
      const result = await algorithmInitializer.triggerGRUTraining(examples, toolEmbeddings, capabilityData);

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
