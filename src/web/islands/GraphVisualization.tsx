import { useEffect, useRef, useState } from "preact/hooks";

interface GraphVisualizationProps {
  apiBase: string;
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

export default function GraphVisualization({ apiBase: _apiBase }: GraphVisualizationProps) {
  // Hard-code gateway URL - Fresh props don't serialize Deno.env properly
  const apiBase = "http://localhost:3001";
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());

  // Server colors (matching original dashboard)
  const serverColors: Record<string, string> = {
    filesystem: "#3b82f6",
    memory: "#10b981",
    "sequential-thinking": "#f59e0b",
    unknown: "#6b7280",
  };

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
    });

    // Background click handler
    cy.on("tap", (event: any) => {
      if (event.target === cy) {
        setSelectedNode(null);
      }
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

      updateServers();
    } catch (error) {
      console.error("Failed to load graph data:", error);
    }
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

  return (
    <>
      <div ref={containerRef} class="graph-canvas" />
      <div class="legend">
        <h3>MCP Servers</h3>
        {Array.from(servers).map((server) => (
          <div
            key={server}
            class={`legend-item ${hiddenServers.has(server) ? "hidden" : ""}`}
            onClick={() => toggleServer(server)}
          >
            <div class="legend-dot" style={{ backgroundColor: serverColors[server] || serverColors.unknown }} />
            <span class="legend-label">{server}</span>
          </div>
        ))}
      </div>
      {selectedNode && (
        <div class="node-details">
          <span class="close" onClick={() => setSelectedNode(null)}>✕</span>
          <h3>{selectedNode.label}</h3>
          <p>Server: {selectedNode.server}</p>
          <p>PageRank: {selectedNode.pagerank.toFixed(4)}</p>
          <p>Degree: {selectedNode.degree}</p>
        </div>
      )}
    </>
  );
}
