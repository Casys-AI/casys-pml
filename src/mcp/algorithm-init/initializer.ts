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
  type ToolGraphFeatures,
} from "../../graphrag/algorithms/shgat.ts";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import { GraphSyncController } from "../graph-sync/mod.ts";
import {
  AlgorithmFactory,
  type AlgorithmCapabilityInput,
} from "../../infrastructure/patterns/factory/algorithm-factory.ts";
import { loadAllProvidesEdges } from "../../graphrag/provides-edge-calculator.ts";
import { normalizeToolId } from "../../capabilities/routing-resolver.ts";
import { cleanToolIds } from "../../capabilities/trace-path.ts";
import type { IGRUInference } from "../../graphrag/algorithms/gru/types.ts";
import { GRUInference } from "../../graphrag/algorithms/gru/gru-inference.ts";
import {
  loadGRUWeightsFile,
  loadGRUWeightsFromDb,
  buildVocabulary,
  computeStructuralMatrices,
  type GRUWeightsFile,
} from "../../graphrag/algorithms/gru/gru-loader.ts";
import type { ToolCapabilityMap, SpawnGRUTrainingInput } from "../../graphrag/algorithms/gru/types.ts";
import { spawnGRUTraining } from "../../graphrag/algorithms/gru/spawn-training.ts";
import pako from "pako";
import { decode as msgpackDecode } from "npm:@msgpack/msgpack@3.0.0-beta2";

/**
 * @deprecated Use cleanToolIds from trace-path.ts directly.
 * Kept as re-export for backward compatibility with train-shgat-standalone.ts.
 */
