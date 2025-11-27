/**
 * GraphRAG Engine with Graphology
 *
 * Implements true graph algorithms (PageRank, Louvain, path finding) for
 * intelligent DAG construction and tool dependency analysis.
 *
 * @module graphrag/graph-engine
 */

// @ts-ignore: NPM module resolution
import graphologyPkg from "graphology";
// @ts-ignore: NPM module resolution
import pagerankPkg from "graphology-metrics/centrality/pagerank.js";
// @ts-ignore: NPM module resolution
import louvainPkg from "graphology-communities-louvain";
// @ts-ignore: NPM module resolution
import { bidirectional } from "graphology-shortest-path";
import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { DAGStructure, GraphStats, WorkflowExecution, HybridSearchResult } from "./types.ts";

// Extract exports from Graphology packages
const { DirectedGraph } = graphologyPkg as any;
const pagerank = pagerankPkg as any;
const louvain = louvainPkg as any;

/**
 * GraphRAG Engine
 *
 * Hybrid approach: PGlite for persistence, Graphology for graph computations.
 * Syncs graph from database, computes PageRank and communities, provides
 * path finding and DAG building capabilities.
 */
export class GraphRAGEngine {
  private graph: any;
  private pageRanks: Record<string, number> = {};
  private communities: Record<string, string> = {};

  constructor(private db: PGliteClient) {
    this.graph = new DirectedGraph({ allowSelfLoops: false });
  }

  /**
   * Sync graph from PGlite to Graphology in-memory
   *
   * Performance target: <50ms P95 for 200 tools, 100 dependencies
   */
  async syncFromDatabase(): Promise<void> {
    const startTime = performance.now();

    // Clear existing graph
    this.graph.clear();

    try {
      // 1. Load nodes (tools) from PGlite
      const tools = await this.db.query(`
        SELECT tool_id, tool_name, server_id, metadata
        FROM tool_embedding
      `);

      for (const tool of tools) {
        this.graph.addNode(tool.tool_id as string, {
          name: tool.tool_name as string,
          serverId: tool.server_id as string,
          metadata: tool.metadata,
        });
      }

      // 2. Load edges (dependencies) from PGlite
      const deps = await this.db.query(`
        SELECT from_tool_id, to_tool_id, observed_count, confidence_score
        FROM tool_dependency
        WHERE confidence_score > 0.3
      `);

      for (const dep of deps) {
        const from = dep.from_tool_id as string;
        const to = dep.to_tool_id as string;

        if (this.graph.hasNode(from) && this.graph.hasNode(to)) {
          this.graph.addEdge(from, to, {
            weight: dep.confidence_score as number,
            count: dep.observed_count as number,
          });
        }
      }

      const syncTime = performance.now() - startTime;
      log.info(
        `✓ Graph synced: ${this.graph.order} nodes, ${this.graph.size} edges (${syncTime.toFixed(1)}ms)`,
      );

      // 3. Precompute metrics if graph is not empty
      if (this.graph.order > 0) {
        await this.precomputeMetrics();
      }
    } catch (error) {
      log.error(`Graph sync failed: ${error}`);
      throw error;
    }
  }

  /**
   * Precompute expensive graph metrics (PageRank, Communities)
   *
   * Performance target: <100ms for PageRank, <150ms for community detection
   */
  private async precomputeMetrics(): Promise<void> {
    const startTime = performance.now();

    try {
      // PageRank (native Graphology)
      this.pageRanks = pagerank(this.graph, {
        weighted: true,
        tolerance: 0.0001,
      });

      // Community detection (Louvain algorithm)
      this.communities = louvain(this.graph, {
        resolution: 1.0,
      });

      const computeTime = performance.now() - startTime;
      log.info(`✓ Graph metrics computed (${computeTime.toFixed(1)}ms)`);
    } catch (error) {
      log.error(`Graph metrics computation failed: ${error}`);
      // Don't throw - allow system to continue with empty metrics
      this.pageRanks = {};
      this.communities = {};
    }
  }

  /**
   * Get PageRank score for a tool
   *
   * @param toolId - Tool identifier
   * @returns PageRank score between 0 and 1, or 0 if tool not found
   */
  getPageRank(toolId: string): number {
    return this.pageRanks[toolId] || 0;
  }

