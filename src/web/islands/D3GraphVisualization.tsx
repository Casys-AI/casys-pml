/**
 * D3GraphVisualization Island - Force-directed graph using D3.js
 *
 * Replaces Cytoscape to support hyperedges (multiple parents per node)
 * Uses d3-force for layout, d3-zoom for pan/zoom
 *
 * Story 6.4: Graph visualization with ADR-041 edge types
 * Story 8.3: Hypergraph view mode with capability hull zones
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type EdgeSource,
  type EdgeType,
  getEdgeColor,
  getEdgeOpacity,
  getEdgeStrokeDasharray,
  getEdgeWidth,
  type GraphEdgeData,
  type GraphNodeData,
  getNodeRadius,
} from "../components/ui/mod.ts";
import {
  GraphLegendPanel,
  GraphTooltip,
  NodeDetailsPanel,
} from "../components/ui/mod.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface D3GraphVisualizationProps {
  apiBase: string;
  onNodeSelect?: (node: GraphNodeData | null) => void;
  /** Callback when a capability is selected (Story 8.4 integration point) */
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  highlightedNodeId?: string | null;
  pathNodes?: string[] | null;
}

/** Capability data for hypergraph mode selection (Story 8.3, 8.4) */
export interface CapabilityData {
  id: string;
  label: string;
  successRate: number;
  usageCount: number;
  toolsCount: number;
  codeSnippet?: string;
  /** Tool IDs used by this capability (Story 8.4) */
  toolIds?: string[];
  /** Creation timestamp */
  createdAt?: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Louvain community ID */
  communityId?: number;
}

/** Hull zone from hypergraph API (Story 8.2/8.3) */
interface CapabilityZone {
  id: string;
  label: string;
  color: string;
  opacity: number;
  toolIds: string[];
  padding: number;
  minRadius: number;
}

/** Hypergraph API response (Story 8.1/8.3) - snake_case from API */
interface HypergraphResponse {
  nodes: Array<{
    data: {
      id: string;
      type: "capability" | "tool";
      label: string;
      server?: string;
      pagerank?: number;
      degree?: number;
      parents?: string[];
      // API returns snake_case
      success_rate?: number;
      usage_count?: number;
      tools_count?: number;
      code_snippet?: string;
    };
  }>;
  edges: Array<{
    data: {
      id: string;
      source: string;
      target: string;
      edge_type: string;
      edge_source: string;
      shared_tools?: number;
      observed_count?: number;
    };
  }>;
  capability_zones?: CapabilityZone[];
  capabilities_count: number;
  tools_count: number;
  metadata: {
    generated_at: string;
    version: string;
  };
}

// D3 simulation node type (extends our node data)
interface SimNode extends GraphNodeData {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  /** Node type for hypergraph mode */
  nodeType?: "tool" | "capability";
  /** Parent capability IDs (hypergraph mode) */
  parents?: string[];
  /** Capability-specific fields */
  successRate?: number;
  usageCount?: number;
  toolsCount?: number;
  codeSnippet?: string;
}

// D3 simulation link type
interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  data: GraphEdgeData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#FFB86F", // accent orange (primary)
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

