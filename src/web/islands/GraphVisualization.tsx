import { useEffect, useRef, useState } from "preact/hooks";
import { Badge, Button, Divider, LegendItem } from "../components/ui/mod.ts";

interface GraphVisualizationProps {
  apiBase: string;
  onNodeSelect?: (node: NodeData | null) => void;
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
    // ADR-041: Edge type and source for visualization
    edge_type?: string; // 'contains', 'sequence', or 'dependency'
    edge_source?: string; // 'observed', 'inferred', or 'template'
  }>;
  metadata: {
    total_nodes: number;
    total_edges: number;
    density: number;
    last_updated: string;
  };
}

interface NodeData {
  id: string;
  label: string;
  server: string;
  pagerank: number;
  degree: number;
}

export default function GraphVisualization({
  apiBase: apiBaseProp,
  onNodeSelect,
  highlightedNodeId,
  pathNodes,
}: GraphVisualizationProps) {
  // Use prop or fallback to localhost for dev
  const apiBase = apiBaseProp || "http://localhost:3003";
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(true);

  // Tooltip state (Story 6.4 AC11 - enriched tooltip)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: NodeData } | null>(null);

  // Server colors - Neo4j "Color on Demand" pattern (Story 6.4 AC11)
  // Generate distinct colors dynamically for each server discovered
  const serverColorsRef = useRef<Map<string, string>>(new Map());

  // Base colors palette - Casys warm theme with high contrast
  const colorPalette = [
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

  // Get or generate color for a server (Neo4j Color on Demand)
  const getServerColor = (server: string): string => {
    if (server === "unknown") return "#8a8078"; // Casys text-dim

    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % colorPalette.length;
      serverColorsRef.current.set(server, colorPalette[index]);
    }
    return serverColorsRef.current.get(server)!;
  };

  // For backward compatibility, expose as object-like accessor
  const serverColors: Record<string, string> = new Proxy({} as Record<string, string>, {
    get: (_, prop: string) => getServerColor(prop),
  });

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // @ts-ignore - Cytoscape loaded from CDN
    const cytoscape = globalThis.cytoscape;
    if (!cytoscape) {
      console.error("Cytoscape not loaded");
      return;
    }

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele: any) => {
              const server = ele.data("server") || "unknown";
              return serverColors[server] || serverColors.unknown;
            },
            label: "data(label)",
            width: (ele: any) => Math.max(30, (ele.data("pagerank") || 0) * 100 + 20),
            height: (ele: any) => Math.max(30, (ele.data("pagerank") || 0) * 100 + 20),
            "font-size": 12,
            color: "#fff",
            "text-valign": "center",
            "text-halign": "center",
            "border-width": 2,
            "border-color": "#fff",
            "border-opacity": 0.3,
          },
        },
        {
          selector: "node.highlight",
          style: {
            "border-width": 4,
            "border-color": "#fff",
            "border-opacity": 1,
          },
        },
        {
          selector: "node.hidden",
          style: {
            display: "none",
          },
        },
        // ADR-041: Edge styles based on type (color) and source (line style)
        // Type colors: contains=green, sequence=orange, dependency=white
        // Source styles: observed=solid, inferred=dashed, template=dotted
        {
          selector: "edge",
          style: {
            width: (ele: any) => Math.max(1, (ele.data("confidence") || 0) * 5),
            // ADR-041: Color by edge_type
            "line-color": (ele: any) => {
              const type = ele.data("edge_type") || "sequence";
              if (type === "contains") return "#22c55e"; // green
              if (type === "dependency") return "#f5f0ea"; // white
              return "#FFB86F"; // orange (sequence)
            },
            "target-arrow-color": (ele: any) => {
              const type = ele.data("edge_type") || "sequence";
              if (type === "contains") return "#22c55e";
              if (type === "dependency") return "#f5f0ea";
              return "#FFB86F";
            },
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            // ADR-041: Line style by edge_source
            "line-style": (ele: any) => {
              const source = ele.data("edge_source") || "inferred";
              if (source === "observed") return "solid";
              if (source === "template") return "dotted";
              return "dashed"; // inferred
            },
            // ADR-041: Opacity by edge_source
            opacity: (ele: any) => {
              const source = ele.data("edge_source") || "inferred";
              if (source === "observed") return 0.9;
              if (source === "template") return 0.4;
              return 0.6; // inferred
            },
          },
        },
        {
          selector: "edge.highlight",
          style: {
            "line-color": "#FFB86F",
            "target-arrow-color": "#FFB86F",
            opacity: 1,
            width: 3,
          },
        },
        {
          selector: "edge.hidden",
          style: {
            display: "none",
          },
        },
        // Story 6.4 AC3: Selected node highlight
        {
          selector: "node.selected",
          style: {
            "border-width": 6,
            "border-color": "#f5f0ea",
            "border-opacity": 1,
            "z-index": 100,
          },
        },
        // Story 6.4 AC4: Path highlight
        {
          selector: "node.path",
          style: {
            "border-width": 4,
            "border-color": "#22c55e",
            "border-opacity": 1,
            "z-index": 50,
          },
        },
        {
          selector: "edge.path",
          style: {
            "line-color": "#22c55e",
            "target-arrow-color": "#22c55e",
            opacity: 1,
            width: 4,
            "z-index": 50,
          },
        },
        // Story 6.4 AC5: Orphan nodes (low visibility)
        {
          selector: "node.orphan",
          style: {
            opacity: 0.4,
            "border-style": "dashed",
          },
        },
        {
          selector: "node.orphan-hidden",
          style: {
            display: "none",
          },
        },
        // Story 6.4 AC6: Related nodes (Adamic-Adar)
        {
          selector: "node.related",
          style: {
            "border-width": 3,
            "border-color": "#f97316",
            "border-opacity": 0.8,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        edgeElasticity: 100,
        nestingFactor: 1.2,
        gravity: 0.25,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
    });

    cyRef.current = cy;

    // Node click handler
    cy.on("tap", "node", (event: any) => {
      const node = event.target;
      const nodeData: NodeData = {
        id: node.data("id"),
        label: node.data("label"),
        server: node.data("server"),
        pagerank: node.data("pagerank"),
        degree: node.data("degree"),
      };
      setSelectedNode(nodeData);
      onNodeSelect?.(nodeData);

      // Clear previous selection
      cy.nodes().removeClass("selected");
      // Highlight selected node
      node.addClass("selected");
      // Center on node
      cy.animate({
        center: { eles: node },
        zoom: cy.zoom(),
      }, { duration: 300 });
    });

    // Background click handler
    cy.on("tap", (event: any) => {
      if (event.target === cy) {
        setSelectedNode(null);
        onNodeSelect?.(null);
        cy.nodes().removeClass("selected");
      }
    });

    // Tooltip on hover (Story 6.4 AC11 - enriched tooltip)
    cy.on("mouseover", "node", (event: any) => {
      const node = event.target;
      const renderedPosition = node.renderedPosition();
      setTooltip({
        x: renderedPosition.x,
        y: renderedPosition.y - 20,
        data: {
          id: node.data("id"),
          label: node.data("label"),
          server: node.data("server"),
          pagerank: node.data("pagerank"),
          degree: node.data("degree"),
        },
      });
    });

    cy.on("mouseout", "node", () => {
      setTooltip(null);
    });

    // Load initial graph data
    loadGraphData();

    // Setup SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);

    eventSource.addEventListener("node_created", (event: any) => {
      const data = JSON.parse(event.data);
      if (!cy.$id(data.tool_id).length) {
        const [_, server, toolName] = data.tool_id.match(/^([^:]+):(.+)$/) || [];
        cy.add({
          group: "nodes",
          data: {
            id: data.tool_id,
            label: toolName || data.tool_id,
            server: server || "unknown",
            pagerank: 0,
            degree: 0,
          },
        });
        cy.layout({ name: "cose", animate: true }).run();
        updateServers();
      }
    });

    eventSource.addEventListener("graph.edge.created", (event: any) => {
      const data = JSON.parse(event.data);
      const edgeId = `${data.fromToolId}-${data.toToolId}`;
      if (!cy.$id(edgeId).length) {
        const newEdge = cy.add({
          group: "edges",
          data: {
            id: edgeId,
            source: data.fromToolId,
            target: data.toToolId,
            confidence: data.confidenceScore || 0.5,
            observed_count: data.observedCount || 1,
            edge_type: data.edgeType || "sequence", // ADR-041
            edge_source: data.edgeSource || "inferred", // ADR-041
          },
        });
        newEdge.addClass("highlight");
        setTimeout(() => newEdge.removeClass("highlight"), 2000);

        // Update degree for connected nodes and orphan status
        const sourceNode = cy.$id(data.fromToolId);
        const targetNode = cy.$id(data.toToolId);
        if (sourceNode.length) {
          sourceNode.data("degree", sourceNode.degree());
          sourceNode.removeClass("orphan orphan-hidden");
        }
        if (targetNode.length) {
          targetNode.data("degree", targetNode.degree());
          targetNode.removeClass("orphan orphan-hidden");
        }

        cy.layout({ name: "cose", animate: true }).run();
      }
    });

    eventSource.addEventListener("graph.edge.updated", (event: any) => {
      const data = JSON.parse(event.data);
      const edgeId = `${data.fromToolId}-${data.toToolId}`;
      const edge = cy.$id(edgeId);
      if (edge.length) {
        edge.data({
          confidence: data.newConfidence, // ADR-041: use newConfidence from event
          observed_count: data.observedCount,
          edge_type: data.edgeType || "sequence", // ADR-041
          edge_source: data.edgeSource || "inferred", // ADR-041
        });
        edge.addClass("highlight");
        setTimeout(() => edge.removeClass("highlight"), 2000);
      }
    });

    return () => {
      eventSource.close();
      cy.destroy();
    };
  }, [apiBase]);

  // Effect: Handle external node highlight (Story 6.4 AC3)
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Clear previous highlights
    cy.nodes().removeClass("selected");

    if (highlightedNodeId) {
      const node = cy.$id(highlightedNodeId);
      if (node.length) {
        node.addClass("selected");
        cy.animate({
          center: { eles: node },
          zoom: Math.max(cy.zoom(), 1.2),
        }, { duration: 500 });
      }
    }
  }, [highlightedNodeId]);

  // Effect: Handle path visualization (Story 6.4 AC4)
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Clear previous path
    cy.nodes().removeClass("path");
    cy.edges().removeClass("path");

    if (pathNodes && pathNodes.length > 1) {
      // Highlight path nodes
      pathNodes.forEach((nodeId) => {
        const node = cy.$id(nodeId);
        if (node.length) node.addClass("path");
      });

      // Highlight path edges
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const edgeId = `${pathNodes[i]}-${pathNodes[i + 1]}`;
        const edge = cy.$id(edgeId);
        if (edge.length) edge.addClass("path");
      }

      // Fit view to show path
      const pathEles = cy.nodes(".path");
      if (pathEles.length) {
        cy.fit(pathEles, 50);
      }
    }
  }, [pathNodes]);

  const loadGraphData = async () => {
    try {
      const response = await fetch(`${apiBase}/api/graph/snapshot`);
      const data: GraphSnapshot = await response.json();

      if (!cyRef.current) return;

      // Add nodes
      const nodes = data.nodes.map((node) => ({
        group: "nodes",
        data: {
          id: node.id,
          label: node.label,
          server: node.server,
          pagerank: node.pagerank,
          degree: node.degree,
        },
      }));

      // Add edges (ADR-041: include edge_type and edge_source)
      const edges = data.edges.map((edge) => ({
        group: "edges",
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          confidence: edge.confidence,
          observed_count: edge.observed_count,
          edge_type: edge.edge_type || "sequence",
          edge_source: edge.edge_source || "inferred",
        },
      }));

      cyRef.current.add([...nodes, ...edges]);
      cyRef.current.layout({ name: "cose", animate: true }).run();

      // Mark orphan nodes (Story 6.4 AC5)
      updateOrphanStatus();
      updateServers();
    } catch (error) {
      console.error("Failed to load graph data:", error);
    }
  };

  // Mark nodes with degree 0 as orphans (Story 6.4 AC5)
  const updateOrphanStatus = () => {
    if (!cyRef.current) return;
    cyRef.current.nodes().forEach((node: any) => {
      if (node.data("degree") === 0) {
        node.addClass("orphan");
        if (!showOrphanNodes) {
          node.addClass("orphan-hidden");
        }
      } else {
        node.removeClass("orphan orphan-hidden");
      }
    });
  };

  // Toggle orphan nodes visibility (Story 6.4 AC5)
  const toggleOrphanNodes = () => {
    setShowOrphanNodes(!showOrphanNodes);
    if (!cyRef.current) return;
    cyRef.current.nodes(".orphan").forEach((node: any) => {
      if (showOrphanNodes) {
        node.addClass("orphan-hidden");
      } else {
        node.removeClass("orphan-hidden");
      }
    });
  };

  const updateServers = () => {
    if (!cyRef.current) return;
    const serverSet = new Set<string>();
    cyRef.current.nodes().forEach((node: any) => {
      serverSet.add(node.data("server") || "unknown");
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

    if (!cyRef.current) return;

    // Update node visibility
    cyRef.current.nodes().forEach((node: any) => {
      if (node.data("server") === server) {
        if (newHidden.has(server)) {
          node.addClass("hidden");
        } else {
          node.removeClass("hidden");
        }
      }
    });

    // Update edge visibility
    cyRef.current.edges().forEach((edge: any) => {
      const sourceServer = edge.source().data("server");
      const targetServer = edge.target().data("server");
      if (newHidden.has(sourceServer) || newHidden.has(targetServer)) {
        edge.addClass("hidden");
      } else {
        edge.removeClass("hidden");
      }
    });
  };

  // Export graph data (Story 6.4 AC7)
  const exportGraph = async (format: "json" | "png") => {
    if (!cyRef.current) return;

    if (format === "json") {
      const data = cyRef.current.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "png") {
      const png = cyRef.current.png({ full: true, scale: 2 });
      const a = document.createElement("a");
      a.href = png;
      a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    }
  };

  return (
    <>
      <div ref={containerRef} class="w-full h-full absolute top-0 left-0" />

      {/* Legend Panel - Sidebar Left (using Atomic Design components) */}
      <div
        class="absolute top-5 left-5 p-4 rounded-xl z-10 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto"
        style={{
          background: "rgba(18, 17, 15, 0.95)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
          minWidth: "200px",
        }}
      >
        {/* MCP Servers */}
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          MCP Servers
        </h3>
        {Array.from(servers).map((server) => (
          <Badge
            key={server}
            color={serverColors[server] || serverColors.unknown}
            label={server}
            active={!hiddenServers.has(server)}
            onClick={() => toggleServer(server)}
          />
        ))}

        <Divider />

        {/* Edge Types */}
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          Edge Types
        </h3>
        <LegendItem label="Contains (parent→child)" color="#22c55e" lineStyle="solid" />
        <LegendItem label="Sequence (siblings)" color="#FFB86F" lineStyle="solid" />
        <LegendItem label="Dependency (explicit)" color="#f5f0ea" lineStyle="solid" />

        <Divider />

        {/* Confidence */}
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          Confidence
        </h3>
        <LegendItem label="Observed (3+ runs)" color="var(--text-dim)" lineStyle="solid" />
        <LegendItem label="Inferred (1-2 runs)" color="var(--text-dim)" lineStyle="dashed" />
        <LegendItem
          label="Template (bootstrap)"
          color="var(--text-dim)"
          lineStyle="dotted"
          opacity={0.5}
        />

        <Divider />

        {/* Orphan toggle */}
        <Badge
          color="transparent"
          label="Orphan nodes"
          active={showOrphanNodes}
          onClick={toggleOrphanNodes}
          class="border-2 border-dashed"
        />

        <Divider />

        {/* Export buttons */}
        <div class="flex gap-2">
          <Button variant="default" size="sm" onClick={() => exportGraph("json")} class="flex-1">
            Export JSON
          </Button>
          <Button variant="default" size="sm" onClick={() => exportGraph("png")} class="flex-1">
            Export PNG
          </Button>
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div
          class="absolute bottom-5 left-5 p-5 rounded-xl min-w-[280px] z-10"
          style={{
            background: "rgba(18, 17, 15, 0.9)",
            border: "1px solid rgba(255, 184, 111, 0.1)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span
            class="absolute top-3 right-3 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all"
            style={{ color: "#8a8078" }}
            onClick={() => setSelectedNode(null)}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#8a8078";
            }}
          >
            ✕
          </span>
          <h3
            class="text-lg font-semibold mb-3"
            style={{ color: "#FFB86F" }}
          >
            {selectedNode.label}
          </h3>
          <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
            <span style={{ color: "#8a8078" }}>Server:</span> {selectedNode.server}
          </p>
          <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
            <span style={{ color: "#8a8078" }}>PageRank:</span> {selectedNode.pagerank.toFixed(4)}
          </p>
          <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
            <span style={{ color: "#8a8078" }}>Degree:</span> {selectedNode.degree}
          </p>
        </div>
      )}

      {/* Enriched Tooltip on Hover */}
      {tooltip && (
        <div
          class="absolute py-2 px-3 rounded-lg text-xs pointer-events-none z-[1000] whitespace-nowrap"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: "translate(-50%, -100%)",
            background: "rgba(18, 17, 15, 0.95)",
            border: "1px solid rgba(255, 184, 111, 0.2)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div class="font-semibold mb-1" style={{ color: getServerColor(tooltip.data.server) }}>
            {tooltip.data.label}
          </div>
          <div style={{ color: "#8a8078" }}>
            <span class="mr-3">Server: {tooltip.data.server}</span>
            <span class="mr-3">PR: {tooltip.data.pagerank.toFixed(3)}</span>
            <span>Deg: {tooltip.data.degree}</span>
          </div>
        </div>
      )}
    </>
  );
}