  /**
   * Get community ID for a tool
   *
   * @param toolId - Tool identifier
   * @returns Community ID or undefined if tool not found
   */
  getCommunity(toolId: string): string | undefined {
    return this.communities[toolId];
  }

  /**
   * Find tools in the same community
   *
   * @param toolId - Tool identifier
   * @returns Array of tool IDs in the same community (excluding the tool itself)
   */
  findCommunityMembers(toolId: string): string[] {
    const community = this.communities[toolId];
    if (!community) return [];

    return Object.entries(this.communities)
      .filter(([_, comm]) => comm === community)
      .map(([id]) => id)
      .filter((id) => id !== toolId);
  }

  /**
   * Find shortest path between two tools
   *
   * @param fromToolId - Source tool
   * @param toToolId - Target tool
   * @returns Array of tool IDs representing the path, or null if no path exists
   */
  findShortestPath(fromToolId: string, toToolId: string): string[] | null {
    try {
      return bidirectional(this.graph, fromToolId, toToolId);
    } catch {
      return null; // No path exists
    }
  }

  /**
   * Build DAG from tool candidates using graph topology
   *
   * Uses shortest path finding to infer dependencies based on historical patterns.
   * Tools with paths ≤3 hops are considered dependent.
   *
   * @param candidateTools - Array of tool IDs to include in DAG
   * @returns DAG structure with tasks and dependencies
   */
  buildDAG(candidateTools: string[]): DAGStructure {
    const tasks = [];

    for (let i = 0; i < candidateTools.length; i++) {
      const toolId = candidateTools[i];
      const dependsOn: string[] = [];

      // Find dependencies from previous tools in the list
      for (let j = 0; j < i; j++) {
        const prevToolId = candidateTools[j];
        const path = this.findShortestPath(prevToolId, toolId);

        // If path exists and is short (≤3 hops), add as dependency
        if (path && path.length > 0 && path.length <= 4) {
          dependsOn.push(`task_${j}`);
        }
      }

      tasks.push({
        id: `task_${i}`,
        tool: toolId,
        arguments: {},
        depends_on: dependsOn,
      });
    }

    return { tasks };
  }

  /**
   * Update graph with new execution data
   *
   * Learns from workflow executions to strengthen dependency edges.
   *
   * @param execution - Workflow execution record
   */
  async updateFromExecution(execution: WorkflowExecution): Promise<void> {
    try {
      // Extract dependencies from executed DAG
      for (const task of execution.dag_structure.tasks) {
        for (const depTaskId of task.depends_on) {
          const depTask = execution.dag_structure.tasks.find((t) => t.id === depTaskId);
          if (!depTask) continue;

          const fromTool = depTask.tool;
          const toTool = task.tool;

          // Update or add edge in Graphology
          if (this.graph.hasEdge(fromTool, toTool)) {
            const edge = this.graph.getEdgeAttributes(fromTool, toTool);
            const newCount = (edge.count as number) + 1;
            const newWeight = Math.min((edge.weight as number) * 1.1, 1.0);

            this.graph.setEdgeAttribute(fromTool, toTool, "count", newCount);
            this.graph.setEdgeAttribute(fromTool, toTool, "weight", newWeight);
          } else if (this.graph.hasNode(fromTool) && this.graph.hasNode(toTool)) {
            this.graph.addEdge(fromTool, toTool, {
              count: 1,
              weight: 0.5,
            });
          }
        }
      }

      // Recompute metrics (fast with Graphology)
      if (this.graph.order > 0) {
        await this.precomputeMetrics();
      }

      // Persist updated edges to PGlite
      await this.persistEdgesToDB();
    } catch (error) {
      log.error(`Failed to update graph from execution: ${error}`);
      throw error;
    }
  }

  /**
   * Persist graph edges to database
   *
   * Saves all edges from Graphology back to PGlite for persistence.
   */
  private async persistEdgesToDB(): Promise<void> {
    for (const edge of this.graph.edges()) {
      const [from, to] = this.graph.extremities(edge);
      const attrs = this.graph.getEdgeAttributes(edge);

      await this.db.query(
        `
        INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (from_tool_id, to_tool_id) DO UPDATE SET
          observed_count = $3,
          confidence_score = $4,
          last_observed = NOW()
      `,
        [from, to, attrs.count, attrs.weight],
      );
    }
  }

