/**
 * DAG Suggester
 *
 * Combines vector search and graph algorithms to suggest optimal DAG structures
 * for workflow execution.
 *
 * @module graphrag/dag-suggester
 */

import * as log from "@std/log";
import type { VectorSearch } from "../vector/search.ts";
import type { GraphRAGEngine } from "./graph-engine.ts";
import type { EpisodicMemoryStore } from "../learning/episodic-memory-store.ts";
import type { CapabilityMatcher } from "../capabilities/matcher.ts";
import type { CapabilityMatch } from "../capabilities/types.ts";
import type {
  CompletedTask,
  DAGStructure,
  DependencyPath,
  PredictedNode,
  SuggestedDAG,
  WorkflowIntent,
  WorkflowPredictionState,
} from "./types.ts";

/**
 * DAG Suggester
 *
 * Orchestrates vector search for semantic candidate selection and graph algorithms
 * for dependency inference and DAG construction.
 */
export class DAGSuggester {
  private episodicMemory: EpisodicMemoryStore | null = null; // Story 4.1e - Episodic memory integration
  private capabilityMatcher: CapabilityMatcher | null = null; // Story 7.3a - Capability matching

  constructor(
    private graphEngine: GraphRAGEngine,
    private vectorSearch: VectorSearch,
    capabilityMatcher?: CapabilityMatcher,
  ) {
    this.capabilityMatcher = capabilityMatcher || null;
  }

  /**
   * Get GraphRAGEngine instance for feedback loop (Story 2.5-3 Task 4)
   *
   * Exposes GraphRAGEngine to allow ControlledExecutor to call
   * updateFromExecution() after workflow completion.
   *
   * @returns GraphRAGEngine instance
   */
  getGraphEngine(): GraphRAGEngine {
    return this.graphEngine;
  }

  /**
   * Set episodic memory store for learning-enhanced predictions (Story 4.1e)
   *
   * Enables DAGSuggester to query historical episodes and adjust confidence
   * based on past success/failure patterns. Optional dependency with graceful
   * degradation when not set.
   *
   * @param store - EpisodicMemoryStore instance
   */
  setEpisodicMemoryStore(store: EpisodicMemoryStore): void {
    this.episodicMemory = store;
    log.debug("[DAGSuggester] Episodic memory enabled for learning-enhanced predictions");
  }

  /**
   * Set capability matcher (Story 7.3a)
   *
   * Allows injecting matcher after construction if needed.
   *
   * @param matcher - CapabilityMatcher instance
   */
  setCapabilityMatcher(matcher: CapabilityMatcher): void {
    this.capabilityMatcher = matcher;
    log.debug("[DAGSuggester] Capability matching enabled");
  }

  /**
   * Search for capabilities matching an intent (Active Search - Story 7.3a)
   *
   * Delegates to CapabilityMatcher helper for logic (Semantic * Reliability).
   *
   * @param intent - User intent
   * @returns Best capability match or null
   */
  async searchCapabilities(intent: string): Promise<CapabilityMatch | null> {
    if (!this.capabilityMatcher) {
      log.debug("[DAGSuggester] searchCapabilities called but CapabilityMatcher not configured");
      return null;
    }
    return await this.capabilityMatcher.findMatch(intent);
  }

