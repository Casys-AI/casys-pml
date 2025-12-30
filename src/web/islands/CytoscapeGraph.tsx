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
import type { PinnedSet } from "./GraphInsightsPanel.tsx";
import {
  type ClusterVizConfig,
  computeConvexHull,
  drawAnimatedHull,
  drawFlowPath,
  drawSmoothHull,
  expandHull,
  type HullPoint,
} from "../utils/graph/index.ts";

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
  module?: string; // Category/module for std tools (e.g., "crypto", "json")
  parent?: string;
  parents?: string[];
  degree?: number;
  community_id?: number;
  // Tool invocation fields
  tool?: string; // The underlying tool ID (e.g., "filesystem:read_file")
  ts?: number; // Timestamp when invocation started
  duration_ms?: number; // Execution duration
  sequence_index?: number; // Sequence index within capability
  // Timeline fields
  last_used?: string; // ISO timestamp for timeline sorting
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
  pagerank?: number; // Hypergraph pagerank for importance sizing
  lastUsed?: string; // ISO timestamp for timeline sorting
}

interface ToolNode {
  id: string;
  name: string;
  type: "tool";
  server: string;
  pagerank: number;
  parentCapabilities: string[];
  communityId?: number;
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
export type ViewMode = "capabilities" | "emergence" | "graph";

/** Node mode - definition (generic tools) vs invocation (actual calls) */
export type NodeMode = "definition" | "invocation";

interface CytoscapeGraphProps {
  apiBase: string;
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  onToolSelect?: (tool: ToolData | null) => void;
  onNodeSelect?: (
    node: { id: string; label: string; server: string; type?: "tool" | "capability" } | null,
  ) => void;
  highlightedNodeId?: string | null;
  /** Preview node ID (from sidebar hover) */
  previewNodeId?: string | null;
  /** Section ID for preview color (community=blue, neighbors=cyan, adamic-adar=green) */
  previewSectionId?: string | null;
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
  /** Pinned sets for multi-selection visualization */
  pinnedSets?: PinnedSet[];
  /** Cluster visualization config (for algorithm hover) */
  clusterViz?: ClusterVizConfig | null;
  /** Whether breadcrumbs have items (prevents panel close on background click) */
  hasBreadcrumbs?: boolean;
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

// Community colors for Louvain clustering (graph mode)
const COMMUNITY_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
  "#a855f7", // purple
];

export default function CytoscapeGraph({
  apiBase,
  onCapabilitySelect,
  onToolSelect,
  onNodeSelect,
  highlightedNodeId,
  previewNodeId,
  previewSectionId,
  pathNodes,
  highlightDepth = 1,
  viewMode = "capabilities",
  nodeMode = "definition",
  onExpandedNodesChange,
  expandedNodes: externalExpandedNodes,
  refreshKey = 0,
  onServersDiscovered,
  pinnedSets,
  clusterViz,
  hasBreadcrumbs = false,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-explicit-any
  const cyRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
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

  // Ref to track highlighted node for event handlers (closure-safe)
  const highlightedNodeIdRef = useRef<string | null>(null);
  // Ref to track breadcrumbs state for event handlers (closure-safe)
  const hasBreadcrumbsRef = useRef(hasBreadcrumbs);

  // Timeline layout: store calculated positions for preset layout
  const timelinePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Timeline separators: model coordinates (from calculation) and rendered coordinates (for display)
  const timelineSeparatorsModelRef = useRef<Array<{ label: string; y: number }>>([]);
  const [renderedSeparators, setRenderedSeparators] = useState<
    Array<{ label: string; y: number; visible: boolean }>
  >([]);

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

  /**
   * Calculate timeline positions for capabilities mode
   * Uses logarithmic scale: recent items spread out, older items compressed
   * Returns positions map and separator positions for overlay
   */
  const calculateTimelinePositions = useCallback(
    (
      capabilities: CapabilityNode[],
      tools: ToolNode[],
      containerWidth: number,
    ): {
      positions: Map<string, { x: number; y: number }>;
      separators: Array<{ label: string; y: number }>;
    } => {
      const positions = new Map<string, { x: number; y: number }>();
      const now = Date.now();

      // Time thresholds in milliseconds
      const DAY = 24 * 60 * 60 * 1000;
      const WEEK = 7 * DAY;
      const MONTH = 30 * DAY;

      // Sort capabilities by lastUsed (most recent first)
      const sortedCaps = [...capabilities].sort((a, b) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateB - dateA;
      });

      // Layout constants
      const BASE_Y = 80; // Starting Y offset
      const ROW_HEIGHT = 180; // Min vertical spacing between capabilities
      const CARD_WIDTH = 200; // Approximate capability card width
      const CARDS_PER_ROW = Math.max(1, Math.floor(containerWidth / CARD_WIDTH));

      // Group capabilities by time period for layout
      interface TimeGroup {
        label: string;
        threshold: number;
        capabilities: CapabilityNode[];
        startY: number;
      }

      const groups: TimeGroup[] = [
        { label: "Aujourd'hui", threshold: DAY, capabilities: [], startY: 0 },
        { label: "Cette semaine", threshold: WEEK, capabilities: [], startY: 0 },
        { label: "Ce mois", threshold: MONTH, capabilities: [], startY: 0 },
        { label: "Plus ancien", threshold: Infinity, capabilities: [], startY: 0 },
      ];

      // Assign capabilities to groups
      for (const cap of sortedCaps) {
        const lastUsedTime = cap.lastUsed ? new Date(cap.lastUsed).getTime() : 0;
        const age = now - lastUsedTime;

        for (const group of groups) {
          if (age < group.threshold) {
            group.capabilities.push(cap);
            break;
          }
        }
      }

      // Calculate positions per group (grid within each group)
      let currentY = BASE_Y;
      const separators: Array<{ label: string; y: number }> = [];

      for (const group of groups) {
        if (group.capabilities.length === 0) continue;

        // Add separator at group start
        separators.push({ label: group.label, y: currentY - 30 });
        group.startY = currentY;

        // Position capabilities in a grid within this group
        for (let i = 0; i < group.capabilities.length; i++) {
          const cap = group.capabilities[i];
          const col = i % CARDS_PER_ROW;
          const row = Math.floor(i / CARDS_PER_ROW);

          const x = 100 + col * CARD_WIDTH;
          const y = currentY + row * ROW_HEIGHT;

          positions.set(cap.id, { x, y });

          // Position tools inside this capability (relative positions handled by compound)
          const capTools = tools.filter((t) => t.parentCapabilities.includes(cap.id));
          const toolsPerRow = Math.ceil(Math.sqrt(capTools.length));
          for (let j = 0; j < capTools.length; j++) {
            const tool = capTools[j];
            const toolCol = j % toolsPerRow;
            const toolRow = Math.floor(j / toolsPerRow);
            const isShared = tool.parentCapabilities.length > 1;
            const toolId = isShared ? `${tool.id}__${cap.id}` : tool.id;

            // Tools positioned relative to their parent capability center
            positions.set(toolId, {
              x: x + 20 + toolCol * 35,
              y: y + 40 + toolRow * 35,
            });
          }
        }

        // Move to next group
        const rowsInGroup = Math.ceil(group.capabilities.length / CARDS_PER_ROW);
        currentY += rowsInGroup * ROW_HEIGHT + 60; // Extra spacing between groups
      }

      return { positions, separators };
    },
    [],
  );

  /**
   * Update rendered separator positions based on Cytoscape pan/zoom
   * Converts model coordinates to screen coordinates
   */
  const updateRenderedSeparators = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || viewMode !== "capabilities") {
      setRenderedSeparators([]);
      return;
    }

