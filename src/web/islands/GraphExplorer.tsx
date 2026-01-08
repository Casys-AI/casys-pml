/**
 * GraphExplorer Island - Search and explore graph with advanced features
 *
 * Story 6.4: Graph Explorer & Search Interface
 * Story 8.3: Hypergraph View Mode with capability zones
 * Enhanced: Compound nodes, expand/collapse, view modes
 * Styled with Casys.ai design system
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import { useSSE } from "../hooks/mod.ts";
import CytoscapeGraph, {
  type CapabilityData,
  type ToolData,
  type ViewMode,
} from "./CytoscapeGraph.tsx";
import type { ClusterVizConfig } from "../utils/graph/index.ts";
import CapabilityTimeline, { type TimelineCapability } from "./CapabilityTimeline.tsx";
import CodePanel from "./CodePanel.tsx";
import EmergencePanel from "./EmergencePanel.tsx";
import ExplorerSidebar, {
  type CardDensity,
  type SortBy,
  type SuccessFilter,
} from "./ExplorerSidebar.tsx";
import GraphInsightsPanel, {
  ALGORITHM_BADGES,
  type AlgorithmSection,
  type NodeType,
  PIN_COLORS,
  type PinnedSet,
  type SelectedNodeInfo,
} from "./GraphInsightsPanel.tsx";
import type { NodeMode } from "../components/ui/molecules/GraphLegendPanel.tsx";

interface ToolSearchResult {
  tool_id: string;
  name: string;
  server: string;
  description: string;
  score: number;
  pagerank: number;
}

/** Unified search result for tools and capabilities */
interface UnifiedSearchResult {
  id: string;
  name: string;
  type: "tool" | "capability";
  server?: string;
  score: number;
  extra?: string; // pagerank for tools, success rate for capabilities
}

interface RelatedTool {
  tool_id: string;
  name: string;
  server: string;
  adamic_adar_score: number;
  edge_confidence: number | null;
}

interface PathResult {
  path: string[];
  total_hops: number;
  from: string;
  to: string;
}

interface BreadcrumbItem {
  id: string;
  label: string;
  server: string;
}

interface GraphExplorerProps {
  apiBase?: string;
  apiKey?: string | null;
}

