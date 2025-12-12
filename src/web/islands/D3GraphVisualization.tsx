/**
 * D3GraphVisualization Island - Radial Hierarchical Edge Bundling
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 * Layout: Tools on outer circle, Capabilities on inner circle
 * Bundling: D3's native curveBundle with tension parameter
 *
 * Story 8.3: Hypergraph view with capability hull zones
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type GraphNodeData } from "../components/ui/mod.ts";
import { GraphLegendPanel, type EdgeType, type ToolGroupingMode, GraphTooltip } from "../components/ui/mod.ts";
import {
  buildHierarchy,
  type BundledPath,
  type CapabilityEdge,
  createRadialLayout,
  getLabelRotation,
  getRadialEdgeColor,
  getRadialEdgeOpacity,
  type HypergraphApiResponse,
  type PositionedNode,
  type RadialLayoutResult,
  type RootNodeData,
} from "../utils/graph/index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface D3GraphVisualizationProps {
  apiBase: string;
  /** Callback when a capability is selected */
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  /** Callback when a tool is selected */
  onToolSelect?: (tool: ToolData | null) => void;
  highlightedNodeId?: string | null;
}

/** Capability data for selection callback */
export interface CapabilityData {
  id: string;
  label: string;
  successRate: number;
  usageCount: number;
  toolsCount: number;
  codeSnippet?: string;
  toolIds?: string[];
  /** Spectral/Louvain community cluster ID */
  communityId?: number;
}

export interface ToolData {
  id: string;
  label: string;
  server: string;
  description?: string;
  parentCapabilities?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function D3GraphVisualization({
  apiBase: apiBaseProp,
  onCapabilitySelect,
  onToolSelect,
  highlightedNodeId,
}: D3GraphVisualizationProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Layout refs (for re-rendering on tension change)
  const hierarchyRef = useRef<RootNodeData | null>(null);
  const capEdgesRef = useRef<CapabilityEdge[]>([]);
  const toolEdgesRef = useRef<import("../utils/graph/index.ts").ToolEdge[]>([]);
  const emptyCapabilitiesRef = useRef<import("../utils/graph/index.ts").CapabilityNodeData[]>([]);
  const layoutRef = useRef<RadialLayoutResult | null>(null);
  // Data refs for callbacks
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const toolDataRef = useRef<Map<string, ToolData>>(new Map());

  // State
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(false); // Off by default per plan
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: GraphNodeData } | null>(
    null,
  );
  const [capabilityTooltip, setCapabilityTooltip] = useState<
    { x: number; y: number; data: CapabilityData } | null
  >(null);

  // HEB Controls
  const [tension, setTension] = useState(0.85); // Holten default
  const [highlightDepth, setHighlightDepth] = useState(1); // 1 = direct connections only, Infinity = full stack
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<EdgeType>>(new Set());
  const [toolGroupingMode, setToolGroupingMode] = useState<ToolGroupingMode>("server");

  // Server colors
  const serverColorsRef = useRef<Map<string, string>>(new Map());

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (server === "capability") return "#8b5cf6"; // Purple for capabilities
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
    console.log("[RadialHEB] Component mounted, apiBase:", apiBase);
    let isMounted = true;