// Story 8.3: Zone colors for capability hulls (same as hypergraph-builder.ts)
const ZONE_COLORS = [
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

const MARKER_ID = "graph-arrow";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function D3GraphVisualization({
  apiBase: apiBaseProp,
  onNodeSelect,
  onCapabilitySelect,
  highlightedNodeId,
  pathNodes,
}: D3GraphVisualizationProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<any>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  // Story 8.3: Hypergraph mode refs
  const capabilityZonesRef = useRef<CapabilityZone[]>([]);
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const hullUpdateTimerRef = useRef<number | null>(null);
  const zoneColorIndexRef = useRef<number>(0); // Track next color for new zones

  // State
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: GraphNodeData } | null>(
    null,
  );
  const [capabilityTooltip, setCapabilityTooltip] = useState<{
    x: number;
    y: number;
    zone: CapabilityZone;
  } | null>(null);

  // Story 8.3: Hull interaction callbacks
  const handleHullHover = useCallback(
    (zone: CapabilityZone | null, x: number, y: number) => {
      if (zone) {
        setCapabilityTooltip({ zone, x, y });
      } else {
        setCapabilityTooltip(null);
      }
    },
    [],
  );

  const handleHullClick = useCallback(
    (zone: CapabilityZone) => {
      const capData = capabilityDataRef.current.get(zone.id);
      if (capData) {
        onCapabilitySelect?.(capData);
        // Emit BroadcastChannel event for cross-tab sync
        // Channel name: PML_EVENTS_CHANNEL from src/events/event-bus.ts
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const channel = new BroadcastChannel("pml-events");
          channel.postMessage({
            type: "capability.selected",
            payload: {
              capabilityId: zone.id,
              label: zone.label,
              timestamp: Date.now(),
            },
          });
          channel.close();
        }
      }
    },
    [onCapabilitySelect],
  );

  // Server colors (Neo4j "Color on Demand" pattern)
  const serverColorsRef = useRef<Map<string, string>>(new Map());

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % COLOR_PALETTE.length;
      serverColorsRef.current.set(server, COLOR_PALETTE[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // D3 Initialization
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // @ts-ignore - D3 loaded from CDN
    const d3 = globalThis.d3;
    if (!d3) {
      console.error("D3 not loaded");
      return;
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create SVG
    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", [0, 0, width, height])
      .style("background", "transparent");

    svgRef.current = svg.node();

    // Add marker definitions for arrows
    const defs = svg.append("defs");

    // Create markers for each edge type
    const edgeTypes: EdgeType[] = ["contains", "sequence", "dependency"];
    edgeTypes.forEach((edgeType) => {
      defs
        .append("marker")
        .attr("id", `${MARKER_ID}-${edgeType}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", getEdgeColor(edgeType));
    });

    // Path marker (green)
    defs
      .append("marker")
      .attr("id", `${MARKER_ID}-path`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#22c55e");

    // Create zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: any) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Main group for zoom/pan
    const g = svg.append("g").attr("class", "graph-container");

    // Layers: edges → hulls → nodes (hulls between edges and nodes for proper z-order)
    const edgeLayer = g.append("g").attr("class", "edges");
    const hullLayer = g.append("g").attr("class", "hulls"); // Story 8.3: Hull zones
    const nodeLayer = g.append("g").attr("class", "nodes");

    // Create force simulation
    // @ts-ignore - D3 type generics from CDN
    const simulation = d3
      .forceSimulation<SimNode>()
      .force(
        "link",
        // @ts-ignore - D3 type generics from CDN
        d3
          .forceLink<SimNode, SimLink>()
          .id((d: SimNode) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: SimNode) => getNodeRadius(d.pagerank) + 5))
      .on("tick", ticked);

    simulationRef.current = simulation;

    // Tick function - update positions
    function ticked() {
      // Update edge positions
      edgeLayer
        .selectAll(".edge")
        .attr("d", (d: any) => {
          const sourceNode = d.source as SimNode;
          const targetNode = d.target as SimNode;
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dr = Math.sqrt(dx * dx + dy * dy) * 0.8;
          return `M${sourceNode.x},${sourceNode.y}A${dr},${dr} 0 0,1 ${targetNode.x},${targetNode.y}`;
        });

      // Update node positions
      nodeLayer.selectAll(".node").attr("transform", (d: any) => `translate(${d.x},${d.y})`);

      // Story 8.3: Debounced hull update with interactivity callbacks
      if (capabilityZonesRef.current.length > 0) {
        if (hullUpdateTimerRef.current) clearTimeout(hullUpdateTimerRef.current);
        hullUpdateTimerRef.current = setTimeout(() => {
          drawCapabilityHulls(
            hullLayer,
            capabilityZonesRef.current,
            nodesRef.current,
            handleHullHover,
            handleHullClick,
          );
        }, 100) as unknown as number;
      }
    }

    // Store references for updates
    (window as any).__d3Graph = {
      svg,
      g,
      edgeLayer,
      hullLayer,
      nodeLayer,
      simulation,
      zoom,
      width,
      height,
    };

    // Always load hypergraph data (tools + capability zones)
    loadHypergraphData();

    // Setup SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);
    let hadError = false; // Track if we had a disconnection

    // SSE connection lifecycle handlers
    eventSource.onopen = () => {
      console.log("[D3Graph] SSE connection opened to", `${apiBase}/events/stream`);
      // If reconnecting after error, reload data to catch up on missed events
      if (hadError) {
        console.log("[D3Graph] SSE reconnected after error - reloading data to sync");
        loadHypergraphData();
        hadError = false;
      }
    };
    eventSource.onerror = (e) => {
      console.error("[D3Graph] SSE connection error:", e);
      console.log("[D3Graph] SSE readyState:", eventSource.readyState);
      // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
      hadError = true; // Mark that we had an error, will reload on reconnect
    };

    eventSource.addEventListener("node_created", handleNodeCreated);
    eventSource.addEventListener("graph.edge.created", handleEdgeCreated);
    eventSource.addEventListener("graph.edge.updated", handleEdgeUpdated);

    // Story 8.3: Incremental hull updates via zone events
    eventSource.addEventListener("capability.zone.created", handleZoneCreated);
    eventSource.addEventListener("capability.zone.updated", handleZoneUpdated);

    // Debug: Log all incoming SSE messages
    eventSource.onmessage = (e) => {
      console.log("[D3Graph] SSE generic message:", e.data?.substring(0, 100));
    };

    // Cleanup
    return () => {
      eventSource.close();
      simulation.stop();
      svg.remove();
      if (hullUpdateTimerRef.current) clearTimeout(hullUpdateTimerRef.current);
      delete (window as any).__d3Graph;
    };
  }, [apiBase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ───────────────────────────────────────────────────────────────────────────

  // Load hypergraph data with tools + capability zones
  const loadHypergraphData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/graph/hypergraph`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: HypergraphResponse = await response.json();

      // Convert to simulation nodes (tools only for force layout)
      const nodes: SimNode[] = [];
      const capMap = new Map<string, CapabilityData>();

      for (const node of data.nodes) {
        const d = node.data;
        if (d.type === "tool") {
          // Tool node
          nodes.push({
            id: d.id,
            label: d.label,
            server: d.server || "unknown",
            pagerank: d.pagerank || 0,
            degree: d.degree || 0,
            nodeType: "tool",
            parents: d.parents || [],
            x: Math.random() * 800,
            y: Math.random() * 600,
          });
        } else if (d.type === "capability") {
          // Store capability data for tooltips/selection (convert snake_case from API)
          capMap.set(d.id, {
            id: d.id,
            label: d.label,
            successRate: d.success_rate || 0,
            usageCount: d.usage_count || 0,
            toolsCount: d.tools_count || 0,
            codeSnippet: d.code_snippet,
          });
        }
      }

      // Convert edges (filter to tool-tool edges for force layout)
      // API returns snake_case: edge_type, edge_source, observed_count
      const links: SimLink[] = data.edges
        .filter(
          (edge) =>
            edge.data.edge_type !== "hierarchy" && edge.data.edge_type !== "capability_link",
        )
        .map((edge) => ({
          source: edge.data.source,
          target: edge.data.target,
          data: {
            id: edge.data.id,
            source: edge.data.source,
            target: edge.data.target,
            confidence: 0.5, // Default for capability edges
            observed_count: edge.data.observed_count || 1,
            edge_type: (edge.data.edge_type || "sequence") as EdgeType,
            edge_source: (edge.data.edge_source || "inferred") as EdgeSource,
          },
        }));

      // Story 8.3: Create capability nodes for zones without tools (toolless capabilities)
      for (const zone of data.capability_zones || []) {
        if (zone.toolIds.length === 0) {
          // Capability sans tools → créer un noeud capability
          nodes.push({
            id: zone.id,
            label: zone.label,
            server: "capability", // Special server type for capability nodes
            pagerank: 0,
            degree: 0,
            nodeType: "capability",
            x: Math.random() * 800,
            y: Math.random() * 600,
          });
        }
      }

      nodesRef.current = nodes;
      linksRef.current = links;
      capabilityZonesRef.current = data.capability_zones || [];

      // Story 8.4: Enrich capability data with toolIds from zones
      for (const zone of capabilityZonesRef.current) {
        const capData = capMap.get(zone.id);
        if (capData) {
          capData.toolIds = zone.toolIds;
        }
      }

      capabilityDataRef.current = capMap;
      // Initialize color index for incremental zone additions
      zoneColorIndexRef.current = capabilityZonesRef.current.length;

      updateGraph();
      updateServers();

      // Initial hull draw after nodes are positioned
      const graph = (window as any).__d3Graph;
      if (graph && capabilityZonesRef.current.length > 0) {
        setTimeout(() => {
          drawCapabilityHulls(
            graph.hullLayer,
            capabilityZonesRef.current,
            nodesRef.current,
            handleHullHover,
            handleHullClick,
          );
        }, 500);
      }

      // Clear any previous errors on successful load
      // Note: No capabilities is fine - tools still display, hulls appear when capabilities exist
      setError(null);
    } catch (error) {
      console.error("Failed to load hypergraph data:", error);
      setError(
        `Failed to load hypergraph: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Graph Update (D3)
  // ───────────────────────────────────────────────────────────────────────────

  const updateGraph = useCallback(() => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    // @ts-ignore
    const d3 = globalThis.d3;
    const { edgeLayer, nodeLayer, simulation } = graph;

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // ─── Update Edges ───
    const edgeSelection = edgeLayer.selectAll(".edge").data(links, (d: any) => d.data.id);

    edgeSelection.exit().remove();

    const edgeEnter = edgeSelection
      .enter()
      .append("path")
      .attr("class", "edge")
      .attr("fill", "none")
      .style("transition", "all 0.2s ease");

    const edgeMerge = edgeEnter.merge(edgeSelection);

    edgeMerge
      .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
      .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence))
      .attr("stroke-dasharray", (d: SimLink) => getEdgeStrokeDasharray(d.data.edge_source))
      .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source))
      .attr("marker-end", (d: SimLink) => `url(#${MARKER_ID}-${d.data.edge_type})`);

    // ─── Update Nodes ───
    const nodeSelection = nodeLayer.selectAll(".node").data(nodes, (d: any) => d.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(
        // @ts-ignore - D3 type generics from CDN
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded),
      );

    // Node circle
    nodeEnter
      .append("circle")
      .attr("stroke", "rgba(255, 255, 255, 0.3)")
      .attr("stroke-width", 2)
      .style("transition", "all 0.2s ease");

    // Node label
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#fff")
      .attr("font-weight", 500)
      .style("pointer-events", "none")
      .style("user-select", "none");

    // Story 8.3: Multi-parent badge (hypergraph mode)
    // Badge shows number of capabilities containing this tool
    const badgeGroup = nodeEnter
      .append("g")
      .attr("class", "parent-badge")
      .style("opacity", 0); // Hidden by default

    badgeGroup
      .append("circle")
      .attr("class", "badge-bg")
      .attr("r", 8)
      .attr("fill", "var(--accent, #FFB86F)")
      .attr("stroke", "var(--bg, #0a0908)")
      .attr("stroke-width", 1.5);

    badgeGroup
      .append("text")
      .attr("class", "badge-text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "var(--bg, #0a0908)")
      .attr("font-size", 9)
      .attr("font-weight", 700);

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Update circles
    nodeMerge
      .select("circle")
      .attr("r", (d: SimNode) => {
        // Story 8.3: Capability nodes are smaller (anchor points for hulls)
        if (d.nodeType === "capability") return 12;
        return getNodeRadius(d.pagerank);
      })
      .attr("fill", (d: SimNode) => {
        // Story 8.3: Capability nodes use zone color from their hull
        if (d.nodeType === "capability") {
          const zone = capabilityZonesRef.current.find((z) => z.id === d.id);
          return zone?.color || "#8b5cf6"; // Fallback to violet
        }
        return getServerColor(d.server);
      })
      .attr("opacity", (d: SimNode) => {
        // Story 8.3: Capability nodes always visible
        if (d.nodeType === "capability") return 0.8;
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        if (d.degree === 0) return 0.4;
        return 1;
      })
      .attr("stroke-dasharray", (d: SimNode) => {
        // Story 8.3: Capability nodes have dashed border
        if (d.nodeType === "capability") return "3,2";
        return d.degree === 0 ? "4,2" : "none";
      })
      .attr("stroke", (d: SimNode) => {
        // Story 8.3: Capability nodes have matching colored stroke
        if (d.nodeType === "capability") {
          const zone = capabilityZonesRef.current.find((z) => z.id === d.id);
          return zone?.color || "#8b5cf6";
        }
        return "rgba(255, 255, 255, 0.3)";
      })
      .attr("stroke-width", (d: SimNode) => (d.nodeType === "capability" ? 2 : 2));

    // Update labels
    nodeMerge
      .select(".node-label")
      .text((d: SimNode) => {
        // Story 8.3: Hide label for capability nodes (hull has the label)
        if (d.nodeType === "capability") return "";
        return truncateLabel(d.label, getNodeRadius(d.pagerank));
      })
      .attr("font-size", (d: SimNode) => Math.max(8, Math.min(12, getNodeRadius(d.pagerank) * 0.6)))
      .attr("opacity", (d: SimNode) => {
        // Story 8.3: Hide label for capability nodes
        if (d.nodeType === "capability") return 0;
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        return 1;
      });

    // Story 8.3: Update multi-parent badges (hypergraph mode only)
    const badgeSelection = nodeMerge.select(".parent-badge");
    badgeSelection
      .attr("transform", (d: SimNode) => {
        const r = getNodeRadius(d.pagerank);
        return `translate(${r * 0.7}, ${-r * 0.7})`; // Position at top-right of node
      })
      .style("opacity", (d: SimNode) => {
        // Show badge only in hypergraph mode and if tool has multiple parents
        const parentCount = d.parents?.length || 0;
        if (parentCount <= 1) return 0;
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        return 1;
      });

    badgeSelection
      .select(".badge-text")
      .text((d: SimNode) => {
        const count = d.parents?.length || 0;
        return count > 9 ? "9+" : count.toString();
      });

    // Event handlers
    nodeMerge
      .on("click", (_event: any, d: SimNode) => {
        handleNodeClick(d);
      })
      .on("mouseenter", (event: MouseEvent, d: SimNode) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top - 10,
            data: d,
          });
        }
      })
      .on("mouseleave", () => {
        setTooltip(null);
      });

    // Update simulation
    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(0.3).restart();

    // Drag handlers
    function dragStarted(event: any, d: SimNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: SimNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event: any, d: SimNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }, [getServerColor, hiddenServers, showOrphanNodes]);

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleNodeClick = (node: SimNode) => {
    setSelectedNode(node);
    onNodeSelect?.(node);
    updateNodeHighlight(node.id);
  };

  const handleNodeCreated = (event: any) => {
    const data = JSON.parse(event.data);
    const existingNode = nodesRef.current.find((n) => n.id === data.tool_id);
    if (existingNode) return;

    const [_, server, toolName] = data.tool_id.match(/^([^:]+):(.+)$/) || [];
    const newNode: SimNode = {
      id: data.tool_id,
      label: toolName || data.tool_id,
      server: server || "unknown",
      pagerank: 0,
      degree: 0,
      x: Math.random() * 800,
      y: Math.random() * 600,
    };

    nodesRef.current = [...nodesRef.current, newNode];
    updateGraph();
    updateServers();
  };

  const handleEdgeCreated = (event: any) => {
    const data = JSON.parse(event.data);
    const edgeId = `${data.fromToolId}-${data.toToolId}`;
    const existingEdge = linksRef.current.find((l) => l.data.id === edgeId);
    if (existingEdge) return;

    const newLink: SimLink = {
      source: data.fromToolId,
      target: data.toToolId,
      data: {
        id: edgeId,
        source: data.fromToolId,
        target: data.toToolId,
        confidence: data.confidenceScore || 0.5,
        observed_count: data.observedCount || 1,
        edge_type: (data.edgeType || "sequence") as EdgeType,
        edge_source: (data.edgeSource || "inferred") as EdgeSource,
      },
    };

    linksRef.current = [...linksRef.current, newLink];

    // Update degrees
    const sourceNode = nodesRef.current.find((n) => n.id === data.fromToolId);
    const targetNode = nodesRef.current.find((n) => n.id === data.toToolId);
    if (sourceNode) sourceNode.degree++;
    if (targetNode) targetNode.degree++;

    updateGraph();
    highlightEdge(edgeId, 2000);
  };

  const handleEdgeUpdated = (event: any) => {
    const data = JSON.parse(event.data);
    const edgeId = `${data.fromToolId}-${data.toToolId}`;
    const link = linksRef.current.find((l) => l.data.id === edgeId);
    if (link) {
      link.data.confidence = data.newConfidence;
      link.data.observed_count = data.observedCount;
      link.data.edge_type = (data.edgeType || "sequence") as EdgeType;
      link.data.edge_source = (data.edgeSource || "inferred") as EdgeSource;
      updateGraph();
      highlightEdge(edgeId, 2000);
    }
  };

  // Story 8.3: Handle capability.zone.created - incremental hull update
  const handleZoneCreated = (event: any) => {
    console.log("[D3Graph] handleZoneCreated RAW event:", event);
    console.log("[D3Graph] handleZoneCreated event.data:", event.data);
    const data = JSON.parse(event.data);
    console.log("[D3Graph] Zone created:", data.capabilityId, "- tools:", data.toolIds?.length || 0);

    // Check if zone already exists (idempotency)
    const existingZone = capabilityZonesRef.current.find((z) => z.id === data.capabilityId);
    if (existingZone) {
      console.log("[D3Graph] Zone already exists, skipping:", data.capabilityId);
      return;
    }

    // Create new zone with next color from palette
    const colorIndex = zoneColorIndexRef.current % ZONE_COLORS.length;
    zoneColorIndexRef.current++;

    const newZone: CapabilityZone = {
      id: data.capabilityId,
      label: data.label,
      color: data.color || ZONE_COLORS[colorIndex],
      opacity: 0.3,
      toolIds: data.toolIds || [],
      padding: 20,
      minRadius: 50,
    };

    capabilityZonesRef.current = [...capabilityZonesRef.current, newZone];

    // Update capability data map for tooltips and CodePanel
    capabilityDataRef.current.set(data.capabilityId, {
      id: data.capabilityId,
      label: data.label,
      successRate: data.successRate || 0,
      usageCount: data.usageCount || 0,
      toolsCount: data.toolIds?.length || 0,
      codeSnippet: data.codeSnippet,
      toolIds: data.toolIds,
    });

    // Story 8.3: If 0 tools, create a capability node for the hull to anchor to
    if (!data.toolIds || data.toolIds.length === 0) {
      const capNode: SimNode = {
        id: data.capabilityId,
        label: data.label,
        server: "capability",
        pagerank: 0,
        degree: 0,
        nodeType: "capability",
        x: Math.random() * 800,
        y: Math.random() * 600,
      };
      nodesRef.current = [...nodesRef.current, capNode];
    } else {
      // Update tool nodes with new parent
      for (const toolId of data.toolIds) {
        const node = nodesRef.current.find((n) => n.id === toolId);
        if (node) {
          if (!node.parents) node.parents = [];
          if (!node.parents.includes(data.capabilityId)) {
            node.parents.push(data.capabilityId);
          }
        }
      }
    }

    // Redraw hulls
    const graph = (window as any).__d3Graph;
    if (graph) {
      drawCapabilityHulls(
        graph.hullLayer,
        capabilityZonesRef.current,
        nodesRef.current,
        handleHullHover,
        handleHullClick,
      );
    }

    // Also update the main graph to refresh badges
    updateGraph();
  };

  // Story 8.3: Handle capability.zone.updated - incremental hull update
  const handleZoneUpdated = (event: any) => {
    const data = JSON.parse(event.data);
    console.log("[D3Graph] Zone updated:", data.capabilityId);

    // Find existing zone
    const zoneIndex = capabilityZonesRef.current.findIndex((z) => z.id === data.capabilityId);
    if (zoneIndex === -1) {
      console.log("[D3Graph] Zone not found for update, ignoring:", data.capabilityId);
      return;
    }

    // Update zone metadata
    const zone = capabilityZonesRef.current[zoneIndex];
    if (data.label) zone.label = data.label;
    if (data.toolIds) {
      // Update tool membership if changed
      const oldToolIds = new Set(zone.toolIds);
      const newToolIds = new Set(data.toolIds);

      // Remove capability from old tools that are no longer in the zone
      for (const toolId of zone.toolIds) {
        if (!newToolIds.has(toolId)) {
          const node = nodesRef.current.find((n) => n.id === toolId);
          if (node?.parents) {
            node.parents = node.parents.filter((p) => p !== data.capabilityId);
          }
        }
      }

      // Add capability to new tools
      for (const toolId of data.toolIds) {
        if (!oldToolIds.has(toolId)) {
          const node = nodesRef.current.find((n) => n.id === toolId);
          if (node) {
            if (!node.parents) node.parents = [];
            if (!node.parents.includes(data.capabilityId)) {
              node.parents.push(data.capabilityId);
            }
          }
        }
      }

      zone.toolIds = data.toolIds;
    }

    // Update capability data map
    const capData = capabilityDataRef.current.get(data.capabilityId);
    if (capData) {
      if (data.label) capData.label = data.label;
      capData.successRate = data.successRate ?? capData.successRate;
      capData.usageCount = data.usageCount ?? capData.usageCount;
      if (data.toolIds) capData.toolsCount = data.toolIds.length;
    }

    // Redraw hulls
    const graph = (window as any).__d3Graph;
    if (graph) {
      drawCapabilityHulls(
        graph.hullLayer,
        capabilityZonesRef.current,
        nodesRef.current,
        handleHullHover,
        handleHullClick,
      );
    }

    // Also update the main graph to refresh badges
    updateGraph();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Highlighting
  // ───────────────────────────────────────────────────────────────────────────

  const updateNodeHighlight = (nodeId: string | null) => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    // @ts-ignore
    const d3 = globalThis.d3;
    const { nodeLayer } = graph;

    // Reset all nodes
    nodeLayer.selectAll(".node circle").attr("stroke", "rgba(255, 255, 255, 0.3)").attr(
      "stroke-width",
      2,
    );

    // Highlight selected
    if (nodeId) {
      nodeLayer
        .selectAll(".node")
        .filter((d: SimNode) => d.id === nodeId)
        .select("circle")
        .attr("stroke", "#f5f0ea")
        .attr("stroke-width", 4);

      // Center on node
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (node) {
        const { svg, zoom, width, height } = graph;
        const transform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(1.2)
          .translate(-node.x, -node.y);

        svg.transition().duration(500).call(zoom.transform, transform);
      }
    }
  };

  const highlightEdge = (edgeId: string, duration: number) => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    // @ts-ignore
    const d3 = globalThis.d3;
    const { edgeLayer } = graph;

    const edge = edgeLayer.selectAll(".edge").filter((d: SimLink) => d.data.id === edgeId);

    edge.attr("stroke", "#FFB86F").attr("opacity", 1).attr("stroke-width", 3);

    setTimeout(() => {
      const link = linksRef.current.find((l) => l.data.id === edgeId);
      if (link) {
        edge
          .attr("stroke", getEdgeColor(link.data.edge_type))
          .attr("opacity", getEdgeOpacity(link.data.edge_source))
          .attr("stroke-width", getEdgeWidth(link.data.confidence));
      }
    }, duration);
  };

  // Effect: Handle external node highlight
  useEffect(() => {
    if (highlightedNodeId) {
      updateNodeHighlight(highlightedNodeId);
      const node = nodesRef.current.find((n) => n.id === highlightedNodeId);
      if (node) {
        setSelectedNode(node);
        onNodeSelect?.(node);
      }
    }
  }, [highlightedNodeId]);

  // Effect: Handle path visualization
  useEffect(() => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    const { nodeLayer, edgeLayer } = graph;

    // Reset all
    nodeLayer.selectAll(".node circle").attr("stroke", "rgba(255, 255, 255, 0.3)").attr(
      "stroke-width",
      2,
    );

    edgeLayer
      .selectAll(".edge")
      .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
      .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source))
      .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence))
      .attr("marker-end", (d: SimLink) => `url(#${MARKER_ID}-${d.data.edge_type})`);

    if (pathNodes && pathNodes.length > 1) {
      // Highlight path nodes
      nodeLayer
        .selectAll(".node")
        .filter((d: SimNode) => pathNodes.includes(d.id))
        .select("circle")
        .attr("stroke", "#22c55e")
        .attr("stroke-width", 3);

      // Highlight path edges
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const edgeId = `${pathNodes[i]}-${pathNodes[i + 1]}`;
        edgeLayer
          .selectAll(".edge")
          .filter((d: SimLink) => d.data.id === edgeId)
          .attr("stroke", "#22c55e")
          .attr("opacity", 1)
          .attr("stroke-width", 3)
          .attr("marker-end", `url(#${MARKER_ID}-path)`);
      }

      // Fit to path - zoom to show all path nodes
      // @ts-ignore
      const d3 = globalThis.d3;
      const pathNodeData = nodesRef.current.filter((n) => pathNodes.includes(n.id));
      if (pathNodeData.length > 0) {
        const { svg, zoom, width, height } = graph;
        const xs = pathNodeData.map((n) => n.x);
        const ys = pathNodeData.map((n) => n.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const scale = Math.min(
          width / (maxX - minX + 100),
          height / (maxY - minY + 100),
          1.5,
        );

        const transform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-centerX, -centerY);

        svg.transition().duration(500).call(zoom.transform, transform);
      }
    }
  }, [pathNodes]);

  // Effect: Update graph when visibility changes
  useEffect(() => {
    updateGraph();
  }, [hiddenServers, showOrphanNodes, updateGraph]);

  // ───────────────────────────────────────────────────────────────────────────
  // Server Management
  // ───────────────────────────────────────────────────────────────────────────

  const updateServers = () => {
    const serverSet = new Set<string>();
    nodesRef.current.forEach((node) => {
      serverSet.add(node.server || "unknown");
    });
    setServers(serverSet);
  };

  const toggleServer = (server: string) => {
    const newHidden = new Set(hiddenServers);
    if (newHidden.has(server)) {
      newHidden.delete(server);
    } else {
      newHidden.add(server);
    }
    setHiddenServers(newHidden);
  };

  const toggleOrphanNodes = () => {
    setShowOrphanNodes(!showOrphanNodes);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Export
  // ───────────────────────────────────────────────────────────────────────────

  const exportGraph = (format: "json" | "png") => {
    if (format === "json") {
      const data: Record<string, unknown> = {
        nodes: nodesRef.current.map((n) => ({
          id: n.id,
          label: n.label,
          server: n.server,
          pagerank: n.pagerank,
          degree: n.degree,
          parents: n.parents, // Story 8.3: Include parents for hypergraph
        })),
        edges: linksRef.current.map((l) => l.data),
      };
      // Include capability zones if present
      if (capabilityZonesRef.current.length > 0) {
        data.capabilityZones = capabilityZonesRef.current;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "png") {
      const svgElement = svgRef.current;
      if (!svgElement) return;

      // Clone SVG and set background
      const clone = svgElement.cloneNode(true) as SVGSVGElement;
      clone.style.background = "#0a0908";

      // Serialize to string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create canvas and draw
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = svgElement.clientWidth * 2;
        canvas.height = svgElement.clientHeight * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        ctx.fillStyle = "#0a0908";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.png`;
            a.click();
          }
        });
        URL.revokeObjectURL(svgUrl);
      };
      img.src = svgUrl;
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div ref={containerRef} class="w-full h-full absolute top-0 left-0" />

      {/* Loading Spinner (Story 8.3) */}
      {isLoading && (
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
          style={{
            color: "var(--accent, #FFB86F)",
          }}
        >
          <div class="flex flex-col items-center gap-3">
            <div
              class="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
            />
            <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Loading graph...
            </span>
          </div>
        </div>
      )}

      {/* Error/Empty State Message (Story 8.3) */}
      {error && !isLoading && (
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 max-w-md text-center p-6 rounded-xl"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
          }}
        >
          <div class="text-4xl mb-3">📊</div>
          <p style={{ color: "var(--text-muted, #d5c3b5)" }}>{error}</p>
        </div>
      )}

      {/* Legend Panel */}
      <GraphLegendPanel
        servers={servers}
        hiddenServers={hiddenServers}
        showOrphanNodes={showOrphanNodes}
        getServerColor={getServerColor}
        onToggleServer={toggleServer}
        onToggleOrphans={toggleOrphanNodes}
        onExportJson={() => exportGraph("json")}
        onExportPng={() => exportGraph("png")}
      />

      {/* Node Details Panel */}
      {selectedNode && (
        <NodeDetailsPanel
          node={selectedNode}
          onClose={() => {
            setSelectedNode(null);
            onNodeSelect?.(null);
            updateNodeHighlight(null);
          }}
        />
      )}

      {/* Tooltip on Hover */}
      {tooltip && (
        <GraphTooltip
          data={tooltip.data}
          x={tooltip.x}
          y={tooltip.y}
          serverColor={getServerColor(tooltip.data.server)}
        />
      )}

      {/* Capability Tooltip on Hull Hover (Story 8.3) */}
      {capabilityTooltip && (
        <div
          class="absolute z-50 pointer-events-none"
          style={{
            left: `${capabilityTooltip.x}px`,
            top: `${capabilityTooltip.y - 10}px`,
            transform: "translateX(-50%) translateY(-100%)",
          }}
        >
          <div
            class="px-3 py-2 rounded-lg shadow-lg text-sm"
            style={{
              background: "var(--bg-elevated, #12110f)",
              border: `2px solid ${capabilityTooltip.zone.color}`,
              color: "var(--text, #f5f0ea)",
            }}
          >
            <div class="font-semibold mb-1" style={{ color: capabilityTooltip.zone.color }}>
              {capabilityTooltip.zone.label}
            </div>
            <div class="text-xs" style={{ color: "var(--text-dim, #8a8078)" }}>
              {capabilityTooltip.zone.toolIds.length} tools
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncateLabel(label: string, radius: number): string {
  const fontSize = Math.max(8, Math.min(12, radius * 0.6));
  const avgCharWidth = fontSize * 0.6;
  const maxWidth = radius * 1.8;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 2) + "..";
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 8.3: Hull Zone Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw capability hull zones using D3 polygon hull
 * Each capability is rendered as a convex hull around its tool nodes
 *
 * @param hullLayer D3 selection for hull container
 * @param zones Capability zone metadata
 * @param nodes Current node positions
 * @param onHullHover Optional callback for hull hover (tooltip)
 * @param onHullClick Optional callback for hull click (selection)
 */
function drawCapabilityHulls(
  hullLayer: any,
  zones: CapabilityZone[],
  nodes: SimNode[],
  onHullHover?: (zone: CapabilityZone | null, x: number, y: number) => void,
  onHullClick?: (zone: CapabilityZone) => void,
) {
  // @ts-ignore - D3 loaded from CDN
  const d3 = globalThis.d3;
  if (!d3 || !hullLayer) return;

  // Prepare hull data
  const hullData = zones.map((zone) => {
    let points: [number, number][];

    if (zone.toolIds.length === 0) {
      // Story 8.3: Capability sans tools → utiliser le noeud capability comme point
      const capNode = nodes.find((n) => n.id === zone.id && n.nodeType === "capability");
      points = capNode ? [[capNode.x, capNode.y]] : [];
    } else {
      // Get positions of tools in this capability
      const toolNodes = nodes.filter((n) => zone.toolIds.includes(n.id));
      points = toolNodes.map((n) => [n.x, n.y]);
    }

    // Calculate hull (need at least 3 points)
    let hull: [number, number][] | null = null;
    if (points.length >= 3) {
      hull = d3.polygonHull(points);
    }

    return { zone, hull, points };
  });

  // Update hulls with D3 data join
  const hulls = hullLayer.selectAll(".capability-hull").data(hullData, (d: any) => d.zone.id);

  // Exit: remove old hulls
  hulls.exit().remove();

  // Enter: create new hull groups
  const hullEnter = hulls
    .enter()
    .append("g")
    .attr("class", "capability-hull")
    .style("cursor", "pointer")
    .on("mouseenter", function (this: SVGGElement, event: any, d: any) {
      // Highlight hull on hover
      d3.select(this).select(".hull-path").attr("fill-opacity", (d.zone.opacity || 0.2) + 0.15);
      // Trigger tooltip callback
      if (onHullHover) {
        const [x, y] = d3.pointer(event, document.body);
        onHullHover(d.zone, x, y);
      }
    })
    .on("mouseleave", function (this: SVGGElement, _event: any, d: any) {
      // Reset hull opacity
      d3.select(this).select(".hull-path").attr("fill-opacity", d.zone.opacity || 0.2);
      // Clear tooltip
      if (onHullHover) onHullHover(null, 0, 0);
    })
    .on("click", function (_event: any, d: any) {
      // Selection callback for Story 8.4 integration
      if (onHullClick) onHullClick(d.zone);
    });

  // Hull polygon path
  hullEnter
    .append("path")
    .attr("class", "hull-path")
    .style("transition", "all 0.3s ease");

  // Hull label text
  hullEnter
    .append("text")
    .attr("class", "hull-label")
    .attr("text-anchor", "middle")
    .attr("font-family", "var(--font-sans)")
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("pointer-events", "none");

  // Merge: update all hulls
  const hullMerge = hullEnter.merge(hulls);

  // Update hull paths
  hullMerge
    .select(".hull-path")
    .attr("d", (d: any) => {
      if (d.hull) {
        // Expand hull with padding
        const paddedHull = expandHull(d.hull, d.zone.padding || 20);
        return `M${paddedHull.map((p: [number, number]) => p.join(",")).join("L")}Z`;
      }
      // Fallback for < 3 points
      if (d.points.length === 1) {
        const [x, y] = d.points[0];
        const r = d.zone.minRadius || 50;
        return `M${x - r},${y}A${r},${r} 0 1,0 ${x + r},${y}A${r},${r} 0 1,0 ${x - r},${y}`;
      }
      if (d.points.length === 2) {
        return createEllipsePath(d.points, d.zone.minRadius || 50);
      }
      return "";
    })
    .attr("fill", (d: any) => d.zone.color)
    .attr("fill-opacity", (d: any) => d.zone.opacity || 0.2)
    .attr("stroke", (d: any) => d.zone.color)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 2);

  // Update hull labels
  hullMerge
    .select(".hull-label")
    .attr("x", (d: any) => {
      if (d.hull) {
        const centroid = d3.polygonCentroid(d.hull);
        return centroid[0];
      }
      if (d.points.length > 0) {
        return d.points.reduce((sum: number, p: [number, number]) => sum + p[0], 0) /
          d.points.length;
      }
      return 0;
    })
    .attr("y", (d: any) => {
      if (d.hull) {
        const centroid = d3.polygonCentroid(d.hull);
        return centroid[1] - (d.zone.padding || 20) - 8;
      }
      if (d.points.length > 0) {
        const avgY = d.points.reduce((sum: number, p: [number, number]) => sum + p[1], 0) /
          d.points.length;
        return avgY - (d.zone.minRadius || 50) - 8;
      }
      return 0;
    })
    .attr("fill", (d: any) => d.zone.color)
    .text((d: any) => d.zone.label);
}

/**
 * Expand a convex hull outward by padding amount
 */
function expandHull(hull: [number, number][], padding: number): [number, number][] {
  // @ts-ignore
  const d3 = globalThis.d3;
  if (!d3 || !hull || hull.length < 3) return hull;

  const centroid = d3.polygonCentroid(hull);
  return hull.map(([x, y]: [number, number]) => {
    const dx = x - centroid[0];
    const dy = y - centroid[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return [x, y] as [number, number];
    const scale = (dist + padding) / dist;
    return [centroid[0] + dx * scale, centroid[1] + dy * scale] as [number, number];
  });
}

/**
 * Create an ellipse path for 2 points
 */
function createEllipsePath(points: [number, number][], minRadius: number): string {
  if (points.length !== 2) return "";
  const [p1, p2] = points;
  const cx = (p1[0] + p2[0]) / 2;
  const cy = (p1[1] + p2[1]) / 2;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rx = Math.max(dist / 2 + minRadius / 2, minRadius);
  const ry = minRadius;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  // Create rotated ellipse as path
  return `M${cx - rx},${cy}A${rx},${ry} ${angle} 1,0 ${cx + rx},${cy}A${rx},${ry} ${angle} 1,0 ${
    cx - rx
  },${cy}`;
}
