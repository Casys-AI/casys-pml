/**
 * CytoscapeGraph Island - Advanced graph visualization using Cytoscape.js
 *
 * Features:
 * - Compound nodes (Capabilities contain Tools and other Capabilities)
 * - Expand/Collapse functionality for hierarchical navigation
 * - Two view modes: Capabilities (hierarchical) and Tools (flat)
 * - Configurable highlight depth for exploring connections
 * - Integration with CodePanel for code/schema display
 *
 * @module web/islands/CytoscapeGraph
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

// Tool invocation from API (snake_case)
interface ApiToolInvocation {
  id: string;
  tool: string;
  ts: number;
  duration_ms: number;
  sequence_index: number;
}

// Types matching the API response (snake_case from server)
interface ApiNodeData {
  id: string;
  type: "capability" | "tool" | "tool_invocation";
  label: string;
  // Capability fields
  code_snippet?: string;
  success_rate?: number;
  usage_count?: number;
  tools_count?: number;
  tools_used?: string[]; // Unique tools (deduplicated)
  tool_invocations?: ApiToolInvocation[]; // Full sequence with timestamps
  pagerank?: number;
  // Story 11.4: Execution traces (when include_traces=true)
  traces?: Array<{
    id: string;
    capability_id?: string;
    executed_at: string;
    success: boolean;
    duration_ms: number;
    error_message?: string;
    priority: number;
    task_results: Array<{
      task_id: string;
      tool: string;
      args: Record<string, unknown>;
      result: unknown;
      success: boolean;
      duration_ms: number;
      layer_index?: number;
    }>;
  }>;
  // Tool fields
  server?: string;
  parent?: string;
  parents?: string[];
  degree?: number;
  community_id?: number;
  // Tool invocation fields
  tool?: string; // The underlying tool ID (e.g., "filesystem:read_file")
  ts?: number; // Timestamp when invocation started
  duration_ms?: number; // Execution duration
  sequence_index?: number; // Sequence index within capability
}

interface ApiNode {
  data: ApiNodeData;
}

interface ApiEdgeData {
  id: string;
  source: string;
  target: string;
  edge_type?: string;
  edgeType?: string;
  weight?: number;
  observed_count?: number;
  // Sequence edge fields
  time_delta_ms?: number;
  is_parallel?: boolean;
  // Provides edge fields (Story 11.4 AC12)
  coverage?: "strict" | "partial" | "optional";
}

interface ApiEdge {
  data: ApiEdgeData;
}

interface HypergraphApiResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
  capabilities_count: number;
  tools_count: number;
}

// Tool invocation (internal camelCase)
interface ToolInvocation {
  id: string;
  tool: string;
  ts: number;
  durationMs: number;
  sequenceIndex: number;
}

// Story 11.4: Trace task result with layerIndex for fan-in/fan-out
export interface TraceTaskResult {
  taskId: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
  durationMs: number;
  layerIndex?: number;
}

// Story 11.4: Execution trace for capability
export interface ExecutionTrace {
  id: string;
  capabilityId?: string;
  executedAt: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
  priority: number;
  taskResults: TraceTaskResult[];
}

// Transformed types for internal use
interface CapabilityNode {
  id: string;
  name: string;
  type: "capability";
  successRate: number;
  usageCount: number;
  communityId?: number;
  codeSnippet?: string;
  toolsCount?: number;
  toolsUsed?: string[]; // Unique tools (deduplicated)
  toolInvocations?: ToolInvocation[]; // Full sequence with timestamps
  parentCapabilityId?: string;
  traces?: ExecutionTrace[]; // Story 11.4: Recent execution traces
}

interface ToolNode {
  id: string;
  name: string;
  type: "tool";
  server: string;
  pagerank: number;
  parentCapabilities: string[];
  inputSchema?: Record<string, unknown>;
  description?: string;
}

interface Edge {
  source: string;
  target: string;
  edgeType:
    | "hierarchy"
    | "contains"
    | "sequence"
    | "dependency"
    | "capability_link"
    | "uses"
    | "provides"
    | "dependsOn";
  weight?: number;
  observedCount?: number;
  // Sequence edge specific
  timeDeltaMs?: number;
  isParallel?: boolean;
  // Provides edge specific (Story 11.4 AC12)
  coverage?: "strict" | "partial" | "optional";
}

interface TransformedData {
  capabilities: CapabilityNode[];
  tools: ToolNode[];
  edges: Edge[];
}

export interface CapabilityData {
  id: string;
  label: string;
  successRate: number;
  usageCount: number;
  toolsCount: number;
  codeSnippet?: string;
  toolIds?: string[];
  childCapabilityIds?: string[];
  communityId?: number;
  lastUsedAt?: number;
  createdAt?: number;
  traces?: ExecutionTrace[]; // Story 11.4
}

export interface ToolData {
  id: string;
  label: string;
  server: string;
  description?: string;
  parentCapabilities?: string[];
  inputSchema?: Record<string, unknown>;
  observedCount?: number;
}

/** View mode for the graph */
export type ViewMode = "capabilities" | "tools";

/** Node mode - definition (generic tools) vs invocation (actual calls) */
export type NodeMode = "definition" | "invocation";

