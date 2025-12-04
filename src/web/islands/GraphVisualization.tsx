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
  apiBase: _apiBase,
  onNodeSelect,
  highlightedNodeId,
  pathNodes,
}: GraphVisualizationProps) {
  // Hard-code gateway URL - Fresh props don't serialize Deno.env properly
  const apiBase = "http://localhost:3001";
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

  // Base colors palette - extended for scalability
  const colorPalette = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#8b5cf6", // purple
    "#ef4444", // red
    "#06b6d4", // cyan
    "#f97316", // orange
    "#ec4899", // pink
    "#84cc16", // lime
    "#14b8a6", // teal
    "#6366f1", // indigo
    "#a855f7", // violet
  ];

  // Get or generate color for a server (Neo4j Color on Demand)
  const getServerColor = (server: string): string => {
    if (server === "unknown") return "#6b7280";

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
            "line-color": "#444",
            "target-arrow-color": "#444",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.6,
          },
        },
        {
          selector: "edge.highlight",
          style: {
            "line-color": "#0066cc",
            "target-arrow-color": "#0066cc",
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
            "border-color": "#ffcc00",
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
      <div class="absolute top-5 right-5 bg-slate-900/80 p-5 rounded-2xl border border-slate-700/30 backdrop-blur-xl z-10 shadow-glass transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
        <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          MCP Servers
        </h3>
        {Array.from(servers).map((server) => (
          <div
            key={server}
            class={`flex items-center gap-2.5 py-2 px-3 -mx-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-white/5 ${hiddenServers.has(server) ? "opacity-35" : ""}`}
            onClick={() => toggleServer(server)}
          >
            <div
              class="w-3 h-3 rounded-full shadow-glow transition-all duration-200 hover:scale-125"
              style={{ backgroundColor: serverColors[server] || serverColors.unknown }}
            />
            <span class="text-slate-200 text-sm font-medium">{server}</span>
          </div>
        ))}

        {/* Orphan toggle */}
        <div class="h-px bg-gradient-to-r from-transparent via-slate-700/30 to-transparent my-3" />
        <div
          class={`flex items-center gap-2.5 py-2 px-3 -mx-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-white/5 ${showOrphanNodes ? "" : "opacity-35"}`}
          onClick={toggleOrphanNodes}
        >
          <div class="w-3 h-3 rounded-full border-2 border-dashed border-slate-500 bg-slate-600" />
          <span class="text-slate-200 text-sm font-medium">Orphan nodes</span>
        </div>

        {/* Export buttons */}
        <div class="h-px bg-gradient-to-r from-transparent via-slate-700/30 to-transparent my-3" />
        <div class="flex gap-2 mt-3">
          <button
            onClick={() => exportGraph("json")}
            class="flex-1 py-2 px-3.5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg text-slate-400 text-xs font-medium cursor-pointer transition-all duration-200 hover:from-blue-500/20 hover:to-purple-500/20 hover:border-blue-500 hover:text-slate-100 hover:-translate-y-0.5 hover:shadow-glow-blue"
          >
            Export JSON
          </button>
          <button
            onClick={() => exportGraph("png")}
            class="flex-1 py-2 px-3.5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg text-slate-400 text-xs font-medium cursor-pointer transition-all duration-200 hover:from-blue-500/20 hover:to-purple-500/20 hover:border-blue-500 hover:text-slate-100 hover:-translate-y-0.5 hover:shadow-glow-blue"
          >
            Export PNG
          </button>
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div class="absolute bottom-5 left-5 bg-slate-900/80 p-5 rounded-2xl border border-slate-700/30 min-w-[280px] z-10 backdrop-blur-xl shadow-glass animate-slide-up">
          <span
            class="absolute top-3 right-3 text-slate-500 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all hover:bg-red-500/10 hover:text-red-400"
            onClick={() => setSelectedNode(null)}
          >
            ✕
          </span>
          <h3 class="text-lg font-semibold mb-3 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            {selectedNode.label}
          </h3>
          <p class="text-slate-400 text-sm my-2 leading-relaxed">Server: {selectedNode.server}</p>
          <p class="text-slate-400 text-sm my-2 leading-relaxed">PageRank: {selectedNode.pagerank.toFixed(4)}</p>
          <p class="text-slate-400 text-sm my-2 leading-relaxed">Degree: {selectedNode.degree}</p>
        </div>
      )}

      {/* Enriched Tooltip on Hover */}
      {tooltip && (
        <div
          class="absolute bg-black/90 py-2 px-3 rounded-md border border-slate-700 text-xs pointer-events-none z-[1000] whitespace-nowrap"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div class="font-semibold mb-1" style={{ color: getServerColor(tooltip.data.server) }}>
            {tooltip.data.label}
          </div>
          <div class="text-slate-400">
            <span class="mr-3">Server: {tooltip.data.server}</span>
            <span class="mr-3">PR: {tooltip.data.pagerank.toFixed(3)}</span>
            <span>Deg: {tooltip.data.degree}</span>
          </div>
        </div>
      )}
    </>
  );
}
