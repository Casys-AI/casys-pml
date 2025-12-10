/**
 * D3GraphVisualization Island - Force-directed graph using D3.js
 *
 * Replaces Cytoscape to support hyperedges (multiple parents per node)
 * Uses d3-force for layout, d3-zoom for pan/zoom
 *
 * Story 6.4: Graph visualization with ADR-041 edge types
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
  highlightedNodeId?: string | null;
  pathNodes?: string[] | null;
}

interface GraphSnapshot {
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
    edge_type?: string;
    edge_source?: string;
  }>;
  metadata: {
    total_nodes: number;
    total_edges: number;
    density: number;
    last_updated: string;
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

const MARKER_ID = "graph-arrow";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function D3GraphVisualization({
  apiBase: apiBaseProp,
  onNodeSelect,
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

  // State
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: GraphNodeData } | null>(
    null,
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

    // Layers for edges and nodes (edges below nodes)
    const edgeLayer = g.append("g").attr("class", "edges");
    const nodeLayer = g.append("g").attr("class", "nodes");

    // Create force simulation
    const simulation = d3
      .forceSimulation<SimNode>()
      .force(
        "link",
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
    }

    // Store references for updates
    (window as any).__d3Graph = {
      svg,
      g,
      edgeLayer,
      nodeLayer,
      simulation,
      zoom,
      width,
      height,
    };

    // Load initial data
    loadGraphData();

    // Setup SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);

    eventSource.addEventListener("node_created", handleNodeCreated);
    eventSource.addEventListener("graph.edge.created", handleEdgeCreated);
    eventSource.addEventListener("graph.edge.updated", handleEdgeUpdated);

    // Cleanup
    return () => {
      eventSource.close();
      simulation.stop();
      svg.remove();
      delete (window as any).__d3Graph;
    };
  }, [apiBase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ───────────────────────────────────────────────────────────────────────────

  const loadGraphData = async () => {
    try {
      const response = await fetch(`${apiBase}/api/graph/snapshot`);
      const data: GraphSnapshot = await response.json();

      // Convert to simulation nodes
      const nodes: SimNode[] = data.nodes.map((node) => ({
        ...node,
        x: Math.random() * 800,
        y: Math.random() * 600,
      }));

      // Convert to simulation links
      const links: SimLink[] = data.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          confidence: edge.confidence,
          observed_count: edge.observed_count,
          edge_type: (edge.edge_type || "sequence") as EdgeType,
          edge_source: (edge.edge_source || "inferred") as EdgeSource,
        },
      }));

      nodesRef.current = nodes;
      linksRef.current = links;

      updateGraph();
      updateServers();
    } catch (error) {
      console.error("Failed to load graph data:", error);
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
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#fff")
      .attr("font-weight", 500)
      .style("pointer-events", "none")
      .style("user-select", "none");

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Update circles
    nodeMerge
      .select("circle")
      .attr("r", (d: SimNode) => getNodeRadius(d.pagerank))
      .attr("fill", (d: SimNode) => getServerColor(d.server))
      .attr("opacity", (d: SimNode) => {
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        if (d.degree === 0) return 0.4;
        return 1;
      })
      .attr("stroke-dasharray", (d: SimNode) => (d.degree === 0 ? "4,2" : "none"));

    // Update labels
    nodeMerge
      .select("text")
      .text((d: SimNode) => truncateLabel(d.label, getNodeRadius(d.pagerank)))
      .attr("font-size", (d: SimNode) => Math.max(8, Math.min(12, getNodeRadius(d.pagerank) * 0.6)))
      .attr("opacity", (d: SimNode) => {
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        return 1;
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
      const data = {
        nodes: nodesRef.current.map((n) => ({
          id: n.id,
          label: n.label,
          server: n.server,
          pagerank: n.pagerank,
          degree: n.degree,
        })),
        edges: linksRef.current.map((l) => l.data),
      };
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