  // ============================================
  // New methods for search_tools (Spike: search-tools-graph-traversal)
  // ============================================

  /**
   * Get edge count for adaptive alpha calculation
   */
  getEdgeCount(): number {
    return this.graph.size;
  }

  /**
   * Get edge data between two tools (Story 3.5-1)
   *
   * Returns the edge attributes if edge exists, null otherwise.
   *
   * @param fromToolId - Source tool
   * @param toToolId - Target tool
   * @returns Edge attributes or null
   */
  getEdgeData(fromToolId: string, toToolId: string): { weight: number; count: number } | null {
    if (!this.graph.hasEdge(fromToolId, toToolId)) return null;

    const attrs = this.graph.getEdgeAttributes(fromToolId, toToolId);
    return {
      weight: attrs.weight as number,
      count: attrs.count as number,
    };
  }

  /**
   * Add or update edge between two tools (Story 3.5-1 AC #12)
   *
   * Used for agent hints and pattern import/export.
   *
   * @param fromToolId - Source tool
   * @param toToolId - Target tool
   * @param attributes - Edge attributes (weight, count, source)
   */
  async addEdge(
    fromToolId: string,
    toToolId: string,
    attributes: { weight: number; count: number; source?: string },
  ): Promise<void> {
    // Ensure nodes exist
    if (!this.graph.hasNode(fromToolId)) {
      this.graph.addNode(fromToolId, { type: "tool" });
    }
    if (!this.graph.hasNode(toToolId)) {
      this.graph.addNode(toToolId, { type: "tool" });
    }

    // Update or add edge
    if (this.graph.hasEdge(fromToolId, toToolId)) {
      this.graph.setEdgeAttribute(fromToolId, toToolId, "weight", attributes.weight);
      this.graph.setEdgeAttribute(fromToolId, toToolId, "count", attributes.count);
      if (attributes.source) {
        this.graph.setEdgeAttribute(fromToolId, toToolId, "source", attributes.source);
      }
    } else {
      this.graph.addEdge(fromToolId, toToolId, {
        weight: attributes.weight,
        count: attributes.count,
        source: attributes.source ?? "manual",
      });
    }
  }

  /**
   * Get all edges from the graph (Story 3.5-1 AC #13)
   *
   * Returns all edges with their attributes for export.
   *
   * @returns Array of edges with source, target, and attributes
   */
  getEdges(): Array<{
    source: string;
    target: string;
    attributes: Record<string, unknown>;
  }> {
    const edges: Array<{
      source: string;
      target: string;
      attributes: Record<string, unknown>;
    }> = [];

    this.graph.forEachEdge((_edge: string, attrs: Record<string, unknown>, source: string, target: string) => {
      edges.push({
        source,
        target,
        attributes: { ...attrs },
      });
    });

    return edges;
  }

  /**
   * Get neighbors of a tool
   *
   * @param toolId - Tool identifier
   * @param direction - 'in' (tools before), 'out' (tools after), 'both'
   * @returns Array of neighbor tool IDs
   */
  getNeighbors(toolId: string, direction: "in" | "out" | "both" = "both"): string[] {
    if (!this.graph.hasNode(toolId)) return [];

    switch (direction) {
      case "in":
        return this.graph.inNeighbors(toolId);
      case "out":
        return this.graph.outNeighbors(toolId);
      case "both":
        return this.graph.neighbors(toolId);
    }
  }

