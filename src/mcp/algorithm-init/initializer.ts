/**
 * Algorithm Initializer Service
 *
 * Handles complex initialization of SHGAT and DR-DSP algorithms at startup.
 * Encapsulates:
 * - Loading capabilities from database
 * - Building hierarchy from contains edges
 * - Creating SHGAT/DR-DSP via AlgorithmFactory
 * - Loading co-occurrence patterns
 * - Caching hyperedges
 * - Starting GraphSyncController
 * - Loading/saving SHGAT params
 * - Populating tool features
 * - Background training on traces
 *
 * @module mcp/algorithm-initializer
 */

import * as log from "@std/log";
import type { DbClient } from "../../db/types.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { EmbeddingModelInterface } from "../../vector/embeddings.ts";
import {
  type SHGAT,
  type TrainingExample,
  type ToolGraphFeatures,
} from "../../graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../../graphrag/algorithms/shgat/types.ts";
import { spawnSHGATTraining } from "../../graphrag/algorithms/shgat/spawn-training.ts";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import { GraphSyncController } from "../graph-sync/mod.ts";
import { trainingLock } from "../../graphrag/learning/mod.ts";
import {
  AlgorithmFactory,
  type AlgorithmCapabilityInput,
} from "../../infrastructure/patterns/factory/algorithm-factory.ts";
import { loadAllProvidesEdges } from "../../graphrag/provides-edge-calculator.ts";
import pako from "pako";
import { decode as msgpackDecode } from "npm:@msgpack/msgpack@3.0.0-beta2";

// ==========================================================================
// Types
// ==========================================================================

interface CapRow {
  id: string;
  embedding: number[] | null;
  tools_used: string[] | null;
  success_rate: number;
}

interface ContainsEdge {
  from_capability_id: string;
  to_capability_id: string;
}

// Re-use AlgorithmCapabilityInput from factory
type CapabilityWithEmbedding = AlgorithmCapabilityInput;

interface TraceRow {
  capability_id: string;
  intent_text: string | null;
  intent_embedding: string | null;
  success: boolean;
  executed_path: string[] | null;
}

interface TraceToolRow {
  task_results: string | Array<{ tool?: string }>;
  executed_at: string;
}

interface SHGATParamsRow {
  params: Record<string, unknown>;
  updated_at: string;
}

/**
 * Dependencies for AlgorithmInitializer
 */
export interface AlgorithmInitializerDeps {
  db: DbClient;
  graphEngine: GraphRAGEngine;
  capabilityStore?: CapabilityStore;
  embeddingModel: EmbeddingModelInterface; // Required - no random fallback
}

/**
 * Result of algorithm initialization
 */
export interface AlgorithmInitResult {
  shgat: SHGAT | null;
  drdsp: DRDSP | null;
  graphSyncController: GraphSyncController | null;
  capabilitiesLoaded: number;
}

// ==========================================================================
// AlgorithmInitializer
// ==========================================================================

/**
 * Service for initializing ML algorithms at server startup
 */
export class AlgorithmInitializer {
  private shgat: SHGAT | null = null;
  private drdsp: DRDSP | null = null;
  private graphSyncController: GraphSyncController | null = null;
  private capabilities: CapabilityWithEmbedding[] = [];