    // Initialize SVG
    if (!svgRef.current && containerRef.current) {
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
        .style("background", "transparent")
        .on("click", (event: MouseEvent) => {
          if (event.target === svgRef.current) {
            onToolSelect?.(null);
            onCapabilitySelect?.(null);
            clearHighlight();
          }
        });

      svgRef.current = svg.node();

      // Main group for zoom/pan
      const g = svg.append("g").attr("class", "graph-container");

      // Layers: edges first, then nodes on top
      const edgeLayer = g.append("g").attr("class", "edges");
      const nodeLayer = g.append("g").attr("class", "nodes");
      const labelLayer = g.append("g").attr("class", "labels");

      // Zoom behavior
      const zoom = d3
        .zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", (event: any) => {
          g.attr("transform", event.transform);
        });

      svg.call(zoom);

      // Store references
      (window as any).__radialGraph = {
        svg,
        g,
        edgeLayer,
        nodeLayer,
        labelLayer,
        zoom,
        width,
        height,
      };
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await loadRadialData();
      } catch (err) {
        console.error("[RadialHEB] Data load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load graph data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    // SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);
    let hadError = false;

    eventSource.onopen = () => {
      if (hadError) {
        loadData();
        hadError = false;
      }
    };
    eventSource.onerror = () => {
      hadError = true;
    };

    const handleReload = () => loadData();
    eventSource.addEventListener("node_created", handleReload);
    eventSource.addEventListener("capability.zone.created", handleReload);

    return () => {
      isMounted = false;
      eventSource.close();
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
      delete (window as any).__radialGraph;
    };
  }, [apiBase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ───────────────────────────────────────────────────────────────────────────

  const loadRadialData = async () => {
    const response = await fetch(`${apiBase}/api/graph/hypergraph`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: HypergraphApiResponse = await response.json();
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    const { width, height } = graph;

    // 1. Build hierarchy from flat data
    const { root, capabilityEdges, toolEdges, orphanTools, emptyCapabilities, stats } = buildHierarchy(data);

    console.log("[RadialHEB] Built hierarchy:", stats);

    hierarchyRef.current = root;
    capEdgesRef.current = capabilityEdges;
    toolEdgesRef.current = toolEdges;
    emptyCapabilitiesRef.current = emptyCapabilities;

    // 2. Store capability/tool data for callbacks
    const capMap = new Map<string, CapabilityData>();
    const toolMap = new Map<string, ToolData>();

    for (const cap of root.children) {
      capMap.set(cap.id, {
        id: cap.id,
        label: cap.name,
        successRate: cap.successRate,
        usageCount: cap.usageCount,
        toolsCount: cap.children.length,
        codeSnippet: cap.codeSnippet,
        toolIds: cap.children.map((t) => t.id),
        communityId: cap.communityId,
      });

      for (const tool of cap.children) {
        toolMap.set(tool.id, {
          id: tool.id,
          label: tool.name,
          server: tool.server,
          parentCapabilities: tool.parentCapabilities,
        });
      }
    }

    // Add orphans to toolMap if showOrphanNodes is enabled
    for (const tool of orphanTools) {
      toolMap.set(tool.id, {
        id: tool.id,
        label: tool.name,
        server: tool.server,
        parentCapabilities: [],
      });
    }

    // Add empty capabilities to capMap
    for (const cap of emptyCapabilitiesRef.current) {
      capMap.set(cap.id, {
        id: cap.id,
        label: cap.name,
        successRate: cap.successRate,
        usageCount: cap.usageCount,
        toolsCount: 0,
        codeSnippet: cap.codeSnippet,
        toolIds: [],
        communityId: cap.communityId,
      });
    }

    capabilityDataRef.current = capMap;
    toolDataRef.current = toolMap;

    // 3. Create radial layout (with empty capabilities and tool edges)
    const layout = createRadialLayout(root, capabilityEdges, {
      width,
      height,
      tension,
    }, emptyCapabilitiesRef.current, toolEdgesRef.current);

    layoutRef.current = layout;

    console.log(
      "[RadialHEB] Layout created:",
      layout.capabilities.length,
      "caps,",
      layout.tools.length,
      "tools,",
      layout.paths.length,
      "paths",
    );

    // Debug: check for undefined x values
    for (const tool of layout.tools) {
      if (tool.x === undefined || tool.y === undefined) {
        console.warn("[RadialHEB] Tool with undefined position:", tool.id, tool);
      }
    }
    for (const cap of layout.capabilities) {
      if (cap.x === undefined || cap.y === undefined) {
        console.warn("[RadialHEB] Cap with undefined position:", cap.id, cap);
      }
    }

    // 4. Update servers list
    const serverSet = new Set<string>();
    for (const tool of layout.tools) {
      serverSet.add((tool.data as any).server || "unknown");
    }
    setServers(serverSet);

    // 5. Render
    renderGraph(layout);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────────────────────

  const renderGraph = useCallback(
    (layout: RadialLayoutResult) => {
      const graph = (window as any).__radialGraph;
      if (!graph) return;

      // @ts-ignore
      const d3 = globalThis.d3;
      const { edgeLayer, nodeLayer, labelLayer } = graph;
      // Use center from layout, not from graph
      const center = layout.center;

      // Clear existing
      edgeLayer.selectAll("*").remove();
      nodeLayer.selectAll("*").remove();
      labelLayer.selectAll("*").remove();

      // Translate edge layer to center (lineRadial generates paths centered at 0,0)
      edgeLayer.attr("transform", `translate(${center.x},${center.y})`);

      // Filter out any nodes with undefined positions
      const validCaps = layout.capabilities.filter((d) => d && d.x !== undefined && d.y !== undefined);
      const validTools = layout.tools.filter((d) => d && d.x !== undefined && d.y !== undefined);
      // Filter paths by edge type visibility
      const validPaths = layout.paths.filter((d) => d && d.pathD && !hiddenEdgeTypes.has(d.edgeType as EdgeType));

      console.log("[RadialHEB] Rendering:", validCaps.length, "caps,", validTools.length, "tools,", validPaths.length, "paths");

      // ─── Render Edges ───
      edgeLayer
        .selectAll(".edge")
        .data(validPaths, (d: BundledPath | undefined) => d?.id ?? "")
        .enter()
        .append("path")
        .attr("class", "edge")
        .attr("d", (d: BundledPath) => d.pathD)
        .attr("fill", "none")
        .attr("stroke", (d: BundledPath) => getRadialEdgeColor(d.edgeType))
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", (d: BundledPath) => getRadialEdgeOpacity(d.edgeType))
        .style("pointer-events", "none");

      // ─── Shared arc setup ───
      const totalAngle = 2 * Math.PI;
      // @ts-ignore - D3 loaded from CDN
      const arcGenerator = d3.arc();

      // ─── Render Capability Nodes (inner circle - ARC segments) ───
      const capCount = validCaps.length;
      const capPadding = 0.02; // Gap between caps in same cluster
      const clusterGap = 0.08; // Larger gap between spectral clusters

      // Sort caps by: 1) communityId, 2) successRate (desc), 3) name (alpha)
      const sortedCaps = [...validCaps].sort((a, b) => {
        const capA = a.data as any;
        const capB = b.data as any;
        // 1. Group by communityId (nulls go last)
        const commA = capA?.communityId ?? Infinity;
        const commB = capB?.communityId ?? Infinity;
        if (commA !== commB) return commA - commB;
        // 2. Within cluster, sort by successRate descending
        const srA = capA?.successRate ?? 0;
        const srB = capB?.successRate ?? 0;
        if (srA !== srB) return srB - srA;
        // 3. Alphabetical by name
        return a.name.localeCompare(b.name);
      });

      // Group by cluster to calculate gaps
      const capsByCommunity = new Map<number, PositionedNode[]>();
      for (const cap of sortedCaps) {
        const comm = (cap.data as any)?.communityId ?? -1;
        if (!capsByCommunity.has(comm)) capsByCommunity.set(comm, []);
        capsByCommunity.get(comm)!.push(cap);
      }

      const communityIds = [...capsByCommunity.keys()].sort((a, b) => a - b);
      const numClusterGaps = communityIds.length > 1 ? communityIds.length : 0;
      const availableCapAngle = totalAngle - capPadding * capCount - clusterGap * numClusterGaps;
      const capArcAngle = availableCapAngle / capCount;

      // Build community start indices for gap insertion
      const communityStartIdx = new Map<number, number>();
      let capIdx = 0;
      for (const comm of communityIds) {
        communityStartIdx.set(comm, capIdx);
        capIdx += capsByCommunity.get(comm)!.length;
      }

      const capNodes = nodeLayer
        .selectAll(".cap-node")
        .data(sortedCaps, (d: PositionedNode | undefined) => d?.id ?? "")
        .enter()
        .append("g")
        .attr("class", "cap-node")
        .attr("transform", `translate(${center.x},${center.y})`)
        .style("cursor", "pointer");

      capNodes
        .append("path")
        .attr("d", (d: PositionedNode, i: number) => {
          if (!d) return "";
          const cap = d.data as any;
          const pagerank = cap?.pagerank || 0;
          const usage = cap?.usageCount || 0;
          // Arc thickness based on pagerank + usage (10-24px)
          const thickness = 10 + Math.min(pagerank * 30, 8) + Math.min(usage * 0.3, 6);
          const innerR = (d.y || 100) - thickness / 2;
          const outerR = (d.y || 100) + thickness / 2;

          // Calculate start/end angles with cluster gaps
          const comm = cap?.communityId ?? -1;
          const commIdx = communityIds.indexOf(comm);
          const gapsBefore = commIdx >= 0 ? commIdx : communityIds.length;
          const baseAngle = i * (capArcAngle + capPadding) + gapsBefore * clusterGap;
          const startAngle = baseAngle - Math.PI / 2;
          const endAngle = startAngle + capArcAngle;

          return arcGenerator({
            innerRadius: innerR,
            outerRadius: outerR,
            startAngle: startAngle,
            endAngle: endAngle,
          });
        })
        .attr("fill", "#8b5cf6") // Purple for capabilities
        .attr("stroke", "rgba(255,255,255,0.4)")
        .attr("stroke-width", 1);

      // Capability labels (on arc)
      sortedCaps.forEach((d, i) => {
        if (!d || d.y === undefined) return;
        const cap = d.data as any;
        const comm = cap?.communityId ?? -1;
        const commIdx = communityIds.indexOf(comm);
        const gapsBefore = commIdx >= 0 ? commIdx : communityIds.length;
        const capCenterAngle = i * (capArcAngle + capPadding) + gapsBefore * clusterGap + capArcAngle / 2;
        const labelRadius = d.y || 100;
        const x = labelRadius * Math.cos(capCenterAngle - Math.PI / 2);
        const y = labelRadius * Math.sin(capCenterAngle - Math.PI / 2);

        let rotateDeg = (capCenterAngle * 180) / Math.PI - 90;
        if (rotateDeg > 90 && rotateDeg < 270) rotateDeg += 180;

        const label = d.name.length > 10 ? d.name.slice(0, 8) + ".." : d.name;

        labelLayer
          .append("text")
          .attr("class", "cap-label")
          .attr("transform", `translate(${center.x + x},${center.y + y}) rotate(${rotateDeg})`)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("fill", "#fff")
          .attr("font-size", "8px")
          .attr("font-weight", "bold")
          .text(label)
          .style("pointer-events", "none");
      });

      // ─── Render Tool Nodes (outer circle - ARC segments) ───
      const toolCount = validTools.length;
      const toolPadding = 0.02; // Gap between arcs in radians
      const groupGap = 0.06; // Larger gap between groups

      // Group tools based on current mode (server or cluster)
      const toolsByGroup = new Map<string, PositionedNode[]>();
      for (const tool of validTools) {
        const toolData = tool.data as any;
        const groupKey = toolGroupingMode === "cluster"
          ? (toolData?.communityId ?? "unknown")
          : (toolData?.server || "unknown");
        if (!toolsByGroup.has(groupKey)) toolsByGroup.set(groupKey, []);
        toolsByGroup.get(groupKey)!.push(tool);
      }

      // Sort groups, then flatten with gaps
      const groupKeys = [...toolsByGroup.keys()].sort();
      const sortedTools: PositionedNode[] = [];
      for (const key of groupKeys) {
        const tools = toolsByGroup.get(key)!;
        // Sort tools within group by name
        tools.sort((a, b) => a.name.localeCompare(b.name));
        sortedTools.push(...tools);
      }

      // Calculate arc angle accounting for group gaps
      const numGroupGaps = groupKeys.length > 1 ? groupKeys.length : 0;
      const availableAngle = totalAngle - toolPadding * toolCount - groupGap * numGroupGaps;
      const toolArcAngle = availableAngle / toolCount;

      // Build group start indices for gap insertion
      const groupStartIdx = new Map<string, number>();
      let idx = 0;
      for (const key of groupKeys) {
        groupStartIdx.set(key, idx);
        idx += toolsByGroup.get(key)!.length;
      }

      const toolNodes = nodeLayer
        .selectAll(".tool-node")
        .data(sortedTools, (d: PositionedNode | undefined) => d?.id ?? "")
        .enter()
        .append("g")
        .attr("class", "tool-node")
        .attr("transform", `translate(${center.x},${center.y})`)
        .style("cursor", "pointer");

      toolNodes
        .append("path")
        .attr("d", (d: PositionedNode, i: number) => {
          if (!d || !d.data) return "";
          const tool = d.data as any;
          const pagerank = tool.pagerank || 0;
          // Arc thickness based on pagerank (6-16px)
          const thickness = 6 + Math.min(pagerank * 25, 10);
          const innerR = (d.y || 200) - thickness / 2;
          const outerR = (d.y || 200) + thickness / 2;

          // Calculate start/end angles for this arc (with group gaps)
          const groupKey = toolGroupingMode === "cluster"
            ? (tool.communityId ?? "unknown")
            : (tool.server || "unknown");
          const groupIdx = groupKeys.indexOf(groupKey);
          const gapsBefore = groupIdx >= 0 ? groupIdx : groupKeys.length;
          const baseAngle = i * (toolArcAngle + toolPadding) + gapsBefore * groupGap;
          const startAngle = baseAngle - Math.PI / 2;
          const endAngle = startAngle + toolArcAngle;

          return arcGenerator({
            innerRadius: innerR,
            outerRadius: outerR,
            startAngle: startAngle,
            endAngle: endAngle,
          });
        })
        .attr("fill", (d: PositionedNode) => {
          if (!d || !d.data) return "#888";
          const tool = d.data as any;
          return getServerColor(tool.server || "unknown");
        })
        .attr("stroke", "rgba(0,0,0,0.3)")
        .attr("stroke-width", 1);

      // ─── Render Labels (outer, radial - aligned with arc centers) ───
      sortedTools.forEach((d, i) => {
        if (!d || d.y === undefined) return;
        const tool = d.data as any;
        const groupKey = toolGroupingMode === "cluster"
          ? (tool?.communityId ?? "unknown")
          : (tool?.server || "unknown");
        const groupIdx = groupKeys.indexOf(groupKey);
        const gapsBefore = groupIdx >= 0 ? groupIdx : groupKeys.length;
        // Calculate center angle of this arc (with group gaps)
        const arcCenterAngle = i * (toolArcAngle + toolPadding) + gapsBefore * groupGap + toolArcAngle / 2;
        const labelRadius = (d.y || 200) + 14;
        const x = labelRadius * Math.cos(arcCenterAngle - Math.PI / 2);
        const y = labelRadius * Math.sin(arcCenterAngle - Math.PI / 2);

        // Rotation for readability
        let rotateDeg = (arcCenterAngle * 180) / Math.PI - 90;
        const anchor = rotateDeg > 90 && rotateDeg < 270 ? "end" : "start";
        if (rotateDeg > 90 && rotateDeg < 270) rotateDeg += 180;

        const label = d.name.length > 12 ? d.name.slice(0, 10) + ".." : d.name;

        labelLayer
          .append("text")
          .attr("class", "tool-label")
          .attr("transform", `translate(${center.x + x},${center.y + y}) rotate(${rotateDeg})`)
          .attr("text-anchor", anchor)
          .attr("dominant-baseline", "middle")
          .attr("fill", "#d5c3b5")
          .attr("font-size", "9px")
          .text(label)
          .style("pointer-events", "none");
      });

      // ─── Event Handlers ───
      capNodes
        .on("click", (_event: any, d: PositionedNode) => {
          const capData = capabilityDataRef.current.get(d.id);
          if (capData) {
            onCapabilitySelect?.(capData);
            onToolSelect?.(null);
            highlightNode(d.id, layout);
          }
        })
        .on("mouseenter", (event: MouseEvent, d: PositionedNode) => {
          const rect = containerRef.current?.getBoundingClientRect();
          const capData = capabilityDataRef.current.get(d.id);
          if (rect && capData) {
            setCapabilityTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              data: capData,
            });
          }
          highlightConnectedEdges(d.id);
        })
        .on("mouseleave", () => {
          setCapabilityTooltip(null);
          resetEdgeHighlight();
        });

      toolNodes
        .on("click", (_event: any, d: PositionedNode) => {
          const toolData = toolDataRef.current.get(d.id);
          if (toolData) {
            onToolSelect?.(toolData);
            onCapabilitySelect?.(null);
            highlightNode(d.id, layout);
          }
        })
        .on("mouseenter", (event: MouseEvent, d: PositionedNode) => {
          const rect = containerRef.current?.getBoundingClientRect();
          const tool = d.data as any;
          if (rect) {
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top - 10,
              data: {
                id: d.id,
                label: d.name,
                server: tool.server || "unknown",
                pagerank: tool.pagerank || 0,
                degree: tool.degree || 0,
                parents: tool.parentCapabilities || [],
              },
            });
          }
          highlightConnectedEdges(d.id);
        })
        .on("mouseleave", () => {
          setTooltip(null);
          resetEdgeHighlight();
        });
    },
    [getServerColor, onCapabilitySelect, onToolSelect, hiddenEdgeTypes, toolGroupingMode],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Highlighting
  // ───────────────────────────────────────────────────────────────────────────

  const highlightConnectedEdges = (nodeId: string) => {
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    graph.edgeLayer
      .selectAll(".edge")
      .transition()
      .duration(100)
      .attr("stroke-opacity", (d: BundledPath) => {
        return d.sourceId === nodeId || d.targetId === nodeId ? 0.9 : 0.1;
      })
      .attr("stroke-width", (d: BundledPath) => {
        return d.sourceId === nodeId || d.targetId === nodeId ? 2.5 : 1;
      });
  };

  const resetEdgeHighlight = () => {
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    graph.edgeLayer
      .selectAll(".edge")
      .transition()
      .duration(100)
      .attr("stroke-opacity", (d: BundledPath) => getRadialEdgeOpacity(d.edgeType))
      .attr("stroke-width", 1.5);
  };

  const highlightNode = (nodeId: string, layout: RadialLayoutResult, maxDepth: number = highlightDepth) => {
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    // Build adjacency map for transitive traversal
    const adjacency = new Map<string, Set<string>>();
    for (const path of layout.paths) {
      if (!adjacency.has(path.sourceId)) adjacency.set(path.sourceId, new Set());
      if (!adjacency.has(path.targetId)) adjacency.set(path.targetId, new Set());
      adjacency.get(path.sourceId)!.add(path.targetId);
      adjacency.get(path.targetId)!.add(path.sourceId);
    }

    // BFS with depth limit to find connected nodes up to maxDepth
    const connected = new Set<string>([nodeId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id: current, depth } = queue.shift()!;

      // Stop if we've reached max depth
      if (depth >= maxDepth) continue;

      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!connected.has(neighbor)) {
            connected.add(neighbor);
            queue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    // Dim non-connected nodes
    graph.nodeLayer
      .selectAll(".cap-node, .tool-node")
      .transition()
      .duration(200)
      .attr("opacity", (d: PositionedNode) => (connected.has(d.id) ? 1 : 0.2));

    // Highlight edges that connect nodes in the stack
    graph.edgeLayer
      .selectAll(".edge")
      .transition()
      .duration(200)
      .attr("stroke-opacity", (d: BundledPath) => {
        const inStack = connected.has(d.sourceId) && connected.has(d.targetId);
        return inStack ? 0.9 : 0.05;
      })
      .attr("stroke-width", (d: BundledPath) => {
        const inStack = connected.has(d.sourceId) && connected.has(d.targetId);
        return inStack ? 3 : 1;
      });
  };

  const clearHighlight = () => {
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    graph.nodeLayer
      .selectAll(".cap-node, .tool-node")
      .transition()
      .duration(200)
      .attr("opacity", 1);

    resetEdgeHighlight();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Tension Control
  // ───────────────────────────────────────────────────────────────────────────

  const handleTensionChange = useCallback(
    (newTension: number) => {
      setTension(newTension);

      // Re-render with new tension
      if (hierarchyRef.current && capEdgesRef.current) {
        const graph = (window as any).__radialGraph;
        if (!graph) return;

        const layout = createRadialLayout(hierarchyRef.current, capEdgesRef.current, {
          width: graph.width,
          height: graph.height,
          tension: newTension,
        }, emptyCapabilitiesRef.current, toolEdgesRef.current);

        layoutRef.current = layout;

        // Update paths only (nodes stay in place)
        // @ts-ignore
        const d3 = globalThis.d3;

        graph.edgeLayer
          .selectAll(".edge")
          .data(layout.paths, (d: BundledPath) => d.id)
          .transition()
          .duration(150)
          .attr("d", (d: BundledPath) => d.pathD);
      }
    },
    [],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Server Visibility
  // ───────────────────────────────────────────────────────────────────────────

  const toggleServer = (server: string) => {
    const newHidden = new Set(hiddenServers);
    if (newHidden.has(server)) {
      newHidden.delete(server);
    } else {
      newHidden.add(server);
    }
    setHiddenServers(newHidden);
    // TODO: Filter and re-render
  };

  const toggleEdgeType = useCallback((edgeType: EdgeType) => {
    setHiddenEdgeTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(edgeType)) {
        newSet.delete(edgeType);
      } else {
        newSet.add(edgeType);
      }
      return newSet;
    });
  }, []);

  const toggleOrphanNodes = () => {
    setShowOrphanNodes(!showOrphanNodes);
    // TODO: Re-load with orphans included/excluded
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Export
  // ───────────────────────────────────────────────────────────────────────────

  const exportGraph = (format: "json" | "png") => {
    if (format === "json") {
      const data = {
        capabilities: Array.from(capabilityDataRef.current.values()),
        tools: Array.from(toolDataRef.current.values()),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Effect: Handle external highlight
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (highlightedNodeId && layoutRef.current) {
      highlightNode(highlightedNodeId, layoutRef.current);
    } else {
      clearHighlight();
    }
  }, [highlightedNodeId]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effect: Re-render on edge type visibility or tool grouping mode change
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (layoutRef.current) {
      renderGraph(layoutRef.current);
    }
  }, [hiddenEdgeTypes, toolGroupingMode, renderGraph]);

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div ref={containerRef} class="w-full h-full absolute top-0 left-0" />

      {/* Loading Spinner */}
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

      {/* Error Message */}
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

      {/* Legend Panel with Tension Slider */}
      <GraphLegendPanel
        servers={servers}
        hiddenServers={hiddenServers}
        showOrphanNodes={showOrphanNodes}
        getServerColor={getServerColor}
        onToggleServer={toggleServer}
        onToggleOrphans={toggleOrphanNodes}
        onExportJson={() => exportGraph("json")}
        onExportPng={() => exportGraph("png")}
        // HEB tension control (replaces straightening/smoothing)
        tension={tension}
        onTensionChange={handleTensionChange}
        // Highlight depth control
        highlightDepth={highlightDepth === Infinity ? 10 : highlightDepth}
        onHighlightDepthChange={setHighlightDepth}
        // Edge type visibility toggles
        hiddenEdgeTypes={hiddenEdgeTypes}
        onToggleEdgeType={toggleEdgeType}
        // Tool grouping mode
        toolGroupingMode={toolGroupingMode}
        onToolGroupingModeChange={setToolGroupingMode}
      />

      {/* Tool Tooltip */}
      {tooltip && (
        <GraphTooltip
          data={tooltip.data}
          x={tooltip.x}
          y={tooltip.y}
          serverColor={getServerColor(tooltip.data.server)}
        />
      )}

      {/* Capability Tooltip */}
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
            class="px-3 py-2 rounded-lg shadow-xl border backdrop-blur-md"
            style={{
              background: "var(--bg-elevated, #12110f)",
              borderColor: "var(--border, rgba(255, 184, 111, 0.1))",
            }}
          >
            <div class="font-bold text-sm text-white mb-1">{capabilityTooltip.data.label}</div>
            <div class="text-xs text-gray-400">
              {capabilityTooltip.data.toolsCount} tools •{" "}
              {Math.round(capabilityTooltip.data.successRate * 100)}% success
              {capabilityTooltip.data.communityId !== undefined && (
                <> • C{capabilityTooltip.data.communityId}</>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