export default function GraphExplorer({ apiBase: apiBaseProp, apiKey }: GraphExplorerProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  // Helper for authenticated API calls
  const apiFetch = (url: string, options?: RequestInit) => {
    const headers: HeadersInit = { ...(options?.headers || {}) };
    if (apiKey) {
      (headers as Record<string, string>)["x-api-key"] = apiKey;
    }
    return fetch(url, { ...options, headers, credentials: "include" });
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  // Capabilities cache for search (populated by CapabilityTimeline)
  const [allCapabilities, setAllCapabilities] = useState<TimelineCapability[]>([]);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [pathNodes, setPathNodes] = useState<string[] | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [relatedTools, setRelatedTools] = useState<RelatedTool[]>([]);
  const [showRelatedSidebar, setShowRelatedSidebar] = useState(false);
  const [sidebarSelectedNode, setSidebarSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [algorithmSections, setAlgorithmSections] = useState<AlgorithmSection[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [previewSectionId, setPreviewSectionId] = useState<string | null>(null);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  // Pinned sets for accumulating algorithm results
  const [pinnedSets, setPinnedSets] = useState<PinnedSet[]>([]);
  // Cluster visualization for algorithm badge hover
  const [clusterViz, setClusterViz] = useState<ClusterVizConfig | null>(null);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [pathFrom, setPathFrom] = useState("");
  const [pathTo, setPathTo] = useState("");
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  // Story 8.4: Selected capability for CodePanel
  const [selectedCapability, setSelectedCapability] = useState<CapabilityData | null>(null);
  // Selected tool for CodePanel (tool info display)
  const [selectedTool, setSelectedTool] = useState<ToolData | null>(null);

  // New: View mode and expand/collapse state
  const [viewMode, setViewMode] = useState<ViewMode>("capabilities");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [highlightDepth, setHighlightDepth] = useState(1);
  // nodeMode is always "definition" - graph shows structure, not invocations
  const nodeMode: NodeMode = "definition";

  // Server filtering state (for ExplorerSidebar)
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());

  // Sort and filter state for capabilities mode
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>("all");
  const [density, setDensity] = useState<CardDensity>("normal");

  // SSE refresh trigger for incremental graph updates
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  // Server color mapping
  const serverColorsRef = useRef<Map<string, string>>(new Map());
  const SERVER_COLORS = [
    "#FFB86F",
    "#FF6B6B",
    "#4ECDC4",
    "#FFE66D",
    "#95E1D3",
    "#F38181",
    "#AA96DA",
    "#FCBAD3",
  ];

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % SERVER_COLORS.length;
      serverColorsRef.current.set(server, SERVER_COLORS[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  // Servers discovered via graph callbacks
  const handleServersDiscovered = useCallback((serverSet: Set<string>) => {
    setServers(serverSet);
  }, []);

  // Debounced refresh handler for SSE events
  const handleCapabilityEvent = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      console.log("[GraphExplorer] SSE capability event, refreshing graph...");
      setGraphRefreshKey((prev) => prev + 1);
    }, 150) as unknown as number;
  }, []);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // SSE for real-time graph updates with robust reconnection
  useSSE({
    url: `${apiBase}/events/stream?filter=capability.*`,
    events: {
      "capability.zone.created": handleCapabilityEvent,
      "capability.zone.updated": handleCapabilityEvent,
      "capability.learned": handleCapabilityEvent,
    },
    onOpen: () => {
      console.log("[GraphExplorer] SSE connected");
    },
    onReconnected: () => {
      // After reconnection, refresh graph data to catch missed events
      console.log("[GraphExplorer] SSE reconnected - refreshing graph");
      setGraphRefreshKey((prev) => prev + 1);
    },
  });

  // Handle toggling a pin on a specific badge (algo + node)
  // Collects ALL nodeIds that have this algorithm, not just the clicked one
  const handleTogglePin = useCallback((algoId: string, nodeId: string, nodeName: string) => {
    const pinId = `${algoId}-${nodeId}`;

    setPinnedSets((prev) => {
      // Check if already pinned
      const existingIndex = prev.findIndex((p) => p.id === pinId);
      if (existingIndex >= 0) {
        // Unpin - remove it
        return prev.filter((_, i) => i !== existingIndex);
      }

      // Collect ALL nodeIds that have this algorithm from the unified section
      const unifiedSection = algorithmSections.find((s) => s.id === "unified-insights");
      const allNodeIds = unifiedSection?.items
        .filter((item) => item.algorithms && item.algorithms[algoId])
        .map((item) => item.id) || [nodeId];

      // Pin - add it with algo color and ALL matching nodeIds
      const badge = ALGORITHM_BADGES[algoId];
      const newPin: PinnedSet = {
        id: pinId,
        sourceNodeName: nodeName,
        algorithm: badge?.label || algoId,
        color: badge?.color || PIN_COLORS[prev.length % PIN_COLORS.length],
        nodeIds: allNodeIds.length > 0 ? allNodeIds : [nodeId],
      };
      return [...prev, newPin];
    });
  }, [algorithmSections]);

  // Clear all pinned sets
  const handleClearPins = useCallback(() => {
    setPinnedSets([]);
  }, []);

  // Toggle server visibility
  const handleToggleServer = useCallback((server: string) => {
    setHiddenServers((prev) => {
      const next = new Set(prev);
      if (next.has(server)) {
        next.delete(server);
      } else {
        next.add(server);
      }
      return next;
    });
  }, []);

  // Export handlers (placeholder)
  const handleExportJson = useCallback(() => {
    console.log("Export JSON not yet implemented");
  }, []);

  const handleExportPng = useCallback(() => {
    console.log("Export PNG not yet implemented");
  }, []);

  // Find header slot for portal (with retry for async island loading)
  useEffect(() => {
    const findSlot = () => {
      const slot = document.getElementById("header-search-slot");
      if (slot) {
        console.log("[Search] Header slot found, enabling portal");
        setHeaderSlot(slot);
        return true;
      }
      return false;
    };

    // Try immediately
    if (findSlot()) return;

    // Retry a few times if not found (island async loading)
    console.log("[Search] Header slot not found, retrying...");
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
      attempts++;
      if (findSlot() || attempts >= maxAttempts) {
        clearInterval(interval);
        if (attempts >= maxAttempts) {
          console.warn("[Search] Header slot not found after max attempts");
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.key === "k") ||
        (e.key === "/" && !e.ctrlKey && document.activeElement?.tagName !== "INPUT")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchQuery("");
        setShowResults(false);
        setHighlightedNode(null);
        setPathNodes(null);
        searchInputRef.current?.blur();
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        setShowPathFinder(!showPathFinder);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showPathFinder]);

  // Fuzzy match: all query words must appear in target (with typo tolerance)
  const fuzzyMatch = useCallback(
    (target: string, query: string): { matches: boolean; score: number } => {
      const targetLower = target.toLowerCase().replace(/[_-]/g, " ");
      const queryLower = query.toLowerCase().replace(/[_-]/g, " ");

      // Exact match = highest score
      if (targetLower === queryLower) return { matches: true, score: 1.0 };

      // Contains exact query = high score
      if (targetLower.includes(queryLower)) return { matches: true, score: 0.9 };

      // Split into words
      const targetWords = targetLower.split(/\s+/);
      const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

      if (queryWords.length === 0) return { matches: false, score: 0 };

      // Check each query word: must be found OR be a prefix OR be 1-2 chars off
      const wordMatches: number[] = queryWords.map((qWord) => {
        // Exact contains
        if (targetLower.includes(qWord)) return 0.9;

        // Prefix match (query word starts a target word)
        for (const tWord of targetWords) {
          if (tWord.startsWith(qWord) || qWord.startsWith(tWord)) return 0.7;

          // Typo tolerance: if words are similar length and differ by 1-2 chars
          if (Math.abs(tWord.length - qWord.length) <= 2 && qWord.length >= 4) {
            let diffs = 0;
            const minLen = Math.min(tWord.length, qWord.length);
            for (let i = 0; i < minLen; i++) {
              if (tWord[i] !== qWord[i]) diffs++;
              if (diffs > 2) break;
            }
            diffs += Math.abs(tWord.length - qWord.length);
            if (diffs <= 2) return 0.5;
          }
        }
        return 0;
      });

      // All query words must have some match
      if (wordMatches.every((score) => score > 0)) {
        const avgScore = wordMatches.reduce((a, b) => a + b, 0) / wordMatches.length;
        return { matches: true, score: avgScore };
      }

      return { matches: false, score: 0 };
    },
    [],
  );

  // Debounced search - capabilities only in capabilities mode (no orphan tools)
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const results: UnifiedSearchResult[] = [];

      // Search capabilities (local, instant)
      // Matches: name, description, tool names, tool servers, FQDN
      const capMatches = allCapabilities
        .map((cap) => {
          // Check all searchable fields with fuzzy matching
          const nameMatch = fuzzyMatch(cap.name, searchQuery);
          const descMatch = cap.description
            ? fuzzyMatch(cap.description, searchQuery)
            : { matches: false, score: 0 };
          const fqdnMatch = cap.fqdn
            ? fuzzyMatch(cap.fqdn, searchQuery)
            : { matches: false, score: 0 };

          // Check tools
          let toolMatch = { matches: false, score: 0 };
          for (const t of cap.tools) {
            const tm = fuzzyMatch(t.name, searchQuery);
            if (tm.matches && tm.score > toolMatch.score) toolMatch = tm;
            const sm = fuzzyMatch(t.server, searchQuery);
            if (sm.matches && sm.score > toolMatch.score) toolMatch = sm;
          }

          // Best match score
          const bestScore = Math.max(
            nameMatch.score,
            descMatch.score,
            fqdnMatch.score,
            toolMatch.score,
          );
          const matches = nameMatch.matches || descMatch.matches || fqdnMatch.matches ||
            toolMatch.matches;

          return { cap, matches, score: bestScore };
        })
        .filter(({ matches }) => matches)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ cap, score }) => ({
          id: cap.id,
          name: cap.name,
          type: "capability" as const,
          score,
          extra: `${Math.round(cap.successRate * 100)}% • ${cap.tools.length} tools`,
        }));
      results.push(...capMatches);

      // In capabilities mode, only show capabilities (no orphan tools from API)
      // In graph/tools mode, also search tools API
      if (viewMode !== "capabilities") {
        try {
          const url = `${apiBase}/api/tools/search?q=${encodeURIComponent(searchQuery)}&limit=8`;
          const response = await apiFetch(url);
          if (response.ok) {
            const data = await response.json();
            const toolResults = (data.results || []).map((t: ToolSearchResult) => ({
              id: t.tool_id,
              name: t.name,
              type: "tool" as const,
              server: t.server,
              score: t.score,
              extra: `PR: ${t.pagerank.toFixed(3)}`,
            }));
            results.push(...toolResults);
          }
        } catch (error) {
          console.error("[Search] Tools API failed:", error);
        }
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);
      setSearchResults(results.slice(0, 10));
      setShowResults(true);
    }, 150) as unknown as number;

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, allCapabilities, apiBase, viewMode, fuzzyMatch]);

  // Story 8.4: Handle capability selection from hull click
  const handleCapabilitySelect = (capability: CapabilityData | null) => {
    setSelectedCapability(capability);
    if (capability) setSelectedTool(null); // Clear tool when capability selected
  };

  // Handle tool selection from node click
  // In graph mode, we show the Related Tools sidebar instead of CodePanel
  const handleToolSelect = (tool: ToolData | null) => {
    if (viewMode === "graph") {
      // In graph mode, don't show CodePanel for tools
      return;
    }
    setSelectedTool(tool);
    if (tool) setSelectedCapability(null); // Clear capability when tool selected
  };

  const handleNodeSelect = async (
    node: { id: string; label: string; server: string; pagerank?: number; type?: NodeType } | null,
  ) => {
    if (!node) {
      setRelatedTools([]);
      setShowRelatedSidebar(false);
      setSidebarSelectedNode(null);
      setAlgorithmSections([]);
      setHighlightedNode(null);
      return;
    }

    // Persist the selection (lock it until click elsewhere)
    setHighlightedNode(node.id);

    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === node.id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: node.id, label: node.label, server: node.server }];
    });

    // Determine node type from id pattern or explicit type
    const nodeType: NodeType = node.type ?? (
      node.id.startsWith("meta:")
        ? "meta-capability"
        : node.id.startsWith("cap:")
        ? "capability"
        : "tool"
    );

    // In graph mode, open the sidebar for any node type
    if (viewMode === "graph") {
      setSidebarSelectedNode({
        id: node.id,
        name: node.label,
        type: nodeType,
        server: node.server,
        pagerank: node.pagerank,
      });
      setShowRelatedSidebar(true);
      setIsLoadingRelated(true);

      // Initialize with loading section
      setAlgorithmSections([
        {
          id: "unified-insights",
          name: "Related",
          description: "Loading insights...",
          tab: "behavior",
          items: [],
          isLoading: true,
        },
      ]);
    }

    try {
      // Fetch unified insights from single endpoint
      const response = await apiFetch(
        `${apiBase}/api/graph/insights?node_id=${encodeURIComponent(node.id)}&limit=15`,
      );
      const insightsData = await response.json();

      // Map API response to RelatedItem format with algorithm badges
      const unifiedItems = (insightsData.items || []).map((item: {
        id: string;
        name: string;
        type: "tool" | "capability";
        server?: string;
        algorithms: Record<
          string,
          { score: number; rank?: number; metadata?: Record<string, unknown> }
        >;
        combinedScore: number;
      }) => ({
        id: item.id,
        name: item.name,
        type: item.type as NodeType,
        server: item.server,
        score: item.combinedScore,
        algorithms: item.algorithms,
        combinedScore: item.combinedScore,
      }));

      // Single unified section with all items (badges show which algos found each)
      const sections: AlgorithmSection[] = [{
        id: "unified-insights",
        name: "Related",
        description: `${unifiedItems.length} items`,
        tab: "behavior", // Legacy, not used anymore
        items: unifiedItems,
        isLoading: false,
      }];

      // Also keep relatedTools for backward compatibility
      const allItems = (insightsData.items || []).map((item: {
        id: string;
        name: string;
        server?: string;
        combinedScore: number;
      }) => ({
        tool_id: item.id,
        name: item.name,
        server: item.server || "unknown",
        adamic_adar_score: item.combinedScore,
      }));
      setRelatedTools(allItems.slice(0, 10));

      setAlgorithmSections(sections);
    } catch (error) {
      console.error("Failed to fetch graph insights:", error);
      setRelatedTools([]);
      setAlgorithmSections([
        { id: "unified-insights", name: "Related", tab: "behavior", items: [], isLoading: false },
      ]);
    } finally {
      setIsLoadingRelated(false);
    }
  };

  const selectSearchResult = async (result: UnifiedSearchResult) => {
    setShowResults(false);

    // In capabilities mode: set search to exact name to filter to just that capability
    if (viewMode === "capabilities" && result.type === "capability") {
      setSearchQuery(result.name);
      // Find the capability and trigger selection for CodePanel
      const cap = allCapabilities.find((c) => c.id === result.id);
      if (cap) {
        setSelectedCapability({
          id: cap.id,
          label: cap.name,
          successRate: cap.successRate,
          usageCount: cap.usageCount,
          toolsCount: cap.tools.length,
          toolIds: cap.tools.map((t) => t.id),
          traces: cap.traces ?? [],
          codeSnippet: cap.codeSnippet,
        });
      }
      return;
    }

    // Other modes: clear search and navigate
    setSearchQuery("");

    // If it's a capability, highlight it directly
    if (result.type === "capability") {
      setHighlightedNode(result.id);
      setBreadcrumbs((prev) => {
        const existing = prev.findIndex((b) => b.id === result.id);
        if (existing >= 0) return prev.slice(0, existing + 1);
        return [...prev, { id: result.id, label: result.name, server: "capability" }];
      });
      return;
    }

    // It's a tool - in graph/tools mode
    setHighlightedNode(result.id);
    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === result.id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: result.id, label: result.name, server: result.server || "unknown" }];
    });
  };

  const findPath = async () => {
    if (!pathFrom || !pathTo) return;

    try {
      const response = await apiFetch(
        `${apiBase}/api/graph/path?from=${encodeURIComponent(pathFrom)}&to=${
          encodeURIComponent(pathTo)
        }`,
      );
      const data: PathResult = await response.json();

      if (data.path && data.path.length > 0) {
        setPathNodes(data.path);
        setHighlightedNode(null);
      } else {
        alert("No path found between these tools");
      }
    } catch (error) {
      console.error("Path finding failed:", error);
    }
  };

  const navigateBreadcrumb = (item: BreadcrumbItem, index: number) => {
    setHighlightedNode(item.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setPathNodes(null);
  };

  const clearPath = () => {
    setPathNodes(null);
    setPathFrom("");
    setPathTo("");
  };

  // Casys design tokens
  const styles = {
    panel: {
      background: "var(--bg-elevated, #12110f)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      backdropFilter: "blur(12px)",
    },
    input: {
      background: "var(--bg-surface, #1a1816)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text, #f5f0ea)",
    },
    inputFocus: {
      borderColor: "var(--accent, #FFB86F)",
      boxShadow: "0 0 0 2px var(--accent-dim, rgba(255, 184, 111, 0.1))",
    },
    button: {
      background: "var(--bg-surface, #1a1816)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text-muted, #d5c3b5)",
    },
    buttonActive: {
      background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
      borderColor: "var(--accent, #FFB86F)",
      color: "var(--accent, #FFB86F)",
    },
    buttonPrimary: {
      background: "var(--accent, #FFB86F)",
      color: "var(--bg, #0a0908)",
    },
    kbd: {
      background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text-dim, #8a8078)",
    },
  };

  // SearchBar component to portal into header
  const searchBarContent = (
    <div class="flex gap-3 items-center">
      <div class="relative">
        <input
          ref={searchInputRef}
          type="text"
          class="w-[420px] py-2.5 px-4 pr-[60px] rounded-xl text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50"
          style={{
            ...styles.input,
            fontFamily: "var(--font-sans)",
          }}
          placeholder="Search capabilities & tools... (/ or Ctrl+K)"
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          onFocus={(e) => {
            console.log(`[Search] Input focus - query length: ${searchQuery.length}`);
            if (searchQuery.length >= 2) {
              console.log("[Search] Re-showing results on focus");
              setShowResults(true);
            }
            Object.assign(e.currentTarget.style, styles.inputFocus);
          }}
          onBlur={(e) => {
            console.log("[Search] Input blur - closing dropdown in 200ms");
            setTimeout(() => {
              console.log("[Search] Closing dropdown now");
              setShowResults(false);
            }, 200);
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {/* Clear button or keyboard shortcut hint */}
        <span class="absolute right-3 top-1/2 -translate-y-1/2">
          {searchQuery
            ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCapability(null);
                  searchInputRef.current?.focus();
                }}
                class="p-1 rounded-md transition-colors hover:bg-white/10"
                style={{ color: "var(--text-dim, #8a8078)" }}
                title="Effacer la recherche (Esc)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )
            : <kbd class="px-2 py-0.5 rounded-md text-xs font-medium" style={styles.kbd}>/</kbd>}
        </span>

        {/* Autocomplete Results - dropdown below search */}
        {showResults && searchResults.length > 0 && (
          <div
            class="absolute top-full left-0 mt-2 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto shadow-2xl"
            style={{ ...styles.panel, zIndex: 9999, width: "420px" }}
          >
            {searchResults.map((result) => (
              <div
                key={result.id}
                class="px-4 py-3 cursor-pointer flex justify-between items-center transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
                onClick={() => selectSearchResult(result)}
                onMouseOver={(e) => e.currentTarget.style.background = "var(--accent-dim)"}
                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div class="flex gap-3 items-center">
                  {/* Type badge */}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase"
                    style={{
                      background: result.type === "capability"
                        ? "var(--accent-dim)"
                        : "var(--bg-surface)",
                      color: result.type === "capability" ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    {result.type === "capability" ? "cap" : "tool"}
                  </span>
                  <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.875rem" }}>
                    {result.name}
                  </span>
                  {result.server && result.type === "tool" && (
                    <span
                      class="text-xs px-2 py-1 rounded-md font-medium"
                      style={{ background: "var(--bg-surface)", color: "var(--text-dim)" }}
                    >
                      {result.server}
                    </span>
                  )}
                </div>
                <div class="flex gap-3 text-xs">
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    {(result.score * 100).toFixed(0)}%
                  </span>
                  {result.extra && (
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {result.extra}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Path Finder Toggle */}
      <button
        type="button"
        class="py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200"
        style={showPathFinder ? styles.buttonActive : styles.button}
        onClick={() => setShowPathFinder(!showPathFinder)}
        title="Find Path (Ctrl+P)"
        onMouseOver={(e) =>
          !showPathFinder && (e.currentTarget.style.borderColor = "var(--accent-medium)")}
        onMouseOut={(e) => !showPathFinder && (e.currentTarget.style.borderColor = "var(--border)")}
      >
        Path
      </button>
    </div>
  );

  return (
    <div
      class="w-full h-full relative overflow-hidden"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {/* SearchBar rendered in header via portal */}
      {headerSlot && createPortal(searchBarContent, headerSlot)}

      {/* Path Finder Panel */}
      {showPathFinder && (
        <div
          class="absolute top-20 left-1/2 -translate-x-1/2 z-[90] p-4 px-5 rounded-xl shadow-2xl mt-2"
          style={styles.panel}
        >
          <div class="flex gap-3 items-center">
            <input
              type="text"
              class="w-[200px] py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all"
              style={styles.input}
              placeholder="From tool..."
              value={pathFrom}
              onInput={(e) => setPathFrom((e.target as HTMLInputElement).value)}
              onFocus={(e) => Object.assign(e.currentTarget.style, styles.inputFocus)}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <span style={{ color: "var(--accent)", fontSize: "1.25rem" }}>→</span>
            <input
              type="text"
              class="w-[200px] py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all"
              style={styles.input}
              placeholder="To tool..."
              value={pathTo}
              onInput={(e) => setPathTo((e.target as HTMLInputElement).value)}
              onFocus={(e) => Object.assign(e.currentTarget.style, styles.inputFocus)}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="button"
              onClick={findPath}
              class="py-3 px-5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:brightness-110"
              style={styles.buttonPrimary}
            >
              Find Path
            </button>
            {pathNodes && (
              <button
                type="button"
                onClick={clearPath}
                class="py-3 px-4 rounded-lg text-sm font-medium cursor-pointer transition-all"
                style={{
                  background: "rgba(248, 113, 113, 0.1)",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                  color: "var(--error)",
                }}
              >
                Clear
              </button>
            )}
          </div>
          {pathNodes && pathNodes.length > 0 && (
            <div class="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--success)", fontSize: "0.875rem", fontWeight: 600 }}>
                Path ({pathNodes.length - 1} hops):
              </span>
              <div class="mt-2.5 flex flex-wrap gap-1.5 items-center">
                {pathNodes.map((nodeId, i) => (
                  <span key={nodeId}>
                    {i > 0 && (
                      <span
                        style={{ color: "var(--accent)", margin: "0 0.25rem", fontWeight: 600 }}
                      >
                        →
                      </span>
                    )}
                    <span
                      class="cursor-pointer px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        color: "var(--accent)",
                        background: "var(--accent-dim)",
                        border: "1px solid var(--accent-medium)",
                      }}
                      onClick={() => setHighlightedNode(nodeId)}
                      onMouseOver={(e) =>
                        e.currentTarget.style.background = "var(--accent-medium)"}
                      onMouseOut={(e) =>
                        e.currentTarget.style.background = "var(--accent-dim)"}
                    >
                      {nodeId.split(":")[1] || nodeId}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Breadcrumbs - positioned to avoid legend panel */}
      {breadcrumbs.length > 0 && (
        <div
          class="absolute top-5 left-[240px] z-[80] py-2.5 px-4 rounded-xl flex items-center gap-2.5 text-sm"
          style={styles.panel}
        >
          <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>History:</span>
          {breadcrumbs.map((item, index) => (
            <span key={item.id}>
              {index > 0 && <span style={{ color: "var(--text-dim)", opacity: 0.5 }}>/</span>}
              <span
                class="cursor-pointer px-2.5 py-1 rounded-md font-medium transition-all"
                style={{
                  color: index === breadcrumbs.length - 1 ? "var(--accent)" : "var(--text-muted)",
                  background: index === breadcrumbs.length - 1
                    ? "var(--accent-dim)"
                    : "transparent",
                }}
                onClick={() => navigateBreadcrumb(item, index)}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--accent-dim)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = index === breadcrumbs.length - 1
                    ? "var(--accent-dim)"
                    : "transparent";
                  e.currentTarget.style.color = index === breadcrumbs.length - 1
                    ? "var(--accent)"
                    : "var(--text-muted)";
                }}
              >
                {item.label}
              </span>
            </span>
          ))}
          <button
            type="button"
            class="border-none cursor-pointer ml-2 px-2 py-1 rounded transition-all"
            style={{ background: "transparent", color: "var(--text-dim)" }}
            onClick={() => setBreadcrumbs([])}
            title="Clear history"
            onMouseOver={(e) => {
              e.currentTarget.style.color = "var(--error)";
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Graph Insights Panel (graph mode only) */}
      <GraphInsightsPanel
        isOpen={showRelatedSidebar && viewMode === "graph"}
        onClose={() => {
          setShowRelatedSidebar(false);
          setSidebarSelectedNode(null);
          setAlgorithmSections([]);
        }}
        selectedNode={sidebarSelectedNode}
        algorithms={algorithmSections}
        isLoading={isLoadingRelated}
        getServerColor={getServerColor}
        onItemSelect={(itemId, itemType) => {
          setHighlightedNode(itemId);
          setHoveredNodeId(null); // Clear hover on click
          // Fetch related for the new node
          const tool = relatedTools.find((t) => t.tool_id === itemId);
          if (tool) {
            handleNodeSelect({
              id: itemId,
              label: tool.name,
              server: tool.server,
              type: itemType,
            });
          } else {
            // For capabilities/meta-caps, just navigate
            handleNodeSelect({
              id: itemId,
              label: itemId.split(":")[1] || itemId,
              server: "unknown",
              type: itemType,
            });
          }
        }}
        onItemHover={(nodeId, algoId) => {
          setHoveredNodeId(nodeId);
          setPreviewSectionId(algoId ?? null); // algoId used for preview color

          // Create cluster visualization when hovering on an algorithm badge
          if (nodeId && algoId) {
            // Find all items that have this algorithm in their badges
            const unifiedSection = algorithmSections.find((s) => s.id === "unified-insights");
            if (unifiedSection && unifiedSection.items.length > 0) {
              // Get all node IDs that have this algo
              const nodeIds = unifiedSection.items
                .filter((item) => item.algorithms && item.algorithms[algoId])
                .map((item) => item.id);

              if (nodeIds.length > 0) {
                // Get algorithm badge config for color and viz type
                const badge = ALGORITHM_BADGES[algoId];
                const color = badge?.color || "#FFB86F";

                // Visualization type based on algorithm
                let vizType: ClusterVizConfig["type"] = "hull";
                let animated = false;

                switch (algoId) {
                  case "louvain":
                  case "spectral":
                  case "hyperedge":
                    vizType = "hull";
                    break;
                  case "neighbors":
                  case "adamic_adar":
                    vizType = "nodes-edges"; // Highlight nodes + edges in Cytoscape
                    break;
                  case "co_occurrence":
                    vizType = "animated-path";
                    animated = true;
                    break;
                  case "shgat":
                    vizType = "edges";
                    break;
                  default:
                    vizType = "hull";
                }

                setClusterViz({
                  type: vizType,
                  color,
                  nodeIds,
                  animated,
                });
              }
            }
          } else {
            // Clear cluster viz when not hovering
            setClusterViz(null);
          }
        }}
        pinnedSets={pinnedSets}
        onTogglePin={handleTogglePin}
        onClearPins={handleClearPins}
      />

      {/* Main content area: Sidebar + Graph/Timeline */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ExplorerSidebar - collapsible and resizable */}
        <ExplorerSidebar
          servers={servers}
          hiddenServers={hiddenServers}
          getServerColor={getServerColor}
          onToggleServer={handleToggleServer}
          onExportJson={handleExportJson}
          onExportPng={handleExportPng}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          onSortChange={setSortBy}
          successFilter={successFilter}
          onSuccessFilterChange={setSuccessFilter}
          density={density}
          onDensityChange={setDensity}
          highlightDepth={highlightDepth}
          onDepthChange={setHighlightDepth}
        />

        {/* Graph Visualization - view mode dependent */}
        <div ref={graphRef} style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {viewMode === "capabilities" && (
            /* Timeline view for capabilities (scrollable HTML) */
            <CapabilityTimeline
              apiBase={apiBase}
              apiKey={apiKey}
              onCapabilitySelect={(cap) => {
                if (cap) {
                  // Convert TimelineCapability to CapabilityData format
                  setSelectedCapability({
                    id: cap.id,
                    label: cap.name,
                    successRate: cap.successRate,
                    usageCount: cap.usageCount,
                    toolsCount: cap.tools.length,
                    toolIds: cap.tools.map((t) => t.id),
                    traces: cap.traces ?? [], // Pass traces for CodePanel
                    codeSnippet: cap.codeSnippet, // Pass code snippet for CodePanel
                  });
                } else {
                  setSelectedCapability(null);
                }
              }}
              onToolSelect={(toolId) => {
                if (toolId) {
                  setHighlightedNode(toolId);
                }
              }}
              refreshKey={graphRefreshKey}
              onServersDiscovered={handleServersDiscovered}
              onCapabilitiesLoaded={setAllCapabilities}
              density={density}
              searchQuery={searchQuery}
            />
          )}
          {viewMode === "emergence" && (
            /* EmergencePanel for CAS metrics dashboard */
            <EmergencePanel apiBase={apiBase} apiKey={apiKey} />
          )}
          {viewMode === "graph" && (
            /* Cytoscape graph for graph mode */
            <CytoscapeGraph
              apiBase={apiBase}
              apiKey={apiKey}
              onNodeSelect={handleNodeSelect}
              onCapabilitySelect={handleCapabilitySelect}
              onToolSelect={handleToolSelect}
              highlightedNodeId={highlightedNode}
              previewNodeId={hoveredNodeId}
              previewSectionId={previewSectionId}
              pathNodes={pathNodes}
              highlightDepth={highlightDepth}
              viewMode={viewMode}
              expandedNodes={expandedNodes}
              onExpandedNodesChange={setExpandedNodes}
              nodeMode={nodeMode}
              refreshKey={graphRefreshKey}
              onServersDiscovered={handleServersDiscovered}
              pinnedSets={pinnedSets}
              clusterViz={clusterViz}
              hasBreadcrumbs={breadcrumbs.length > 0}
            />
          )}
        </div>
      </div>

      {/* Story 8.4: Code Panel (bottom panel when capability or tool selected) */}
      {(selectedCapability || selectedTool) && (
        <CodePanel
          capability={selectedCapability}
          tool={selectedTool}
          onClose={() => {
            setSelectedCapability(null);
            setSelectedTool(null);
          }}
          onToolClick={(toolId) => {
            setHighlightedNode(toolId);
          }}
        />
      )}
    </div>
  );
}
