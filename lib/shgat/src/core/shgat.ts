/**
 * SHGAT (SuperHyperGraph Attention Networks)
 *
 * Implementation based on "SuperHyperGraph Attention Networks" research paper.
 * Key architecture:
 * - Multi-level message passing: V→E→...→V across hierarchy levels
 * - Incidence matrix A where A[v][e] = 1 if vertex v is in hyperedge e
 * - K-head attention (K=4-16, adaptive) with InfoNCE contrastive loss
 *
 * This file is the main orchestrator that delegates to specialized modules:
 * - graph/: Node registration and incidence matrix
 * - initialization/: Parameter initialization
 * - message-passing/: Multi-level message passing
 * - scoring/: K-head attention scoring
 * - training/: K-head training with PER and curriculum learning
 *
 * @module shgat
 */

import { getLogger } from "./logger.ts";

// Module imports
import {
  GraphBuilder,
  type HierarchyResult,
  type MultiLevelIncidence,
} from "../graph/mod.ts";
import {
  initializeParameters,
  type SHGATParams,
} from "../initialization/index.ts";
import {
  DEFAULT_V2V_PARAMS,
  MultiLevelOrchestrator,
  type CooccurrenceEntry,
  type V2VParams,
} from "../message-passing/index.ts";
import { computeFusionWeights } from "../training/v1-trainer.ts";

// K-head scoring functions (extracted)
import {
  projectIntent as projectIntentFn,
  scoreAllCapabilities as scoreAllCapabilitiesFn,
  scoreAllTools as scoreAllToolsFn,
  scoreNodes as scoreNodesFn,
  type NodeScore,
} from "../attention/khead-scorer.ts";

// Training functions (extracted)
import {
  trainBatchV1KHeadBatchedCore,
  type TrainingContext,
} from "../training/shgat-trainer.ts";

// Forward pass helpers (extracted)
import {
  forwardCore,
  type ForwardPassContext,
} from "./forward-helpers.ts";

// Serialization helpers (extracted)
import {
  exportSHGATParams,
  importSHGATParams,
  type SerializationContext,
} from "./serialization.ts";

// Scoring helpers (extracted)
import {
  getCapabilityToolAttention as getCapToolAttentionFn,
  predictPathSuccess as predictPathSuccessFn,
  computeAttentionForCapability,
  type ScoringContext,
} from "./scoring-helpers.ts";

// Hierarchy builder (extracted)
import { rebuildHierarchy as rebuildHierarchyFn } from "./hierarchy-builder.ts";

// Stats helper (extracted)
import { computeStats, type SHGATStats } from "./stats.ts";

// Re-export all types from ./shgat/types.ts for backward compatibility
export {
  type AttentionResult,
  buildGraph,
  type CapabilityNode,
  computeAllLevels,
  createDefaultTraceFeatures,
  DEFAULT_FEATURE_WEIGHTS,
  DEFAULT_FUSION_WEIGHTS,
  DEFAULT_HYPERGRAPH_FEATURES,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_TOOL_GRAPH_FEATURES,
  DEFAULT_TRACE_STATS,
  type FeatureWeights,
  type ForwardCache,
  type FusionWeights,
  getAdaptiveConfig,
  type HypergraphFeatures,
  type Node,
  NUM_TRACE_STATS,
  type SHGATConfig,
  type ToolGraphFeatures,
  type ToolNode,
  type TraceFeatures,
  type TraceStats,
  type TrainingExample,
} from "./types.ts";

// Export seeded RNG for reproducibility
export { seedRng } from "../initialization/parameters.ts";

// Export helper for generating tool embeddings
export { generateDefaultToolEmbedding } from "../graph/mod.ts";

import {
  type AttentionResult,
  type CapabilityNode,
  createMembersFromLegacy,
  DEFAULT_SHGAT_CONFIG,
  type ForwardCache,
  type FusionWeights,
  type HypergraphFeatures,
  type LevelParams,
  type Node,
  type SHGATConfig,
  type ToolGraphFeatures,
  type ToolNode,
  type TrainingExample,
} from "./types.ts";