  constructor(private deps: AlgorithmInitializerDeps) {}

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Initialize all algorithms
   */
  async initialize(): Promise<AlgorithmInitResult> {
    if (!this.deps.capabilityStore) {
      log.warn("[AlgorithmInitializer] No capability store - SHGAT/DR-DSP disabled");
      return {
        shgat: null,
        drdsp: null,
        graphSyncController: null,
        capabilitiesLoaded: 0,
      };
    }

    try {
      // 1. Load and parse capabilities from database
      const rows = await this.loadCapabilities();
      const containsEdges = await this.loadContainsEdges();
      this.capabilities = this.parseCapabilities(rows, containsEdges);

      // 2. Load provides edges (tool→tool or cap→cap schema matching)
      let providesEdges: Array<{ from: string; to: string; type: "provides"; weight: number }> | undefined;
      try {
        providesEdges = await loadAllProvidesEdges(this.deps.db);
        if (providesEdges.length > 0) {
          log.info(`[AlgorithmInitializer] Loaded ${providesEdges.length} provides edges for DR-DSP`);
        }
      } catch (e) {
        log.debug(`[AlgorithmInitializer] Could not load provides edges: ${e}`);
      }

      // 3. Create SHGAT and DR-DSP via AlgorithmFactory (centralized creation)
      // Factory handles: algorithm creation, co-occurrence loading, provides edges
      const { shgat: shgatResult, drdsp } = await AlgorithmFactory.createBoth(
        this.capabilities,
        { withCooccurrence: true },
        providesEdges,
      );

      this.shgat = shgatResult.shgat;
      this.drdsp = drdsp;
      log.info(
        `[AlgorithmInitializer] Algorithms initialized: ${shgatResult.capabilitiesLoaded} caps, ` +
        `${shgatResult.cooccurrenceEdges ?? 0} co-occurrence edges`,
      );

      // 4. Start GraphSyncController for incremental updates
      this.graphSyncController = new GraphSyncController(
        this.deps.graphEngine,
        this.deps.db,
        () => this.shgat,
      );
      this.graphSyncController.start();

      // 5. Load persisted SHGAT params
      const { loaded: paramsLoaded } = await this.loadSHGATParams();

      // 6. Populate tool features from graph
      await this.populateToolFeatures();

      // 7. Background training disabled - use `deno task train` instead
      if (paramsLoaded) {
        log.info(`[AlgorithmInitializer] SHGAT params loaded from DB`);
      } else {
        log.info(`[AlgorithmInitializer] No SHGAT params - run 'deno task train' to train`);
      }

      return {
        shgat: this.shgat,
        drdsp: this.drdsp,
        graphSyncController: this.graphSyncController,
        capabilitiesLoaded: this.capabilities.length,
      };
    } catch (error) {
      log.error(`[AlgorithmInitializer] Failed to initialize: ${error}`);
      return {
        shgat: null,
        drdsp: null,
        graphSyncController: null,
        capabilitiesLoaded: 0,
      };
    }
  }

  /**
   * Get SHGAT instance
   */
  getSHGAT(): SHGAT | null {
    return this.shgat;
  }

  /**
   * Get DR-DSP instance
   */
  getDRDSP(): DRDSP | null {
    return this.drdsp;
  }

  /**
   * Stop services
   */
  stop(): void {
    if (this.graphSyncController) {
      this.graphSyncController.stop();
      this.graphSyncController = null;
    }
  }

  /**
   * Save SHGAT params to database (compressed with gzip)
   */
  async saveSHGATParams(): Promise<void> {
    if (!this.shgat) return;

    try {
      const params = this.shgat.exportParams();

      // Compress with pako to avoid V8 string limits (~500MB)
      const encoder = new TextEncoder();
      const jsonBytes = encoder.encode(JSON.stringify(params));
      const compressed = pako.gzip(jsonBytes, { level: 6 });

      // Convert to base64 for JSONB storage
      const base64 = this.bytesToBase64(compressed);

      const wrapper = {
        compressed: true,
        format: "gzip+base64",
        size: jsonBytes.length,
        compressedSize: compressed.length,
        data: base64,
      };

      log.info(`[AlgorithmInitializer] Saving SHGAT params (${(compressed.length / 1024 / 1024).toFixed(2)} MB compressed)`);

      // Global model - only one row, use upsert
      await this.deps.db.query(
        `INSERT INTO shgat_params (params, updated_at)
         SELECT $1::jsonb, NOW()
         WHERE NOT EXISTS (SELECT 1 FROM shgat_params)
         ON CONFLICT DO NOTHING`,
        [wrapper],
      );
      await this.deps.db.query(
        `UPDATE shgat_params SET params = $1::jsonb, updated_at = NOW()`,
        [wrapper],
      );
      log.info("[AlgorithmInitializer] SHGAT params saved to DB");
    } catch (error) {
      log.warn(`[AlgorithmInitializer] Could not save SHGAT params: ${error}`);
    }
  }