  /**
   * Suggest DAG structure for a given workflow intent (ADR-022: Hybrid Search)
   *
   * Process:
   * 1. Hybrid search for candidates (semantic + graph relatedness)
   * 2. Rank by finalScore (already combines semantic + graph)
   * 3. Boost by PageRank for importance
   * 4. Build DAG using graph topology
   * 5. Calculate confidence score
   * 6. Find alternative tools from same community
   *
   * @param intent - Workflow intent with natural language description
   * @returns Suggested DAG with confidence, rationale, and alternatives, or null if confidence too low
   */
  async suggestDAG(intent: WorkflowIntent): Promise<SuggestedDAG | null> {
    try {
      // ADR-022: Use hybrid search (semantic + graph) instead of pure vector search
      // This helps discover intermediate tools that are logically necessary but not
      // explicitly mentioned in the intent (e.g., finding npm_install between git_clone and deploy)
      const contextTools = intent.toolsConsidered || [];
      const hybridCandidates = await this.graphEngine.searchToolsHybrid(
        this.vectorSearch,
        intent.text,
        10, // top-10 candidates
        contextTools,
        false, // no related tools needed here
      );

      if (hybridCandidates.length === 0) {
        log.info(`No candidates found for intent: "${intent.text}"`);
        return null;
      }

      // 2. Rank by hybrid finalScore + PageRank boost
      const rankedCandidates = hybridCandidates
        .map((c) => ({
          toolId: c.toolId,
          serverId: c.serverId,
          toolName: c.toolName,
          score: c.finalScore, // Use hybrid finalScore as base
          semanticScore: c.semanticScore,
          graphScore: c.graphScore,
          pageRank: this.graphEngine.getPageRank(c.toolId),
          schema: c.schema,
        }))
        // Combine finalScore with PageRank: 80% finalScore + 20% PageRank
        .map((c) => ({
          ...c,
          combinedScore: c.score * 0.8 + c.pageRank * 0.2,
        }))
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, 5);

      log.debug(
        `Ranked candidates (hybrid+PageRank): ${
          rankedCandidates.map((c) =>
            `${c.toolId} (final=${c.score.toFixed(2)}, PR=${c.pageRank.toFixed(3)})`
          ).join(", ")
        }`,
      );

      // 3. Build DAG using graph topology (Graphology)
      const dagStructure = this.graphEngine.buildDAG(
        rankedCandidates.map((c) => c.toolId),
      );

      // 4. Extract dependency paths for explainability
      const dependencyPaths = this.extractDependencyPaths(rankedCandidates.map((c) => c.toolId));

      // 5. Calculate confidence (adjusted for hybrid search)
      const { confidence, semanticScore, pageRankScore, pathStrength } = this
        .calculateConfidenceHybrid(
          rankedCandidates,
          dependencyPaths,
        );

      log.info(
        `Confidence: ${confidence.toFixed(2)} (semantic: ${semanticScore.toFixed(2)}, pageRank: ${
          pageRankScore.toFixed(2)
        }, pathStrength: ${pathStrength.toFixed(2)}) for intent: "${intent.text}"`,
      );

      // 6. Find alternatives from same community (Graphology)
      const alternatives = this.graphEngine
        .findCommunityMembers(rankedCandidates[0].toolId)
        .slice(0, 3);

      // 7. Generate rationale (updated for hybrid)
      const rationale = this.generateRationaleHybrid(rankedCandidates, dependencyPaths);

      // ADR-026: Never return null if we have valid candidates
      // Instead, return suggestion with warning for low confidence
      if (confidence < 0.50) {
        log.info(
          `Confidence below threshold (${
            confidence.toFixed(2)
          }), returning suggestion with warning`,
        );
        return {
          dagStructure,
          confidence,
          rationale,
          dependencyPaths,
          alternatives,
          warning:
            "Low confidence suggestion - graph is in cold start mode. Confidence may improve with usage.",
        };
      }

      return {
        dagStructure,
        confidence,
        rationale,
        dependencyPaths,
        alternatives,
      };
    } catch (error) {
      log.error(`DAG suggestion failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract dependency paths for explainability
   *
   * Finds paths between tools and generates explanations for dependencies.
   *
   * @param toolIds - Array of tool IDs in the DAG
   * @returns Array of dependency paths with explanations
   */
  private extractDependencyPaths(toolIds: string[]): DependencyPath[] {
    const paths: DependencyPath[] = [];

    for (let i = 0; i < toolIds.length; i++) {
      for (let j = 0; j < i; j++) {
        const fromTool = toolIds[j];
        const toTool = toolIds[i];

        const path = this.graphEngine.findShortestPath(fromTool, toTool);

        if (path && path.length <= 4) {
          paths.push({
            from: fromTool,
            to: toTool,
            path: path,
            hops: path.length - 1,
            explanation: this.explainPath(path),
            confidence: this.calculatePathConfidence(path.length),
          });
        }
      }
    }

    return paths;
  }

  /**
   * Explain a dependency path
   *
   * @param path - Array of tool IDs representing the path
   * @returns Human-readable explanation
   */
  private explainPath(path: string[]): string {
    if (path.length === 2) {
      return `Direct dependency: ${path[0]} → ${path[1]}`;
    } else {
      const intermediate = path.slice(1, -1).join(" → ");
      return `Transitive: ${path[0]} → ${intermediate} → ${path[path.length - 1]}`;
    }
  }

  /**
   * Calculate path confidence based on hop count
   *
   * Direct paths (1 hop) have highest confidence, decreasing with distance.
   *
   * @param hops - Number of hops in the path
   * @returns Confidence score between 0 and 1
   */
  private calculatePathConfidence(hops: number): number {
    if (hops === 1) return 0.95;
    if (hops === 2) return 0.80;
    if (hops === 3) return 0.65;
    return 0.50;
  }

  // =============================================================================
  // Story 5.2 / ADR-022: Hybrid Search Support Methods
  // =============================================================================
  // NOTE: Legacy calculateConfidence() and generateRationale() removed (ADR-022)
  // Use calculateConfidenceHybrid() and generateRationaleHybrid() instead

  /**
   * Get adaptive weights for confidence calculation based on graph density (ADR-026)
   *
   * In cold start (sparse graph), semantic search is more reliable than graph metrics.
   * As the graph matures with more edges, PageRank and paths become more meaningful.
   *
   * Density thresholds:
   * - <0.01 (cold start): Trust semantic heavily (85%)
   * - <0.10 (growing): Balanced approach (65%)
   * - >=0.10 (mature): Full graph integration (55%)
   *
   * @returns Weight configuration for confidence calculation
   */
  private getAdaptiveWeights(): { hybrid: number; pageRank: number; path: number } {
    const density = this.graphEngine.getGraphDensity();

    if (density < 0.01) {
      // Cold start: trust semantic heavily, minimal weight on empty graph metrics
      log.debug(`[DAGSuggester] Cold start weights (density=${density.toFixed(4)})`);
      return { hybrid: 0.85, pageRank: 0.05, path: 0.10 };
    } else if (density < 0.10) {
      // Growing graph: balanced approach
      log.debug(`[DAGSuggester] Growing graph weights (density=${density.toFixed(4)})`);
      return { hybrid: 0.65, pageRank: 0.20, path: 0.15 };
    } else {
      // Mature graph: current formula (original ADR-022)
      log.debug(`[DAGSuggester] Mature graph weights (density=${density.toFixed(4)})`);
      return { hybrid: 0.55, pageRank: 0.30, path: 0.15 };
    }
  }

  /**
   * Calculate confidence for hybrid search candidates (ADR-022, ADR-026)
   *
   * Uses the already-computed hybrid finalScore which includes both semantic and graph scores.
   * This provides a more accurate confidence since graph context is already factored in.
   *
   * ADR-026: Uses adaptive weights based on graph density to handle cold start better.
   *
   * @param candidates - Ranked candidates with hybrid scores
   * @param dependencyPaths - Extracted dependency paths
   * @returns Confidence breakdown
   */
  private calculateConfidenceHybrid(
    candidates: Array<{
      score: number;
      semanticScore: number;
      graphScore: number;
      pageRank: number;
      combinedScore: number;
    }>,
    dependencyPaths: DependencyPath[],
  ): { confidence: number; semanticScore: number; pageRankScore: number; pathStrength: number } {
    if (candidates.length === 0) {
      return { confidence: 0, semanticScore: 0, pageRankScore: 0, pathStrength: 0 };
    }

    // Use the hybrid finalScore as base (already includes semantic + graph)
    const hybridScore = candidates[0].score;
    const semanticScore = candidates[0].semanticScore;

    // PageRank score (average of top 3)
    const pageRankScore = candidates.slice(0, 3).reduce((sum, c) => sum + c.pageRank, 0) /
      Math.min(3, candidates.length);

    // Path strength (average confidence of all paths)
    const pathStrength = dependencyPaths.length > 0
      ? dependencyPaths.reduce((sum, p) => sum + (p.confidence || 0.5), 0) / dependencyPaths.length
      : 0.5;

    // ADR-026: Use adaptive weights based on graph density
    const weights = this.getAdaptiveWeights();
    const confidence = hybridScore * weights.hybrid + pageRankScore * weights.pageRank +
      pathStrength * weights.path;

    return { confidence, semanticScore, pageRankScore, pathStrength };
  }

  /**
   * Generate rationale for hybrid search candidates (ADR-022)
   *
   * Includes both semantic and graph contributions in the explanation.
   *
   * @param candidates - Ranked candidates with hybrid scores
   * @param dependencyPaths - Extracted dependency paths
   * @returns Rationale text
   */
  private generateRationaleHybrid(
    candidates: Array<{
      toolId: string;
      score: number;
      semanticScore: number;
      graphScore: number;
      pageRank: number;
    }>,
    dependencyPaths: DependencyPath[],
  ): string {
    const topTool = candidates[0];
    const parts: string[] = [];

    // Hybrid match (main score)
    parts.push(`Based on hybrid search (${(topTool.score * 100).toFixed(0)}%)`);

    // Semantic contribution
    if (topTool.semanticScore > 0) {
      parts.push(`semantic: ${(topTool.semanticScore * 100).toFixed(0)}%`);
    }

    // Graph contribution
    if (topTool.graphScore > 0) {
      parts.push(`graph: ${(topTool.graphScore * 100).toFixed(0)}%`);
    }

    // PageRank importance
    if (topTool.pageRank > 0.01) {
      parts.push(`PageRank: ${(topTool.pageRank * 100).toFixed(1)}%`);
    }

    // Dependency paths
    if (dependencyPaths.length > 0) {
      const directDeps = dependencyPaths.filter((p) => p.hops === 1).length;
      parts.push(`${dependencyPaths.length} deps (${directDeps} direct)`);
    }

    return parts.join(", ") + ".";
  }

  /**
   * Replan DAG by incorporating new tools from GraphRAG (Story 2.5-3 Task 3)
   *
   * Called during runtime when agent discovers new requirements.
   * Queries GraphRAG for relevant tools and merges them into existing DAG.
   *
   * Flow:
   * 1. Query GraphRAG vector search for new requirement
   * 2. Rank tools by PageRank importance
   * 3. Build new DAG nodes from top-k tools
   * 4. Merge with existing DAG (preserve completed layers)
   * 5. Validate no cycles introduced
   *
   * Performance target: <200ms P95
   *
   * @param currentDAG - Current DAG structure
   * @param context - Replanning context (completed tasks, new requirement, etc.)
   * @returns Augmented DAG structure with new nodes
   */
  async replanDAG(
    currentDAG: DAGStructure,
    context: {
      completedTasks: Array<{ taskId: string; status: string }>;
      newRequirement: string;
      availableContext: Record<string, unknown>;
    },
  ): Promise<DAGStructure> {
    const startTime = performance.now();

    try {
      log.info(
        `Replanning DAG with new requirement: "${context.newRequirement}"`,
      );

      // 1. Query GraphRAG vector search for relevant tools
      const candidates = await this.vectorSearch.searchTools(
        context.newRequirement,
        5, // Top-5 candidates
        0.5, // Lower threshold for replanning (more permissive)
      );

      if (candidates.length === 0) {
        log.warn("No relevant tools found for replanning requirement");
        // Return current DAG unchanged
        return currentDAG;
      }

      // 2. Rank by PageRank importance
      const rankedCandidates = candidates
        .map((c) => ({
          ...c,
          pageRank: this.graphEngine.getPageRank(c.toolId),
        }))
        .sort((a, b) => b.pageRank - a.pageRank)
        .slice(0, 3); // Top-3 for replanning

      log.debug(
        `Ranked replan candidates: ${
          rankedCandidates.map((c) => `${c.toolId} (PR: ${c.pageRank.toFixed(3)})`).join(", ")
        }`,
      );

      // 3. Build new tasks from candidates
      const existingTaskIds = currentDAG.tasks.map((t) => t.id);
      const newTasks = rankedCandidates.map((candidate, idx) => {
        const newTaskId = `replan_task_${existingTaskIds.length + idx}`;

        // Infer dependencies from context (completed tasks provide outputs)
        const dependsOn: string[] = [];

        // Simple heuristic: new tasks depend on last successful task
        const lastSuccessfulTask = context.completedTasks
          .filter((t) => t.status === "success")
          .slice(-1)[0];

        if (lastSuccessfulTask) {
          dependsOn.push(lastSuccessfulTask.taskId);
        }

        return {
          id: newTaskId,
          tool: candidate.toolId,
          arguments: context.availableContext || {},
          dependsOn: dependsOn,
        };
      });

      // 4. Merge new tasks with existing DAG
      const augmentedDAG: DAGStructure = {
        tasks: [...currentDAG.tasks, ...newTasks],
      };

      // 5. Validate no cycles introduced
      // Simple cycle detection: topological sort should succeed
      try {
        this.validateDAGNoCycles(augmentedDAG);
      } catch (error) {
        log.error(`Cycle detected in replanned DAG: ${error}`);
        // Reject replan, return original DAG
        return currentDAG;
      }

      const replanTime = performance.now() - startTime;
      log.info(
        `✓ DAG replanned: added ${newTasks.length} new tasks (${replanTime.toFixed(1)}ms)`,
      );

      return augmentedDAG;
    } catch (error) {
      log.error(`DAG replanning failed: ${error}`);
      // Graceful degradation: return current DAG unchanged
      return currentDAG;
    }
  }

  // =============================================================================
  // Story 3.5-1: Speculative Execution - predictNextNodes()
  // =============================================================================

  /**
   * Dangerous operations blacklist - never speculate on these (ADR-006)
   */
  private static readonly DANGEROUS_OPERATIONS = [
    "delete",
    "remove",
    "deploy",
    "payment",
    "send_email",
    "execute_shell",
    "drop",
    "truncate",
    "transfer",
    "admin",
  ];

  /**
   * Predict next likely tools based on workflow state (Story 3.5-1)
   *
   * Uses GraphRAG community detection, co-occurrence patterns, and PageRank
   * to predict which tools are likely to be requested next.
   *
   * Process:
   * 1. Get last completed tool from workflow state
   * 2. Query community members (Louvain algorithm)
   * 3. Query outgoing edges (co-occurrence patterns)
   * 4. Calculate confidence scores using:
   *    - Edge weight (historical co-occurrence)
   *    - PageRank (tool importance)
   *    - Observation count (pattern frequency)
   * 5. Filter dangerous operations
   * 6. Return sorted predictions
   *
   * Performance target: <50ms (AC #10)
   *
   * @param workflowState - Current workflow state with completed tasks
   * @param completedTasks - Alternative: Array of completed tasks
   * @returns Sorted array of predicted nodes (highest confidence first)
   */
  async predictNextNodes(
    workflowState: WorkflowPredictionState | null,
    completedTasks?: CompletedTask[],
  ): Promise<PredictedNode[]> {
    const startTime = performance.now();

    try {
      // 1. Get completed tasks from either source
      const tasks = workflowState?.completedTasks ?? completedTasks ?? [];

      if (tasks.length === 0) {
        log.debug("[predictNextNodes] No completed tasks, returning empty predictions");
        return [];
      }

      // 2. Get last successful completed tool
      const successfulTasks = tasks.filter((t) => t.status === "success");
      if (successfulTasks.length === 0) {
        log.debug("[predictNextNodes] No successful tasks, returning empty predictions");
        return [];
      }

      const lastTask = successfulTasks[successfulTasks.length - 1];
      const lastToolId = lastTask.tool;

      log.debug(`[predictNextNodes] Predicting next tools after: ${lastToolId}`);

      // Story 4.1e: Retrieve relevant historical episodes for learning-enhanced predictions
      const episodes = await this.retrieveRelevantEpisodes(workflowState);
      const episodeStats = this.parseEpisodeStatistics(episodes);

      if (episodeStats.size > 0) {
        log.debug(
          `[predictNextNodes] Loaded episode statistics for ${episodeStats.size} tools from ${episodes.length} episodes`,
        );
      }

      const predictions: PredictedNode[] = [];
      const seenTools = new Set<string>();

      // Exclude tools already executed in this workflow
      const executedTools = new Set(tasks.map((t) => t.tool));

      // 3. Query community members (Louvain algorithm)
      const communityMembers = this.graphEngine.findCommunityMembers(lastToolId);
      for (const memberId of communityMembers.slice(0, 5)) {
        if (seenTools.has(memberId) || executedTools.has(memberId)) continue;
        if (this.isDangerousOperation(memberId)) continue;

        const pageRank = this.graphEngine.getPageRank(memberId);
        const baseConfidence = this.calculateCommunityConfidence(memberId, lastToolId, pageRank);

        // Story 4.1e: Apply episodic learning adjustments
        const adjusted = this.adjustConfidenceFromEpisodes(baseConfidence, memberId, episodeStats);
        if (!adjusted) continue; // Excluded due to high failure rate

        predictions.push({
          toolId: memberId,
          confidence: adjusted.confidence,
          reasoning: `Same community as ${lastToolId} (PageRank: ${(pageRank * 100).toFixed(1)}%)`,
          source: "community",
        });
        seenTools.add(memberId);
      }

      // 4. Query outgoing edges (co-occurrence patterns)
      const neighbors = this.graphEngine.getNeighbors(lastToolId, "out");
      for (const neighborId of neighbors) {
        if (seenTools.has(neighborId) || executedTools.has(neighborId)) continue;
        if (this.isDangerousOperation(neighborId)) continue;

        const edgeData = this.graphEngine.getEdgeData(lastToolId, neighborId);

        // Calculate Recency Boost (Story 7.4 - ADR-038)
        // Check if tool was used in recent tasks of this workflow
        const recencyBoost = executedTools.has(neighborId) ? 0.10 : 0.0;

        const baseConfidence = this.calculateCooccurrenceConfidence(edgeData, recencyBoost);

        // Story 4.1e: Apply episodic learning adjustments
        const adjusted = this.adjustConfidenceFromEpisodes(
          baseConfidence,
          neighborId,
          episodeStats,
        );
        if (!adjusted) continue; // Excluded due to high failure rate

        predictions.push({
          toolId: neighborId,
          confidence: adjusted.confidence,
          reasoning: `Historical co-occurrence (60%) + Community (30%) + Recency (${
            (recencyBoost * 100).toFixed(0)
          }%)`,
          source: "co-occurrence",
        });
        seenTools.add(neighborId);
      }

      // NOTE: Adamic-Adar (2-hop) removed for passive suggestion (ADR-038)
      // It is too slow for this scope and dilutes the signal.
      // Kept for Active Hybrid Search only.

      // 6. Sort by confidence (descending)
      predictions.sort((a, b) => b.confidence - a.confidence);

      const elapsedMs = performance.now() - startTime;
      log.info(
        `[predictNextNodes] Generated ${predictions.length} predictions for ${lastToolId} (${
          elapsedMs.toFixed(1)
        }ms)`,
      );

      // Log top predictions
      if (predictions.length > 0) {
        const top3 = predictions.slice(0, 3).map((p) => `${p.toolId}:${p.confidence.toFixed(2)}`);
        log.debug(`[predictNextNodes] Top predictions: ${top3.join(", ")}`);
      }

      return predictions;
    } catch (error) {
      log.error(`[predictNextNodes] Failed: ${error}`);
      return [];
    }
  }

  /**
   * Check if a tool is a dangerous operation (never speculate)
   *
   * @param toolId - Tool identifier to check
   * @returns true if tool is dangerous
   */
  private isDangerousOperation(toolId: string): boolean {
    const lowerToolId = toolId.toLowerCase();
    return DAGSuggester.DANGEROUS_OPERATIONS.some((op) => lowerToolId.includes(op));
  }

  /**
   * Generate context hash for episodic memory retrieval (Story 4.1e)
   *
   * Consistent with EpisodicMemoryStore.hashContext() pattern.
   * Hash includes workflow type, domain, and complexity for context matching.
   *
   * @param workflowState - Current workflow state
   * @returns Context hash string
   */
  private getContextHash(workflowState: WorkflowPredictionState | null): string {
    if (!workflowState) return "no-state";

    // Extract from context field or use defaults
    const ctx = workflowState.context || {};
    const workflowType = (ctx.workflowType as string) || "unknown";
    const domain = (ctx.domain as string) || "general";
    const complexity = workflowState.completedTasks?.length.toString() || "0";

    return `workflowType:${workflowType}|domain:${domain}|complexity:${complexity}`;
  }

  /**
   * Retrieve relevant historical episodes for context (Story 4.1e Task 2)
   *
   * Queries episodic memory for similar past workflows based on context hash.
   * Returns empty array if episodic memory not configured (graceful degradation).
   *
   * @param workflowState - Current workflow state
   * @returns Array of relevant episodic events
   */
  private async retrieveRelevantEpisodes(
    workflowState: WorkflowPredictionState | null,
  ): Promise<
    Array<{
      id: string;
      event_type: string;
      data: {
        prediction?: { toolId: string; confidence: number; wasCorrect?: boolean };
        result?: { status: string };
      };
    }>
  > {
    if (!this.episodicMemory || !workflowState) return [];

    const startTime = performance.now();
    const contextHash = this.getContextHash(workflowState);

    try {
      const ctx = workflowState.context || {};
      const context = {
        workflowType: (ctx.workflowType as string) || "unknown",
        domain: (ctx.domain as string) || "general",
        complexity: workflowState.completedTasks?.length.toString() || "0",
      };

      const episodes = await this.episodicMemory.retrieveRelevant(context, {
        limit: 10,
        eventTypes: ["speculation_start", "task_complete"],
      });

      const retrievalTime = performance.now() - startTime;
      log.debug(
        `[DAGSuggester] Retrieved ${episodes.length} episodes for context ${contextHash} (${
          retrievalTime.toFixed(1)
        }ms)`,
      );

      return episodes;
    } catch (error) {
      log.error(`[DAGSuggester] Episode retrieval failed: ${error}`);
      return [];
    }
  }

  /**
   * Parse episodes to extract success/failure statistics per tool (Story 4.1e Task 2.3)
   *
   * Analyzes historical episodes to compute success rates for each tool.
   *
   * @param episodes - Retrieved episodic events
   * @returns Map of toolId to episode statistics
   */
  private parseEpisodeStatistics(
    episodes: Array<{
      id: string;
      event_type: string;
      data: {
        prediction?: { toolId: string; confidence: number; wasCorrect?: boolean };
        result?: { status: string };
      };
    }>,
  ): Map<
    string,
    {
      total: number;
      successes: number;
      failures: number;
      successRate: number;
      failureRate: number;
    }
  > {
    const stats = new Map<
      string,
      {
        total: number;
        successes: number;
        failures: number;
        successRate: number;
        failureRate: number;
      }
    >();

    for (const episode of episodes) {
      let toolId: string | undefined;
      let success = false;

      // Extract toolId and outcome from different event types
      if (episode.event_type === "speculation_start" && episode.data.prediction) {
        toolId = episode.data.prediction.toolId;
        success = episode.data.prediction.wasCorrect === true;
      } else if (episode.event_type === "task_complete" && episode.data.result) {
        // For task_complete events, we'd need task_id mapped to toolId (simplified here)
        // In practice, you might need to correlate with speculation_start events
        continue; // Skip for now, focus on speculation_start
      }

      if (!toolId) continue;

      const current = stats.get(toolId) || {
        total: 0,
        successes: 0,
        failures: 0,
        successRate: 0,
        failureRate: 0,
      };

      current.total++;
      if (success) {
        current.successes++;
      } else {
        current.failures++;
      }

      current.successRate = current.total > 0 ? current.successes / current.total : 0;
      current.failureRate = current.total > 0 ? current.failures / current.total : 0;

      stats.set(toolId, current);
    }

    return stats;
  }

  /**
   * Adjust confidence based on episodic memory patterns (Story 4.1e Tasks 3 & 4)
   *
   * Applies confidence boost for successful patterns and penalty for failures.
   * Returns null if tool should be excluded due to high failure rate.
   *
   * Algorithm (from Dev Notes):
   * - Boost: min(0.15, successRate * 0.20)
   * - Penalty: min(0.15, failureRate * 0.25)
   * - Exclusion: failureRate > 0.50 → exclude entirely
   *
   * @param baseConfidence - Base confidence from graph patterns
   * @param toolId - Tool being predicted
   * @param episodeStats - Episode statistics map
   * @returns Adjusted confidence (0-1) or null if excluded
   */
  private adjustConfidenceFromEpisodes(
    baseConfidence: number,
    toolId: string,
    episodeStats: Map<
      string,
      {
        total: number;
        successes: number;
        failures: number;
        successRate: number;
        failureRate: number;
      }
    >,
  ): { confidence: number; adjustment: number } | null {
    const stats = episodeStats.get(toolId);

    // No historical data: return base confidence unchanged
    if (!stats || stats.total === 0) {
      return { confidence: baseConfidence, adjustment: 0 };
    }

    // Task 4.4: Exclude if failure rate > 50%
    if (stats.failureRate > 0.50) {
      log.debug(
        `[DAGSuggester] Excluding ${toolId} due to high failure rate: ${
          (stats.failureRate * 100).toFixed(0)
        }% (${stats.failures}/${stats.total})`,
      );
      return null; // Exclude entirely
    }

    // Task 3.2: Calculate boost for successful patterns
    const boost = Math.min(0.15, stats.successRate * 0.20);

    // Task 4.2: Calculate penalty for failed patterns
    const penalty = Math.min(0.15, stats.failureRate * 0.25);

    // Net adjustment
    const adjustment = boost - penalty;

    // Task 3.3 & 4.3: Apply adjustment with clamping
    const adjustedConfidence = Math.max(0, Math.min(1.0, baseConfidence + adjustment));

    // Task 3.4: Log adjustments for observability
    if (Math.abs(adjustment) > 0.01) {
      log.debug(
        `[DAGSuggester] Confidence adjusted for ${toolId}: ${baseConfidence.toFixed(2)} → ${
          adjustedConfidence.toFixed(2)
        } (boost: +${boost.toFixed(2)}, penalty: -${
          penalty.toFixed(2)
        }, stats: ${stats.successes}/${stats.total} success)`,
      );
    }

    return { confidence: adjustedConfidence, adjustment };
  }

  /**
   * Calculate confidence for community-based prediction
   *
   * @param toolId - Target tool
   * @param sourceToolId - Source tool (last executed)
   * @param pageRank - PageRank score of target tool
   * @returns Confidence score (0-1)
   */
  private calculateCommunityConfidence(
    toolId: string,
    sourceToolId: string,
    pageRank: number,
  ): number {
    // Base confidence for community membership: 0.40
    let confidence = 0.40;

    // Boost by PageRank (up to +0.20)
    confidence += Math.min(pageRank * 2, 0.20);

    // Boost if direct edge exists (historical pattern)
    const edgeData = this.graphEngine.getEdgeData(sourceToolId, toolId);
    if (edgeData) {
      confidence += Math.min(edgeData.weight * 0.25, 0.25);
    }

    // Boost by Adamic-Adar similarity (indirect patterns)
    const aaScore = this.graphEngine.adamicAdarBetween(sourceToolId, toolId);
    if (aaScore > 0) {
      confidence += Math.min(aaScore * 0.1, 0.10);
    }

    return Math.min(confidence, 0.95); // Cap at 0.95
  }

  /**
   * Calculate confidence for co-occurrence-based prediction
   *
   * @param edgeData - Edge attributes from GraphRAG
   * @param recencyBoost - Boost if tool was used recently (default: 0)
   * @returns Confidence score (0-1)
   */
  private calculateCooccurrenceConfidence(
    edgeData: { weight: number; count: number } | null,
    recencyBoost: number = 0,
  ): number {
    if (!edgeData) return 0.30;

    // Base: edge weight (confidence_score from DB) - Max 0.60 (ADR-038)
    let confidence = Math.min(edgeData.weight, 0.60);

    // Boost by observation count (diminishing returns) - Max 0.20
    // 1 observation: +0, 5: +0.10, 10: +0.15, 20+: +0.20
    const countBoost = Math.min(Math.log2(edgeData.count + 1) * 0.05, 0.20);
    confidence += countBoost;

    // Boost by recency - Max 0.10
    confidence += Math.min(recencyBoost, 0.10);

    return Math.min(confidence, 0.95); // Cap at 0.95
  }

  // =============================================================================
  // Story 3.5-1: Agent Hints & Pattern Export (AC #12, #13)
  // =============================================================================

  /**
   * Register agent hint for graph bootstrap (Story 3.5-1 AC #12)
   *
   * Allows agents to hint expected tool sequences before patterns are learned.
   * Useful for:
   * - Initial bootstrap of new workflows
   * - Explicit knowledge injection
   * - Testing speculation behavior
   *
   * @param toToolId - Tool that typically follows
   * @param fromToolId - Tool that typically precedes
   * @param confidence - Optional confidence override (default: 0.60)
   */
  async registerAgentHint(
    toToolId: string,
    fromToolId: string,
    confidence: number = 0.60,
  ): Promise<void> {
    try {
      log.info(
        `[DAGSuggester] Registering agent hint: ${fromToolId} -> ${toToolId} (confidence: ${confidence})`,
      );

      // Add or update edge in graph
      await this.graphEngine.addEdge(fromToolId, toToolId, {
        weight: confidence,
        count: 1,
        source: "hint",
      });

      log.debug(`[DAGSuggester] Agent hint registered successfully`);
    } catch (error) {
      log.error(`[DAGSuggester] Failed to register agent hint: ${error}`);
      throw error;
    }
  }

  /**
   * Export learned patterns for portability (Story 3.5-1 AC #13)
   *
   * Returns all learned tool-to-tool patterns from the graph.
   * Useful for:
   * - Sharing patterns between instances
   * - Debugging speculation behavior
   * - Cold-start initialization
   *
   * @returns Array of learned patterns with metadata
   */
  exportLearnedPatterns(): Array<{
    from: string;
    to: string;
    weight: number;
    count: number;
    source: string;
  }> {
    const patterns: Array<{
      from: string;
      to: string;
      weight: number;
      count: number;
      source: string;
    }> = [];

    try {
      // Get all edges from graph
      const edges = this.graphEngine.getEdges();

      for (const { source: from, target: to, attributes } of edges) {
        patterns.push({
          from,
          to,
          weight: (attributes.weight as number) ?? 0.5,
          count: (attributes.count as number) ?? 1,
          source: (attributes.source as string) ?? "learned",
        });
      }

      log.info(`[DAGSuggester] Exported ${patterns.length} learned patterns`);
      return patterns;
    } catch (error) {
      log.error(`[DAGSuggester] Failed to export patterns: ${error}`);
      return [];
    }
  }

  /**
   * Import learned patterns (Story 3.5-1 AC #13)
   *
   * Imports patterns exported from another instance.
   * Useful for cold-start initialization.
   *
   * @param patterns - Patterns to import
   * @param mergeStrategy - How to handle existing patterns ("replace" | "merge")
   */
  async importLearnedPatterns(
    patterns: Array<{
      from: string;
      to: string;
      weight: number;
      count: number;
      source?: string;
    }>,
    mergeStrategy: "replace" | "merge" = "merge",
  ): Promise<number> {
    let imported = 0;

    for (const pattern of patterns) {
      try {
        const existingEdge = this.graphEngine.getEdgeData(pattern.from, pattern.to);

        if (existingEdge && mergeStrategy === "merge") {
          // Merge: Average weights, sum counts
          const newWeight = (existingEdge.weight + pattern.weight) / 2;
          const newCount = existingEdge.count + pattern.count;

          await this.graphEngine.addEdge(pattern.from, pattern.to, {
            weight: newWeight,
            count: newCount,
            source: "merged",
          });
        } else {
          // Replace or new edge
          await this.graphEngine.addEdge(pattern.from, pattern.to, {
            weight: pattern.weight,
            count: pattern.count,
            source: pattern.source ?? "imported",
          });
        }

        imported++;
      } catch (error) {
        log.error(
          `[DAGSuggester] Failed to import pattern ${pattern.from} -> ${pattern.to}: ${error}`,
        );
      }
    }

    log.info(`[DAGSuggester] Imported ${imported}/${patterns.length} patterns`);
    return imported;
  }

  /**
   * Validate DAG has no cycles using topological sort
   *
   * Throws error if cycle detected.
   *
   * @param dag - DAG structure to validate
   */
  private validateDAGNoCycles(dag: DAGStructure): void {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Build adjacency list and in-degree map
    for (const task of dag.tasks) {
      inDegree.set(task.id, task.dependsOn.length);
      for (const dep of task.dependsOn) {
        if (!adjList.has(dep)) adjList.set(dep, []);
        adjList.get(dep)!.push(task.id);
      }
    }

    // Kahn's algorithm (topological sort)
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(taskId);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const neighbors = adjList.get(current) || [];
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (sorted.length !== dag.tasks.length) {
      throw new Error(
        `Cycle detected: topological sort produced ${sorted.length} tasks, expected ${dag.tasks.length}`,
      );
    }
  }
}