// Auto-initialize BLAS acceleration on module load
import { initBlasAcceleration } from "../utils/math.ts";
await initBlasAcceleration();

const log = getLogger();

// ============================================================================
// SHGAT Implementation
// ============================================================================

/**
 * SuperHyperGraph Attention Networks
 *
 * Implements proper two-phase message passing:
 * 1. Vertex → Hyperedge: Aggregate tool features to capabilities
 * 2. Hyperedge → Vertex: Propagate capability features back to tools
 */
export class SHGAT {
  private config: SHGATConfig;
  private graphBuilder: GraphBuilder;
  private params: SHGATParams;
  private orchestrator: MultiLevelOrchestrator;
  private trainingMode = false;
  private lastCache: ForwardCache | null = null;
  private lastResidualCache: import("./forward-helpers.ts").ResidualCache | null = null;

  // Multi-level n-SuperHyperGraph structures
  private hierarchy: HierarchyResult | null = null;
  private multiLevelIncidence: MultiLevelIncidence | null = null;
  private levelParams: Map<number, LevelParams> = new Map();
  private hierarchyDirty = true; // Flag to rebuild hierarchy when graph changes

  // V→V trainable parameters (co-occurrence enrichment)
  private v2vParams: V2VParams = { ...DEFAULT_V2V_PARAMS };

  constructor(config: Partial<SHGATConfig> = {}) {
    this.config = { ...DEFAULT_SHGAT_CONFIG, ...config };

    // Note: preserveDim affects levelParams (message passing keeps 1024-dim)
    // hiddenDim = numHeads * 16 for K-head scoring (adaptive: 64, 128, etc.)
    // Each head gets 16 dims for consistent expressiveness

    this.graphBuilder = new GraphBuilder();
    // Pass v2vResidual to the V2V phase config
    const v2vConfig = this.config.v2vResidual !== undefined && this.config.v2vResidual > 0
      ? { residualWeight: this.config.v2vResidual }
      : undefined;
    this.orchestrator = new MultiLevelOrchestrator(this.trainingMode, v2vConfig);
    this.params = initializeParameters(this.config);
  }

  // ==========================================================================
  // Graph Management (delegated to GraphBuilder)
  // ==========================================================================

  /**
   * Register a unified node
   *
   * @param node Node to register
   */
  registerNode(node: Node): void {
    this.graphBuilder.registerNode(node);
    this.hierarchyDirty = true;
  }

  /**
   * Finalize node registration - call after registering all nodes
   * Rebuilds indices once for efficiency.
   */
  finalizeNodes(): void {
    this.graphBuilder.finalizeNodes();
    this.hierarchyDirty = true;
  }

  /**
   * Register a tool (vertex)
   * @deprecated Use registerNode() with children: [] instead
   */
  registerTool(node: ToolNode): void {
    this.graphBuilder.registerTool(node);
    this.hierarchyDirty = true;
  }

  /**
   * Register a capability (hyperedge)
   * @deprecated Use registerNode() with children: [...] instead
   */
  registerCapability(node: CapabilityNode): void {
    this.graphBuilder.registerCapability(node);
    this.hierarchyDirty = true;
  }

  /** Set V→V co-occurrence data for tool embedding enrichment */
  setCooccurrenceData(data: CooccurrenceEntry[]): void {
    this.orchestrator.setCooccurrenceData(data);
    log.info(`[SHGAT] V→V co-occurrence enabled with ${data.length} edges`);
  }

  /**
   * Get tool ID to index mapping for co-occurrence loader
   */
  getToolIndexMap(): Map<string, number> {
    return this.graphBuilder.getToolIndexMap();
  }

  /**
   * Rebuild multi-level hierarchy and incidence structures
   *
   * Called lazily before forward() when hierarchyDirty is true.
   */
  private rebuildHierarchy(): void {
    if (!this.hierarchyDirty) return;

    const result = rebuildHierarchyFn(this.config, this.graphBuilder, this.levelParams);
    this.hierarchy = result.hierarchy;
    this.multiLevelIncidence = result.multiLevelIncidence;
    this.levelParams = result.levelParams;
    this.hierarchyDirty = false;
  }

