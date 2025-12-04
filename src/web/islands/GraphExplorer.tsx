/**
 * GraphExplorer Island - Search and explore graph with advanced features
 *
 * Story 6.4: Graph Explorer & Search Interface
 */

import { useState, useEffect, useRef } from "preact/hooks";
import GraphVisualization from "./GraphVisualization.tsx";

interface ToolSearchResult {
  tool_id: string;
  name: string;
  server: string;
  description: string;
  score: number;
  pagerank: number;
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

export default function GraphExplorer() {
  const apiBase = "http://localhost:3001";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ToolSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [pathNodes, setPathNodes] = useState<string[] | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [relatedTools, setRelatedTools] = useState<RelatedTool[]>([]);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [pathFrom, setPathFrom] = useState("");
  const [pathTo, setPathTo] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "k") || (e.key === "/" && !e.ctrlKey && document.activeElement?.tagName !== "INPUT")) {
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

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`${apiBase}/api/tools/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        const data = await response.json();
        setSearchResults(data.results || []);
        setShowResults(true);
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]);
      }
    }, 200) as unknown as number;

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleNodeSelect = async (node: { id: string; label: string; server: string } | null) => {
    if (!node) {
      setRelatedTools([]);
      return;
    }

    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === node.id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: node.id, label: node.label, server: node.server }];
    });

    try {
      const response = await fetch(`${apiBase}/api/graph/related?tool_id=${encodeURIComponent(node.id)}&limit=5`);
      const data = await response.json();
      setRelatedTools(data.related || []);
    } catch (error) {
      console.error("Failed to fetch related tools:", error);
      setRelatedTools([]);
    }
  };

  const selectSearchResult = (result: ToolSearchResult) => {
    setHighlightedNode(result.tool_id);
    setShowResults(false);
    setSearchQuery("");

    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === result.tool_id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: result.tool_id, label: result.name, server: result.server }];
    });
  };

  const findPath = async () => {
    if (!pathFrom || !pathTo) return;

    try {
      const response = await fetch(`${apiBase}/api/graph/path?from=${encodeURIComponent(pathFrom)}&to=${encodeURIComponent(pathTo)}`);
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

  return (
    <div class="w-full h-full relative overflow-hidden">
      {/* Search Bar */}
      <div class="absolute top-5 left-1/2 -translate-x-1/2 z-[100] flex gap-3 items-center">
        <div class="relative">
          <input
            ref={searchInputRef}
            type="text"
            class="w-[420px] py-3.5 px-5 pr-[70px] bg-slate-900/80 border border-slate-700/30 rounded-2xl text-slate-100 text-[15px] font-medium outline-none backdrop-blur-xl shadow-lg transition-all duration-300 placeholder:text-slate-600 focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.4),0_8px_32px_rgba(0,0,0,0.4)]"
            placeholder="Search tools... (/ or Ctrl+K)"
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
          <span class="absolute right-4 top-1/2 -translate-y-1/2">
            <kbd class="bg-gradient-to-br from-blue-500/10 to-purple-500/10 px-2.5 py-1 rounded-md text-xs text-slate-500 font-semibold border border-blue-500/20">
              /
            </kbd>
          </span>
        </div>

        {/* Autocomplete Results */}
        {showResults && searchResults.length > 0 && (
          <div class="absolute top-full left-0 right-auto w-[420px] mt-2 bg-slate-900/80 border border-slate-700/30 rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto backdrop-blur-xl shadow-2xl animate-fade-slide">
            {searchResults.map((result) => (
              <div
                key={result.tool_id}
                class="px-5 py-3.5 cursor-pointer border-b border-slate-700/10 flex justify-between items-center transition-colors hover:bg-blue-500/10"
                onClick={() => selectSearchResult(result)}
              >
                <div class="flex gap-3.5 items-center">
                  <span class="text-slate-100 font-semibold text-sm">{result.name}</span>
                  <span class="text-slate-500 text-xs bg-slate-800/80 px-2 py-1 rounded-md font-medium">
                    {result.server}
                  </span>
                </div>
                <div class="flex gap-4 text-xs">
                  <span class="text-emerald-400 font-semibold">{(result.score * 100).toFixed(0)}%</span>
                  <span class="text-purple-400 font-semibold">PR: {result.pagerank.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Path Finder Toggle */}
        <button
          class={`py-3.5 px-5 bg-slate-900/80 border border-slate-700/30 rounded-xl text-slate-500 cursor-pointer text-sm font-semibold transition-all duration-200 backdrop-blur-xl hover:bg-blue-500/10 hover:border-blue-500 hover:text-slate-100 hover:shadow-glow-blue ${showPathFinder ? "bg-blue-500/10 border-blue-500 text-slate-100 shadow-glow-blue" : ""}`}
          onClick={() => setShowPathFinder(!showPathFinder)}
          title="Find Path (Ctrl+P)"
        >
          Path
        </button>
      </div>

      {/* Path Finder Panel */}
      {showPathFinder && (
        <div class="absolute top-20 left-1/2 -translate-x-1/2 z-[90] bg-slate-900/80 border border-slate-700/30 rounded-2xl p-4 px-5 backdrop-blur-xl shadow-2xl">
          <div class="flex gap-3 items-center">
            <input
              type="text"
              class="w-[200px] py-3 px-4 bg-slate-900/60 border border-slate-700/30 rounded-xl text-slate-100 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.4)]"
              placeholder="From tool..."
              value={pathFrom}
              onInput={(e) => setPathFrom((e.target as HTMLInputElement).value)}
            />
            <span class="text-cyan-400 text-xl">→</span>
            <input
              type="text"
              class="w-[200px] py-3 px-4 bg-slate-900/60 border border-slate-700/30 rounded-xl text-slate-100 text-sm font-medium outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.4)]"
              placeholder="To tool..."
              value={pathTo}
              onInput={(e) => setPathTo((e.target as HTMLInputElement).value)}
            />
            <button
              onClick={findPath}
              class="py-3 px-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl text-white text-sm font-semibold cursor-pointer transition-all duration-200 shadow-glow-blue hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)]"
            >
              Find Path
            </button>
            {pathNodes && (
              <button
                onClick={clearPath}
                class="py-3 px-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium cursor-pointer transition-all hover:bg-red-500/20"
              >
                Clear
              </button>
            )}
          </div>
          {pathNodes && pathNodes.length > 0 && (
            <div class="mt-4 pt-4 border-t border-slate-700/30">
              <span class="text-emerald-400 text-sm font-semibold">Path ({pathNodes.length - 1} hops):</span>
              <div class="mt-2.5 flex flex-wrap gap-1.5 items-center">
                {pathNodes.map((nodeId, i) => (
                  <span key={nodeId}>
                    {i > 0 && <span class="text-cyan-400 mx-1 font-semibold">→</span>}
                    <span
                      class="text-blue-400 cursor-pointer px-2.5 py-1.5 bg-blue-500/15 border border-blue-500/30 rounded-lg text-sm font-medium transition-all hover:bg-blue-500/25 hover:shadow-glow-blue"
                      onClick={() => setHighlightedNode(nodeId)}
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

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div class="absolute top-20 left-5 z-[80] bg-slate-900/80 py-2.5 px-4 rounded-xl flex items-center gap-2.5 text-sm border border-slate-700/30 backdrop-blur-xl">
          <span class="text-slate-600 font-medium">History:</span>
          {breadcrumbs.map((item, index) => (
            <span key={item.id}>
              {index > 0 && <span class="text-slate-700">/</span>}
              <span
                class={`text-slate-400 cursor-pointer px-2.5 py-1 rounded-md font-medium transition-all hover:bg-blue-500/10 hover:text-slate-100 ${index === breadcrumbs.length - 1 ? "text-blue-400 bg-blue-500/10" : ""}`}
                onClick={() => navigateBreadcrumb(item, index)}
              >
                {item.label}
              </span>
            </span>
          ))}
          <button
            class="bg-transparent border-none text-slate-600 cursor-pointer ml-2 px-2 py-1 rounded transition-all hover:text-red-400 hover:bg-red-500/10"
            onClick={() => setBreadcrumbs([])}
            title="Clear history"
          >
            ✕
          </button>
        </div>
      )}

      {/* Related Tools Panel */}
      {relatedTools.length > 0 && (
        <div class="absolute top-[300px] right-5 z-[80] bg-slate-900/80 p-4 px-5 rounded-2xl border border-slate-700/30 min-w-[260px] max-w-[300px] backdrop-blur-xl max-h-[280px] overflow-y-auto shadow-glass">
          <h4 class="text-slate-500 text-xs uppercase tracking-widest mb-3 font-semibold">
            Related Tools (Adamic-Adar)
          </h4>
          <div class="flex flex-col gap-2">
            {relatedTools.map((tool) => (
              <div
                key={tool.tool_id}
                class="flex justify-between items-center p-2.5 px-3 bg-slate-800/50 border border-transparent rounded-xl cursor-pointer transition-all duration-200 hover:bg-orange-500/10 hover:border-orange-500/20 hover:translate-x-1"
                onClick={() => setHighlightedNode(tool.tool_id)}
              >
                <span class="text-slate-100 text-sm font-medium">{tool.name}</span>
                <span class="text-slate-500 text-xs ml-2">{tool.server}</span>
                <span class="text-orange-400 text-xs font-semibold">AA: {tool.adamic_adar_score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graph Visualization */}
      <GraphVisualization
        apiBase={apiBase}
        onNodeSelect={handleNodeSelect}
        highlightedNodeId={highlightedNode}
        pathNodes={pathNodes}
      />

      {/* Keyboard Shortcuts Help */}
      <div class="absolute bottom-5 right-5 z-[80] bg-slate-900/80 py-3 px-4 rounded-xl text-xs text-slate-600 flex gap-5 border border-slate-700/30 backdrop-blur-xl">
        <span>
          <kbd class="bg-gradient-to-br from-blue-500/10 to-purple-500/10 px-2 py-0.5 rounded mr-1.5 text-slate-400 font-semibold text-[11px] border border-blue-500/20">/</kbd>
          Search
        </span>
        <span>
          <kbd class="bg-gradient-to-br from-blue-500/10 to-purple-500/10 px-2 py-0.5 rounded mr-1.5 text-slate-400 font-semibold text-[11px] border border-blue-500/20">Esc</kbd>
          Clear
        </span>
        <span>
          <kbd class="bg-gradient-to-br from-blue-500/10 to-purple-500/10 px-2 py-0.5 rounded mr-1.5 text-slate-400 font-semibold text-[11px] border border-blue-500/20">Ctrl+P</kbd>
          Path
        </span>
      </div>
    </div>
  );
}