interface CytoscapeGraphProps {
  apiBase: string;
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  onToolSelect?: (tool: ToolData | null) => void;
  onNodeSelect?: (node: { id: string; label: string; server: string } | null) => void;
  highlightedNodeId?: string | null;
  pathNodes?: string[] | null;
  /** Highlight depth (1 = direct connections, Infinity = full stack) */
  highlightDepth?: number;
  /** Current view mode */
  viewMode?: ViewMode;
  /** Node mode - definition (generic tools) vs invocation (actual calls) */
  nodeMode?: NodeMode;
  /** Callback when expand/collapse state changes */
  onExpandedNodesChange?: (expandedIds: Set<string>) => void;
  /** External control of expanded nodes */
  expandedNodes?: Set<string>;
  /** Key to trigger data refresh (increment to refetch) */
  refreshKey?: number;
  /** Callback when server list is discovered from graph data (eliminates redundant fetch) */
  onServersDiscovered?: (servers: Set<string>) => void;
}

// Color palette for servers
const SERVER_COLORS = [
  "#FFB86F", // accent orange
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#FFE66D", // bright yellow
  "#95E1D3", // mint green
  "#F38181", // salmon pink
  "#AA96DA", // lavender
  "#FCBAD3", // light pink
  "#A8D8EA", // sky blue
  "#FF9F43", // bright orange
  "#6C5CE7", // purple
  "#00CEC9", // cyan
];