  /** @deprecated Use registerCapability() with members array */
  addCapabilityLegacy(
    id: string,
    embedding: number[],
    toolsUsed: string[],
    children: string[] = [],
    successRate: number = 0.5,
  ): void {
    const members = createMembersFromLegacy(toolsUsed, children);

    this.registerCapability({
      id,
      embedding,
      members,
      hierarchyLevel: 0, // Will be recomputed during rebuild
      toolsUsed, // Keep for backward compat
      children,
      successRate,
    });
  }

  hasToolNode(toolId: string): boolean { return this.graphBuilder.hasToolNode(toolId); }
  hasCapabilityNode(capabilityId: string): boolean { return this.graphBuilder.hasCapabilityNode(capabilityId); }
  getToolCount(): number { return this.graphBuilder.getToolCount(); }
  getCapabilityCount(): number { return this.graphBuilder.getCapabilityCount(); }
  getToolIds(): string[] { return this.graphBuilder.getToolIds(); }
  getCapabilityIds(): string[] { return this.graphBuilder.getCapabilityIds(); }

  buildFromData(
    tools: Array<{ id: string; embedding: number[] }>,
    capabilities: Array<{
      id: string;
      embedding: number[];
      toolsUsed: string[];
      successRate: number;
      parents?: string[];
      children?: string[];
    }>,
  ): void {
    this.graphBuilder.buildFromData({ tools, capabilities });
  }

  updateHypergraphFeatures(capabilityId: string, features: Partial<HypergraphFeatures>): void {
    this.graphBuilder.updateHypergraphFeatures(capabilityId, features);
  }
  updateToolFeatures(toolId: string, features: Partial<ToolGraphFeatures>): void {
    this.graphBuilder.updateToolFeatures(toolId, features);
  }
  batchUpdateFeatures(updates: Map<string, Partial<HypergraphFeatures>>): void {
    this.graphBuilder.batchUpdateCapabilityFeatures(updates);
  }
  batchUpdateToolFeatures(updates: Map<string, Partial<ToolGraphFeatures>>): void {
    this.graphBuilder.batchUpdateToolFeatures(updates);
  }

  // ==========================================================================
  // Multi-Level Message Passing (n-SuperHyperGraph)
  // ==========================================================================

  /** Execute multi-level message passing (V→E→...→V) */
  forward(): { H: number[][]; E: number[][]; cache: ForwardCache } {
    // Return cached result if graph hasn't changed
    if (!this.hierarchyDirty && this.lastCache) {
      const H = this.lastCache.H[this.lastCache.H.length - 1] ?? [];
      const E = this.lastCache.E[this.lastCache.E.length - 1] ?? [];
      return { H, E, cache: this.lastCache };
    }

    // Rebuild hierarchy if needed
    this.rebuildHierarchy();

    // Delegate to extracted core function
    const result = forwardCore(this.getForwardPassContext());
    this.lastCache = result.cache;
    this.lastResidualCache = result.residualCache;
    return result;
  }

  /** Get context for forward pass */
  private getForwardPassContext(): ForwardPassContext {
    return {
      config: this.config,
      graphBuilder: this.graphBuilder,
      hierarchy: this.hierarchy,
      multiLevelIncidence: this.multiLevelIncidence,
      levelParams: this.levelParams,
      orchestrator: this.orchestrator,
      residualLogits: this.params.residualLogits,
    };
  }

  /** Project intent embedding - delegated */
  private projectIntent(intentEmbedding: number[]): number[] {
    return projectIntentFn(intentEmbedding, this.params.W_intent);
  }

  // ==========================================================================
  // Scoring (K-head Attention)
  // ==========================================================================

  /** Score all capabilities using K-head attention after message passing */
  scoreAllCapabilities(intentEmbedding: number[], _contextToolIds?: string[]): AttentionResult[] {
    const { E } = this.forward();
    return scoreAllCapabilitiesFn(
      E,
      intentEmbedding,
      this.graphBuilder.getCapabilityNodes(),
      this.params.headParams,
      this.params.W_intent,
      this.config,
      (capIdx) => this.getCapabilityToolAttention(capIdx),
    );
  }

