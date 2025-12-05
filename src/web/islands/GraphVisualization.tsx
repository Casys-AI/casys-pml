import { useEffect, useRef, useState } from "preact/hooks";

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
    const cytoscape = window.cytoscape;
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
        {
          selector: "edge",
          style: {
            width: (ele: any) => Math.max(1, (ele.data("confidence") || 0) * 5),
            "line-color": "rgba(255, 184, 111, 0.3)",
            "target-arrow-color": "rgba(255, 184, 111, 0.3)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.6,
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

    eventSource.addEventListener("edge_created", (event: any) => {
      const data = JSON.parse(event.data);
      const edgeId = `${data.from_tool_id}-${data.to_tool_id}`;
      if (!cy.$id(edgeId).length) {
        const newEdge = cy.add({
          group: "edges",
          data: {
            id: edgeId,
            source: data.from_tool_id,
            target: data.to_tool_id,
            confidence: data.confidence_score || 0.5,
            observed_count: data.observed_count || 1,
          },
        });
        newEdge.addClass("highlight");
        setTimeout(() => newEdge.removeClass("highlight"), 2000);
        cy.layout({ name: "cose", animate: true }).run();
      }
    });

    eventSource.addEventListener("edge_updated", (event: any) => {
      const data = JSON.parse(event.data);
      const edgeId = `${data.from_tool_id}-${data.to_tool_id}`;
      const edge = cy.$id(edgeId);
      if (edge.length) {
        edge.data({
          confidence: data.confidence_score,
          observed_count: data.observed_count,
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

      // Add edges
      const edges = data.edges.map((edge) => ({
        group: "edges",
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          confidence: edge.confidence,
          observed_count: edge.observed_count,
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

      {/* Legend Panel */}
      <div
        class="absolute top-5 right-5 p-5 rounded-xl z-10 transition-all duration-300"
        style={{
          background: 'rgba(18, 17, 15, 0.9)',
          border: '1px solid rgba(255, 184, 111, 0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-4"
          style={{ color: '#8a8078' }}
        >
          MCP Servers
        </h3>
        {Array.from(servers).map((server) => (
          <div
            key={server}
            class={`flex items-center gap-2.5 py-2 px-3 -mx-3 cursor-pointer rounded-lg transition-all duration-200 ${hiddenServers.has(server) ? "opacity-35" : ""}`}
            style={{ ':hover': { background: 'rgba(255, 184, 111, 0.05)' } }}
            onClick={() => toggleServer(server)}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 184, 111, 0.05)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div
              class="w-3 h-3 rounded-full transition-all duration-200 hover:scale-125"
              style={{ backgroundColor: serverColors[server] || serverColors.unknown }}
            />
            <span class="text-sm font-medium" style={{ color: '#d5c3b5' }}>{server}</span>
          </div>
        ))}

        {/* Orphan toggle */}
        <div class="h-px my-3" style={{ background: 'linear-gradient(to right, transparent, rgba(255, 184, 111, 0.2), transparent)' }} />
        <div
          class={`flex items-center gap-2.5 py-2 px-3 -mx-3 cursor-pointer rounded-lg transition-all duration-200 ${showOrphanNodes ? "" : "opacity-35"}`}
          onClick={toggleOrphanNodes}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 184, 111, 0.05)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div class="w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: '#8a8078', background: '#1a1816' }} />
          <span class="text-sm font-medium" style={{ color: '#d5c3b5' }}>Orphan nodes</span>
        </div>

        {/* Export buttons */}
        <div class="h-px my-3" style={{ background: 'linear-gradient(to right, transparent, rgba(255, 184, 111, 0.2), transparent)' }} />
        <div class="flex gap-2 mt-3">
          <button
            onClick={() => exportGraph("json")}
            class="flex-1 py-2 px-3.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
            style={{
              background: 'rgba(255, 184, 111, 0.1)',
              border: '1px solid rgba(255, 184, 111, 0.2)',
              color: '#d5c3b5',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 184, 111, 0.2)';
              e.currentTarget.style.borderColor = '#FFB86F';
              e.currentTarget.style.color = '#FFB86F';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 184, 111, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 184, 111, 0.2)';
              e.currentTarget.style.color = '#d5c3b5';
            }}
          >
            Export JSON
          </button>
          <button
            onClick={() => exportGraph("png")}
            class="flex-1 py-2 px-3.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
            style={{
              background: 'rgba(255, 184, 111, 0.1)',
              border: '1px solid rgba(255, 184, 111, 0.2)',
              color: '#d5c3b5',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 184, 111, 0.2)';
              e.currentTarget.style.borderColor = '#FFB86F';
              e.currentTarget.style.color = '#FFB86F';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 184, 111, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 184, 111, 0.2)';
              e.currentTarget.style.color = '#d5c3b5';
            }}
          >
            Export PNG
          </button>
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div
          class="absolute bottom-5 left-5 p-5 rounded-xl min-w-[280px] z-10"
          style={{
            background: 'rgba(18, 17, 15, 0.9)',
            border: '1px solid rgba(255, 184, 111, 0.1)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span
            class="absolute top-3 right-3 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all"
            style={{ color: '#8a8078' }}
            onClick={() => setSelectedNode(null)}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#8a8078';
            }}
          >
            ✕
          </span>
          <h3
            class="text-lg font-semibold mb-3"
            style={{ color: '#FFB86F' }}
          >
            {selectedNode.label}
          </h3>
          <p class="text-sm my-2 leading-relaxed" style={{ color: '#d5c3b5' }}>
            <span style={{ color: '#8a8078' }}>Server:</span> {selectedNode.server}
          </p>
          <p class="text-sm my-2 leading-relaxed" style={{ color: '#d5c3b5' }}>
            <span style={{ color: '#8a8078' }}>PageRank:</span> {selectedNode.pagerank.toFixed(4)}
          </p>
          <p class="text-sm my-2 leading-relaxed" style={{ color: '#d5c3b5' }}>
            <span style={{ color: '#8a8078' }}>Degree:</span> {selectedNode.degree}
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
            background: 'rgba(18, 17, 15, 0.95)',
            border: '1px solid rgba(255, 184, 111, 0.2)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div class="font-semibold mb-1" style={{ color: getServerColor(tooltip.data.server) }}>
            {tooltip.data.label}
          </div>
          <div style={{ color: '#8a8078' }}>
            <span class="mr-3">Server: {tooltip.data.server}</span>
            <span class="mr-3">PR: {tooltip.data.pagerank.toFixed(3)}</span>
            <span>Deg: {tooltip.data.degree}</span>
          </div>
        </div>
      )}
    </>
  );
}
