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
} from "../components/ui/mod.ts";
import {
  type Point,
  type BundledEdge,
  FDEBBundler,
  BoundedForceLayout,
  type SimulationNode as BoundedSimNode,
  type SimulationLink,
} from "../utils/graph/index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface D3GraphVisualizationProps {
  apiBase: string;
  /** Callback when a capability is selected (Story 8.4 integration point) */
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  /** Callback when a tool is selected */
  onToolSelect?: (tool: ToolData | null) => void;
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
  /** Tool IDs used by this capability */
  toolIds?: string[];
  /** Creation timestamp */
  createdAt?: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Louvain community ID */
  communityId?: number;
}

export interface ToolData {
  id: string;
  label: string;
  server: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** Parent capability IDs */
  parentCapabilities?: string[];
  /** Observed usage count */
  observedCount?: number;
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
      // Tool-specific fields
      description?: string;
      input_schema?: Record<string, unknown>;
      observed_count?: number;
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
  capability_zones?: any[]; // Deprecated, ignored
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

const MARKER_ID = "graph-arrow";

function truncateLabel(label: string, maxRadius: number): string {
  // Simplified truncation
  const maxChars = Math.max(5, Math.floor(maxRadius / 3));
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 2) + "..";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function D3GraphVisualization({
  apiBase: apiBaseProp,
  onCapabilitySelect,
  onToolSelect,
  highlightedNodeId,
  pathNodes,
}: D3GraphVisualizationProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  // Data refs
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const toolDataRef = useRef<Map<string, ToolData>>(new Map());

  // State
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: GraphNodeData } | null>(
    null,
  );
  // Bipartite interaction
  const [capabilityTooltip, setCapabilityTooltip] = useState<{
    x: number;
    y: number;
    data: CapabilityData;
  } | null>(null);

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

