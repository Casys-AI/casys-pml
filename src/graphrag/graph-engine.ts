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
import type {
  DAGStructure,
  GraphMetricsResponse,
  GraphStats,
  HybridSearchResult,
  MetricsTimeRange,
  TimeSeriesPoint,
  WorkflowExecution,
} from "./types.ts";
import type { GraphEvent } from "./events.ts";
import type { TraceEvent } from "../sandbox/types.ts";
// Story 6.5: EventBus integration (ADR-036)
import { eventBus } from "../events/mod.ts";

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
  private eventTarget: EventTarget;
  private listenerMap: Map<(event: GraphEvent) => void, EventListener> = new Map();

  constructor(private db: PGliteClient) {
    this.graph = new DirectedGraph({ allowSelfLoops: false });
    this.eventTarget = new EventTarget();
  }

  /**
   * Subscribe to graph events
   *
   * @param event - Event name (always "graph_event")
   * @param listener - Event listener function
   */
  on(event: "graph_event", listener: (event: GraphEvent) => void): void {
    const wrappedListener = ((e: CustomEvent<GraphEvent>) => {
      listener(e.detail);
    }) as EventListener;

    this.listenerMap.set(listener, wrappedListener);
    this.eventTarget.addEventListener(event, wrappedListener);
  }

  /**
   * Unsubscribe from graph events
   *
   * @param event - Event name (always "graph_event")
   * @param listener - Event listener function to remove
   */
  off(event: "graph_event", listener: (event: GraphEvent) => void): void {
    const wrappedListener = this.listenerMap.get(listener);
    if (wrappedListener) {
      this.eventTarget.removeEventListener(event, wrappedListener);
      this.listenerMap.delete(listener);
    }
  }

  /**
   * Emit a graph event
   * Story 6.5: Also emits to unified EventBus (ADR-036)
   *
   * @param event - Graph event to emit
   */
  private emit(event: GraphEvent): void {
    // Legacy: dispatch to local EventTarget for backward compat (EventsStreamManager)
    const customEvent = new CustomEvent("graph_event", { detail: event });
    this.eventTarget.dispatchEvent(customEvent);

    // Story 6.5: Also emit to unified EventBus with mapped event types
    this.emitToEventBus(event);
  }

  /**
   * Map legacy GraphEvent to new EventBus event types
   * Story 6.5: Bridge between old and new event systems
   */
  private emitToEventBus(event: GraphEvent): void {
    switch (event.type) {
      case "graph_synced":
        eventBus.emit({
          type: "graph.synced",
          source: "graphrag",
          payload: {
            node_count: event.data.node_count,
            edge_count: event.data.edge_count,
            sync_duration_ms: event.data.sync_duration_ms,
          },
        });
        break;

      case "edge_created":
        eventBus.emit({
          type: "graph.edge.created",
          source: "graphrag",
          payload: {
            from_tool_id: event.data.from_tool_id,
            to_tool_id: event.data.to_tool_id,
            confidence_score: event.data.confidence_score,
          },
        });
        break;

      case "edge_updated":
        eventBus.emit({
          type: "graph.edge.updated",
          source: "graphrag",
          payload: {
            from_tool_id: event.data.from_tool_id,
            to_tool_id: event.data.to_tool_id,
            old_confidence: event.data.old_confidence,
            new_confidence: event.data.new_confidence,
            observed_count: event.data.observed_count,
          },
        });
        break;

      case "metrics_updated":
        eventBus.emit({
          type: "graph.metrics.computed",
          source: "graphrag",
          payload: {
            node_count: event.data.node_count,
            edge_count: event.data.edge_count,
            density: event.data.density,
            communities_count: event.data.communities_count,
          },
        });
        break;

      // heartbeat and workflow_executed are handled elsewhere
      default:
        // Unknown event type, skip EventBus emission
        break;
    }
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
      // ADR-041: Include edge_type and edge_source
      const deps = await this.db.query(`
        SELECT from_tool_id, to_tool_id, observed_count, confidence_score, edge_type, edge_source
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
            // ADR-041: Load edge_type and edge_source with defaults for legacy data
            edge_type: (dep.edge_type as string) || "sequence",
            edge_source: (dep.edge_source as string) || "inferred",
          });
        }
      }

      const syncTime = performance.now() - startTime;
      log.info(
        `✓ Graph synced: ${this.graph.order} nodes, ${this.graph.size} edges (${
          syncTime.toFixed(1)
        }ms)`,
      );

      // 3. Precompute metrics if graph is not empty
      if (this.graph.order > 0) {
        await this.precomputeMetrics();
      }

      // 4. Emit graph_synced event
      this.emit({
        type: "graph_synced",
        data: {
          node_count: this.graph.order,
          edge_count: this.graph.size,
          sync_duration_ms: syncTime,
          timestamp: new Date().toISOString(),
        },
      });
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
   * ADR-041: Get combined edge weight (type × source modifier)
   *
   * @param edgeType - Edge type: 'contains', 'sequence', or 'dependency'
   * @param edgeSource - Edge source: 'observed', 'inferred', or 'template'
   * @returns Combined weight for algorithms
   */
  getEdgeWeight(edgeType: string, edgeSource: string): number {
    const typeWeight = GraphRAGEngine.EDGE_TYPE_WEIGHTS[edgeType] || 0.5;
    const sourceModifier = GraphRAGEngine.EDGE_SOURCE_MODIFIERS[edgeSource] || 0.7;
    return typeWeight * sourceModifier;
  }

  /**
   * Find shortest path between two tools
   * ADR-041: Uses edge weights stored in the graph
   *
   * Note: graphology-shortest-path bidirectional doesn't support custom weight functions.
   * The weighted path finding is handled by storing appropriate weights in edge attributes
   * during edge creation (via createOrUpdateEdge).
   *
   * @param fromToolId - Source tool
   * @param toToolId - Target tool
   * @returns Array of tool IDs representing the path, or null if no path exists
   */
  findShortestPath(fromToolId: string, toToolId: string): string[] | null {
    try {
      // ADR-041: Path finding uses the 'weight' attribute stored on edges
      // which already incorporates edge_type and edge_source weights
      return bidirectional(this.graph, fromToolId, toToolId);
    } catch {
      return null; // No path exists
    }
  }

  /**
   * Build DAG from tool candidates using graph topology
   * ADR-041: Prioritizes edges by source (observed > inferred > template)
   *
   * Uses shortest path finding to infer dependencies based on historical patterns.
   * Tools with paths ≤3 hops are considered dependent.
   *
   * @param candidateTools - Array of tool IDs to include in DAG
   * @returns DAG structure with tasks and dependencies
   */
  buildDAG(candidateTools: string[]): DAGStructure {
    const n = candidateTools.length;

    // ADR-024: Build full adjacency matrix (N×N) to avoid ordering bias
    // Check dependencies in BOTH directions regardless of list order
    const adjacency: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    const edgeWeights: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;

        const fromTool = candidateTools[j];
        const toTool = candidateTools[i];
        const path = this.findShortestPath(fromTool, toTool);

        // If path exists and is short (≤3 hops), mark as dependency
        if (path && path.length > 0 && path.length <= 4) {
          adjacency[i][j] = true;

          // ADR-041: Weight based on path length AND edge quality
          // Get average edge weight along the path
          let totalEdgeWeight = 0;
          let edgeCount = 0;
          for (let k = 0; k < path.length - 1; k++) {
            if (this.graph.hasEdge(path[k], path[k + 1])) {
              const attrs = this.graph.getEdgeAttributes(path[k], path[k + 1]);
              const edgeType = attrs.edge_type as string || "sequence";
              const edgeSource = attrs.edge_source as string || "inferred";
              totalEdgeWeight += this.getEdgeWeight(edgeType, edgeSource);
              edgeCount++;
            }
          }
          const avgEdgeWeight = edgeCount > 0 ? totalEdgeWeight / edgeCount : 0.5;

          // Combined weight: path length factor × edge quality
          edgeWeights[i][j] = (1.0 / path.length) * avgEdgeWeight;
        }
      }
    }

    // ADR-024: Detect and break cycles using edge weights
    // ADR-041: Higher edge weight = more reliable = keep
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (adjacency[i][j] && adjacency[j][i]) {
          // Cycle detected: keep edge with higher weight (more reliable)
          if (edgeWeights[i][j] >= edgeWeights[j][i]) {
            adjacency[j][i] = false; // Remove j→i edge
            log.debug(
              `[buildDAG] Cycle broken: keeping ${candidateTools[j]} → ${candidateTools[i]} (weight: ${edgeWeights[i][j].toFixed(2)})`,
            );
          } else {
            adjacency[i][j] = false; // Remove i→j edge
            log.debug(
              `[buildDAG] Cycle broken: keeping ${candidateTools[i]} → ${candidateTools[j]} (weight: ${edgeWeights[j][i].toFixed(2)})`,
            );
          }
        }
      }
    }

    // Build tasks with resolved dependencies
    const tasks = candidateTools.map((toolId, i) => {
      const dependsOn: string[] = [];
      for (let j = 0; j < n; j++) {
        if (adjacency[i][j]) {
          dependsOn.push(`task_${j}`);
        }
      }

      return {
        id: `task_${i}`,
        tool: toolId,
        arguments: {},
        depends_on: dependsOn,
      };
    });

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
    const startTime = performance.now();
    const toolIds = execution.dag_structure.tasks.map((t) => t.tool);

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
            const oldConfidence = edge.weight as number;
            const newCount = (edge.count as number) + 1;
            const newConfidence = Math.min(oldConfidence * 1.1, 1.0);

            this.graph.setEdgeAttribute(fromTool, toTool, "count", newCount);
            this.graph.setEdgeAttribute(fromTool, toTool, "weight", newConfidence);

            // Emit edge_updated event
            this.emit({
              type: "edge_updated",
              data: {
                from_tool_id: fromTool,
                to_tool_id: toTool,
                old_confidence: oldConfidence,
                new_confidence: newConfidence,
                observed_count: newCount,
                timestamp: new Date().toISOString(),
              },
            });
          } else if (this.graph.hasNode(fromTool) && this.graph.hasNode(toTool)) {
            this.graph.addEdge(fromTool, toTool, {
              count: 1,
              weight: 0.5,
            });

            // Emit edge_created event
            this.emit({
              type: "edge_created",
              data: {
                from_tool_id: fromTool,
                to_tool_id: toTool,
                confidence_score: 0.5,
                timestamp: new Date().toISOString(),
              },
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

      // Persist workflow execution for time-series analytics (Story 6.3)
      await this.db.query(
        `INSERT INTO workflow_execution
         (intent_text, dag_structure, success, execution_time_ms, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          execution.intent_text || null,
          JSON.stringify(execution.dag_structure),
          execution.success,
          Math.round(execution.execution_time_ms), // INTEGER column
          execution.error_message || null,
        ],
      );

      const executionTime = performance.now() - startTime;

      // Emit workflow_executed event
      this.emit({
        type: "workflow_executed",
        data: {
          workflow_id: execution.execution_id,
          tool_ids: toolIds,
          success: execution.success,
          execution_time_ms: executionTime,
          timestamp: new Date().toISOString(),
        },
      });

      // Emit metrics_updated event
      this.emit({
        type: "metrics_updated",
        data: {
          edge_count: this.graph.size,
          node_count: this.graph.order,
          density: this.getDensity(),
          pagerank_top_10: this.getTopPageRank(10),
          communities_count: this.getCommunitiesCount(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      log.error(`Failed to update graph from execution: ${error}`);
      throw error;
    }
  }

  // ============================================
  // Story 7.3b: Code Execution Trace Learning
  // ADR-041: Hierarchical edge creation using parent_trace_id
  // ============================================

  /**
   * ADR-041: Edge type weights for algorithms
   * - dependency: 1.0 (explicit DAG from templates)
   * - contains: 0.8 (parent-child hierarchy)
   * - sequence: 0.5 (temporal between siblings)
   */
  private static readonly EDGE_TYPE_WEIGHTS: Record<string, number> = {
    dependency: 1.0,
    contains: 0.8,
    sequence: 0.5,
  };

  /**
   * ADR-041: Edge source weight modifiers
   * - observed: ×1.0 (confirmed by 3+ executions)
   * - inferred: ×0.7 (single observation)
   * - template: ×0.5 (bootstrap, not yet confirmed)
   */
  private static readonly EDGE_SOURCE_MODIFIERS: Record<string, number> = {
    observed: 1.0,
    inferred: 0.7,
    template: 0.5,
  };

  /**
   * ADR-041: Observation threshold for edge_source upgrade
   * Edge transitions from 'inferred' to 'observed' after this many observations
   */
  private static readonly OBSERVED_THRESHOLD = 3;

  /**
   * Update graph from code execution traces (tool + capability)
   * Story 7.3b: Called by WorkerBridge after execution completes
   * ADR-041: Uses parent_trace_id for hierarchical edge creation
   *
   * Creates edges for:
   * - `contains`: Parent → Child (capability → tool, capability → nested capability)
   * - `sequence`: Sibling → Sibling (same parent, ordered by timestamp)
   *
   * @param traces - Chronologically sorted trace events
   */
  async updateFromCodeExecution(traces: TraceEvent[]): Promise<void> {
    if (traces.length < 1) {
      log.debug("[updateFromCodeExecution] No traces for edge creation");
      return;
    }

    const startTime = performance.now();
    let edgesCreated = 0;
    let edgesUpdated = 0;

    // ADR-041: Build maps for hierarchy analysis
    // Map trace_id → node_id for all events
    const traceToNode = new Map<string, string>();
    // Map parent_trace_id → list of children node_ids (in timestamp order)
    const parentToChildren = new Map<string, string[]>();
    // Track all node IDs for creation
    const nodeIds = new Set<string>();

    // First pass: collect all nodes and build hierarchy
    for (const trace of traces) {
      // Only process *_end events (completed calls)
      if (trace.type !== "tool_end" && trace.type !== "capability_end") continue;

      // Extract node ID based on event type
      const nodeId = trace.type === "tool_end"
        ? (trace as { tool: string }).tool
        : `capability:${(trace as { capability_id: string }).capability_id}`;

      nodeIds.add(nodeId);
      traceToNode.set(trace.trace_id, nodeId);

      // ADR-041: Track parent-child relationships
      const parent_trace_id = trace.parent_trace_id;
      if (parent_trace_id) {
        if (!parentToChildren.has(parent_trace_id)) {
          parentToChildren.set(parent_trace_id, []);
        }
        parentToChildren.get(parent_trace_id)!.push(nodeId);
      }
    }

    // Ensure all nodes exist in graph
    for (const trace of traces) {
      if (trace.type !== "tool_end" && trace.type !== "capability_end") continue;

      const nodeId = trace.type === "tool_end"
        ? (trace as { tool: string }).tool
        : `capability:${(trace as { capability_id: string }).capability_id}`;

      if (!this.graph.hasNode(nodeId)) {
        this.graph.addNode(nodeId, {
          type: trace.type === "tool_end" ? "tool" : "capability",
          name: trace.type === "tool_end"
            ? (trace as { tool: string }).tool
            : (trace as { capability: string }).capability,
        });
      }
    }

    // ADR-041: Create 'contains' edges (parent → child)
    for (const [parentTraceId, children] of parentToChildren) {
      const parentNodeId = traceToNode.get(parentTraceId);
      if (!parentNodeId) continue; // Parent not in this execution (e.g., top-level)

      for (const childNodeId of children) {
        if (parentNodeId === childNodeId) continue; // Skip self-loops

        const result = await this.createOrUpdateEdge(
          parentNodeId,
          childNodeId,
          "contains",
        );
        if (result === "created") edgesCreated++;
        else if (result === "updated") edgesUpdated++;
      }
    }

    // ADR-041: Create 'sequence' edges between siblings (same parent)
    for (const [_parentTraceId, children] of parentToChildren) {
      // Children are already in timestamp order (from trace array order)
      for (let i = 0; i < children.length - 1; i++) {
        const fromId = children[i];
        const toId = children[i + 1];
        if (fromId === toId) continue;

        const result = await this.createOrUpdateEdge(fromId, toId, "sequence");
        if (result === "created") edgesCreated++;
        else if (result === "updated") edgesUpdated++;
      }
    }

    // ADR-041: Backward compatibility - create sequence edges for top-level traces without parent
    const topLevelTraces = traces.filter((t) =>
      (t.type === "tool_end" || t.type === "capability_end") && !t.parent_trace_id
    );
    for (let i = 0; i < topLevelTraces.length - 1; i++) {
      const from = topLevelTraces[i];
      const to = topLevelTraces[i + 1];

      const fromId = from.type === "tool_end"
        ? (from as { tool: string }).tool
        : `capability:${(from as { capability_id: string }).capability_id}`;
      const toId = to.type === "tool_end"
        ? (to as { tool: string }).tool
        : `capability:${(to as { capability_id: string }).capability_id}`;

      if (fromId === toId) continue;

      const result = await this.createOrUpdateEdge(fromId, toId, "sequence");
      if (result === "created") edgesCreated++;
      else if (result === "updated") edgesUpdated++;
    }

    // Recompute metrics if changes were made
    if (edgesCreated > 0 || edgesUpdated > 0) {
      if (this.graph.order > 0) {
        await this.precomputeMetrics();
      }
    }

    const elapsed = performance.now() - startTime;
    log.info(
      `[updateFromCodeExecution] Processed ${traces.length} traces: ${edgesCreated} edges created, ${edgesUpdated} updated (${elapsed.toFixed(1)}ms)`,
    );
  }

  /**
   * ADR-041: Create or update an edge with type and source tracking
   *
   * @param fromId - Source node ID
   * @param toId - Target node ID
   * @param edgeType - Edge type: 'contains', 'sequence', or 'dependency'
   * @returns "created" | "updated" | "none"
   */
  private async createOrUpdateEdge(
    fromId: string,
    toId: string,
    edgeType: "contains" | "sequence" | "dependency",
  ): Promise<"created" | "updated" | "none"> {
    const baseWeight = GraphRAGEngine.EDGE_TYPE_WEIGHTS[edgeType];

    if (this.graph.hasEdge(fromId, toId)) {
      const edge = this.graph.getEdgeAttributes(fromId, toId);
      const newCount = (edge.count as number) + 1;

      // ADR-041: Update edge_source based on observation count
      let newSource = edge.edge_source as string || "inferred";
      if (newCount >= GraphRAGEngine.OBSERVED_THRESHOLD && newSource === "inferred") {
        newSource = "observed";
      }

      // ADR-041: Compute combined weight (type × source modifier)
      const sourceModifier = GraphRAGEngine.EDGE_SOURCE_MODIFIERS[newSource] || 0.7;
      const newWeight = baseWeight * sourceModifier;

      this.graph.setEdgeAttribute(fromId, toId, "count", newCount);
      this.graph.setEdgeAttribute(fromId, toId, "weight", newWeight);
      this.graph.setEdgeAttribute(fromId, toId, "edge_type", edgeType);
      this.graph.setEdgeAttribute(fromId, toId, "edge_source", newSource);

      this.emit({
        type: "edge_updated",
        data: {
          from_tool_id: fromId,
          to_tool_id: toId,
          old_confidence: edge.weight as number,
          new_confidence: newWeight,
          observed_count: newCount,
          timestamp: new Date().toISOString(),
        },
      });

      return "updated";
    } else {
      // ADR-041: New edge starts as 'inferred'
      const sourceModifier = GraphRAGEngine.EDGE_SOURCE_MODIFIERS["inferred"];
      const weight = baseWeight * sourceModifier;

      this.graph.addEdge(fromId, toId, {
        count: 1,
        weight: weight,
        source: "code_execution",
        edge_type: edgeType,
        edge_source: "inferred",
      });

      this.emit({
        type: "edge_created",
        data: {
          from_tool_id: fromId,
          to_tool_id: toId,
          confidence_score: weight,
          timestamp: new Date().toISOString(),
        },
      });

      return "created";
    }
  }

  /**
   * Persist graph edges to database
   * ADR-041: Now persists edge_type and edge_source
   *
   * Saves all edges from Graphology back to PGlite for persistence.
   */
  private async persistEdgesToDB(): Promise<void> {
    for (const edge of this.graph.edges()) {
      const [from, to] = this.graph.extremities(edge);
      const attrs = this.graph.getEdgeAttributes(edge);

      // ADR-041: Include edge_type and edge_source in persistence
      await this.db.query(
        `
        INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score, edge_type, edge_source)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (from_tool_id, to_tool_id) DO UPDATE SET
          observed_count = $3,
          confidence_score = $4,
          edge_type = $5,
          edge_source = $6,
          last_observed = NOW()
      `,
        [
          from,
          to,
          attrs.count,
          attrs.weight,
          attrs.edge_type || "sequence", // ADR-041: default for existing edges
          attrs.edge_source || "inferred", // ADR-041: default for existing edges
        ],
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

    this.graph.forEachEdge(
      (_edge: string, attrs: Record<string, unknown>, source: string, target: string) => {
        edges.push({
          source,
          target,
          attributes: { ...attrs },
        });
      },
    );

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
   * ADR-041: Now weighted by edge type and source
   *
   * Finds tools that share common neighbors, weighted by neighbor rarity
   * AND by the edge quality (type × source modifier).
   *
   * Formula: AA(u,v) = Σ (edge_weight × 1/log(|N(w)|)) for all w in N(u) ∩ N(v)
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

      // ADR-041: Get edge weight from toolId → neighbor
      let edgeWeight = 0.5; // default
      if (this.graph.hasEdge(toolId, neighbor)) {
        const attrs = this.graph.getEdgeAttributes(toolId, neighbor);
        edgeWeight = this.getEdgeWeight(
          attrs.edge_type as string || "sequence",
          attrs.edge_source as string || "inferred",
        );
      } else if (this.graph.hasEdge(neighbor, toolId)) {
        const attrs = this.graph.getEdgeAttributes(neighbor, toolId);
        edgeWeight = this.getEdgeWeight(
          attrs.edge_type as string || "sequence",
          attrs.edge_source as string || "inferred",
        );
      }

      for (const twoHop of this.graph.neighbors(neighbor)) {
        if (twoHop === toolId) continue;
        // ADR-041: Weight the AA contribution by edge quality
        const aaContribution = edgeWeight / Math.log(degree);
        scores.set(twoHop, (scores.get(twoHop) || 0) + aaContribution);
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
   * ADR-041: Template edges are marked with edge_source: 'template'
   *
   * Creates initial edges based on predefined workflow patterns.
   * Used to solve cold-start problem when no usage data exists.
   *
   * @param templates - Workflow templates with edges
   */
  async bootstrapFromTemplates(
    templates: Record<string, { edges: [string, string][] }>,
  ): Promise<void> {
    let edgesAdded = 0;

    for (const [_templateName, template] of Object.entries(templates)) {
      for (const [from, to] of template.edges) {
        if (this.graph.hasNode(from) && this.graph.hasNode(to)) {
          if (!this.graph.hasEdge(from, to)) {
            // ADR-041: Template edges get lowest confidence (type × template modifier)
            const baseWeight = GraphRAGEngine.EDGE_TYPE_WEIGHTS["dependency"];
            const sourceModifier = GraphRAGEngine.EDGE_SOURCE_MODIFIERS["template"];
            const weight = baseWeight * sourceModifier; // 1.0 × 0.5 = 0.5

            this.graph.addEdge(from, to, {
              count: 1,
              weight: weight,
              source: "template",
              edge_type: "dependency", // ADR-041: Templates create explicit dependencies
              edge_source: "template", // ADR-041: Mark as template-originated
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

  /**
   * Get graph density (0-1)
   * Density = actual_edges / max_possible_edges
   */
  private getDensity(): number {
    const nodeCount = this.graph.order;
    if (nodeCount <= 1) return 0;

    const maxPossibleEdges = nodeCount * (nodeCount - 1); // directed graph
    return this.graph.size / maxPossibleEdges;
  }

  /**
   * Get top N tools by PageRank score
   */
  private getTopPageRank(n: number): Array<{ tool_id: string; score: number }> {
    const entries = Object.entries(this.pageRanks)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n);

    return entries.map(([tool_id, score]) => ({ tool_id, score }));
  }

  /**
   * Get total number of communities detected
   */
  private getCommunitiesCount(): number {
    return new Set(Object.values(this.communities)).size;
  }

  // ============================================
  // Story 6.2: Graph Visualization Dashboard
  // ============================================

  /**
   * Get complete graph snapshot for visualization
   *
   * Returns all nodes and edges with their attributes for rendering
   * in the dashboard interface.
   *
   * @returns GraphSnapshot containing nodes, edges, and metadata
   */
  getGraphSnapshot(): GraphSnapshot {
    const nodes = this.graph.nodes().map((toolId: string) => {
      // Tool IDs can be in format "server:tool_name" or "mcp__server__tool_name"
      // Support both formats for backward compatibility
      let server = "unknown";
      let label = toolId;

      if (toolId.includes(":")) {
        // Format: "server:tool_name" (e.g., "filesystem:read_file")
        const colonIndex = toolId.indexOf(":");
        server = toolId.substring(0, colonIndex);
        label = toolId.substring(colonIndex + 1);
      } else if (toolId.includes("__")) {
        // Format: "mcp__server__tool_name"
        const parts = toolId.split("__");
        if (parts.length >= 3) {
          server = parts[1];
          label = parts.slice(2).join("__");
        }
      }

      return {
        id: toolId,
        label,
        server,
        pagerank: this.pageRanks[toolId] || 0,
        degree: this.graph.degree(toolId),
      };
    });

    const edges = this.graph.edges().map((edgeKey: string) => {
      const edge = this.graph.getEdgeAttributes(edgeKey);
      return {
        source: this.graph.source(edgeKey),
        target: this.graph.target(edgeKey),
        confidence: edge.weight ?? 0,
        observed_count: edge.count ?? 0,
        // ADR-041: Include edge_type and edge_source for visualization
        edge_type: (edge.edge_type as string) ?? "sequence",
        edge_source: (edge.edge_source as string) ?? "inferred",
      };
    });

    return {
      nodes,
      edges,
      metadata: {
        total_nodes: nodes.length,
        total_edges: edges.length,
        density: this.getDensity(),
        last_updated: new Date().toISOString(),
      },
    };
  }

  // ============================================
  // Story 6.4: Search Tools for Autocomplete
  // ============================================

  /**
   * Search tools for autocomplete suggestions (Story 6.4 AC10)
   *
   * Fast prefix-based search on tool name/server for autocomplete.
   * Returns results with pagerank for ranking display.
   *
   * @param query - Search query (min 2 chars)
   * @param limit - Maximum results (default: 10)
   * @returns Array of matching tools with metadata
   */
  searchToolsForAutocomplete(
    query: string,
    limit: number = 10,
  ): Array<{
    tool_id: string;
    name: string;
    server: string;
    description: string;
    score: number;
    pagerank: number;
  }> {
    if (query.length < 2) return [];

    const lowerQuery = query.toLowerCase();
    const results: Array<{
      tool_id: string;
      name: string;
      server: string;
      description: string;
      score: number;
      pagerank: number;
    }> = [];

    // Search through all nodes in graph
    this.graph.forEachNode(
      (
        toolId: string,
        attrs: { name?: string; serverId?: string; metadata?: { description?: string } },
      ) => {
        // Extract server and name from tool_id
        let server = "unknown";
        let name = toolId;

        if (toolId.includes(":")) {
          const colonIndex = toolId.indexOf(":");
          server = toolId.substring(0, colonIndex);
          name = toolId.substring(colonIndex + 1);
        } else if (toolId.includes("__")) {
          const parts = toolId.split("__");
          if (parts.length >= 3) {
            server = parts[1];
            name = parts.slice(2).join("__");
          }
        }

        const description = attrs.metadata?.description || attrs.name || "";
        const lowerName = name.toLowerCase();
        const lowerServer = server.toLowerCase();
        const lowerDescription = description.toLowerCase();

        // Score based on match quality
        let score = 0;

        // Exact name match = highest score
        if (lowerName === lowerQuery) {
          score = 1.0;
        } // Name starts with query = high score
        else if (lowerName.startsWith(lowerQuery)) {
          score = 0.9;
        } // Name contains query = medium score
        else if (lowerName.includes(lowerQuery)) {
          score = 0.7;
        } // Server matches = lower score
        else if (lowerServer.includes(lowerQuery)) {
          score = 0.5;
        } // Description contains query = lowest score
        else if (lowerDescription.includes(lowerQuery)) {
          score = 0.3;
        }

        if (score > 0) {
          results.push({
            tool_id: toolId,
            name,
            server,
            description: description.substring(0, 200), // Truncate for autocomplete
            score,
            pagerank: this.pageRanks[toolId] || 0,
          });
        }
      },
    );

    // Sort by score (desc), then by pagerank (desc)
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.pagerank - a.pagerank;
    });

    return results.slice(0, limit);
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
      // 1. Calculate graph density for adaptive parameters
      const edgeCount = this.getEdgeCount();
      const nodeCount = this.getStats().nodeCount;
      const maxPossibleEdges = nodeCount * (nodeCount - 1); // directed graph
      const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

      // ADR-023: Dynamic Candidate Expansion based on graph maturity
      // Cold start: 1.5x (trust semantic), Growing: 2.0x, Mature: 3.0x (find hidden gems)
      const expansionMultiplier = density < 0.01 ? 1.5 : density < 0.10 ? 2.0 : 3.0;
      const searchLimit = Math.ceil(limit * expansionMultiplier);

      // 2. Semantic search for base candidates with dynamic expansion
      const semanticResults = await vectorSearch.searchTools(query, searchLimit, 0.5);

      if (semanticResults.length === 0) {
        log.debug(`[searchToolsHybrid] No semantic candidates for: "${query}"`);
        return [];
      }

      // 3. Calculate adaptive alpha based on graph density (ADR-015)
      // More semantic weight when graph is sparse (cold start)
      const alpha = Math.max(0.5, 1.0 - density * 2);

      log.debug(
        `[searchToolsHybrid] alpha=${
          alpha.toFixed(2)
        }, expansion=${expansionMultiplier}x (density=${density.toFixed(4)}, edges=${edgeCount})`,
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
        `[searchToolsHybrid] "${query}" → ${topResults.length} results (alpha=${
          alpha.toFixed(2)
        }, ${elapsedMs.toFixed(1)}ms)`,
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

  // ============================================
  // Story 6.3: Live Metrics & Analytics Panel
  // ============================================

  /**
   * Get adaptive alpha value for hybrid search (Story 6.3 AC2)
   *
   * Alpha controls the balance between semantic and graph scores:
   * - alpha=1.0: Pure semantic search (cold start, no graph data)
   * - alpha=0.5: Equal weight (dense graph)
   *
   * Formula: alpha = max(0.5, 1.0 - density * 2)
   *
   * @returns Alpha value between 0.5 and 1.0
   */
  getAdaptiveAlpha(): number {
    const nodeCount = this.graph.order;
    if (nodeCount <= 1) return 1.0;

    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    const density = maxPossibleEdges > 0 ? this.graph.size / maxPossibleEdges : 0;
    return Math.max(0.5, 1.0 - density * 2);
  }

  /**
   * Get graph density (0-1) - public version for metrics (Story 6.3)
   *
   * Density = actual_edges / max_possible_edges
   */
  getGraphDensity(): number {
    return this.getDensity();
  }

  /**
   * Get top N tools by PageRank - public version for metrics (Story 6.3)
   */
  getPageRankTop(n: number): Array<{ tool_id: string; score: number }> {
    return this.getTopPageRank(n);
  }

  /**
   * Get total communities count - public version for metrics (Story 6.3)
   */
  getTotalCommunities(): number {
    return this.getCommunitiesCount();
  }

  /**
   * Get comprehensive metrics for dashboard (Story 6.3 AC4)
   *
   * Aggregates current snapshot, time series data, and period statistics.
   *
   * @param range - Time range for historical data ("1h", "24h", "7d")
   * @returns Complete metrics response for dashboard
   */
  async getMetrics(range: MetricsTimeRange): Promise<GraphMetricsResponse> {
    const startTime = performance.now();

    // Current snapshot metrics
    const current = {
      node_count: this.graph.order,
      edge_count: this.graph.size,
      density: this.getDensity(),
      adaptive_alpha: this.getAdaptiveAlpha(),
      communities_count: this.getCommunitiesCount(),
      pagerank_top_10: this.getTopPageRank(10),
    };

    // Calculate interval for time range
    const intervalHours = range === "1h" ? 1 : range === "24h" ? 24 : 168; // 7d = 168h
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const startDate = new Date(Date.now() - intervalMs);

    // Fetch time series data
    const timeseries = await this.getMetricsTimeSeries(range, startDate);

    // Fetch period statistics
    const period = await this.getPeriodStats(range, startDate);

    const elapsed = performance.now() - startTime;
    log.debug(`[getMetrics] Collected metrics in ${elapsed.toFixed(1)}ms (range=${range})`);

    return {
      current,
      timeseries,
      period,
    };
  }

  /**
   * Get time series data for metrics charts (Story 6.3 AC3)
   *
   * Queries metrics table for historical data points.
   *
   * @param range - Time range
   * @param startDate - Start date for query
   * @returns Time series data for charts
   */
  private async getMetricsTimeSeries(
    range: MetricsTimeRange,
    startDate: Date,
  ): Promise<{
    edge_count: TimeSeriesPoint[];
    avg_confidence: TimeSeriesPoint[];
    workflow_rate: TimeSeriesPoint[];
  }> {
    // Determine bucket size based on range
    const bucketMinutes = range === "1h" ? 5 : range === "24h" ? 60 : 360; // 6h buckets for 7d

    try {
      // Query edge count over time from metrics table
      const edgeCountResult = await this.db.query(
        `
        SELECT
          date_trunc('hour', timestamp) +
          (EXTRACT(minute FROM timestamp)::int / $1) * interval '1 minute' * $1 as bucket,
          AVG(value) as avg_value
        FROM metrics
        WHERE metric_name = 'graph_edge_count'
          AND timestamp >= $2
        GROUP BY bucket
        ORDER BY bucket
        `,
        [bucketMinutes, startDate.toISOString()],
      );

      // Query average confidence score over time
      const avgConfidenceResult = await this.db.query(
        `
        SELECT
          date_trunc('hour', timestamp) +
          (EXTRACT(minute FROM timestamp)::int / $1) * interval '1 minute' * $1 as bucket,
          AVG(value) as avg_value
        FROM metrics
        WHERE metric_name = 'avg_confidence_score'
          AND timestamp >= $2
        GROUP BY bucket
        ORDER BY bucket
        `,
        [bucketMinutes, startDate.toISOString()],
      );

      // Query workflow execution rate (workflows per hour)
      const workflowRateResult = await this.db.query(
        `
        SELECT
          date_trunc('hour', executed_at) as bucket,
          COUNT(*) as count
        FROM workflow_execution
        WHERE executed_at >= $1
        GROUP BY bucket
        ORDER BY bucket
        `,
        [startDate.toISOString()],
      );

      return {
        edge_count: edgeCountResult.map((row: Record<string, unknown>) => ({
          timestamp: String(row.bucket),
          value: Number(row.avg_value) || 0,
        })),
        avg_confidence: avgConfidenceResult.map((row: Record<string, unknown>) => ({
          timestamp: String(row.bucket),
          value: Number(row.avg_value) || 0,
        })),
        workflow_rate: workflowRateResult.map((row: Record<string, unknown>) => ({
          timestamp: String(row.bucket),
          value: Number(row.count) || 0,
        })),
      };
    } catch (error) {
      log.warn(`[getMetricsTimeSeries] Query failed, returning empty data: ${error}`);
      return {
        edge_count: [],
        avg_confidence: [],
        workflow_rate: [],
      };
    }
  }

  /**
   * Get period statistics (Story 6.3 AC2)
   *
   * @param range - Time range
   * @param startDate - Start date for query
   * @returns Period statistics
   */
  private async getPeriodStats(
    range: MetricsTimeRange,
    startDate: Date,
  ): Promise<{
    range: MetricsTimeRange;
    workflows_executed: number;
    workflows_success_rate: number;
    new_edges_created: number;
    new_nodes_added: number;
  }> {
    try {
      // Workflow statistics
      const workflowStats = await this.db.query(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful
        FROM workflow_execution
        WHERE executed_at >= $1
        `,
        [startDate.toISOString()],
      );

      const total = Number(workflowStats[0]?.total) || 0;
      const successful = Number(workflowStats[0]?.successful) || 0;
      const successRate = total > 0 ? (successful / total) * 100 : 0;

      // New edges created in period
      const newEdges = await this.db.query(
        `
        SELECT COUNT(*) as count
        FROM tool_dependency
        WHERE last_observed >= $1
        `,
        [startDate.toISOString()],
      );

      // New nodes added (tools embedded in period) - approximate via metrics
      const newNodes = await this.db.query(
        `
        SELECT COUNT(DISTINCT metadata->>'tool_id') as count
        FROM metrics
        WHERE metric_name = 'tool_embedded'
          AND timestamp >= $1
        `,
        [startDate.toISOString()],
      );

      return {
        range,
        workflows_executed: total,
        workflows_success_rate: Math.round(successRate * 10) / 10,
        new_edges_created: Number(newEdges[0]?.count) || 0,
        new_nodes_added: Number(newNodes[0]?.count) || 0,
      };
    } catch (error) {
      log.warn(`[getPeriodStats] Query failed, returning zeros: ${error}`);
      return {
        range,
        workflows_executed: 0,
        workflows_success_rate: 0,
        new_edges_created: 0,
        new_nodes_added: 0,
      };
    }
  }
}

// ============================================
// Story 6.2: Graph Snapshot Types
// ============================================

/**
 * Graph snapshot for visualization dashboard
 * ADR-041: Added edge_type and edge_source for visual differentiation
 */
export interface GraphSnapshot {
  nodes: Array<{
    id: string;
    label: string;
    server: string;
    pagerank: number;
    degree: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    confidence: number;
    observed_count: number;
    /** ADR-041: Edge type - 'contains', 'sequence', or 'dependency' */
    edge_type: string;
    /** ADR-041: Edge source - 'observed', 'inferred', or 'template' */
    edge_source: string;
  }>;
  metadata: {
    total_nodes: number;
    total_edges: number;
    density: number;
    last_updated: string;
  };
}