  /**
   * Compute Adamic-Adar similarity for a tool
   *
   * Finds tools that share common neighbors, weighted by neighbor rarity.
   * A common neighbor with fewer connections contributes more to the score.
   *
   * Formula: AA(u,v) = Σ 1/log(|N(w)|) for all w in N(u) ∩ N(v)
   *
   * @param toolId - Tool identifier
   * @param limit - Max number of results
   * @returns Array of related tools with Adamic-Adar scores
   */
  computeAdamicAdar(toolId: string, limit = 10): Array<{ toolId: string; score: number }> {
    if (!this.graph.hasNode(toolId)) return [];

    const neighbors = new Set(this.graph.neighbors(toolId));
    const scores = new Map<string, number>();

    for (const neighbor of neighbors) {
      const degree = this.graph.degree(neighbor);
      if (degree <= 1) continue;

      for (const twoHop of this.graph.neighbors(neighbor)) {
        if (twoHop === toolId) continue;
        scores.set(twoHop, (scores.get(twoHop) || 0) + 1 / Math.log(degree));
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ toolId: id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Compute Adamic-Adar score between two specific tools
   *
   * @param toolId1 - First tool
   * @param toolId2 - Second tool
   * @returns Adamic-Adar score (0 if no common neighbors)
   */
  adamicAdarBetween(toolId1: string, toolId2: string): number {
    if (!this.graph.hasNode(toolId1) || !this.graph.hasNode(toolId2)) return 0;

    const neighbors1 = new Set(this.graph.neighbors(toolId1));
    const neighbors2 = new Set(this.graph.neighbors(toolId2));

    let score = 0;
    for (const neighbor of neighbors1) {
      if (neighbors2.has(neighbor)) {
        const degree = this.graph.degree(neighbor);
        if (degree > 1) {
          score += 1 / Math.log(degree);
        }
      }
    }

    return score;
  }

  /**
   * Compute graph relatedness of a tool to context tools
   *
   * Returns highest relatedness score (direct edge = 1.0, else Adamic-Adar)
   *
   * @param toolId - Tool to evaluate
   * @param contextTools - Tools already in context
   * @returns Normalized relatedness score (0-1)
   */
  computeGraphRelatedness(toolId: string, contextTools: string[]): number {
    if (contextTools.length === 0 || !this.graph.hasNode(toolId)) return 0;

    let maxScore = 0;
    for (const contextTool of contextTools) {
      if (!this.graph.hasNode(contextTool)) continue;

      // Direct neighbor = max score
      if (this.graph.hasEdge(contextTool, toolId) || this.graph.hasEdge(toolId, contextTool)) {
        return 1.0;
      }

      // Adamic-Adar score
      const aaScore = this.adamicAdarBetween(toolId, contextTool);
      maxScore = Math.max(maxScore, aaScore);
    }

    // Normalize (typical AA scores are 0-5, cap at 1.0)
    return Math.min(maxScore / 2, 1.0);
  }

  /**
   * Bootstrap graph with workflow templates
   *
   * Creates initial edges based on predefined workflow patterns.
   * Used to solve cold-start problem when no usage data exists.
   *
   * @param templates - Workflow templates with edges
   */
  async bootstrapFromTemplates(templates: Record<string, { edges: [string, string][] }>): Promise<void> {
    let edgesAdded = 0;

    for (const [_templateName, template] of Object.entries(templates)) {
      for (const [from, to] of template.edges) {
        if (this.graph.hasNode(from) && this.graph.hasNode(to)) {
          if (!this.graph.hasEdge(from, to)) {
            this.graph.addEdge(from, to, {
              count: 1,
              weight: 0.5,
              source: "template",
            });
            edgesAdded++;
          }
        }
      }
    }

    if (edgesAdded > 0) {
      log.info(`✓ Bootstrapped graph with ${edgesAdded} template edges`);
      await this.precomputeMetrics();
    }
  }

  /**
   * Get graph statistics
   *
   * @returns Current graph stats including node/edge counts and metrics
   */
  getStats(): GraphStats {
    const nodeCount = this.graph.order;
    const avgPageRank = nodeCount > 0
      ? Object.values(this.pageRanks).reduce((a, b) => a + b, 0) / nodeCount
      : 0;

    return {
      nodeCount,
      edgeCount: this.graph.size,
      communities: new Set(Object.values(this.communities)).size,
      avgPageRank,
    };
  }

  // ============================================
  // Story 5.2 / ADR-022: Hybrid Search Integration
  // ============================================

  /**
   * Hybrid Search: Combines semantic search with graph-based recommendations (ADR-022)
   *
   * Process:
   * 1. Semantic search for query-matching tools (base candidates)
   * 2. Calculate adaptive alpha based on graph density
   * 3. Compute graph relatedness for each candidate (Adamic-Adar / direct edges)
   * 4. Combine scores: finalScore = α × semantic + (1-α) × graph
   * 5. Optionally add related tools (in/out neighbors)
   *
   * Graceful degradation: Falls back to semantic-only if graph is empty (alpha=1.0)
   *
   * Performance target: <20ms overhead (ADR-022)
   *
   * @param vectorSearch - VectorSearch instance for semantic search
   * @param query - Natural language search query
   * @param limit - Maximum number of results (default: 10)
   * @param contextTools - Tools already in context (boosts related tools)
   * @param includeRelated - Include related tools via graph neighbors (default: false)
   * @returns Sorted array of hybrid search results (highest finalScore first)
   */
  async searchToolsHybrid(
    vectorSearch: VectorSearch,
    query: string,
    limit: number = 10,
    contextTools: string[] = [],
    includeRelated: boolean = false,
  ): Promise<HybridSearchResult[]> {
    const startTime = performance.now();

    try {
      // 1. Semantic search for base candidates (fetch extra for graph filtering)
      const semanticResults = await vectorSearch.searchTools(query, limit * 2, 0.5);

      if (semanticResults.length === 0) {
        log.debug(`[searchToolsHybrid] No semantic candidates for: "${query}"`);
        return [];
      }

      // 2. Calculate adaptive alpha based on graph density
      // More semantic weight when graph is sparse (cold start)
      const edgeCount = this.getEdgeCount();
      const nodeCount = this.getStats().nodeCount;
      const maxPossibleEdges = nodeCount * (nodeCount - 1); // directed graph
      const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
      const alpha = Math.max(0.5, 1.0 - density * 2);

      log.debug(
        `[searchToolsHybrid] alpha=${alpha.toFixed(2)} (density=${density.toFixed(4)}, edges=${edgeCount})`,
      );

      // 3. Compute hybrid scores for each candidate
      const results: HybridSearchResult[] = semanticResults.map((result) => {
        const graphScore = this.computeGraphRelatedness(result.toolId, contextTools);
        const finalScore = alpha * result.score + (1 - alpha) * graphScore;

        const hybridResult: HybridSearchResult = {
          toolId: result.toolId,
          serverId: result.serverId,
          toolName: result.toolName,
          description: result.schema?.description || "",
          semanticScore: Math.round(result.score * 100) / 100,
          graphScore: Math.round(graphScore * 100) / 100,
          finalScore: Math.round(finalScore * 100) / 100,
          schema: result.schema as unknown as Record<string, unknown>,
        };

        return hybridResult;
      });

      // 4. Sort by final score (descending) and limit
      results.sort((a, b) => b.finalScore - a.finalScore);
      const topResults = results.slice(0, limit);

      // 5. Add related tools if requested
      if (includeRelated) {
        for (const result of topResults) {
          result.relatedTools = [];

          // Get in-neighbors (tools often used BEFORE this one)
          const inNeighbors = this.getNeighbors(result.toolId, "in");
          for (const neighbor of inNeighbors.slice(0, 2)) {
            result.relatedTools.push({
              toolId: neighbor,
              relation: "often_before",
              score: 0.8,
            });
          }

          // Get out-neighbors (tools often used AFTER this one)
          const outNeighbors = this.getNeighbors(result.toolId, "out");
          for (const neighbor of outNeighbors.slice(0, 2)) {
            result.relatedTools.push({
              toolId: neighbor,
              relation: "often_after",
              score: 0.8,
            });
          }
        }
      }

      const elapsedMs = performance.now() - startTime;
      log.info(
        `[searchToolsHybrid] "${query}" → ${topResults.length} results (alpha=${alpha.toFixed(2)}, ${elapsedMs.toFixed(1)}ms)`,
      );

      return topResults;
    } catch (error) {
      log.error(`[searchToolsHybrid] Failed: ${error}`);
      // Graceful degradation: fall back to semantic-only
      try {
        const fallbackResults = await vectorSearch.searchTools(query, limit, 0.5);
        return fallbackResults.map((r) => ({
          toolId: r.toolId,
          serverId: r.serverId,
          toolName: r.toolName,
          description: r.schema?.description || "",
          semanticScore: r.score,
          graphScore: 0,
          finalScore: r.score,
          schema: r.schema as unknown as Record<string, unknown>,
        }));
      } catch (fallbackError) {
        log.error(`[searchToolsHybrid] Fallback also failed: ${fallbackError}`);
        return [];
      }
    }
  }
}