  scoreAllTools(
    intentEmbedding: number[],
    _contextToolIds?: string[],
  ): Array<{ toolId: string; score: number; headScores: number[] }> {
    const { H } = this.forward();
    const toolIds = Array.from(this.graphBuilder.getToolNodes().keys());
    return scoreAllToolsFn(
      H,
      intentEmbedding,
      toolIds,
      this.params.headParams,
      this.params.W_intent,
      this.config,
    );
  }

  // ==========================================================================
  // Unified Node Scoring (new API)
  // ==========================================================================

  /**
   * Score nodes using K-head attention (unified API)
   *
   * This is the main scoring function for the unified Node API.
   * It replaces the legacy scoreAllCapabilities/scoreAllTools for new code.
   *
   * @param intentEmbedding - User intent embedding
   * @param level - Optional level filter. If undefined, scores all nodes.
   * @returns Sorted array of node scores
   */
  scoreNodes(intentEmbedding: number[], level?: number): NodeScore[] {
    // Run forward pass to get propagated embeddings
    this.forward();

    // Get nodes (optionally filtered by level)
    const nodes = level !== undefined
      ? this.graphBuilder.getNodesByLevel(level)
      : Array.from(this.graphBuilder.getNodes().values());

    if (nodes.length === 0) return [];

    // Build embedding matrix and metadata arrays
    const embeddings: number[][] = [];
    const nodeIds: string[] = [];
    const levels: number[] = [];

    // Get propagated embeddings from cache
    const H = this.lastCache?.H[this.lastCache.H.length - 1] ?? [];
    const E = this.lastCache?.E[this.lastCache.E.length - 1] ?? [];

    for (const node of nodes) {
      if (node.children.length === 0) {
        // Leaf node - get from H (tool embeddings)
        const idx = this.graphBuilder.getToolIndex(node.id);
        if (idx !== undefined && H[idx]) {
          embeddings.push(H[idx]);
          nodeIds.push(node.id);
          levels.push(node.level);
        }
      } else {
        // Composite node - get from E (capability embeddings)
        const idx = this.graphBuilder.getCapabilityIndex(node.id);
        if (idx !== undefined && E[idx]) {
          embeddings.push(E[idx]);
          nodeIds.push(node.id);
          levels.push(node.level);
        }
      }
    }

    if (embeddings.length === 0) return [];

    return scoreNodesFn(
      embeddings,
      nodeIds,
      levels,
      intentEmbedding,
      this.params.headParams,
      this.params.W_intent,
      this.config,
    );
  }

  /**
   * Score only leaf nodes (level 0)
   *
   * Convenience method equivalent to scoreNodes(intent, 0)
   */
  scoreLeaves(intentEmbedding: number[]): NodeScore[] {
    return this.scoreNodes(intentEmbedding, 0);
  }

  /**
   * Score only composite nodes at a given level (default: 1)
   *
   * Convenience method for scoring higher-level nodes
   */
  scoreComposites(intentEmbedding: number[], level: number = 1): NodeScore[] {
    return this.scoreNodes(intentEmbedding, level);
  }

  predictPathSuccess(intentEmbedding: number[], path: string[]): number {
    return predictPathSuccessFn(this.getScoringContext(), intentEmbedding, path);
  }

  computeAttention(
    intentEmbedding: number[],
    _contextToolEmbeddings: number[][],
    capabilityId: string,
    _contextCapabilityIds?: string[],
  ): AttentionResult {
    return computeAttentionForCapability(this.getScoringContext(), intentEmbedding, capabilityId);
  }

  /** Get scoring context for extracted scoring functions */
  private getScoringContext(): ScoringContext {
    return {
      config: this.config,
      graphBuilder: this.graphBuilder,
      lastCache: this.lastCache,
      scoreAllCapabilities: (e) => this.scoreAllCapabilities(e),
      scoreAllTools: (e) => this.scoreAllTools(e),
    };
  }

  private getCapabilityToolAttention(capIdx: number): number[] {
    return getCapToolAttentionFn(this.getScoringContext(), capIdx);
  }

  // ==========================================================================
  // Training (delegated to extracted functions)
  // ==========================================================================