  // Effect: Load data on mount and updates
  useEffect(() => {
    console.log("[D3Graph] Component mounted/updated, apiBase:", apiBase);
    let isMounted = true;

    // Initialize D3
    if (!svgRef.current && containerRef.current) {
      console.log("[D3Graph] Initializing SVG...");
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
          // Only reset if clicking directly on SVG background (not on nodes/edges)
          if (event.target === svgRef.current) {
            const graph = (window as any).__d3Graph;
            if (graph) {
              graph.highlightedNodeId = null;
            }
            onToolSelect?.(null);
            onCapabilitySelect?.(null);
            // Trigger highlight reset through a custom event
            window.dispatchEvent(new CustomEvent("graph:deselect"));
          }
        });

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
          .attr("refX", 5) // Adjusted for endpoints
          .attr("refY", 0)
          .attr("markerWidth", 4)
          .attr("markerHeight", 4)
          .attr("orient", "auto")
          .append("path")
          .attr("d", "M0,-5L10,0L0,5")
          .attr("fill", getEdgeColor(edgeType));
      });

      // Main group for zoom/pan
      const g = svg.append("g").attr("class", "graph-container");

      // Layers: edges → nodes (simple, single edge layer)
      const edgeLayer = g.append("g").attr("class", "edges");
      const nodeLayer = g.append("g").attr("class", "nodes");

      // Create zoom behavior
      const zoom = d3
        .zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event: any) => {
          g.attr("transform", event.transform);
        });

      svg.call(zoom);

      // Store references for updates
      (window as any).__d3Graph = {
        svg,
        g,
        edgeLayer,
        nodeLayer,
        zoom,
        width,
        height,
      };
    }

    const loadData = async () => {
      console.log("[D3Graph] loadHypergraphData started");
      try {
        setIsLoading(true);
        setError(null);
        await loadHypergraphData();
        console.log("[D3Graph] loadHypergraphData completed successfully");
      } catch (err) {
        console.error("[D3Graph] Data load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load graph data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    // Setup SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);
    let hadError = false; 

    eventSource.onopen = () => {
      console.log("[D3Graph] SSE connection opened to", `${apiBase}/events/stream`);
      if (hadError) {
        loadData(); // Use loadData to ensure proper state handling
        hadError = false;
      }
    };
    eventSource.onerror = (e) => {
      console.error("[D3Graph] SSE connection error:", e);
      hadError = true;
    };

    // Listen for events that should trigger a graph reload
    // In strict bipartite mode, any node/edge change might require re-layout
    const handleReload = () => {
        console.log("Graph update event received, reloading...");
        loadData(); // Use loadData to ensure proper state handling
    };

    eventSource.addEventListener("node_created", handleReload);
    eventSource.addEventListener("graph.edge.created", handleReload);
    eventSource.addEventListener("graph.edge.updated", handleReload);
    eventSource.addEventListener("capability.zone.created", handleReload);
    eventSource.addEventListener("capability.zone.updated", handleReload);

    // Cleanup
    return () => {
      isMounted = false;
      eventSource.close();
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
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
      const graph = (window as any).__d3Graph;
      const width = graph ? graph.width : 800;
      const height = graph ? graph.height : 600;

      // 1. Parse Nodes
      const nodes: SimNode[] = [];
      const capMap = new Map<string, CapabilityData>();
      const nodeMap = new Map<string, SimNode>();

      // Process nodes from API response
      for (const node of data.nodes) {
        const d = node.data;
        if (d.type === "capability") {
          const capData: CapabilityData = {
            id: d.id,
            label: d.label,
            successRate: d.success_rate || 0,
            usageCount: d.usage_count || 0,
            toolsCount: d.tools_count || 0,
            codeSnippet: d.code_snippet,
            toolIds: [], // enriched later
          };
          capMap.set(d.id, capData);
          nodes.push({
            id: d.id,
            label: d.label,
            server: "capability",
            pagerank: 0,
            degree: 0,
            nodeType: "capability",
            x: 0, y: 0
          } as SimNode);
        } else {
          // Tool node
          const toolNode = {
            id: d.id,
            label: d.label,
            server: d.server || "unknown",
            pagerank: d.pagerank || 0,
            degree: d.degree || 0,
            nodeType: "tool",
            parents: d.parents || [],
            x: 0, y: 0
          } as SimNode;
          nodes.push(toolNode);

          // Store ToolData for CodePanel
          toolDataRef.current.set(d.id, {
            id: d.id,
            label: d.label,
            server: d.server || "unknown",
            description: d.description,
            inputSchema: d.input_schema,
            parentCapabilities: d.parents || [],
            observedCount: d.observed_count || 0,
          });
        }
      }

      // Also handle 'capability_zones' if they contain info not in nodes (Legacy support)
      // Usually API returns capability nodes now.
      
      // 2. Parse Edges for Bundling
      // Types of edges:
      // a) "contains" edges: Parent → Child (from parents field) - works for Cap→Cap and Cap→Tool
      // b) API edges: Tool → Tool (sequence, dependency)

      const links: SimLink[] = [];

      // 2a. Generate "contains" edges from parents field (Cap→Cap and Cap→Tool)
      for (const node of data.nodes) {
        const d = node.data;
        if (d.parents && d.parents.length > 0) {
          for (const parentId of d.parents) {
            // Check if parent exists (could be capability or tool)
            const parentExists = capMap.has(parentId) ||
              data.nodes.some(n => n.data.id === parentId);

            if (parentExists) {
              links.push({
                source: parentId,
                target: d.id,
                data: {
                  id: `contains-${parentId}-${d.id}`,
                  source: parentId,
                  target: d.id,
                  confidence: 0.8,
                  observed_count: 1,
                  edge_type: "contains" as EdgeType,
                  edge_source: "observed" as EdgeSource,
                },
              });

              // If parent is a capability and child is a tool, update toolIds
              if (d.type === "tool") {
                const cap = capMap.get(parentId);
                if (cap) {
                  cap.toolIds = cap.toolIds || [];
                  cap.toolIds.push(d.id);
                }
              }
            }
          }
        }
      }

      // 2b. Add API edges (Tool → Tool: sequence, dependency)
      for (const edge of data.edges) {
        links.push({
          source: edge.data.source,
          target: edge.data.target,
          data: {
            id: edge.data.id,
            source: edge.data.source,
            target: edge.data.target,
            confidence: 0.5,
            observed_count: edge.data.observed_count || 1,
            edge_type: (edge.data.edge_type || "sequence") as EdgeType,
            edge_source: (edge.data.edge_source || "inferred") as EdgeSource,
          },
        });
      }

      // 3. Create Bounded Force Layout (nodes stay within viewport)
      const boundedLayout = new BoundedForceLayout({
        width,
        height,
        padding: 60,
        chargeStrength: -200,
        linkDistance: 180,
        boundaryStrength: 0.6,
        bipartiteMode: true,
        bipartiteStrength: 0.4,
      });

      // Convert nodes to simulation format
      // Story 8.2: Capabilities now use pagerank for sizing (min 14px, max 24px)
      const simNodes: BoundedSimNode[] = nodes.map(n => ({
        id: n.id,
        x: n.x || 0,
        y: n.y || 0,
        nodeType: n.nodeType,
        radius: n.nodeType === "capability"
          ? 10 + n.pagerank * 40 // Capabilities: 10px base + pagerank scaling (10-20px range)
          : getNodeRadius(n.pagerank),
      }));

      // Convert links to simulation format
      const simLinks: SimulationLink[] = links.map(l => ({
        source: typeof l.source === 'string' ? l.source : (l.source as SimNode).id,
        target: typeof l.target === 'string' ? l.target : (l.target as SimNode).id,
      }));

      // Create force simulation (kept alive for interactive drag)
      const simulation = boundedLayout.createSimulation(simNodes, simLinks);

      // Link simNodes to nodes for position sync
      const simNodeMap = new Map(simNodes.map(sn => [sn.id, sn]));

      // Tick handler - updates positions during simulation
      simulation.on("tick", () => {
        // Sync positions from simulation to our nodes
        nodes.forEach(n => {
          const simNode = simNodeMap.get(n.id);
          if (simNode) {
            n.x = simNode.x;
            n.y = simNode.y;
          }
        });

        // Update node positions in DOM
        const graph = (window as any).__d3Graph;
        if (graph) {
          graph.nodeLayer
            .selectAll(".node")
            .attr("transform", (d: SimNode) => `translate(${d.x},${d.y})`);

          // Interpolate bundled edges - stretch the bundle like an elastic band
          // @ts-ignore - d3 from CDN
          const d3Local = globalThis.d3;
          const lineGen = d3Local.line()
            .x((d: Point) => d.x)
            .y((d: Point) => d.y)
            .curve(d3Local.curveBasis);

          // Helper function: only update endpoints, keep middle points fixed (bundled)
          // The curveBasis interpolation smoothly connects endpoints to the bundle
          // deno-lint-ignore no-explicit-any
          const interpolatePath = (link: any) => {
            const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
            const targetId = typeof link.target === 'string' ? link.target : link.target.id;
            const srcNode = simNodeMap.get(sourceId);
            const tgtNode = simNodeMap.get(targetId);

            // Skip if path not ready yet
            if (!link.path || !link.originalPath) {
              return null;
            }

            if (srcNode && tgtNode && link.originalPath.length >= 2) {
              // Copy the original path (middle points stay bundled)
              const interpolatedPath = link.originalPath.map((p: Point) => ({ ...p }));

              // Only update first and last points to current node positions
              interpolatedPath[0] = { x: srcNode.x, y: srcNode.y };
              interpolatedPath[interpolatedPath.length - 1] = { x: tgtNode.x, y: tgtNode.y };

              return lineGen(interpolatedPath);
            }
            return null;
          };

          // Update edges with elastic interpolation
          graph.edgeLayer
            .selectAll(".edge")
            .attr("d", interpolatePath);
        }
      });

      // No rebundling on simulation end - edges stay elastically interpolated
      // The original bundle paths are preserved, only endpoints move

      // Run initial layout synchronously until stable
      simulation.stop();
      for (let i = 0; i < 300; i++) {
        simulation.tick();
        if (boundedLayout.isStabilized(0.001)) break;
      }

      // Apply initial positions
      const positionedNodes = nodes.map(n => {
        const simNode = simNodeMap.get(n.id);
        if (simNode) {
          n.x = simNode.x;
          n.y = simNode.y;
        }
        nodeMap.set(n.id, n);
        return n;
      });

      // Store references for drag interactions (simulation stopped - Holten paper approach)
      // After initial layout, node positions are FIXED - only dragged node moves
      (window as any).__d3Graph.simulation = simulation;
      (window as any).__d3Graph.simNodeMap = simNodeMap;
      (window as any).__d3Graph.positionedNodes = positionedNodes;

      // Function to compute edge bundles (called initially and after drag)
      const rebundleEdges = () => {
        // Get current node positions
        const currentPositions = new Map<string, Point>();
        positionedNodes.forEach(n => {
          currentPositions.set(n.id, { x: n.x, y: n.y });
        });

        // Bundle ALL edges together (rail-style: types shown via center line color)
        const bundlerEdgeData = links.map((link) => ({
          source: typeof link.source === 'string' ? link.source : (link.source as SimNode).id,
          target: typeof link.target === 'string' ? link.target : (link.target as SimNode).id
        }));

        // Run FDEB bundling for all edges together
        // Use default params for better bundling (6 cycles, 0.05 threshold)
        const bundler = new FDEBBundler({
          K: 0.1,
          cycles: 6,
          compatibilityThreshold: 0.05,
        });

        const bundled: BundledEdge[] = bundler
          .setNodes(currentPositions)
          .setEdges(bundlerEdgeData)
          .bundle();

        console.log(`[FDEB] Bundled ${bundled.length} edges, sample points:`,
          bundled[0]?.subdivisionPoints?.length || 0);

        // Map bundled results to all edges
        const allBundledPaths: (Point[] | null)[] = links.map((_, i) =>
          bundled[i]?.subdivisionPoints || null
        );

        // Attach bundled paths to links (store original for interpolation)
        links.forEach((link, i) => {
          const bundledPath = allBundledPaths[i];
          if (bundledPath) {
            (link as any).path = bundledPath;
            // Store original path for delta calculations during drag
            (link as any).originalPath = bundledPath.map((p: Point) => ({ ...p }));
          } else {
            const src = currentPositions.get(typeof link.source === 'string' ? link.source : (link.source as SimNode).id);
            const tgt = currentPositions.get(typeof link.target === 'string' ? link.target : (link.target as SimNode).id);
            const straightPath = src && tgt ? [{ ...src }, { ...tgt }] : [];
            (link as any).path = straightPath;
            (link as any).originalPath = straightPath.map((p: Point) => ({ ...p }));
          }
        });

        // Re-render edges with bundles (single layer)
        const graph = (window as any).__d3Graph;
        if (graph) {
          // @ts-ignore - d3 from CDN
          const d3Local = globalThis.d3;
          const lineGen = d3Local.line()
            .x((d: Point) => d.x)
            .y((d: Point) => d.y)
            .curve(d3Local.curveBasis);

          graph.edgeLayer
            .selectAll(".edge")
            .transition()
            .duration(300)
            // deno-lint-ignore no-explicit-any
            .attr("d", (link: any) => link.path ? lineGen(link.path) : null)
            .on("end", () => {
              // Reapply highlight if a node is selected
              if (graph.highlightedNodeId) {
                setTimeout(() => {
                  const highlightedId = graph.highlightedNodeId;
                  if (highlightedId) {
                    graph.edgeLayer
                      .selectAll(".edge")
                      // deno-lint-ignore no-explicit-any
                      .attr("opacity", (d: any) => {
                        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
                        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                        return (sourceId === highlightedId || targetId === highlightedId) ? 1 : 0.08;
                      })
                      // deno-lint-ignore no-explicit-any
                      .attr("stroke-width", (d: any) => {
                        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
                        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                        return (sourceId === highlightedId || targetId === highlightedId)
                          ? getEdgeWidth(d.data.confidence) * 2.5
                          : getEdgeWidth(d.data.confidence);
                      });
                  }
                }, 50);
              }
            });
        }
      };

      // Store rebundle function for later use
      (window as any).__d3Graph.rebundleEdges = rebundleEdges;

      // Light rebundling for drag interactions (fast, 2 cycles)
      const rebundleEdgesLight = () => {
        const currentPositions = new Map<string, Point>();
        positionedNodes.forEach(n => {
          currentPositions.set(n.id, { x: n.x, y: n.y });
        });

        const bundlerEdgeData = links.map((link) => ({
          source: typeof link.source === 'string' ? link.source : (link.source as SimNode).id,
          target: typeof link.target === 'string' ? link.target : (link.target as SimNode).id
        }));

        // Light config: 2 cycles, higher threshold = faster
        const bundler = new FDEBBundler({
          K: 0.1,
          cycles: 2,
          compatibilityThreshold: 0.1,
        });

        const bundled: BundledEdge[] = bundler
          .setNodes(currentPositions)
          .setEdges(bundlerEdgeData)
          .bundle();

        // Update paths WITHOUT transition (instant for responsiveness)
        links.forEach((link, i) => {
          const bundledPath = bundled[i]?.subdivisionPoints;
          if (bundledPath) {
            (link as any).path = bundledPath;
            (link as any).originalPath = bundledPath.map((p: Point) => ({ ...p }));
          }
        });

        // Instant update (no transition for responsiveness)
        // @ts-ignore - d3 from CDN
        const d3Local = globalThis.d3;
        const lineGen = d3Local.line()
          .x((d: Point) => d.x)
          .y((d: Point) => d.y)
          .curve(d3Local.curveBasis);

        graph.edgeLayer
          .selectAll(".edge")
          // deno-lint-ignore no-explicit-any
          .attr("d", (link: any) => link.path ? lineGen(link.path) : null);
      };

      (window as any).__d3Graph.rebundleEdgesLight = rebundleEdgesLight;

      // 4. Initial edge bundling
      rebundleEdges();

      nodesRef.current = positionedNodes;
      linksRef.current = links;
      capabilityDataRef.current = capMap;
      
      updateGraph();
      updateServers();

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
    const { edgeLayer, nodeLayer } = graph;

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Line generator for bundled edges
    const lineGenerator = d3.line()
      .x((d: any) => d.x)
      .y((d: any) => d.y)
      .curve(d3.curveBasis); // Smooth B-spline through control points

    // ─── Single Edge Layer (colored by type) ───
    const edgeSelection = edgeLayer.selectAll(".edge").data(links, (d: any) => d.data.id);

    edgeSelection.exit().remove();

    const edgeEnter = edgeSelection
      .enter()
      .append("path")
      .attr("class", "edge")
      .attr("fill", "none")
      .style("transition", "opacity 0.2s ease");

    const edgeMerge = edgeEnter.merge(edgeSelection);

    edgeMerge
      .attr("d", (d: any) => lineGenerator(d.path))
      .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
      .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence))
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (d: SimLink) => getEdgeStrokeDasharray(d.data.edge_source))
      .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source) * 0.9)
      .attr("marker-end", (d: SimLink) => `url(#${MARKER_ID}-${d.data.edge_type})`);

    // ─── Update Nodes (Fixed) ───
    const nodeSelection = nodeLayer.selectAll(".node").data(nodes, (d: any) => d.id);

    nodeSelection.exit().remove();

    // Drag behavior - Holten paper approach: node positions FIXED after layout
    // Continuous light rebundling during drag for natural edge adaptation
    let hasDragged = false;
    let dragThrottleTimer: number | null = null;

    // deno-lint-ignore no-explicit-any
    const drag = d3.drag()
      .on("start", function(this: SVGGElement, event: any, _d: SimNode) {
        // Prevent zoom/pan during drag
        event.sourceEvent.stopPropagation();
        hasDragged = false;
        dragThrottleTimer = null;
      })
      .on("drag", function(this: SVGGElement, event: any, d: SimNode) {
        if (!hasDragged) {
          hasDragged = true;
          d3.select(this).raise().style("cursor", "grabbing");
        }

        // Update node position (ONLY this node - Holten paper: positions fixed)
        d.x = event.x;
        d.y = event.y;

        // Sync to simNodeMap for edge interpolation
        const graph = (window as any).__d3Graph;
        if (graph?.simNodeMap) {
          const simNode = graph.simNodeMap.get(d.id);
          if (simNode) {
            simNode.x = event.x;
            simNode.y = event.y;
          }
        }

        // Update DOM position
        d3.select(this).attr("transform", `translate(${event.x},${event.y})`);

        // Immediate elastic update for responsiveness
        if (graph) {
          const lineGen = d3.line()
            .x((p: Point) => p.x)
            .y((p: Point) => p.y)
            .curve(d3.curveBasis);

          graph.edgeLayer
            .selectAll(".edge")
            // deno-lint-ignore no-explicit-any
            .attr("d", (link: any) => {
              if (!link.originalPath || link.originalPath.length < 2) return null;

              const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
              const targetId = typeof link.target === 'string' ? link.target : link.target.id;
              const srcNode = graph.simNodeMap.get(sourceId);
              const tgtNode = graph.simNodeMap.get(targetId);

              if (srcNode && tgtNode) {
                // Copy original path (middle points stay bundled)
                const interpolatedPath = link.originalPath.map((p: Point) => ({ ...p }));
                // Only update endpoints
                interpolatedPath[0] = { x: srcNode.x, y: srcNode.y };
                interpolatedPath[interpolatedPath.length - 1] = { x: tgtNode.x, y: tgtNode.y };
                return lineGen(interpolatedPath);
              }
              return null;
            });

          // Throttled light rebundling for natural bundle adaptation (every 100ms)
          if (!dragThrottleTimer) {
            dragThrottleTimer = window.setTimeout(() => {
              graph.rebundleEdgesLight?.();
              dragThrottleTimer = null;
            }, 100) as unknown as number;
          }
        }
      })
      .on("end", function(this: SVGGElement, _event: any, _d: SimNode) {
        d3.select(this).style("cursor", "grab");

        // Clear throttle timer
        if (dragThrottleTimer) {
          clearTimeout(dragThrottleTimer);
          dragThrottleTimer = null;
        }

        // Full quality rebundle after drag
        if (hasDragged) {
          const graph = (window as any).__d3Graph;
          setTimeout(() => graph?.rebundleEdges?.(), 50);
        }
        hasDragged = false;
      });

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "grab")
      .call(drag);

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

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Apply drag to all nodes (new and existing)
    nodeMerge.call(drag).style("cursor", "grab");

    // Position nodes (One-time, no tick loop)
    nodeMerge.attr("transform", (d: any) => `translate(${d.x},${d.y})`);

    // Update circles
    // Story 8.2: Capabilities sized by pagerank (10px base + scaling)
    nodeMerge
      .select("circle")
      .attr("r", (d: SimNode) => {
        if (d.nodeType === "capability") {
          return 10 + d.pagerank * 40; // 10-20px range based on pagerank
        }
        return getNodeRadius(d.pagerank);
      })
      .attr("fill", (d: SimNode) => {
        if (d.nodeType === "capability") {
          // Use fixed color or cycled color
          return "#8b5cf6"; 
        }
        return getServerColor(d.server);
      })
      .attr("opacity", (d: SimNode) => {
        if (hiddenServers.has(d.server)) return 0;
        if (!showOrphanNodes && d.degree === 0) return 0;
        return 1;
      })
      .attr("stroke", (d: SimNode) => d.nodeType === "capability" ? "#fff" : "rgba(255,255,255,0.3)");

    // Update labels
    nodeMerge
      .select(".node-label")
      .text((d: SimNode) => {
        // Show labels for everything in Bipartite
        if (d.nodeType === "capability") return truncateLabel(d.label, 20); // Longer label for caps
        return truncateLabel(d.label, getNodeRadius(d.pagerank));
      })
      .attr("dx", (d: SimNode) => d.nodeType === "capability" ? -20 : 0) // Shift cap labels left
      .attr("text-anchor", (d: SimNode) => d.nodeType === "capability" ? "end" : "middle")
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
           if (d.nodeType === "capability") {
             const capData = capabilityDataRef.current.get(d.id);
             if (capData) setCapabilityTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, data: capData });
           } else {
             setTooltip({
               x: event.clientX - rect.left,
               y: event.clientY - rect.top - 10,
               data: d,
             });
           }
         }
         // Highlight connected edges on hover
         highlightEdgesOnHover(d.id);
      })
      .on("mouseleave", () => {
        setTooltip(null);
        setCapabilityTooltip(null);
        // Clear hover highlight
        highlightEdgesOnHover(null);
      });

  }, [getServerColor, hiddenServers, showOrphanNodes]);

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleNodeClick = (node: SimNode) => {
    if (node.nodeType === "capability") {
      // Capability clicked → trigger CodePanel via onCapabilitySelect
      const capData = capabilityDataRef.current.get(node.id);
      if (capData) {
        onCapabilitySelect?.(capData);
        onToolSelect?.(null); // Clear tool selection
      }
    } else {
      // Tool clicked → trigger CodePanel via onToolSelect
      const toolData = toolDataRef.current.get(node.id);
      if (toolData) {
        onToolSelect?.(toolData);
        onCapabilitySelect?.(null); // Clear capability selection
      }
    }
    // Store highlighted node for persistence across rebundling
    const graph = (window as any).__d3Graph;
    if (graph) {
      graph.highlightedNodeId = node.id;
    }
    updateNodeHighlight(node.id);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Highlighting
  // ───────────────────────────────────────────────────────────────────────────

  const updateNodeHighlight = (nodeId: string | null) => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    // Update stored highlight state
    graph.highlightedNodeId = nodeId;

    // @ts-ignore
    const d3 = globalThis.d3;
    const { nodeLayer, edgeLayer } = graph;

    // Reset all nodes
    nodeLayer
      .selectAll(".node")
      .transition()
      .duration(200)
      .attr("opacity", 1);
    nodeLayer.selectAll(".node circle").attr("stroke", "rgba(255, 255, 255, 0.3)").attr(
      "stroke-width",
      2,
    );

    // Reset all edges to default state
    edgeLayer
      .selectAll(".edge")
      .transition()
      .duration(200)
      .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
      .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence))
      .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source) * 0.9);

    // Highlight selected
    if (nodeId) {
      // Find connected node IDs
      const connectedNodeIds = new Set<string>([nodeId]);
      linksRef.current.forEach((link: SimLink) => {
        const sourceId = typeof link.source === 'string' ? link.source : (link.source as SimNode).id;
        const targetId = typeof link.target === 'string' ? link.target : (link.target as SimNode).id;
        if (sourceId === nodeId) connectedNodeIds.add(targetId);
        if (targetId === nodeId) connectedNodeIds.add(sourceId);
      });

      // Helper to check if edge is connected
      const isConnected = (d: SimLink) => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
        return sourceId === nodeId || targetId === nodeId;
      };

      // Highlight the selected node
      nodeLayer
        .selectAll(".node")
        .filter((d: SimNode) => d.id === nodeId)
        .select("circle")
        .attr("stroke", "#f5f0ea")
        .attr("stroke-width", 4);

      // Dim non-connected nodes
      nodeLayer
        .selectAll(".node")
        .filter((d: SimNode) => !connectedNodeIds.has(d.id))
        .transition()
        .duration(200)
        .attr("opacity", 0.15);

      // Keep connected nodes fully visible
      nodeLayer
        .selectAll(".node")
        .filter((d: SimNode) => connectedNodeIds.has(d.id))
        .transition()
        .duration(200)
        .attr("opacity", 1);

      // Highlight connected edges
      edgeLayer
        .selectAll(".edge")
        .transition()
        .duration(200)
        .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
        .attr("opacity", (d: SimLink) => isConnected(d) ? 1 : 0.08)
        .attr("stroke-width", (d: SimLink) =>
          isConnected(d)
            ? getEdgeWidth(d.data.confidence) * 2.5
            : getEdgeWidth(d.data.confidence)
        );

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

  // Highlight edges on hover (lighter effect than click selection)
  const highlightEdgesOnHover = (nodeId: string | null) => {
    const graph = (window as any).__d3Graph;
    if (!graph) return;

    const { edgeLayer } = graph;

    if (nodeId) {
      // Helper to check if edge is connected
      const isConnected = (d: SimLink) => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
        return sourceId === nodeId || targetId === nodeId;
      };

      // Highlight connected edges on hover
      edgeLayer
        .selectAll(".edge")
        .transition()
        .duration(100)
        .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
        .attr("opacity", (d: SimLink) => isConnected(d) ? 0.95 : 0.15)
        .attr("stroke-width", (d: SimLink) =>
          isConnected(d)
            ? getEdgeWidth(d.data.confidence) * 2
            : getEdgeWidth(d.data.confidence)
        );
    } else {
      // Reset edges to default
      edgeLayer
        .selectAll(".edge")
        .transition()
        .duration(100)
        .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
        .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source) * 0.9)
        .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence));
    }
  };

  // Effect: Handle external node highlight
  useEffect(() => {
    if (highlightedNodeId) {
      updateNodeHighlight(highlightedNodeId);
    }
  }, [highlightedNodeId]);

  // Effect: Handle deselect when clicking on background
  useEffect(() => {
    const handleDeselect = () => {
      updateNodeHighlight(null);
    };
    window.addEventListener("graph:deselect", handleDeselect);
    return () => window.removeEventListener("graph:deselect", handleDeselect);
  }, []);

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

    // Reset all edges
    edgeLayer
      .selectAll(".edge")
      .attr("stroke", (d: SimLink) => getEdgeColor(d.data.edge_type))
      .attr("opacity", (d: SimLink) => getEdgeOpacity(d.data.edge_source) * 0.9)
      .attr("stroke-width", (d: SimLink) => getEdgeWidth(d.data.confidence));

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
          .attr("stroke-width", 3);
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
          parents: n.parents, 
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
             class="px-3 py-2 rounded-lg shadow-xl border backdrop-blur-md"
             style={{
               background: "var(--bg-elevated, #12110f)",
               borderColor: "var(--border, rgba(255, 184, 111, 0.1))",
             }}
          >
             <div class="font-bold text-sm text-white mb-1">{capabilityTooltip.data.label}</div>
             <div class="text-xs text-gray-400">
               {capabilityTooltip.data.toolsCount} tools • {Math.round(capabilityTooltip.data.successRate * 100)}% success
             </div>
          </div>
        </div>
      )}
    </>
  );
}