// Capability colors by zone/category
const CAPABILITY_COLORS = [
  "#8b5cf6", // violet (default)
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export default function CytoscapeGraph({
  apiBase,
  onCapabilitySelect,
  onToolSelect,
  onNodeSelect,
  highlightedNodeId,
  pathNodes,
  highlightDepth = 1,
  viewMode = "capabilities",
  nodeMode = "definition",
  onExpandedNodesChange,
  expandedNodes: externalExpandedNodes,
  refreshKey = 0,
  onServersDiscovered,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-explicit-any
  const cyRef = useRef<any>(null);
  const serverColorsRef = useRef<Map<string, string>>(new Map());
  const capabilityColorsRef = useRef<Map<string, string>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalExpandedNodes, setInternalExpandedNodes] = useState<Set<string>>(new Set());

  // Use external expanded nodes if provided, otherwise use internal state
  const expandedNodes = externalExpandedNodes ?? internalExpandedNodes;
  const setExpandedNodes = useCallback(
    (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (externalExpandedNodes !== undefined && onExpandedNodesChange) {
        const newNodes = typeof nodes === "function" ? nodes(externalExpandedNodes) : nodes;
        onExpandedNodesChange(newNodes);
      } else {
        setInternalExpandedNodes(nodes as Set<string>);
      }
    },
    [externalExpandedNodes, onExpandedNodesChange],
  );

  // Store data for callbacks
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const toolDataRef = useRef<Map<string, ToolData>>(new Map());
  const rawDataRef = useRef<TransformedData | null>(null);

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % SERVER_COLORS.length;
      serverColorsRef.current.set(server, SERVER_COLORS[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  const getCapabilityColor = useCallback((capId: string, communityId?: number): string => {
    if (!capabilityColorsRef.current.has(capId)) {
      const index = communityId ?? capabilityColorsRef.current.size;
      capabilityColorsRef.current.set(capId, CAPABILITY_COLORS[index % CAPABILITY_COLORS.length]);
    }
    return capabilityColorsRef.current.get(capId)!;
  }, []);

  // Count children (tools + nested capabilities) for badge
  const countChildren = useCallback((capId: string): { tools: number; caps: number } => {
    const data = rawDataRef.current;
    if (!data) return { tools: 0, caps: 0 };

    const tools = data.tools.filter((t) => t.parentCapabilities.includes(capId)).length;
    const caps = data.capabilities.filter((c) => c.parentCapabilityId === capId).length;
    return { tools, caps };
  }, []);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // deno-lint-ignore no-explicit-any
    const cy = (globalThis as any).cytoscape;
    if (!cy) {
      setError("Cytoscape.js not loaded");
      return;
    }

    // Create Cytoscape instance with compound node support
    cyRef.current = cy({
      container: containerRef.current,
      style: getCytoscapeStyles(),
      layout: { name: "preset" },
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 3,
    });

    // Load data
    loadData();

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, []);

  // Refetch data when refreshKey changes (for SSE incremental updates)
  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    // Skip initial render (loadData already called in init useEffect)
    if (prevRefreshKeyRef.current === refreshKey) return;
    console.log(`[CytoscapeGraph] refreshKey changed: ${prevRefreshKeyRef.current} -> ${refreshKey}`);
    prevRefreshKeyRef.current = refreshKey;

    // Refetch data silently (no loading indicator) - Cytoscape instance already exists
    if (cyRef.current) {
      console.log("[CytoscapeGraph] Calling loadData(silent) due to refreshKey change");
      loadData(0, true); // silent=true for SSE updates
    } else {
      console.warn("[CytoscapeGraph] cyRef.current is null, cannot reload data");
    }
  }, [refreshKey]);

  // Track previous values for incremental updates
  const prevViewModeRef = useRef(viewMode);
  const prevNodeModeRef = useRef(nodeMode);
  const isInitialRenderRef = useRef(true);

  // Re-render when view mode or node mode change (full re-render)
  useEffect(() => {
    if (!rawDataRef.current || !cyRef.current) return;

    const viewModeChanged = prevViewModeRef.current !== viewMode;
    const nodeModeChanged = prevNodeModeRef.current !== nodeMode;

    if (isInitialRenderRef.current || viewModeChanged || nodeModeChanged) {
      renderGraph(true); // Full render with layout
      isInitialRenderRef.current = false;
    } else {
      // Just expand/collapse changed - do incremental update
      renderGraph(false); // Incremental update, no full layout
    }

    prevViewModeRef.current = viewMode;
    prevNodeModeRef.current = nodeMode;
  }, [viewMode, expandedNodes, nodeMode]);

  const getCytoscapeStyles = () => [
    // Capability nodes (compound containers - bento boxes)
    {
      selector: 'node[type="capability"]',
      style: {
        "background-color": "data(bgColor)",
        "background-opacity": 0.15,
        "border-color": "data(color)",
        "border-width": 2,
        "border-style": "solid",
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "11px",
        "font-weight": "bold",
        color: "data(color)",
        "text-margin-y": -8,
        shape: "roundrectangle",
        // Reduced padding for tighter layout
        "padding": "15px",
        "compound-sizing-wrt-labels": "include",
        "min-width": "80px",
        "min-height": "50px",
      },
    },
    // Tool nodes
    {
      selector: 'node[type="tool"]',
      style: {
        "background-color": "data(color)",
        "border-color": "#fff",
        "border-width": 1,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "9px",
        color: "#d5c3b5",
        "text-margin-y": 5,
        width: "mapData(pagerank, 0, 0.1, 20, 45)",
        height: "mapData(pagerank, 0, 0.1, 20, 45)",
        shape: "ellipse",
      },
    },
    // Tool invocation nodes (individual calls with sequence number)
    {
      selector: 'node[type="tool_invocation"]',
      style: {
        "background-color": "data(color)",
        "border-color": "#fff",
        "border-width": 2,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "8px",
        color: "#d5c3b5",
        "text-margin-y": 4,
        width: 28,
        height: 28,
        shape: "diamond", // Diamond shape to distinguish from regular tools
      },
    },
    // Edges - hierarchy (capability → tool)
    {
      selector: 'edge[edgeType="hierarchy"]',
      style: {
        width: 1.5,
        "line-color": "#555",
        "curve-style": "bezier",
        opacity: 0.3,
      },
    },
    // Edges - contains (capability → capability)
    {
      selector: 'edge[edgeType="contains"]',
      style: {
        width: 2,
        "line-color": "#8b5cf6",
        "curve-style": "bezier",
        opacity: 0.4,
      },
    },
    // Edges - depends
    {
      selector: 'edge[edgeType="dependency"]',
      style: {
        width: 2,
        "line-color": "#3b82f6",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#3b82f6",
        "curve-style": "bezier",
        "line-style": "solid",
        opacity: 0.6,
      },
    },
    // Edges - sequence (sequential execution)
    {
      selector: 'edge[edgeType="sequence"]',
      style: {
        width: 2,
        "line-color": "#10b981",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#10b981",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        opacity: 0.5,
      },
    },
    // Edges - sequence with parallel execution (overlapping timestamps)
    {
      selector: 'edge[edgeType="sequence"][?isParallel]',
      style: {
        width: 2,
        "line-color": "#f59e0b", // Amber color for parallel
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#f59e0b",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        "line-style": "dashed",
        opacity: 0.7,
      },
    },
    // Edges - capability_link (shared tools)
    {
      selector: 'edge[edgeType="capability_link"]',
      style: {
        width: 1.5,
        "line-color": "#8b5cf6",
        "line-style": "dashed",
        "curve-style": "bezier",
        opacity: 0.4,
      },
    },
    // Edges - uses (tool used by multiple capabilities) - dashed
    {
      selector: 'edge[edgeType="uses"]',
      style: {
        width: 1,
        "line-color": "#FFB86F",
        "line-style": "dotted",
        "curve-style": "bezier",
        opacity: 0.3,
      },
    },
    // Edges - hyperedge (shared tool connection to other capabilities)
    {
      selector: 'edge[edgeType="hyperedge"]',
      style: {
        width: 2,
        "line-color": "#FFB86F",
        "line-style": "dashed",
        "target-arrow-shape": "diamond",
        "target-arrow-color": "#FFB86F",
        "arrow-scale": 0.6,
        "curve-style": "bezier",
        opacity: 0.6,
      },
    },
    // Story 11.4 AC12: Edges - provides (data flow: A.output → B.input)
    {
      selector: 'edge[edgeType="provides"]',
      style: {
        width: 2,
        "line-color": "#22c55e",
        "line-style": "dashed",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#22c55e",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        opacity: 0.7,
      },
    },
    // Story 11.4 AC12: Edges - dependsOn (reverse of provides)
    {
      selector: 'edge[edgeType="dependsOn"]',
      style: {
        width: 2,
        "line-color": "#3b82f6",
        "line-style": "solid",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#3b82f6",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        opacity: 0.7,
      },
    },
    // Highlighted node
    {
      selector: "node.highlighted",
      style: {
        "border-color": "#FFB86F",
        "border-width": 4,
        "z-index": 999,
      },
    },
    // Selected node (persistent)
    {
      selector: "node.selected",
      style: {
        "border-color": "#FFB86F",
        "border-width": 5,
        "overlay-color": "#FFB86F",
        "overlay-padding": 8,
        "overlay-opacity": 0.3,
        "z-index": 1000,
      },
    },
    // Connected to highlighted
    {
      selector: "node.connected",
      style: {
        opacity: 1,
      },
    },
    // Dimmed (not connected)
    {
      selector: "node.dimmed",
      style: {
        opacity: 0.3,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity: 0.1,
      },
    },
    {
      selector: "edge.highlighted",
      style: {
        opacity: 1,
        width: 3,
        "line-color": "#FFB86F",
        "target-arrow-color": "#FFB86F",
        "z-index": 999,
      },
    },
    // Path highlighting
    {
      selector: "node.path",
      style: {
        "border-color": "#10b981",
        "border-width": 4,
      },
    },
    {
      selector: "edge.path",
      style: {
        "line-color": "#10b981",
        opacity: 1,
        width: 3,
      },
    },
  ];

  const loadData = async (retryCount = 0, silent = false) => {
    const MAX_RETRIES = 5;
    const BASE_DELAY = 1000;

    console.log(`[CytoscapeGraph] loadData called (retry ${retryCount}, silent=${silent})`);
    // Only show loading indicator on initial load, not SSE refreshes
    if (!silent) {
      setIsLoading(true);
    }
    if (retryCount === 0) {
      setError(null);
    }

    try {
      // Story 11.4: Include traces for invocation mode
      console.log("[CytoscapeGraph] Fetching hypergraph data...");
      const response = await fetch(`${apiBase}/api/graph/hypergraph?include_traces=true`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const apiData: HypergraphApiResponse = await response.json();

      // Transform API response (snake_case) to internal format (camelCase)
      const capabilities: CapabilityNode[] = [];
      const tools: ToolNode[] = [];

      for (const node of apiData.nodes) {
        const d = node.data;
        if (d.type === "capability") {
          const usageCount = d.usage_count ?? 0;
          // Only include capabilities that have been used at least once
          if (usageCount > 0) {
            // Transform tool_invocations from snake_case to camelCase
            const toolInvocations = d.tool_invocations?.map((inv) => ({
              id: inv.id,
              tool: inv.tool,
              ts: inv.ts,
              durationMs: inv.duration_ms,
              sequenceIndex: inv.sequence_index,
            }));

            // Story 11.4: Transform traces from snake_case to camelCase
            const traces = d.traces?.map((t: {
              id: string;
              capability_id?: string;
              executed_at: string;
              success: boolean;
              duration_ms: number;
              error_message?: string;
              priority: number;
              task_results: Array<{
                task_id: string;
                tool: string;
                args: Record<string, unknown>;
                result: unknown;
                success: boolean;
                duration_ms: number;
                layer_index?: number;
              }>;
            }) => ({
              id: t.id,
              capabilityId: t.capability_id,
              executedAt: t.executed_at,
              success: t.success,
              durationMs: t.duration_ms,
              errorMessage: t.error_message,
              priority: t.priority,
              taskResults: t.task_results.map((r) => ({
                taskId: r.task_id,
                tool: r.tool,
                args: r.args,
                result: r.result,
                success: r.success,
                durationMs: r.duration_ms,
                layerIndex: r.layer_index,
              })),
            }));

            capabilities.push({
              id: d.id,
              name: d.label,
              type: "capability",
              successRate: d.success_rate ?? 0,
              usageCount,
              toolsCount: d.tools_count ?? 0,
              toolsUsed: d.tools_used, // Unique tools (deduplicated)
              toolInvocations, // Full sequence with timestamps
              codeSnippet: d.code_snippet,
              communityId: d.community_id,
              traces, // Story 11.4
            });
          }
        } else if (d.type === "tool") {
          const parents = d.parents ?? (d.parent ? [d.parent] : []);
          // Only include tools that have been used (have at least one parent capability)
          if (parents.length > 0) {
            tools.push({
              id: d.id,
              name: d.label,
              type: "tool",
              server: d.server ?? "unknown",
              pagerank: d.pagerank ?? 0,
              parentCapabilities: parents,
            });
          }
        }
        // Note: tool_invocation nodes from API are ignored - we generate them from toolsUsed
      }

      const edges: Edge[] = apiData.edges.map((e) => ({
        source: e.data.source,
        target: e.data.target,
        edgeType: (e.data.edge_type || e.data.edgeType || "hierarchy") as Edge["edgeType"],
        weight: e.data.weight,
        observedCount: e.data.observed_count,
        timeDeltaMs: e.data.time_delta_ms,
        isParallel: e.data.is_parallel,
        coverage: e.data.coverage as Edge["coverage"], // Story 11.4 AC12
      }));

      // Derive parent-child relationships from "contains" edges
      // If A --contains--> B, then B is a child of A (nested inside when expanded)
      const capabilityParentMap = new Map<string, string>();
      for (const edge of edges) {
        if (edge.edgeType === "contains") {
          const parentId = edge.source;
          const childId = edge.target;
          // Only if both are capabilities
          if (parentId.startsWith("cap-") && childId.startsWith("cap-")) {
            if (!capabilityParentMap.has(childId)) {
              capabilityParentMap.set(childId, parentId);
            }
          }
        }
      }

      // Apply parentCapabilityId to capabilities
      for (const cap of capabilities) {
        const parentId = capabilityParentMap.get(cap.id);
        if (parentId) {
          cap.parentCapabilityId = parentId;
        }
      }

      const transformedData: TransformedData = { capabilities, tools, edges };
      rawDataRef.current = transformedData;

      // Build capability data map for CodePanel
      const capMap = new Map<string, CapabilityData>();
      const toolMap = new Map<string, ToolData>();

      for (const cap of capabilities) {
        const toolIds = tools
          .filter((t) => t.parentCapabilities.includes(cap.id))
          .map((t) => t.id);

        const childCapIds = capabilities
          .filter((c) => c.parentCapabilityId === cap.id)
          .map((c) => c.id);

        capMap.set(cap.id, {
          id: cap.id,
          label: cap.name,
          successRate: cap.successRate,
          usageCount: cap.usageCount,
          toolsCount: cap.toolsCount ?? toolIds.length,
          codeSnippet: cap.codeSnippet,
          toolIds,
          childCapabilityIds: childCapIds,
          communityId: cap.communityId,
          traces: cap.traces, // Story 11.4
        });
      }

      for (const tool of tools) {
        toolMap.set(tool.id, {
          id: tool.id,
          label: tool.name,
          server: tool.server,
          parentCapabilities: tool.parentCapabilities,
        });
      }

      capabilityDataRef.current = capMap;
      toolDataRef.current = toolMap;

      // Extract unique servers and notify parent (eliminates redundant fetch in GraphExplorer)
      if (onServersDiscovered) {
        const serverSet = new Set<string>();
        for (const tool of tools) {
          if (tool.server && tool.server !== "unknown") {
            serverSet.add(tool.server);
          }
        }
        onServersDiscovered(serverSet);
      }

      console.log("[CytoscapeGraph] Data loaded, calling renderGraph(true)");
      renderGraph(true);
      if (!silent) {
        setIsLoading(false);
      }
    } catch (err) {
      console.error("[CytoscapeGraph] Failed to load graph data:", err);

      // Retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.warn(`[Graph] Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => loadData(retryCount + 1, silent), delay);
        return; // Don't set error yet, still retrying
      }

      // Only show error on non-silent loads (silent SSE refreshes fail silently)
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load graph");
        setIsLoading(false);
      }
    }
  };

  const renderGraph = (fullLayout = true) => {
    const cy = cyRef.current;
    const data = rawDataRef.current;
    if (!cy || !data) return;

    // Clear existing elements
    cy.elements().remove();

    const elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }> = [];

    if (viewMode === "capabilities") {
      // Capabilities mode: hierarchical with expand/collapse
      renderCapabilitiesMode(elements, data, nodeMode);
    } else {
      // Tools mode: flat tools with capability badges
      renderToolsMode(elements, data);
    }

    // Add all elements
    cy.add(elements);

    // Run layout - full layout with fit, or quick layout without fit
    if (fullLayout) {
      runLayout(true);
    } else {
      // Incremental: quick layout without fit to preserve user's view
      runLayout(false);
    }

    // Setup event handlers
    setupEventHandlers();
  };

  const renderCapabilitiesMode = (
    elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }>,
    data: TransformedData,
    currentNodeMode: NodeMode,
  ) => {
    // All capabilities are always expanded (bento mode)
    const allCapabilities = new Set(data.capabilities.map((c) => c.id));

    // Add all capability nodes (always expanded style)
    for (const cap of data.capabilities) {
      const { tools, caps } = countChildren(cap.id);
      const color = getCapabilityColor(cap.id, cap.communityId);
      const shortName = cap.name.length > 20 ? cap.name.slice(0, 17) + "..." : cap.name;

      elements.push({
        group: "nodes",
        data: {
          id: cap.id,
          label: shortName,
          type: "capability",
          usageCount: cap.usageCount,
          successRate: cap.successRate,
          color,
          bgColor: color,
          childCount: tools + caps,
          // Nested capabilities via contains edges
          ...(cap.parentCapabilityId ? { parent: cap.parentCapabilityId } : {}),
        },
      });
    }

    // Add tool nodes only in "definition" mode
    if (currentNodeMode === "definition") {
      for (const tool of data.tools) {
        const color = getServerColor(tool.server);
        const isShared = tool.parentCapabilities.length > 1;
        const label = tool.name.length > 12 ? tool.name.slice(0, 10) + ".." : tool.name;

        // Create a tool instance in EACH parent capability
        for (const parentCap of tool.parentCapabilities) {
          if (!allCapabilities.has(parentCap)) continue;

          const instanceId = isShared ? `${tool.id}__${parentCap}` : tool.id;

          elements.push({
            group: "nodes",
            data: {
              id: instanceId,
              toolId: tool.id,
              label,
              type: "tool",
              server: tool.server,
              pagerank: tool.pagerank,
              color,
              parent: parentCap,
            },
          });
        }
      }
    }

    // Add tool invocation nodes only in "invocation" mode
    // Story 11.4: Prefer traces with layerIndex for fan-in/fan-out visualization
    // Fallback to toolInvocations, then toolsUsed
    const generatedInvocations: Array<{
      capId: string;
      invId: string;
      index: number;
      layerIndex: number;
      ts?: number;
    }> = [];
    if (currentNodeMode === "invocation") {
      for (const cap of data.capabilities) {
        // Priority 1: Use traces with layerIndex for fan-in/fan-out (Story 11.4)
        const latestTrace = cap.traces?.[0]; // Most recent trace
        if (latestTrace && latestTrace.taskResults.length > 0) {
          for (let i = 0; i < latestTrace.taskResults.length; i++) {
            const task = latestTrace.taskResults[i];
            const [server = "unknown", ...nameParts] = task.tool.split(":");
            const toolName = nameParts.join(":") || task.tool;
            const color = getServerColor(server);
            const layerIndex = task.layerIndex ?? 0;
            const invId = `${cap.id}:inv-${i}`;

            elements.push({
              group: "nodes",
              data: {
                id: invId,
                label: `L${layerIndex}#${i + 1} ${
                  toolName.length > 12 ? toolName.slice(0, 10) + ".." : toolName
                }`,
                type: "tool_invocation",
                tool: task.tool,
                server,
                color,
                parent: cap.id,
                sequenceIndex: i,
                layerIndex,
                durationMs: task.durationMs,
                success: task.success,
              },
            });

            generatedInvocations.push({ capId: cap.id, invId, index: i, layerIndex });
          }
        } else if (cap.toolInvocations && cap.toolInvocations.length > 0) {
          // Priority 2: toolInvocations (full sequence with timestamps, no layerIndex)
          for (const inv of cap.toolInvocations) {
            const [server = "unknown", ...nameParts] = inv.tool.split(":");
            const toolName = nameParts.join(":") || inv.tool;
            const color = getServerColor(server);
            const invId = `${cap.id}:inv-${inv.sequenceIndex}`;

            elements.push({
              group: "nodes",
              data: {
                id: invId,
                label: `#${inv.sequenceIndex + 1} ${
                  toolName.length > 12 ? toolName.slice(0, 10) + ".." : toolName
                }`,
                type: "tool_invocation",
                tool: inv.tool,
                server,
                color,
                parent: cap.id,
                sequenceIndex: inv.sequenceIndex,
                ts: inv.ts,
                durationMs: inv.durationMs,
              },
            });

            generatedInvocations.push({
              capId: cap.id,
              invId,
              index: inv.sequenceIndex,
              layerIndex: inv.sequenceIndex, // Fallback: assume sequential layers
              ts: inv.ts,
            });
          }
        } else if (cap.toolsUsed && cap.toolsUsed.length > 0) {
          // Priority 3: toolsUsed (deduplicated, no timestamps)
          for (let i = 0; i < cap.toolsUsed.length; i++) {
            const toolId = cap.toolsUsed[i];
            const [server = "unknown", ...nameParts] = toolId.split(":");
            const toolName = nameParts.join(":") || toolId;
            const color = getServerColor(server);
            const invId = `${cap.id}:inv-${i}`;

            elements.push({
              group: "nodes",
              data: {
                id: invId,
                label: `#${i + 1} ${
                  toolName.length > 12 ? toolName.slice(0, 10) + ".." : toolName
                }`,
                type: "tool_invocation",
                tool: toolId,
                server,
                color,
                parent: cap.id,
                sequenceIndex: i,
              },
            });

            generatedInvocations.push({
              capId: cap.id,
              invId,
              index: i,
              layerIndex: i, // Fallback: assume sequential layers
            });
          }
        }
      }
    }

    // Build map for tool-to-tool edges (only needed in definition mode)
    const toolInstanceMap = new Map<string, string>();
    if (currentNodeMode === "definition") {
      for (const tool of data.tools) {
        const isShared = tool.parentCapabilities.length > 1;
        for (const capId of tool.parentCapabilities) {
          if (allCapabilities.has(capId)) {
            const instanceId = isShared ? `${tool.id}__${capId}` : tool.id;
            toolInstanceMap.set(`${tool.id}|${capId}`, instanceId);
          }
        }
      }
    }

    // Add edges
    for (const edge of data.edges) {
      const sourceIsCap = edge.source.startsWith("cap-");
      const targetIsCap = edge.target.startsWith("cap-");

      // Capability-to-capability: only dependency edges (both modes)
      if (sourceIsCap && targetIsCap) {
        if (edge.edgeType !== "dependency") continue;
        if (!allCapabilities.has(edge.source) || !allCapabilities.has(edge.target)) continue;

        elements.push({
          group: "edges",
          data: {
            id: `${edge.source}-${edge.target}-${edge.edgeType}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.edgeType,
            weight: edge.weight,
          },
        });
      } // Tool-to-tool edges (definition mode only)
      // Definition mode: show static data flow (provides), not execution patterns (sequence)
      else if (!sourceIsCap && !targetIsCap) {
        // Regular tool-to-tool edges (only in definition mode, only "provides" edges)
        if (currentNodeMode === "definition" && edge.edgeType === "provides") {
          const sourceTools = data.tools.find((t) => t.id === edge.source);
          const targetTools = data.tools.find((t) => t.id === edge.target);
          if (!sourceTools || !targetTools) continue;

          for (const capId of sourceTools.parentCapabilities) {
            if (!targetTools.parentCapabilities.includes(capId)) continue;

            const sourceInstance = toolInstanceMap.get(`${edge.source}|${capId}`);
            const targetInstance = toolInstanceMap.get(`${edge.target}|${capId}`);
            if (!sourceInstance || !targetInstance) continue;

            elements.push({
              group: "edges",
              data: {
                id: `${sourceInstance}-${targetInstance}-${edge.edgeType}`,
                source: sourceInstance,
                target: targetInstance,
                edgeType: edge.edgeType,
                weight: edge.weight,
              },
            });
          }
        }
      }
    }

    // Generate sequence edges for invocation mode (Story 11.4: fan-in/fan-out)
    if (currentNodeMode === "invocation" && generatedInvocations.length > 0) {
      // Group invocations by capability, then by layer for fan-in/fan-out
      const invocationsByCapability = new Map<
        string,
        Map<number, Array<{ invId: string; index: number }>>
      >();

      for (const inv of generatedInvocations) {
        if (!invocationsByCapability.has(inv.capId)) {
          invocationsByCapability.set(inv.capId, new Map());
        }
        const capLayers = invocationsByCapability.get(inv.capId)!;
        if (!capLayers.has(inv.layerIndex)) {
          capLayers.set(inv.layerIndex, []);
        }
        capLayers.get(inv.layerIndex)!.push({ invId: inv.invId, index: inv.index });
      }

      // Create fan-in/fan-out edges between consecutive layers
      for (const [_capId, layersMap] of invocationsByCapability) {
        // Sort layers by index
        const sortedLayers = Array.from(layersMap.entries()).sort((a, b) => a[0] - b[0]);

        // Connect all nodes in layer N to all nodes in layer N+1 (fan-in/fan-out)
        for (let i = 0; i < sortedLayers.length - 1; i++) {
          const currentLayer = sortedLayers[i][1];
          const nextLayer = sortedLayers[i + 1][1];
          const isParallel = currentLayer.length > 1 || nextLayer.length > 1;

          // Create edges from each node in current layer to each node in next layer
          for (const current of currentLayer) {
            for (const next of nextLayer) {
              elements.push({
                group: "edges",
                data: {
                  id: `seq-${current.invId}-${next.invId}`,
                  source: current.invId,
                  target: next.invId,
                  edgeType: "sequence",
                  isParallel,
                  // Fan-out: current layer has 1 node, next has multiple
                  isFanOut: currentLayer.length === 1 && nextLayer.length > 1,
                  // Fan-in: current layer has multiple, next has 1
                  isFanIn: currentLayer.length > 1 && nextLayer.length === 1,
                },
              });
            }
          }
        }
      }
    }
  };

  const renderToolsMode = (
    elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }>,
    data: TransformedData,
  ) => {
    // Tools mode: all tools flat, capabilities as badges/tags

    // Add all tool nodes
    for (const tool of data.tools) {
      const color = getServerColor(tool.server);

      elements.push({
        group: "nodes",
        data: {
          id: tool.id,
          label: tool.name,
          type: "tool",
          server: tool.server,
          pagerank: tool.pagerank,
          color,
          // Capabilities as tags (stored for tooltip)
          capabilities: tool.parentCapabilities,
        },
      });
    }

    // Add edges between tools (Definition mode: provides edges from schema)
    for (const edge of data.edges) {
      // Only show tool-to-tool relationships
      const sourceIsTool = data.tools.some((t) => t.id === edge.source);
      const targetIsTool = data.tools.some((t) => t.id === edge.target);

      // Definition mode shows static data flow (provides), not execution patterns (sequence)
      if (sourceIsTool && targetIsTool && edge.edgeType === "provides") {
        elements.push({
          group: "edges",
          data: {
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.edgeType,
            weight: edge.weight,
          },
        });
      }
    }
  };

  const runLayout = (fit = true) => {
    const cy = cyRef.current;
    if (!cy) return;

    // Use fcose layout for capabilities (fast, good compound support, tight packing)
    if (viewMode === "capabilities") {
      cy.layout({
        name: "fcose",
        animate: true,
        animationDuration: fit ? 300 : 150,
        fit,
        padding: 20,
        // Quality: default is much faster than "proof"
        quality: "default",
        nodeDimensionsIncludeLabels: true,
        // Node spacing
        nodeRepulsion: 4500,
        idealEdgeLength: 50,
        edgeElasticity: 0.45,
        // Nesting for compound nodes
        nestingFactor: 0.1,
        // Gravity to pull nodes together
        gravity: 0.25,
        gravityRange: 3.8,
        gravityCompound: 1.0,
        gravityRangeCompound: 1.5,
        // Iterations - reduced from 2500 for faster layout
        numIter: 500,
        // Pack disconnected components tightly together
        packComponents: true,
        // Tiling for degree-zero nodes
        tile: true,
        tilingPaddingVertical: 10,
        tilingPaddingHorizontal: 10,
        // Randomize for consistent results
        randomize: true,
      }).run();
    } else {
      cy.layout({
        name: "dagre",
        rankDir: "TB", // Top-to-bottom layout
        nodeSep: 40,
        rankSep: 80,
        padding: 50,
        animate: true,
        animationDuration: fit ? 300 : 150,
        fit,
      }).run();
    }
  };

  const setupEventHandlers = () => {
    const cy = cyRef.current;
    if (!cy) return;

    // Remove existing handlers
    cy.off("tap");
    cy.off("mouseover");
    cy.off("mouseout");

    // Node click - zoom to capability, select for tools
    // deno-lint-ignore no-explicit-any
    cy.on("tap", "node", (evt: { target: any }) => {
      const node = evt.target;
      const nodeId = node.data("id") as string;
      const nodeType = node.data("type") as string;

      if (nodeType === "capability") {
        // Zoom to fit this capability and its children
        const capNode = cy.getElementById(nodeId);
        const children = capNode.descendants();
        const toFit = children.length > 0 ? capNode.union(children) : capNode;

        cy.animate({
          fit: { eles: toFit, padding: 50 },
          duration: 300,
          easing: "ease-out",
        });

        // Select for CodePanel
        const capData = capabilityDataRef.current.get(nodeId);
        if (capData) {
          onCapabilitySelect?.(capData);
          onToolSelect?.(null);
        }
      } else {
        // Tool selected - use toolId for shared tools (nodeId may have __capId suffix)
        const toolId = (node.data("toolId") as string) || nodeId;
        const toolData = toolDataRef.current.get(toolId);
        if (toolData) {
          onToolSelect?.(toolData);
          onCapabilitySelect?.(null);
          onNodeSelect?.({
            id: toolId,
            label: toolData.label,
            server: toolData.server,
          });
        }
      }

      highlightNode(nodeId);
    });

    // Background click - clear selection
    cy.on("tap", (evt: { target: { isNode?: () => boolean } }) => {
      if (!evt.target.isNode?.()) {
        clearHighlight();
        onCapabilitySelect?.(null);
        onToolSelect?.(null);
      }
    });

    // Node hover - temporary highlight
    cy.on("mouseover", "node", (evt: { target: { data: (key: string) => string } }) => {
      const nodeId = evt.target.data("id");
      highlightNode(nodeId, true);
    });

    cy.on("mouseout", "node", () => {
      if (highlightedNodeId) {
        highlightNode(highlightedNodeId);
      } else {
        clearHighlight();
      }
    });
  };

  const highlightNode = (nodeId: string, _isHover = false) => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear previous classes
    cy.elements().removeClass("highlighted connected dimmed path selected");

    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    // Highlight the node
    node.addClass("highlighted");

    // Get connected nodes based on depth
    const connectedNodes = getConnectedNodes(node, highlightDepth);
    const connectedEdges = getConnectedEdges(node, connectedNodes);

    // Mark connected
    connectedNodes.addClass("connected");
    connectedEdges.addClass("highlighted");

    // Dim everything else
    cy.elements()
      .not(node)
      .not(connectedNodes)
      .not(connectedEdges)
      .addClass("dimmed");
  };

  // deno-lint-ignore no-explicit-any
  const getConnectedNodes = (node: any, depth: number): any => {
    const cy = cyRef.current;
    if (!cy || depth <= 0) return cy.collection();

    let connected = node.neighborhood().nodes();

    if (depth > 1) {
      // Recursively get deeper connections
      let frontier = connected;
      for (let d = 1; d < depth && d < 10; d++) {
        const nextFrontier = frontier.neighborhood().nodes();
        connected = connected.union(nextFrontier);
        frontier = nextFrontier.difference(connected);
        if (frontier.length === 0) break;
      }
    }

    return connected;
  };

  // deno-lint-ignore no-explicit-any
  const getConnectedEdges = (node: any, connectedNodes: any): any => {
    const cy = cyRef.current;
    if (!cy) return cy.collection();

    // Get edges between the node and connected nodes
    const allNodes = connectedNodes.union(node);
    return allNodes.edgesWith(allNodes);
  };

  const clearHighlight = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("highlighted connected dimmed path selected");
  };

  // Handle external highlight changes
  useEffect(() => {
    if (highlightedNodeId) {
      highlightNode(highlightedNodeId);
    } else {
      clearHighlight();
    }
  }, [highlightedNodeId, highlightDepth]);

  // Handle path highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass("path");

    if (pathNodes && pathNodes.length > 0) {
      for (const nodeId of pathNodes) {
        cy.getElementById(nodeId).addClass("path");
      }

      for (let i = 0; i < pathNodes.length - 1; i++) {
        const edgeId = `${pathNodes[i]}-${pathNodes[i + 1]}`;
        cy.getElementById(edgeId).addClass("path");
        const reverseEdgeId = `${pathNodes[i + 1]}-${pathNodes[i]}`;
        cy.getElementById(reverseEdgeId).addClass("path");
      }

      const pathElements = cy.elements(".path");
      if (pathElements.length > 0) {
        cy.fit(pathElements, 100);
      }
    }
  }, [pathNodes]);

  // Expand all capabilities
  const expandAll = useCallback(() => {
    const allCapIds = Array.from(capabilityDataRef.current.keys());
    setExpandedNodes(new Set(allCapIds));
  }, [setExpandedNodes]);

  // Collapse all capabilities
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, [setExpandedNodes]);

  // Expose methods for external control
  useEffect(() => {
    if (containerRef.current) {
      // @ts-ignore - attach methods to DOM element for external access
      containerRef.current.expandAll = expandAll;
      // @ts-ignore
      containerRef.current.collapseAll = collapseAll;
    }
  }, [expandAll, collapseAll]);

  return (
    <div class="w-full h-full relative" style={{ background: "var(--bg, #0a0908)" }}>
      {/* Cytoscape container */}
      <div ref={containerRef} class="w-full h-full" />

      {/* Loading spinner */}
      {isLoading && (
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div class="flex flex-col items-center gap-3">
            <div
              class="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
              style={{ color: "var(--accent, #FFB86F)" }}
            />
            <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Loading graph...
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && !isLoading && (
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 max-w-md text-center p-6 rounded-xl"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border)",
          }}
        >
          <div class="text-4xl mb-3">Error</div>
          <p style={{ color: "var(--text-muted)" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