    const modelSeparators = timelineSeparatorsModelRef.current;
    if (modelSeparators.length === 0) {
      setRenderedSeparators([]);
      return;
    }

    const containerHeight = containerRef.current?.clientHeight || 600;
    const pan = cy.pan();
    const zoom = cy.zoom();

    const rendered = modelSeparators.map((sep) => {
      // Convert model Y to rendered Y: renderedY = modelY * zoom + panY
      const renderedY = sep.y * zoom + pan.y;
      // Check if visible in viewport
      const visible = renderedY > -50 && renderedY < containerHeight + 50;
      return { label: sep.label, y: renderedY, visible };
    });

    setRenderedSeparators(rendered);
  }, [viewMode]);

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

  // Setup pan/zoom listeners for timeline separators
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Update separators on pan/zoom
    const handleViewport = () => {
      if (viewMode === "capabilities") {
        updateRenderedSeparators();
      }
    };

    cy.on("pan zoom", handleViewport);

    return () => {
      cy.off("pan zoom", handleViewport);
    };
  }, [viewMode, updateRenderedSeparators]);

  // Refetch data when refreshKey changes (for SSE incremental updates)
  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    // Skip initial render (loadData already called in init useEffect)
    if (prevRefreshKeyRef.current === refreshKey) return;
    console.log(
      `[CytoscapeGraph] refreshKey changed: ${prevRefreshKeyRef.current} -> ${refreshKey}`,
    );
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
    // Capability hub nodes (for Graph mode - regular nodes, not compound)
    // Simple capabilities: lighter amber
    {
      selector: 'node[type="capability_hub"]',
      style: {
        "background-color": "#FFB86F", // Theme amber
        "background-opacity": 0.6,
        "border-color": "#E89B4F", // Darker amber border
        "border-width": 2,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "10px",
        "font-weight": "bold",
        color: "#92400E", // Dark amber text
        "text-margin-y": 6,
        width: "mapData(levelNorm, 0, 1, 40, 70)",
        height: "mapData(levelNorm, 0, 1, 40, 70)",
        shape: "ellipse",
      },
    },
    // Meta-capabilities (level > 1) - richer orange, more prominent
    {
      selector: 'node[type="capability_hub"][level > 1]',
      style: {
        "background-color": "#FF9933", // Deeper orange
        "background-opacity": 0.9,
        "border-color": "#CC6600", // Dark burnt orange
        "border-width": 3,
        color: "#7C2D12", // Deep brown text
      },
    },
    // Tool nodes in Graph mode (pale/light colors)
    {
      selector: 'node[type="tool_light"]',
      style: {
        "background-color": "data(color)",
        "background-opacity": 0.35, // Very pale
        "border-color": "data(color)",
        "border-width": 1,
        "border-opacity": 0.6,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "8px",
        color: "#a0a0a0",
        "text-margin-y": 4,
        width: "mapData(pagerank, 0, 0.1, 15, 35)",
        height: "mapData(pagerank, 0, 0.1, 15, 35)",
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
    // Preview node - default/adamic-adar (green)
    {
      selector: "node.preview",
      style: {
        "border-color": "#10b981", // Emerald green
        "border-width": 3,
        "border-style": "dashed",
        "overlay-color": "#10b981",
        "overlay-padding": 6,
        "overlay-opacity": 0.2,
        "z-index": 998,
      },
    },
    // Preview node - community section (blue)
    {
      selector: "node.preview-community",
      style: {
        "border-color": "#3b82f6", // Blue
        "border-width": 3,
        "border-style": "dashed",
        "overlay-color": "#3b82f6",
        "overlay-padding": 6,
        "overlay-opacity": 0.2,
        "z-index": 998,
      },
    },
    // Preview node - neighbors section (cyan)
    {
      selector: "node.preview-neighbors",
      style: {
        "border-color": "#06b6d4", // Cyan
        "border-width": 3,
        "border-style": "dashed",
        "overlay-color": "#06b6d4",
        "overlay-padding": 6,
        "overlay-opacity": 0.2,
        "z-index": 998,
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
    // Preview edges - default/adamic-adar (green)
    {
      selector: "edge.edge-preview",
      style: {
        opacity: 1,
        width: 3,
        "line-color": "#10b981",
        "target-arrow-color": "#10b981",
        "z-index": 999,
      },
    },
    // Preview edges - community (blue)
    {
      selector: "edge.edge-preview-community",
      style: {
        opacity: 1,
        width: 3,
        "line-color": "#3b82f6",
        "target-arrow-color": "#3b82f6",
        "z-index": 999,
      },
    },
    // Preview edges - neighbors (cyan)
    {
      selector: "edge.edge-preview-neighbors",
      style: {
        opacity: 1,
        width: 3,
        "line-color": "#06b6d4",
        "target-arrow-color": "#06b6d4",
        "z-index": 999,
      },
    },
    // Preview connected nodes - default/adamic-adar (green)
    {
      selector: "node.node-preview",
      style: {
        "border-color": "#10b981",
        "border-width": 2,
        "z-index": 998,
      },
    },
    // Preview connected nodes - community (blue)
    {
      selector: "node.node-preview-community",
      style: {
        "border-color": "#3b82f6",
        "border-width": 2,
        "z-index": 998,
      },
    },
    // Preview connected nodes - neighbors (cyan)
    {
      selector: "node.node-preview-neighbors",
      style: {
        "border-color": "#06b6d4",
        "border-width": 2,
        "z-index": 998,
      },
    },
    // Algorithm-specific preview styles
    // co_occurrence (emerald)
    {
      selector: "node.preview-co_occurrence",
      style: { "border-color": "#10b981", "border-width": 3 },
    },
    {
      selector: "node.node-preview-co_occurrence",
      style: { "border-color": "#10b981", "border-width": 2 },
    },
    {
      selector: "edge.edge-preview-co_occurrence",
      style: { "line-color": "#10b981", opacity: 1, width: 3 },
    },
    // louvain (violet)
    { selector: "node.preview-louvain", style: { "border-color": "#8b5cf6", "border-width": 3 } },
    {
      selector: "node.node-preview-louvain",
      style: { "border-color": "#8b5cf6", "border-width": 2 },
    },
    {
      selector: "edge.edge-preview-louvain",
      style: { "line-color": "#8b5cf6", opacity: 1, width: 3 },
    },
    // adamic_adar (amber)
    {
      selector: "node.preview-adamic_adar",
      style: { "border-color": "#f59e0b", "border-width": 3 },
    },
    {
      selector: "node.node-preview-adamic_adar",
      style: { "border-color": "#f59e0b", "border-width": 2 },
    },
    {
      selector: "edge.edge-preview-adamic_adar",
      style: { "line-color": "#f59e0b", opacity: 1, width: 3 },
    },
    // hyperedge (pink)
    { selector: "node.preview-hyperedge", style: { "border-color": "#ec4899", "border-width": 3 } },
    {
      selector: "node.node-preview-hyperedge",
      style: { "border-color": "#ec4899", "border-width": 2 },
    },
    {
      selector: "edge.edge-preview-hyperedge",
      style: { "line-color": "#ec4899", opacity: 1, width: 3 },
    },
    // spectral (cyan)
    { selector: "node.preview-spectral", style: { "border-color": "#06b6d4", "border-width": 3 } },
    {
      selector: "node.node-preview-spectral",
      style: { "border-color": "#06b6d4", "border-width": 2 },
    },
    {
      selector: "edge.edge-preview-spectral",
      style: { "line-color": "#06b6d4", opacity: 1, width: 3 },
    },
    // neighbors (blue) - additional for consistency
    { selector: "node.preview-neighbors", style: { "border-color": "#3b82f6", "border-width": 3 } },
    {
      selector: "edge.edge-preview-neighbors",
      style: { "line-color": "#3b82f6", opacity: 1, width: 3 },
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

            // Determine lastUsed: prefer last_used field, fallback to most recent trace
            let lastUsed = d.last_used;
            if (!lastUsed && traces && traces.length > 0) {
              // Use the most recent trace's executedAt as lastUsed
              lastUsed = traces[0].executedAt;
            }

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
              pagerank: d.pagerank ?? 0, // Hypergraph pagerank for importance sizing
              lastUsed, // ISO timestamp for timeline sorting (from last_used or latest trace)
            });
          }
        } else if (d.type === "tool") {
          const parents = d.parents ?? (d.parent ? [d.parent] : []);
          // Only include tools that have been used (have at least one parent capability)
          if (parents.length > 0) {
            // Build server identifier: "std/module" for std tools, otherwise just server
            const baseServer = d.server ?? "unknown";
            const module = d.module;
            const serverDisplay = baseServer === "std" && module ? `std/${module}` : baseServer;

            tools.push({
              id: d.id,
              name: d.label,
              type: "tool",
              server: serverDisplay,
              pagerank: d.pagerank ?? 0,
              parentCapabilities: parents,
              communityId: d.community_id,
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
      // Note: Capability IDs are UUIDs, not "cap-" prefixed. Build set to check membership.
      const capabilityIds = new Set(capabilities.map((c) => c.id));
      const capabilityParentMap = new Map<string, string>();
      for (const edge of edges) {
        if (edge.edgeType === "contains") {
          const parentId = edge.source;
          const childId = edge.target;
          // Only if both are capabilities (check against our parsed capability set)
          if (capabilityIds.has(parentId) && capabilityIds.has(childId)) {
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
        console.warn(
          `[Graph] Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`,
        );
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
    } else if (viewMode === "graph") {
      // Graph mode: true force-directed with deduplicated tools and all edges
      renderGraphMode(elements, data);
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

    // Sort capabilities by lastUsed date (most recent first)
    const sortedCapabilities = [...data.capabilities].sort((a, b) => {
      const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return dateB - dateA; // Descending (newest first)
    });

    // Add capability nodes (sorted by lastUsed)
    for (const cap of sortedCapabilities) {
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

  /**
   * Graph mode: True force-directed graph with deduplicated tools
   * Shows tools as single nodes connected by edges (capability-tool and tool-tool)
   * Capabilities are regular nodes (not compound containers)
   * Color gradient: tools=pale, capabilities darker based on hierarchy level
   */
  const renderGraphMode = (
    elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }>,
    data: TransformedData,
  ) => {
    // Calculate hierarchy level for each capability
    // Level 1 = calls only tools, Level 2+ = calls other capabilities
    const capabilityIds = new Set(data.capabilities.map((c) => c.id));
    const capabilityChildren = new Map<string, Set<string>>(); // cap -> child caps

    // Build cap→cap relationships from edges
    for (const edge of data.edges) {
      if (capabilityIds.has(edge.source) && capabilityIds.has(edge.target)) {
        if (!capabilityChildren.has(edge.source)) {
          capabilityChildren.set(edge.source, new Set());
        }
        capabilityChildren.get(edge.source)!.add(edge.target);
      }
    }

    // Calculate level for each capability (recursive)
    const levelCache = new Map<string, number>();
    const getCapabilityLevel = (capId: string, visited: Set<string> = new Set()): number => {
      if (levelCache.has(capId)) return levelCache.get(capId)!;
      if (visited.has(capId)) return 1; // Cycle protection

      visited.add(capId);
      const children = capabilityChildren.get(capId);

      if (!children || children.size === 0) {
        // No child capabilities = simple capability (level 1)
        levelCache.set(capId, 1);
        return 1;
      }

      // Has child capabilities = meta-capability (level = 1 + max child level)
      let maxChildLevel = 0;
      for (const childId of children) {
        maxChildLevel = Math.max(maxChildLevel, getCapabilityLevel(childId, visited));
      }
      const level = 1 + maxChildLevel;
      levelCache.set(capId, level);
      return level;
    };

    // Compute all levels
    for (const cap of data.capabilities) {
      getCapabilityLevel(cap.id);
    }
    const maxLevel = Math.max(1, ...Array.from(levelCache.values()));

    // Base color for hierarchy gradient (same for all nodes in graph mode)
    const HIERARCHY_BASE_COLOR = "#8b5cf6"; // Violet base

    // Add capability nodes with hierarchy level for color gradient
    for (const cap of data.capabilities) {
      const shortName = cap.name.length > 12 ? cap.name.slice(0, 10) + "..." : cap.name;
      const level = levelCache.get(cap.id) || 1;
      // Normalize level: tools=0, caps start at 1, so we normalize including tools
      // levelNorm goes from ~0.3 (level 1) to 1.0 (maxLevel)
      const levelNorm = level / (maxLevel + 1);

      elements.push({
        group: "nodes",
        data: {
          id: cap.id,
          label: shortName,
          type: "capability_hub",
          usageCount: cap.usageCount,
          successRate: cap.successRate,
          color: HIERARCHY_BASE_COLOR,
          level, // Hierarchy level
          levelNorm, // Normalized for styling (0.3-1.0 range for caps)
          pagerank: cap.pagerank || 0,
        },
      });
    }

    // Helper to get community color
    const getCommunityColor = (communityId?: number): string => {
      if (communityId === undefined || communityId === null) {
        return HIERARCHY_BASE_COLOR; // Fallback for nodes without community
      }
      return COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length];
    };

    // Add deduplicated tool nodes colored by community
    for (const tool of data.tools) {
      const communityColor = getCommunityColor(tool.communityId);
      elements.push({
        group: "nodes",
        data: {
          id: tool.id,
          label: tool.name,
          type: "tool_light", // Pale style for graph mode
          server: tool.server,
          pagerank: tool.pagerank,
          color: communityColor,
          communityId: tool.communityId,
          level: 0,
          levelNorm: 0, // Tools are level 0
          capabilities: tool.parentCapabilities,
        },
      });
    }

    // Add capability-to-tool edges
    for (const tool of data.tools) {
      for (const capId of tool.parentCapabilities) {
        elements.push({
          group: "edges",
          data: {
            id: `cap-tool-${capId}-${tool.id}`,
            source: capId,
            target: tool.id,
            edgeType: "hierarchy",
            weight: 1,
          },
        });
      }
    }

    // Add tool-to-tool edges (only "provides" - skip "sequence" which is execution-time)
    for (const edge of data.edges) {
      const sourceIsTool = data.tools.some((t) => t.id === edge.source);
      const targetIsTool = data.tools.some((t) => t.id === edge.target);

      // Only show static data flow edges, not execution sequence
      if (sourceIsTool && targetIsTool && edge.edgeType === "provides") {
        elements.push({
          group: "edges",
          data: {
            id: `tool-${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.edgeType,
            weight: edge.weight,
          },
        });
      }
    }

    // Add capability-to-capability edges (only structural: contains, dependency)
    for (const edge of data.edges) {
      const sourceIsCap = data.capabilities.some((c) => c.id === edge.source);
      const targetIsCap = data.capabilities.some((c) => c.id === edge.target);

      // Only show structural edges, not execution sequence
      const edgeType = edge.edgeType || "dependency";
      if (sourceIsCap && targetIsCap && (edgeType === "contains" || edgeType === "dependency")) {
        elements.push({
          group: "edges",
          data: {
            id: `cap-${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType,
            weight: edge.weight,
          },
        });
      }
    }
  };

  const runLayout = (fit = true) => {
    const cy = cyRef.current;
    const data = rawDataRef.current;
    if (!cy || !data) return;

    // Use preset layout for capabilities (timeline view with time-based positioning)
    if (viewMode === "capabilities") {
      // Calculate timeline positions based on lastUsed
      const containerWidth = containerRef.current?.clientWidth || 800;
      const { positions, separators } = calculateTimelinePositions(
        data.capabilities,
        data.tools,
        containerWidth,
      );

      // Store positions and separators for reference
      timelinePositionsRef.current = positions;
      timelineSeparatorsModelRef.current = separators;

      // Use preset layout with calculated positions
      cy.layout({
        name: "preset",
        positions: (node: { id: () => string }) => {
          const pos = positions.get(node.id());
          return pos || { x: 0, y: 0 };
        },
        animate: true,
        animationDuration: fit ? 400 : 250,
        fit: false, // Don't auto-fit, we control the view
        padding: 20,
      }).run();

      // After layout, fit to show all content with padding
      if (fit) {
        setTimeout(() => {
          cy.fit(undefined, 50);
          // Pan to show top of timeline
          cy.pan({ x: cy.pan().x, y: 50 });
          // Update separator positions after fit
          updateRenderedSeparators();
        }, 450);
      } else {
        // Update separators immediately for incremental updates
        setTimeout(() => updateRenderedSeparators(), 300);
      }
    } else if (viewMode === "graph") {
      // Graph mode: cola layout with live forces (D3-like simulation)
      cy.layout({
        name: "cola",
        animate: true,
        refresh: 1, // Refresh rate for live simulation
        maxSimulationTime: 4000, // Run simulation for 4 seconds
        ungrabifyWhileSimulating: false, // Allow dragging during simulation
        fit,
        padding: 30,
        nodeDimensionsIncludeLabels: true,
        // Force parameters
        nodeSpacing: 40,
        edgeLength: 120,
        // Prevent overlap
        avoidOverlap: true,
        // Handle disconnected components
        handleDisconnected: true,
        // Randomize initial positions
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

      if (nodeType === "capability" || nodeType === "capability_hub") {
        // Zoom to fit this capability and its children (for compound mode)
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
          // Notify GraphExplorer for insights panel (same as tools)
          onNodeSelect?.({
            id: nodeId,
            label: capData.label,
            server: "capability",
            type: "capability",
          });
        }
      } else {
        // Tool selected - use toolId for shared tools (nodeId may have __capId suffix)
        const toolId = (node.data("toolId") as string) || nodeId;
        const toolData = toolDataRef.current.get(toolId);
        if (toolData) {
          // Center on tool without changing zoom level
          const toolNode = cy.getElementById(nodeId);

          cy.animate({
            center: { eles: toolNode },
            duration: 300,
            easing: "ease-out",
          });

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

    // Background click - clear selection (but keep panel if breadcrumbs exist)
    cy.on("tap", (evt: { target: { isNode?: () => boolean } }) => {
      if (!evt.target.isNode?.()) {
        clearHighlight();
        onCapabilitySelect?.(null);
        onToolSelect?.(null);
        // Only close panel if no breadcrumbs (user's working memory is empty)
        if (!hasBreadcrumbsRef.current) {
          onNodeSelect?.(null);
        }
      }
    });

    // Node hover - temporary highlight
    cy.on("mouseover", "node", (evt: { target: { data: (key: string) => string } }) => {
      const nodeId = evt.target.data("id");
      highlightNode(nodeId, true);
    });

    cy.on("mouseout", "node", () => {
      // Use ref to get current highlighted node (closure-safe)
      const lockedNodeId = highlightedNodeIdRef.current;
      if (lockedNodeId) {
        highlightNode(lockedNodeId);
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
  // Keep breadcrumbs ref in sync (closure-safe for event handlers)
  useEffect(() => {
    hasBreadcrumbsRef.current = hasBreadcrumbs;
  }, [hasBreadcrumbs]);

  // Re-apply highlight when viewMode changes (after graph rebuild)
  useEffect(() => {
    // Keep ref in sync for event handlers (closure-safe)
    highlightedNodeIdRef.current = highlightedNodeId ?? null;

    if (highlightedNodeId) {
      // Small delay to ensure graph is rebuilt after viewMode change
      const timer = setTimeout(() => {
        highlightNode(highlightedNodeId);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      clearHighlight();
    }
  }, [highlightedNodeId, highlightDepth, viewMode]);

  // Handle preview (sidebar hover) - overlay on top of existing highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // All possible preview classes to clear
    const allPreviewClasses = [
      "preview",
      "preview-community",
      "preview-neighbors",
      "preview-co_occurrence",
      "preview-louvain",
      "preview-adamic_adar",
      "preview-hyperedge",
      "preview-spectral",
      "node-preview",
      "node-preview-community",
      "node-preview-neighbors",
      "node-preview-co_occurrence",
      "node-preview-louvain",
      "node-preview-adamic_adar",
      "node-preview-hyperedge",
      "node-preview-spectral",
      "edge-preview",
      "edge-preview-community",
      "edge-preview-neighbors",
      "edge-preview-co_occurrence",
      "edge-preview-louvain",
      "edge-preview-adamic_adar",
      "edge-preview-hyperedge",
      "edge-preview-spectral",
    ].join(" ");

    cy.elements().removeClass(allPreviewClasses);

    if (previewNodeId) {
      const node = cy.getElementById(previewNodeId);
      if (!node.length) return;

      // Map algoId to CSS class suffix (use algoId directly if it has a style defined)
      const validAlgos = [
        "neighbors",
        "co_occurrence",
        "louvain",
        "adamic_adar",
        "hyperedge",
        "spectral",
        "community",
      ];
      const algoSuffix = previewSectionId && validAlgos.includes(previewSectionId)
        ? previewSectionId
        : null;

      // Get algo-specific classes
      const previewClass = algoSuffix ? `preview-${algoSuffix}` : "preview";
      const connectedClass = algoSuffix ? `node-preview-${algoSuffix}` : "node-preview";
      const edgeClass = algoSuffix ? `edge-preview-${algoSuffix}` : "edge-preview";

      // Add preview class to the node (overlays on existing highlight)
      node.addClass(previewClass);

      // Get connected nodes and edges
      const connectedNodes = getConnectedNodes(node, highlightDepth);
      const connectedEdges = getConnectedEdges(node, connectedNodes);

      // Add preview classes to connected nodes and edges
      connectedNodes.addClass(connectedClass);
      connectedEdges.addClass(edgeClass);
    }
    // No else needed - when preview ends, we just remove preview classes above
    // The existing highlight remains untouched
  }, [previewNodeId, previewSectionId, highlightDepth]);

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

  // Handle cluster visualization overlay (hulls, zones, animated paths, nodes-edges)
  useEffect(() => {
    const cy = cyRef.current;
    const canvas = canvasRef.current;
    if (!cy) return;

    // Cancel any running animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear previous Cytoscape highlights (only elements we marked)
    const prevHighlighted = cy.elements(".algo-highlight");
    prevHighlighted.removeStyle("overlay-color overlay-opacity line-color opacity width");
    prevHighlighted.removeClass("algo-highlight");

    // Clear canvas
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // No viz config - done
    if (!clusterViz || !clusterViz.nodeIds || clusterViz.nodeIds.length === 0) {
      return;
    }

    // Handle "nodes-edges" type - use Cytoscape styling directly
    if (clusterViz.type === "nodes-edges") {
      const nodeIdSet = new Set(clusterViz.nodeIds);

      // Helper to find nodes by ID (handles shared tools with __capId suffix)
      const findNodes = (nodeId: string) => {
        let nodes = cy.getElementById(nodeId);
        if (nodes.length === 0) {
          nodes = cy.nodes(`[toolId = "${nodeId}"]`);
        }
        if (nodes.length === 0) {
          nodes = cy.nodes().filter((n: any) => (n.id() as string).startsWith(nodeId + "__"));
        }
        return nodes;
      };

      // Collect all matching node IDs (including shared tool instances)
      const matchingNodeIds = new Set<string>();

      // Highlight nodes with algo color overlay
      for (const nodeId of clusterViz.nodeIds) {
        const nodes = findNodes(nodeId);
        nodes.forEach((node: any) => {
          matchingNodeIds.add(node.id());
          node.addClass("algo-highlight");
          node.style({
            "overlay-color": clusterViz.color,
            "overlay-opacity": 0.3,
          });
        });
      }

      // Highlight edges between these nodes
      cy.edges().forEach((edge: any) => {
        const sourceId = edge.source().id();
        const targetId = edge.target().id();
        // Check if both endpoints match (either direct ID or shared tool instance)
        const sourceMatches = matchingNodeIds.has(sourceId) || nodeIdSet.has(sourceId);
        const targetMatches = matchingNodeIds.has(targetId) || nodeIdSet.has(targetId);
        if (sourceMatches && targetMatches) {
          edge.addClass("algo-highlight");
          edge.style({
            "line-color": clusterViz.color,
            "opacity": 0.8,
            "width": 3,
          });
        }
      });

      return;
    }

    // For canvas-based visualizations
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get node positions from Cytoscape (rendered coordinates)
    // Handles shared tools which have IDs like "tool_id__cap_id" in capabilities mode
    const getNodePositions = (): HullPoint[] => {
      const points: HullPoint[] = [];
      for (const nodeId of clusterViz.nodeIds) {
        // Try direct ID match first
        let node = cy.getElementById(nodeId);

        // If not found, try finding by toolId data attribute (for shared tools)
        if (node.length === 0) {
          node = cy.nodes(`[toolId = "${nodeId}"]`);
        }

        // If still not found, try partial match (nodeId is prefix of actual ID)
        if (node.length === 0) {
          node = cy.nodes().filter((n: any) => {
            const id = n.id() as string;
            return id.startsWith(nodeId + "__");
          });
        }

        // Add positions for all matching nodes
        if (node.length > 0) {
          node.forEach((n: any) => {
            const pos = n.renderedPosition();
            points.push({ x: pos.x, y: pos.y });
          });
        }
      }
      return points;
    };

    // Draw function
    const draw = (phase: number = 0) => {
      // Resize canvas to match container
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const points = getNodePositions();
      if (points.length < 2) return;

      switch (clusterViz.type) {
        case "hull": {
          // Compute and draw convex hull for cluster
          const hull = computeConvexHull(points);
          const expandedHull = expandHull(hull, 25); // 25px padding

          if (clusterViz.animated) {
            drawAnimatedHull(ctx, expandedHull, {
              baseColor: clusterViz.color,
              phase,
              strokeWidth: 2,
            });
          } else {
            drawSmoothHull(ctx, expandedHull, {
              fillColor: `${clusterViz.color}20`, // 12% opacity
              strokeColor: `${clusterViz.color}60`, // 37% opacity
              strokeWidth: 2,
            });
          }
          break;
        }

        case "highlight": {
          // Draw circles around each node
          for (const point of points) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 30, 0, Math.PI * 2);
            ctx.fillStyle = `${clusterViz.color}15`;
            ctx.fill();
            ctx.strokeStyle = `${clusterViz.color}50`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          break;
        }

        case "edges": {
          // Draw edge weight visualization (for SHGAT attention)
          if (points.length >= 2) {
            for (let i = 0; i < points.length - 1; i++) {
              for (let j = i + 1; j < points.length; j++) {
                ctx.beginPath();
                ctx.moveTo(points[i].x, points[i].y);
                ctx.lineTo(points[j].x, points[j].y);
                ctx.strokeStyle = `${clusterViz.color}40`;
                ctx.lineWidth = 3;
                ctx.stroke();
              }
            }
          }
          break;
        }

        case "animated-path": {
          // Draw animated flow paths (for co-occurrence)
          if (points.length >= 2) {
            drawFlowPath(ctx, points, {
              color: clusterViz.color,
              phase,
              strokeWidth: 3,
            });
          }
          break;
        }
      }
    };

    // Initial draw
    draw(0);

    // Setup animation loop if animated
    if (clusterViz.animated || clusterViz.type === "animated-path") {
      let startTime: number | null = null;
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const phase = (elapsed % 2000) / 2000; // 2 second cycle

        draw(phase);
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Redraw on pan/zoom
    const handleViewport = () => draw(clusterViz.phase ?? 0);
    cy.on("pan zoom", handleViewport);

    return () => {
      cy.off("pan zoom", handleViewport);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Clean up Cytoscape highlights (only elements we marked)
      const highlighted = cy.elements(".algo-highlight");
      highlighted.removeStyle("overlay-color overlay-opacity line-color opacity width");
      highlighted.removeClass("algo-highlight");
    };
  }, [clusterViz]);

  // Render pinned sets as persistent visualizations
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear previous pinned highlights
    const prevPinned = cy.elements(".pinned-highlight");
    prevPinned.removeStyle("overlay-color overlay-opacity line-color opacity width");
    prevPinned.removeClass("pinned-highlight");

    // No pinned sets - done
    if (!pinnedSets || pinnedSets.length === 0) {
      return;
    }

    // Helper to find nodes by ID (handles shared tools with __capId suffix)
    const findNodes = (nodeId: string) => {
      let nodes = cy.getElementById(nodeId);
      if (nodes.length === 0) {
        nodes = cy.nodes(`[toolId = "${nodeId}"]`);
      }
      if (nodes.length === 0) {
        // deno-lint-ignore no-explicit-any
        nodes = cy.nodes().filter((n: any) => (n.id() as string).startsWith(nodeId + "__"));
      }
      return nodes;
    };

    // For each pinned set, highlight nodes and edges
    for (const pinSet of pinnedSets) {
      const matchingNodeIds = new Set<string>();
      const nodeIdSet = new Set(pinSet.nodeIds);

      // Highlight nodes with pin color overlay
      for (const nodeId of pinSet.nodeIds) {
        const nodes = findNodes(nodeId);
        // deno-lint-ignore no-explicit-any
        nodes.forEach((node: any) => {
          matchingNodeIds.add(node.id());
          node.addClass("pinned-highlight");
          node.style({
            "overlay-color": pinSet.color,
            "overlay-opacity": 0.25,
          });
        });
      }

      // Highlight edges between these nodes
      // deno-lint-ignore no-explicit-any
      cy.edges().forEach((edge: any) => {
        const sourceId = edge.source().id();
        const targetId = edge.target().id();
        const sourceMatches = matchingNodeIds.has(sourceId) || nodeIdSet.has(sourceId);
        const targetMatches = matchingNodeIds.has(targetId) || nodeIdSet.has(targetId);
        if (sourceMatches && targetMatches) {
          edge.addClass("pinned-highlight");
          edge.style({
            "line-color": pinSet.color,
            "opacity": 0.7,
            "width": 2.5,
          });
        }
      });
    }
  }, [pinnedSets]);

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

      {/* Cluster visualization canvas overlay */}
      <canvas
        ref={canvasRef}
        class="absolute top-0 left-0 w-full h-full pointer-events-none z-5"
        style={{ opacity: clusterViz ? 1 : 0, transition: "opacity 0.2s ease-out" }}
      />

      {/* Timeline separators overlay (only in capabilities mode) */}
      {viewMode === "capabilities" && renderedSeparators.length > 0 && (
        <div
          class="absolute top-0 left-0 pointer-events-none z-10 overflow-hidden"
          style={{ width: "100%", height: "100%" }}
        >
          {renderedSeparators
            .filter((sep) => sep.visible)
            .map((sep, i) => (
              <div
                key={`sep-${i}`}
                class="absolute left-0 right-0 flex items-center gap-3 px-4"
                style={{
                  top: `${sep.y}px`,
                  transform: "translateY(-50%)",
                  transition: "top 0.1s ease-out",
                }}
              >
                <div
                  class="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, var(--border, #3a3631) 20%, var(--border, #3a3631) 80%, transparent)",
                  }}
                />
                <span
                  class="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap"
                  style={{
                    background: "var(--bg-elevated, #12110f)",
                    color: "var(--text-muted, #a0a0a0)",
                    border: "1px solid var(--border, #3a3631)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  {sep.label}
                </span>
                <div
                  class="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(to left, transparent, var(--border, #3a3631) 20%, var(--border, #3a3631) 80%, transparent)",
                  }}
                />
              </div>
            ))}
        </div>
      )}

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
