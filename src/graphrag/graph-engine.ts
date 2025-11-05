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
import type { DAGStructure, GraphStats, WorkflowExecution } from "./types.ts";

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
}