  /**
   * Encode bytes to base64 in chunks to avoid string limits
   * IMPORTANT: Chunk size must be multiple of 3 to avoid base64 padding in middle of string
   */
  private bytesToBase64(bytes: Uint8Array): string {
    const CHUNK_SIZE = 32766; // Must be multiple of 3 to avoid padding issues
    let base64 = "";
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      base64 += btoa(String.fromCharCode(...chunk));
    }
    return base64;
  }

  /**
   * Decode base64 to bytes
   */
  private base64ToBytes(base64: string): Uint8Array {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Load persisted SHGAT params from database
   */
  async loadSHGATParams(): Promise<{ loaded: boolean; updatedAt?: Date }> {
    if (!this.shgat) return { loaded: false };

    try {
      // Global model - only one row exists
      const rows = (await this.deps.db.query(
        `SELECT params, updated_at FROM shgat_params LIMIT 1`,
      )) as unknown as SHGATParamsRow[];

      if (rows.length > 0 && rows[0].params) {
        let params = rows[0].params;

        // Check if params are compressed (new format)
        const compressed = params as { compressed?: boolean; format?: string; data?: string; compressedSize?: number };
        if (compressed.compressed && compressed.data) {
          log.info(`[AlgorithmInitializer] Decompressing SHGAT params (${((compressed.compressedSize ?? 0) / 1024 / 1024).toFixed(2)} MB, format=${compressed.format})...`);
          const compressedBytes = this.base64ToBytes(compressed.data);
          const decompressed = pako.ungzip(compressedBytes);

          // Handle different serialization formats
          if (compressed.format === "msgpack+gzip+base64") {
            params = msgpackDecode(decompressed) as Record<string, unknown>;
            log.info(`[AlgorithmInitializer] Decoded MessagePack (${(decompressed.length / 1024 / 1024).toFixed(2)} MB)`);
          } else {
            // Legacy JSON format
            const jsonStr = new TextDecoder().decode(decompressed);
            params = JSON.parse(jsonStr);
            log.info(`[AlgorithmInitializer] Decoded JSON (${(decompressed.length / 1024 / 1024).toFixed(2)} MB)`);
          }
        }

        this.shgat.importParams(params);
        const updatedAt = new Date(rows[0].updated_at);
        log.info(
          `[AlgorithmInitializer] SHGAT params loaded (saved: ${rows[0].updated_at})`,
        );
        return { loaded: true, updatedAt };
      } else {
        log.info("[AlgorithmInitializer] No persisted SHGAT params found");
        return { loaded: false };
      }
    } catch (error) {
      log.debug(`[AlgorithmInitializer] Could not load SHGAT params: ${error}`);
      return { loaded: false };
    }
  }

  // ==========================================================================
  // Private: Data Loading
  // ==========================================================================

  private async loadCapabilities(): Promise<CapRow[]> {
    return (await this.deps.db.query(
      `SELECT
        pattern_id as id,
        intent_embedding as embedding,
        dag_structure->'tools_used' as tools_used,
        success_rate
      FROM workflow_pattern
      WHERE code_snippet IS NOT NULL
      LIMIT 1000`,
    )) as unknown as CapRow[];
  }

  private async loadContainsEdges(): Promise<ContainsEdge[]> {
    return (await this.deps.db.query(
      `SELECT from_capability_id, to_capability_id
       FROM capability_dependency
       WHERE edge_type = 'contains'`,
    )) as unknown as ContainsEdge[];
  }

  private parseCapabilities(
    rows: CapRow[],
    containsEdges: ContainsEdge[],
  ): CapabilityWithEmbedding[] {
    // Build hierarchy maps
    const childrenMap = new Map<string, string[]>();
    const parentsMap = new Map<string, string[]>();

    for (const edge of containsEdges) {
      const children = childrenMap.get(edge.from_capability_id) || [];
      children.push(edge.to_capability_id);
      childrenMap.set(edge.from_capability_id, children);

      const parents = parentsMap.get(edge.to_capability_id) || [];
      parents.push(edge.from_capability_id);
      parentsMap.set(edge.to_capability_id, parents);
    }

    const toolEdgesCount = rows.reduce(
      (acc, c) => acc + (c.tools_used?.length ?? 0),
      0,
    );
    log.debug(
      `[AlgorithmInitializer] Hierarchy: ${containsEdges.length} cap→cap, ${toolEdgesCount} cap→tool`,
    );

    // Parse capabilities with embeddings
    return rows
      .filter((c) => c.embedding !== null)
      .map((c) => {
        let embedding: number[];
        if (Array.isArray(c.embedding)) {
          embedding = c.embedding;
        } else if (typeof c.embedding === "string") {
          try {
            embedding = JSON.parse(c.embedding);
          } catch {
            return null;
          }
        } else {
          return null;
        }
        if (!Array.isArray(embedding) || embedding.length === 0) return null;
        return { ...c, embedding };
      })
      .filter((c): c is CapRow & { embedding: number[] } => c !== null)
      .map((c) => ({
        id: c.id,
        embedding: c.embedding,
        toolsUsed: c.tools_used ?? [],
        successRate: c.success_rate,
        children: childrenMap.get(c.id),
        parents: parentsMap.get(c.id),
      }));
  }

  // ==========================================================================
  // Private: Tool Features (co-occurrence & hyperedges handled by AlgorithmFactory)
  // ==========================================================================

  private async populateToolFeatures(): Promise<void> {
    if (!this.shgat || !this.deps.graphEngine) return;

    try {
      // Register/update all tools from graphEngine with real embeddings
      // NOTE: Tools from capabilities may have been registered with default embeddings
      // during createSHGATFromCapabilities. We MUST update them with real embeddings.
      const graphToolIds = this.deps.graphEngine.getGraph().nodes();
      let registeredCount = 0;
      let updatedCount = 0;

      for (const toolId of graphToolIds) {
        const toolNode = this.deps.graphEngine.getToolNode(toolId);

        let embedding: number[];
        if (toolNode?.embedding && toolNode.embedding.length > 0) {
          embedding = toolNode.embedding;
        } else {
          const description = toolNode?.description ?? toolId.replace(":", " ");
          embedding = await this.deps.embeddingModel.encode(description);
        }

        const wasExisting = this.shgat.hasToolNode(toolId);
        this.shgat.registerTool({ id: toolId, embedding });

        if (wasExisting) {
          updatedCount++;
        } else {
          registeredCount++;
        }
      }

      if (registeredCount > 0 || updatedCount > 0) {
        log.info(`[AlgorithmInitializer] Tools: ${registeredCount} new, ${updatedCount} updated with real embeddings`);
      }

      // Compute features
      const toolIds = this.shgat.getRegisteredToolIds();
      if (toolIds.length === 0) return;

      const { toolRecency, toolCooccurrence } =
        await this.computeTemporalFeatures(toolIds);

      const updates = new Map<string, ToolGraphFeatures>();

      for (const toolId of toolIds) {
        const pageRank = this.deps.graphEngine.getPageRank(toolId);
        const community = this.deps.graphEngine.getCommunity(toolId);
        const louvainCommunity = community ? parseInt(community, 10) || 0 : 0;

        const adamicResults = this.deps.graphEngine.computeAdamicAdar(toolId, 1);
        const adamicAdar =
          adamicResults.length > 0
            ? Math.min(adamicResults[0].score / 2, 1.0)
            : 0;

        updates.set(toolId, {
          pageRank,
          louvainCommunity,
          adamicAdar,
          cooccurrence: toolCooccurrence.get(toolId) ?? 0,
          recency: toolRecency.get(toolId) ?? 0,
          heatDiffusion: 0,
        });
      }

      this.shgat.batchUpdateToolFeatures(updates);
      log.info(`[AlgorithmInitializer] Tool features for ${updates.size} tools`);
    } catch (error) {
      log.warn(`[AlgorithmInitializer] Failed to populate features: ${error}`);
    }
  }

  private async computeTemporalFeatures(
    toolIds: string[],
  ): Promise<{
    toolRecency: Map<string, number>;
    toolCooccurrence: Map<string, number>;
  }> {
    const toolRecency = new Map<string, number>();
    const toolCooccurrence = new Map<string, number>();

    for (const toolId of toolIds) {
      toolRecency.set(toolId, 0);
      toolCooccurrence.set(toolId, 0);
    }

    try {
      const traces = (await this.deps.db.query(`
        SELECT task_results, executed_at
        FROM execution_trace
        WHERE task_results IS NOT NULL
          AND jsonb_typeof(task_results) = 'array'
          AND jsonb_array_length(task_results) > 0
        ORDER BY executed_at DESC
        LIMIT 500
      `)) as unknown as TraceToolRow[];

      if (traces.length === 0) {
        return { toolRecency, toolCooccurrence };
      }

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const toolLastUsed = new Map<string, number>();
      const toolPairCount = new Map<string, number>();

      for (const trace of traces) {
        let taskResults: Array<{ tool?: string }> = [];
        try {
          taskResults =
            typeof trace.task_results === "string"
              ? JSON.parse(trace.task_results)
              : trace.task_results;
        } catch {
          continue;
        }

        const traceTime = new Date(trace.executed_at).getTime();
        const toolsInTrace = new Set<string>();

        for (const task of taskResults) {
          if (task.tool && toolIds.includes(task.tool)) {
            toolsInTrace.add(task.tool);
            const existing = toolLastUsed.get(task.tool) ?? 0;
            if (traceTime > existing) {
              toolLastUsed.set(task.tool, traceTime);
            }
          }
        }

        for (const tool of toolsInTrace) {
          toolPairCount.set(tool, (toolPairCount.get(tool) ?? 0) + 1);
        }
      }

      for (const [toolId, lastUsedTime] of toolLastUsed) {
        const timeSinceUse = now - lastUsedTime;
        const recency = Math.exp(-timeSinceUse / oneDayMs);
        toolRecency.set(toolId, Math.min(recency, 1.0));
      }

      const maxCount = Math.max(1, ...toolPairCount.values());
      for (const [toolId, count] of toolPairCount) {
        toolCooccurrence.set(toolId, count / maxCount);
      }

      log.debug(`[AlgorithmInitializer] Temporal features from ${traces.length} traces`);
    } catch (error) {
      log.warn(`[AlgorithmInitializer] Failed temporal features: ${error}`);
    }

    return { toolRecency, toolCooccurrence };
  }

  // ==========================================================================
  // Private: Training
  // ==========================================================================

  /**
   * @deprecated Kept for reference - batch training at startup disabled.
   * Use `deno task train` or live training via train-shgat.use-case.ts instead.
   */
  // @ts-ignore: Kept for reference, may be re-enabled later
  // deno-lint-ignore require-await
  private async _trainOnTraces(): Promise<void> {
    if (!this.shgat) return;

    if (!trainingLock.acquire("BATCH")) {
      log.info(`[AlgorithmInitializer] Skipping training - another in progress`);
      return;
    }

    try {
      const traces = (await this.deps.db.query(`
        SELECT
          et.capability_id,
          wp.description AS intent_text,
          wp.intent_embedding,
          et.success,
          et.executed_path
        FROM execution_trace et
        JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
        WHERE et.capability_id IS NOT NULL
          AND wp.intent_embedding IS NOT NULL
        ORDER BY et.priority DESC
        LIMIT 500
      `)) as unknown as TraceRow[];

      if (traces.length === 0) {
        log.info(`[AlgorithmInitializer] No traces yet - will train when available`);
        return;
      }

      log.info(`[AlgorithmInitializer] Training on ${traces.length} traces...`);

      // Build map of ALL embeddings (capabilities + tools) for negative sampling
      const allEmbeddings = new Map<string, number[]>();
      for (const cap of this.capabilities) {
        allEmbeddings.set(cap.id, cap.embedding);
      }

      // Note: tools are NOT added to negative pool - only capabilities are used as negatives
      // Tools and capabilities are different entity types; mixing them confuses contrastive learning
      log.debug(`[Training] Negative pool: ${this.capabilities.length} caps (tools excluded)`);

      // Build capability → toolsUsed map for exclusion during sampling
      const capToTools = new Map<string, Set<string>>();
      for (const cap of this.capabilities) {
        capToTools.set(cap.id, new Set(cap.toolsUsed));
      }

      // @deprecated - Tool clusters no longer needed since tools are excluded from negatives
      // Keeping empty map for backward compatibility with traceToTrainingExamples signature
      const toolClusters = new Map<string, Set<string>>();
      // log.debug(`[Training] Tool clusters disabled (tools excluded from negatives)`);

      const examples: TrainingExample[] = [];

      // Helper: cosine similarity
      const cosineSim = (a: number[], b: number[]): number => {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          dot += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
      };

      // Helper: compute percentile
      const percentile = (arr: number[], p: number): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.floor((p / 100) * (sorted.length - 1));
        return sorted[idx];
      };

      // Compute global similarity distribution for adaptive thresholds
      const allSims: number[] = [];
      for (const trace of traces) {
        if (!trace.intent_embedding) continue;
        let intentEmb: number[];
        try {
          const cleaned = trace.intent_embedding.replace(/^\[|\]$/g, "");
          intentEmb = cleaned.split(",").map(Number);
        } catch { continue; }

        // Get tools to exclude for this anchor capability
        const anchorTools = capToTools.get(trace.capability_id) ?? new Set();

        for (const [itemId, emb] of allEmbeddings) {
          // Skip the anchor capability itself
          if (itemId === trace.capability_id) continue;
          // Skip tools that belong to this anchor capability
          if (anchorTools.has(itemId)) continue;
          allSims.push(cosineSim(intentEmb, emb));
        }
      }

      // Adaptive thresholds: P25-P75 for semi-hard range (classic)
      // PER will handle curriculum learning by prioritizing harder examples
      let SEMI_HARD_MIN = allSims.length > 0 ? percentile(allSims, 25) : 0.15;
      let SEMI_HARD_MAX = allSims.length > 0 ? percentile(allSims, 75) : 0.65;

      // Ensure minimum spread of 0.1 for semi-hard range
      const MIN_SPREAD = 0.1;
      if (SEMI_HARD_MAX - SEMI_HARD_MIN < MIN_SPREAD) {
        SEMI_HARD_MIN = SEMI_HARD_MAX - MIN_SPREAD;
        log.debug(`[Training] Spread too narrow, expanded to: [${SEMI_HARD_MIN.toFixed(2)}, ${SEMI_HARD_MAX.toFixed(2)}]`);
      }

      // Log distribution
      const easyCount = allSims.filter(s => s < SEMI_HARD_MIN).length;
      const semiHardCount = allSims.filter(s => s >= SEMI_HARD_MIN && s <= SEMI_HARD_MAX).length;
      const hardCount = allSims.filter(s => s > SEMI_HARD_MAX).length;
      log.info(`[Training] Similarity distribution: easy=${easyCount} (< ${SEMI_HARD_MIN.toFixed(2)}), ` +
        `semi-hard=${semiHardCount} [${SEMI_HARD_MIN.toFixed(2)}-${SEMI_HARD_MAX.toFixed(2)}], ` +
        `hard=${hardCount} (> ${SEMI_HARD_MAX.toFixed(2)})`);

      for (const trace of traces) {
        // Ensure this is a valid capability (not a tool)
        if (!capToTools.has(trace.capability_id)) continue;

        // Get anchor embedding - required for anchor-based filtering
        const anchorEmb = allEmbeddings.get(trace.capability_id);
        if (!anchorEmb) continue;

        // Parse intent embedding for training examples (model learns intent→capability)
        if (!trace.intent_embedding) continue;
        let intentEmbedding: number[];
        try {
          const cleaned = trace.intent_embedding.replace(/^\[|\]$/g, "");
          intentEmbedding = cleaned.split(",").map(Number);
        } catch {
          continue;
        }

        // Get tools to exclude for this anchor capability
        const anchorTools = capToTools.get(trace.capability_id)!;

        // Build expanded exclusion set: anchor tools + their similar tools (cluster)
        const excludedTools = new Set<string>();
        for (const toolId of anchorTools) {
          excludedTools.add(toolId);
          const cluster = toolClusters.get(toolId);
          if (cluster) {
            for (const similarTool of cluster) {
              excludedTools.add(similarTool);
            }
          }
        }

        // Compute similarity to INTENT for all candidates
        const candidatesWithSim: Array<{ id: string; sim: number }> = [];
        for (const [itemId, emb] of allEmbeddings) {
          // Skip the anchor capability itself
          if (itemId === trace.capability_id) continue;
          // Skip tools in the exclusion cluster (anchor's tools + similar tools)
          if (excludedTools.has(itemId)) continue;
          const sim = cosineSim(intentEmbedding, emb);
          candidatesWithSim.push({ id: itemId, sim });
        }

        // Sort ALL candidates by similarity descending (hard → easy)
        // Store ALL negatives for curriculum learning (train-worker samples from dynamic tiers)
        const allSorted = [...candidatesWithSim].sort((a, b) => b.sim - a.sim);
        const allNegativesSorted = allSorted.map(c => c.id);

        // Default negativeCapIds: sample from middle third for backward compatibility
        const total = allNegativesSorted.length;
        let negativeCapIds: string[];
        if (total >= NUM_NEGATIVES * 3) {
          // Enough for 3 tiers: use middle third
          const tierSize = Math.floor(total / 3);
          const middleStart = tierSize;
          negativeCapIds = allNegativesSorted.slice(middleStart, middleStart + NUM_NEGATIVES);
        } else if (total >= NUM_NEGATIVES) {
          // Not enough for tiers: use middle slice
          const start = Math.floor((total - NUM_NEGATIVES) / 2);
          negativeCapIds = allNegativesSorted.slice(start, start + NUM_NEGATIVES);
        } else {
          // Not enough negatives: use all available
          negativeCapIds = allNegativesSorted;
        }

        examples.push({
          intentEmbedding,
          contextTools: trace.executed_path ?? [],
          candidateId: trace.capability_id,
          outcome: trace.success ? 1.0 : 0.0,
          negativeCapIds,
          // Curriculum learning: ALL negatives sorted hard → easy
          // train-worker samples from dynamic tier based on accuracy
          allNegativesSorted,
        });
      }

      if (examples.length === 0) {
        log.info(`[AlgorithmInitializer] No valid examples - skipping`);
        return;
      }

      // Collect all tools already known from capabilities
      const toolsInCaps = new Set<string>();
      for (const cap of this.capabilities) {
        for (const tool of cap.toolsUsed) {
          toolsInCaps.add(tool);
        }
      }

      // Find additional tools from examples not in any capability
      // Helper: check if string is a UUID (capability ID) vs tool ID (has colon like "code:filter")
      const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

      const additionalToolIds: string[] = [];
      for (const ex of examples) {
        for (const tool of ex.contextTools) {
          // Skip UUIDs (capability IDs) - they have embeddings in workflow_pattern, not tool_embedding
          if (isUUID(tool)) continue;
          if (!toolsInCaps.has(tool) && !additionalToolIds.includes(tool)) {
            additionalToolIds.push(tool);
          }
        }
      }

      // Load real embeddings for additional tools from tool_embedding table
      const toolEmbeddingsMap = new Map<string, number[]>();
      if (additionalToolIds.length > 0) {
        try {
          // CRITICAL-8 Fix: pgvector can't cast directly to float8[], select as-is
          const rows = await this.deps.db.query(
            `SELECT tool_id, embedding
             FROM tool_embedding
             WHERE tool_id = ANY($1)`,
            [additionalToolIds],
          ) as Array<{ tool_id: string; embedding: number[] | string }>;
          for (const row of rows) {
            // Handle array, string, or pgvector format (PGlite vs PostgreSQL)
            let emb: number[];
            if (Array.isArray(row.embedding)) {
              emb = row.embedding;
            } else if (typeof row.embedding === 'string') {
              // pgvector returns "[1,2,3]" format, parse it
              try {
                emb = JSON.parse(row.embedding);
              } catch (parseErr) {
                log.warn(`[AlgorithmInitializer] Failed to parse embedding for ${row.tool_id}: ${parseErr}`);
                continue;
              }
            } else {
              log.warn(`[AlgorithmInitializer] Invalid embedding type for ${row.tool_id}: ${typeof row.embedding}`);
              continue;
            }
            toolEmbeddingsMap.set(row.tool_id, emb);
          }
          log.info(
            `[AlgorithmInitializer] Loaded ${toolEmbeddingsMap.size}/${additionalToolIds.length} tool embeddings from DB`,
          );
        } catch (e) {
          log.warn(`[AlgorithmInitializer] Failed to load tool embeddings: ${e}`);
        }
      }

      // Build additional tools with embeddings (real if available, null for fallback)
      const additionalToolsWithEmbeddings = additionalToolIds.map((id) => ({
        id,
        embedding: toolEmbeddingsMap.get(id) ?? null, // null = worker will generate
      }));

      // Each capability keeps its own toolsUsed (no hack needed)
      // Include parents/children for multi-level hierarchy training
      const capsForWorker = this.capabilities.map((c) => ({
        id: c.id,
        embedding: c.embedding,
        toolsUsed: c.toolsUsed,
        successRate: c.successRate,
        parents: c.parents,
        children: c.children,
      }));

      const result = await spawnSHGATTraining({
        capabilities: capsForWorker,
        examples,
        epochs: 25, // 25 optimal: test acc peaks at 18-21, overfits after
        batchSize: 32,
        additionalToolsWithEmbeddings, // Tools with real embeddings when available
      });

      if (result.success && this.shgat) {
        if (result.savedToDb) {
          await this.loadSHGATParams();
          log.info(
            `[AlgorithmInitializer] Training complete: loss=${result.finalLoss?.toFixed(4)}`,
          );
        } else if (result.params) {
          this.shgat.importParams(result.params);
          log.info(
            `[AlgorithmInitializer] Training complete: loss=${result.finalLoss?.toFixed(4)}`,
          );
          await this.saveSHGATParams();
        }
      } else if (!result.success) {
        log.warn(`[AlgorithmInitializer] Training failed: ${result.error}`);
      }
    } catch (error) {
      log.warn(`[AlgorithmInitializer] Training error: ${error}`);
    } finally {
      trainingLock.release("BATCH");
    }
  }
}