export const filterContextTools = cleanToolIds;

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
  gru: IGRUInference | null;
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
  private gru: IGRUInference | null = null;
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
        gru: null,
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

      // 8. Initialize GRU inference (independent of SHGAT params, needs tool IDs from SHGAT)
      await this.initializeGRU();

      return {
        shgat: this.shgat,
        drdsp: this.drdsp,
        gru: this.gru,
        graphSyncController: this.graphSyncController,
        capabilitiesLoaded: this.capabilities.length,
      };
    } catch (error) {
      log.error(`[AlgorithmInitializer] Failed to initialize: ${error}`);
      return {
        shgat: null,
        drdsp: null,
        gru: null,
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
   * Get GRU inference instance
   */
  getGRU(): IGRUInference | null {
    return this.gru;
  }

  /**
   * Reload GRU weights from DB after training.
   * Updates weights in-place on the existing GRUInference instance.
   */
  async reloadGRUWeights(): Promise<boolean> {
    if (!this.gru) {
      log.warn("[AlgorithmInitializer] Cannot reload GRU weights — GRU not initialized");
      return false;
    }

    try {
      const result = await loadGRUWeightsFromDb(this.deps.db);
      if (!result) {
        log.warn("[AlgorithmInitializer] No GRU weights in DB to reload");
        return false;
      }

      const gruInstance = this.gru as GRUInference;
      gruInstance.setWeights(result.weights);

      // Rebuild vocab if DB weights include embedded vocab (from training)
      if (result.vocab) {
        const vocab = buildVocabulary(
          result.vocab.toolIds,
          result.vocab.vocabNodes,
          result.weights.similarityHeadKernel,
        );

        const expectedVocab = result.weights.similarityHeadKernel[0]?.length ?? 0;
        if (vocab.vocabSize === expectedVocab) {
          gruInstance.setVocabulary(vocab);
          log.info(
            `[AlgorithmInitializer] GRU weights + vocab reloaded from DB: ${vocab.vocabSize} vocab ` +
            `(${result.vocab.toolIds.length} tools, ${result.vocab.vocabNodes.length} nodes)`,
          );
        } else {
          log.warn(
            `[AlgorithmInitializer] GRU DB vocab mismatch: built ${vocab.vocabSize}, ` +
            `weights expect ${expectedVocab}. Weights reloaded, vocab kept as-is.`,
          );
        }
      } else {
        log.info("[AlgorithmInitializer] GRU weights reloaded from DB (no embedded vocab)");
      }

      return true;
    } catch (error) {
      log.error(`[AlgorithmInitializer] Failed to reload GRU weights: ${error}`);
      return false;
    }
  }

  /**
   * Trigger GRU training subprocess, then hot-reload weights.
   *
   * @param examples - Training examples (from execution traces)
   * @param toolEmbeddings - Tool embeddings keyed by tool ID
   * @returns Training result
   */
  async triggerGRUTraining(
    examples: SpawnGRUTrainingInput["examples"],
    toolEmbeddings: Record<string, number[]>,
    capabilityData?: SpawnGRUTrainingInput["capabilityData"],
    testExamples?: SpawnGRUTrainingInput["examples"],
  ): Promise<{ success: boolean; finalLoss?: number; finalAccuracy?: number; error?: string }> {
    if (!this.gru) {
      return { success: false, error: "GRU not initialized" };
    }

    const result = await spawnGRUTraining({
      examples,
      testExamples,
      evalEvery: 5,
      toolEmbeddings,
      capabilityData,
      existingWeightsPath: "lib/gru/gru-weights-latest.json",
      epochs: 20,
      learningRate: 0.001,
    });

    if (result.success && result.savedToDb) {
      await this.reloadGRUWeights();
    }

    return result;
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
  // Private: GRU Initialization
  // ==========================================================================

  /**
   * Initialize GRU inference engine.
   *
   * Loads weights (DB first, file fallback), builds vocabulary from
   * SHGAT tool IDs + capability hierarchy, computes structural matrices
   * (Jaccard + bigram) from execution traces.
   */
  private async initializeGRU(): Promise<void> {
    try {
      // 1. Load weights — file first (with embedded vocab), DB fallback (live-trained)
      let weights: GRUWeightsFile["weights"] | null = null;
      let savedVocab: GRUWeightsFile["vocab"] | undefined;

      const weightsPath = "lib/gru/gru-weights-prod.json";
      try {
        const file = await loadGRUWeightsFile(weightsPath);
        weights = file.weights;
        savedVocab = file.vocab;
        log.info(
          `[AlgorithmInitializer] GRU weights loaded from file: ${weightsPath}` +
          (savedVocab ? ` (with embedded vocab: ${savedVocab.toolIds.length} tools, ${savedVocab.vocabNodes.length} nodes)` : ""),
        );
      } catch {
        // File not found — try DB
        const dbResult = await loadGRUWeightsFromDb(this.deps.db);
        if (dbResult) {
          weights = dbResult.weights;
          savedVocab = dbResult.vocab;
          log.info(
            "[AlgorithmInitializer] GRU weights loaded from DB" +
            (savedVocab ? ` (with embedded vocab: ${savedVocab.toolIds.length} tools, ${savedVocab.vocabNodes.length} nodes)` : " (no embedded vocab)"),
          );
        } else {
          log.warn("[AlgorithmInitializer] GRU weights not available (file not found, DB empty)");
          return;
        }
      }

      // 2. Build vocabulary
      // If weights file includes vocab mapping, use it (guaranteed match with training).
      // Otherwise fall back to DB query (ORDER BY tool_id must match training).
      let toolIds: string[];
      let vocabNodes: Array<{ id: string; level?: number; children?: string[] }>;

      if (savedVocab) {
        toolIds = savedVocab.toolIds;
        vocabNodes = savedVocab.vocabNodes;
        log.info(`[AlgorithmInitializer] GRU vocab from weights file: ${toolIds.length} tools, ${vocabNodes.length} nodes`);
      } else {
        // Fallback: reconstruct from DB (must match training order)
        const toolRows = await this.deps.db.query(
          "SELECT tool_id FROM tool_embedding ORDER BY tool_id",
        ) as Array<{ tool_id: string }>;
        toolIds = toolRows.map((r) => r.tool_id);

        if (toolIds.length === 0) {
          log.warn("[AlgorithmInitializer] GRU: No tools in tool_embedding table");
          return;
        }

        vocabNodes = [];
        for (const cap of this.capabilities) {
          if (cap.toolsUsed && cap.toolsUsed.length > 0) {
            vocabNodes.push({ id: cap.id, children: cap.toolsUsed });
          }
        }
        log.warn("[AlgorithmInitializer] GRU vocab from DB fallback — may mismatch training if caps changed");
      }

      const vocab = buildVocabulary(toolIds, vocabNodes, weights.similarityHeadKernel);

      // Vocab size sanity check
      const expectedVocab = weights.similarityHeadKernel[0]?.length ?? 0;
      if (vocab.vocabSize !== expectedVocab) {
        log.error(
          `[AlgorithmInitializer] GRU vocab MISMATCH: built ${vocab.vocabSize} (${toolIds.length} tools + ${vocabNodes.length} nodes), ` +
          `weights expect ${expectedVocab}. GRU will NOT be loaded — predictions would be wrong.`,
        );
        return;
      }

      // 3. Build tool-capability map for structural bias + transition features
      const toolCapMap = this.buildToolCapabilityMap(toolIds);

      // 4. Load traces for bigram matrix
      const traces = await this.loadTracesForBigram();
      const toolToIndex = vocab.nodeToIndex;

      // 5. Compute structural matrices
      const structural = computeStructuralMatrices(
        traces,
        toolToIndex,
        toolIds.length,
        toolCapMap,
      );

      // 6. Wire up GRU
      const gru = new GRUInference();
      gru.setWeights(weights);
      gru.setVocabulary(vocab);
      gru.setStructuralMatrices(structural);

      this.gru = gru;
      log.info(
        `[AlgorithmInitializer] GRU ready: ${vocab.vocabSize} vocab, ` +
        `${toolIds.length} tools, ${traces.length} traces for bigram, ` +
        `toolCapMap: ${toolCapMap ? `${toolCapMap.numTools}×${toolCapMap.numCapabilities}` : "none"}`,
      );
    } catch (error) {
      log.error(`[AlgorithmInitializer] GRU initialization failed: ${error}`);
      this.gru = null;
    }
  }

  /**
   * Build binary tool×capability matrix from capabilities data.
   * Returns null if no capability data available.
   */
  private buildToolCapabilityMap(toolIds: string[]): ToolCapabilityMap | undefined {
    if (this.capabilities.length === 0) return undefined;

    // Collect all unique capability IDs that have tools
    const capsWithTools = this.capabilities.filter(
      (c) => c.toolsUsed && c.toolsUsed.length > 0,
    );
    if (capsWithTools.length === 0) return undefined;

    const capIds = capsWithTools.map((c) => c.id);
    const capToIdx = new Map<string, number>();
    for (let i = 0; i < capIds.length; i++) {
      capToIdx.set(capIds[i], i);
    }

    const toolToIdx = new Map<string, number>();
    for (let i = 0; i < toolIds.length; i++) {
      toolToIdx.set(toolIds[i], i);
    }

    const numTools = toolIds.length;
    const numCaps = capIds.length;
    const matrix = new Float32Array(numTools * numCaps);

    for (const cap of capsWithTools) {
      const capIdx = capToIdx.get(cap.id);
      if (capIdx === undefined) continue;
      for (const tool of cap.toolsUsed!) {
        const toolIdx = toolToIdx.get(tool);
        if (toolIdx !== undefined) {
          matrix[toolIdx * numCaps + capIdx] = 1;
        }
      }
    }

    return { matrix, numTools, numCapabilities: numCaps };
  }

  /**
   * Load execution traces as tool ID sequences for bigram matrix computation.
   */
  private async loadTracesForBigram(): Promise<string[][]> {
    try {
      const rows = (await this.deps.db.query(`
        SELECT task_results
        FROM execution_trace
        WHERE task_results IS NOT NULL
          AND jsonb_typeof(task_results) = 'array'
          AND jsonb_array_length(task_results) > 1
        ORDER BY executed_at DESC
        LIMIT 1000
      `)) as unknown as Array<{ task_results: string | Array<{ tool?: string }> }>;

      const traces: string[][] = [];
      for (const row of rows) {
        let taskResults: Array<{ tool?: string }> = [];
        try {
          taskResults =
            typeof row.task_results === "string"
              ? JSON.parse(row.task_results)
              : row.task_results;
        } catch {
          continue;
        }

        const tools = taskResults
          .map((t) => t.tool)
          .filter((t): t is string => !!t)
          .map(normalizeToolId)
          .filter(Boolean) as string[];

        if (tools.length > 1) {
          traces.push(tools);
        }
      }

      return traces;
    } catch (error) {
      log.warn(`[AlgorithmInitializer] Could not load traces for GRU bigram: ${error}`);
      return [];
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
        // Normalize FQDN → short format (e.g. "pml.mcp.std.psql_query.db48" → "std:psql_query")
        // dag_structure.tools_used stores FQDN but tool_embedding.tool_id uses short format.
        // Without this, createSHGATFromCapabilities registers tools with FQDN IDs that don't
        // match any real embedding, causing random embeddings to be used for message passing.
        toolsUsed: (c.tools_used ?? []).map(normalizeToolId).filter(Boolean),
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
      // Register/update all tools from graphEngine with real embeddings.
      // Since toolsUsed are normalized to short format (e.g. "std:psql_query"),
      // these will correctly match and update existing nodes from createSHGATFromCapabilities.
      const allNodeIds = this.deps.graphEngine.getGraph().nodes();
      // Filter out capability nodes — only register actual tools in SHGAT
      const graphToolIds = allNodeIds.filter((id: string) => !id.startsWith("capability:"));
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

}