  /** Get training context for extracted training functions */
  private getTrainingContext(): TrainingContext {
    return {
      config: this.config,
      params: this.params,
      levelParams: this.levelParams,
      v2vParams: this.v2vParams,
      graphBuilder: this.graphBuilder,
      hierarchy: this.hierarchy,
      multiLevelIncidence: this.multiLevelIncidence,
      forward: () => this.forward(),
      projectIntent: (e) => this.projectIntent(e),
      rebuildHierarchy: () => this.rebuildHierarchy(),
      getResidualCache: () => this.lastResidualCache,
    };
  }

  /** Batched K-head training - ~10x faster via single forward pass + BLAS ops */
  trainBatchV1KHeadBatched(examples: TrainingExample[], isWeights?: number[], evaluateOnly = false, temperature = 0.1) {
    if (examples.length === 0) return { loss: 0, accuracy: 0, tdErrors: [] as number[], gradNorm: 0 };

    this.trainingMode = true;
    // Pass v2vResidual to the V2V phase config
    const v2vConfig = this.config.v2vResidual !== undefined && this.config.v2vResidual > 0
      ? { residualWeight: this.config.v2vResidual }
      : undefined;
    this.orchestrator = new MultiLevelOrchestrator(true, v2vConfig);
    const weights = isWeights ?? new Array(examples.length).fill(1.0);

    const result = trainBatchV1KHeadBatchedCore(
      this.getTrainingContext(),
      examples,
      weights,
      this.orchestrator,
      evaluateOnly,
      temperature,
    );

    // Note: Backward pass for learnable per-level residuals is now handled
    // inside trainBatchV1KHeadBatchedCore via ctx.getResidualCache()

    this.trainingMode = false;

    // CRITICAL: Invalidate cache after training so scoreNodes() recalculates
    // forward pass with updated weights (W_q, W_k, etc.)
    if (!evaluateOnly) {
      this.lastCache = null;
    }

    return result;
  }

  // ==========================================================================
  // Serialization (delegated)
  // ==========================================================================

  exportParams(): Record<string, unknown> {
    return exportSHGATParams(this.getSerializationContext());
  }

  importParams(serialized: Record<string, unknown>): void {
    const result = importSHGATParams(serialized, this.params, this.v2vParams);
    if (result.config) this.config = result.config;
    this.params = result.params;
    if (result.levelParams.size > 0) this.levelParams = result.levelParams;
    this.v2vParams = result.v2vParams;
  }

  /** Get serialization context */
  private getSerializationContext(): SerializationContext {
    return {
      config: this.config,
      params: this.params,
      levelParams: this.levelParams,
      v2vParams: this.v2vParams,
    };
  }

  // ==========================================================================
  // Accessors & Utilities
  // ==========================================================================

  getFusionWeights() { return computeFusionWeights(this.params.fusionWeights, this.config.headFusionWeights); }
  setFusionWeights(weights: Partial<FusionWeights>): void {
    Object.assign(this.params.fusionWeights, weights);
  }
  getLearningRate(): number { return this.config.learningRate; }
  setLearningRate(lr: number): void { this.config.learningRate = lr; }

  /** @deprecated Use getToolIds() */
  getRegisteredToolIds(): string[] { return this.getToolIds(); }

  /** @deprecated Use getCapabilityIds() */
  getRegisteredCapabilityIds(): string[] { return this.getCapabilityIds(); }

  /** Get all tool embeddings for negative sampling */
  getToolEmbeddings(): Map<string, number[]> {
    return new Map(
      Array.from(this.graphBuilder.getToolNodes())
        .filter(([, t]) => t.embedding)
        .map(([id, t]) => [id, t.embedding!]),
    );
  }

  getStats(): SHGATStats {
    return computeStats({
      config: this.config,
      graphBuilder: this.graphBuilder,
      getFusionWeights: () => this.getFusionWeights(),
    });
  }
}

// ============================================================================
// Factory Functions (re-exported from factory.ts)
// ============================================================================

export {
  createSHGAT,
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
  trainSHGATOnEpisodesKHead,
  trainSHGATOnExecution,
} from "./factory.ts";
