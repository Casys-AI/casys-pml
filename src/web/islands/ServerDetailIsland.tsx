/**
 * ServerDetailIsland - Node detail explorer
 *
 * New compact design:
 * - Top: breadcrumb + node info + search
 * - Middle: horizontal chip grid for tools (grouped by prefix)
 * - Bottom: selected tool schema viewer
 *
 * @module web/islands/ServerDetailIsland
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import VitrineHeader from "../components/layout/VitrineHeader.tsx";

interface ToolEntry {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  inputSchema: Record<string, unknown> | null;
}

interface NodeNavItem {
  id: string;
  name: string;
  icon: string;
  toolCount: number;
}

interface ServerDetailIslandProps {
  serverId: string;
  displayName: string;
  description: string;
  tools: ToolEntry[];
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
  allNodes?: NodeNavItem[];
}

/** Icon for node category */
function getNodeIcon(displayName: string): string {
  const icons: Record<string, string> = {
    Docker: "🐳",
    Git: "📦",
    Database: "🗄️",
    Network: "🌐",
    Process: "⚙️",
    Archive: "📁",
    Ssh: "🔐",
    Kubernetes: "☸️",
    Media: "🎬",
    Cloud: "☁️",
    Sysinfo: "💻",
    Packages: "📦",
    Text: "📝",
    Json: "{ }",
    Math: "🔢",
    Datetime: "📅",
    Crypto: "🔒",
    Collections: "📚",
    Vfs: "💾",
    Http: "🌍",
    Validation: "✓",
    Format: "📋",
    Transform: "🔄",
    Algo: "🧮",
    Color: "🎨",
    String: "🔤",
    Path: "📂",
    Faker: "🎭",
    Geo: "🌍",
    Qrcode: "📱",
    Resilience: "🛡️",
    Schema: "📐",
    Diff: "↔️",
    Agent: "🤖",
    Pml: "⚡",
    Python: "🐍",
    Pglite: "🐘",
  };
  return icons[displayName] || "🔧";
}

/** Extract prefix groups from tools (e.g., docker_compose_*, docker_container_*) */
function extractPrefixGroups(tools: ToolEntry[]): Map<string, ToolEntry[]> {
  const groups = new Map<string, ToolEntry[]>();

  for (const tool of tools) {
    // Extract prefix: take first two parts if underscore-separated
    const parts = tool.name.split("_");
    const prefix = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : parts[0];

    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(tool);
  }

  // Sort groups by size (largest first), then alphabetically
  return new Map(
    [...groups.entries()].sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    })
  );
}

export default function ServerDetailIsland({
  serverId,
  displayName,
  description,
  tools,
  user: _user,
  isCloudMode: _isCloudMode,
  allNodes = [],
}: ServerDetailIslandProps) {
  void _user;
  void _isCloudMode;

  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(tools[0] || null);
  const [activePrefix, setActivePrefix] = useState<string | null>(null);
  const [showNodeNav, setShowNodeNav] = useState(false);

  const icon = getNodeIcon(displayName);

  // Find prev/next nodes
  const currentIndex = allNodes.findIndex((n) => n.id === serverId);
  const prevNode = currentIndex > 0 ? allNodes[currentIndex - 1] : null;
  const nextNode = currentIndex < allNodes.length - 1 ? allNodes[currentIndex + 1] : null;

  // Compute prefix groups
  const prefixGroups = useMemo(() => extractPrefixGroups(tools), [tools]);
  const prefixes = useMemo(() => [...prefixGroups.keys()], [prefixGroups]);

  // Filter tools by search and active prefix
  const filteredTools = useMemo(() => {
    let result = tools;

    if (activePrefix) {
      result = prefixGroups.get(activePrefix) || [];
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          (t.description?.toLowerCase().includes(searchLower) ?? false)
      );
    }

    return result;
  }, [tools, search, activePrefix, prefixGroups]);

  // Auto-select first tool when filter changes
  useEffect(() => {
    if (filteredTools.length > 0) {
      // Check if current selection is still in filtered list
      const stillVisible = selectedTool && filteredTools.some(t => t.id === selectedTool.id);
      if (!stillVisible) {
        setSelectedTool(filteredTools[0]);
      }
    } else {
      setSelectedTool(null);
    }
  }, [activePrefix, search]);

  // Get short name (remove common prefix when prefix is active)
  const getShortName = (tool: ToolEntry): string => {
    if (!activePrefix) return tool.name;
    if (tool.name.startsWith(activePrefix + "_")) {
      return tool.name.slice(activePrefix.length + 1);
    }
    return tool.name;
  };

  return (
    <div class="node-detail-page">
      {/* Site header */}
      <VitrineHeader activePage="catalog" />

      {/* Node header bar */}
      <header class="node-header">
        <div class="node-header-left">
          <a href="/catalog" class="back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeWidth="2" strokeLinecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div class="node-breadcrumb">
            <a href="/catalog" class="breadcrumb-link">Catalog</a>
            <span class="breadcrumb-sep">/</span>
            <button
              type="button"
              class="breadcrumb-current node-selector"
              onClick={() => setShowNodeNav(!showNodeNav)}
            >
              <span class="node-icon">{icon}</span>
              {displayName}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" class="chevron-down">
                <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        <div class="node-header-right">
          {/* Prev/Next navigation */}
          <div class="node-nav-box">
            {prevNode ? (
              <a href={`/catalog/${prevNode.id}`} class="nav-link prev" title={prevNode.name}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
                <span class="nav-link-name">{prevNode.name}</span>
              </a>
            ) : (
              <span class="nav-link prev disabled">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            )}
            <span class="nav-counter">{currentIndex + 1}<span class="nav-sep">/</span>{allNodes.length}</span>
            {nextNode ? (
              <a href={`/catalog/${nextNode.id}`} class="nav-link next" title={nextNode.name}>
                <span class="nav-link-name">{nextNode.name}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <span class="nav-link next disabled">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </span>
            )}
          </div>
          <span class="node-stat">{tools.length} tools</span>
        </div>
      </header>

      {/* Node dropdown navigation */}
      {showNodeNav && (
        <div class="node-nav-dropdown">
          <div class="node-nav-grid">
            {allNodes.map((node) => (
              <a
                key={node.id}
                href={`/catalog/${node.id}`}
                class={`node-nav-item ${node.id === serverId ? "current" : ""}`}
              >
                <span class="node-nav-icon">{node.icon}</span>
                <span class="node-nav-name">{node.name}</span>
                <span class="node-nav-count">{node.toolCount}</span>
              </a>
            ))}
          </div>
          <button
            type="button"
            class="node-nav-close"
            onClick={() => setShowNodeNav(false)}
          >
            Close
          </button>
        </div>
      )}

      {/* Node info + search */}
      <div class="node-info-bar">
        <p class="node-description">{description || `Tools for ${displayName.toLowerCase()} operations`}</p>
        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Filter tools..."
            class="search-input"
          />
        </div>
      </div>

      {/* Prefix filter pills */}
      {prefixes.length > 1 && (
        <div class="prefix-filters">
          <button
            type="button"
            class={`prefix-pill ${!activePrefix ? "active" : ""}`}
            onClick={() => setActivePrefix(null)}
          >
            All ({tools.length})
          </button>
          {prefixes.slice(0, 8).map((prefix) => (
            <button
              key={prefix}
              type="button"
              class={`prefix-pill ${activePrefix === prefix ? "active" : ""}`}
              onClick={() => setActivePrefix(activePrefix === prefix ? null : prefix)}
            >
              {prefix.replace(/_/g, " ")} ({prefixGroups.get(prefix)?.length})
            </button>
          ))}
          {prefixes.length > 8 && (
            <span class="prefix-more">+{prefixes.length - 8} more</span>
          )}
        </div>
      )}

      {/* Tools grid (compact chips) */}
      <div class="tools-grid">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            class={`tool-chip ${selectedTool?.id === tool.id ? "selected" : ""}`}
            onClick={() => setSelectedTool(selectedTool?.id === tool.id ? null : tool)}
            title={tool.description || tool.name}
          >
            <span class="tool-chip-name">{getShortName(tool)}</span>
            {tool.routing === "cloud" && <span class="tool-chip-cloud">☁</span>}
          </button>
        ))}
        {filteredTools.length === 0 && (
          <div class="tools-empty">No tools match "{search}"</div>
        )}
      </div>

      {/* Selected tool detail */}
      {selectedTool && (
        <div class="tool-detail-panel">
          <div class="tool-detail-header">
            <div class="tool-detail-title-row">
              <code class="tool-detail-name">{selectedTool.name}</code>
              <button
                type="button"
                class="tool-detail-close"
                onClick={() => setSelectedTool(null)}
              >
                ×
              </button>
            </div>
            <p class="tool-detail-desc">
              {selectedTool.description || "No description"}
            </p>
          </div>

          {/* Schema */}
          <div class="tool-schema-section">
            <div class="schema-header">
              <span class="schema-label">Input Schema</span>
              {selectedTool.inputSchema && (
                <span class="schema-params">
                  {Object.keys((selectedTool.inputSchema as any).properties || {}).length} params
                </span>
              )}
            </div>
            {selectedTool.inputSchema ? (
              <SchemaViewer schema={selectedTool.inputSchema} />
            ) : (
              <div class="schema-empty">No parameters required</div>
            )}
          </div>
        </div>
      )}

      <style>
        {`
        .node-detail-page {
          min-height: 100vh;
          background: #0a0908;
          color: #f0ede8;
          font-family: 'Inter', -apple-system, sans-serif;
          padding-top: 60px; /* Space for VitrineHeader */
        }

        /* Node Header */
        .node-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          background: rgba(15, 15, 18, 0.95);
          border-bottom: 1px solid rgba(255, 184, 111, 0.06);
          position: sticky;
          top: 60px; /* Below VitrineHeader */
          z-index: 90;
          backdrop-filter: blur(12px);
        }

        .node-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .back-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: #6b6560;
          text-decoration: none;
          transition: all 0.15s;
        }

        .back-link:hover {
          background: rgba(255, 184, 111, 0.08);
          color: #FFB86F;
        }

        .node-breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }

        .breadcrumb-link {
          color: #6b6560;
          text-decoration: none;
          transition: color 0.15s;
        }

        .breadcrumb-link:hover {
          color: #FFB86F;
        }

        .breadcrumb-sep {
          color: #3a3835;
        }

        .breadcrumb-current {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          color: #f0ede8;
          font-weight: 500;
        }

        .node-icon {
          font-size: 1rem;
        }

        .node-header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .node-stat {
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.06);
          padding: 0.25rem 0.625rem;
          border-radius: 4px;
        }

        /* Node selector dropdown trigger */
        .node-selector {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          margin: -0.25rem -0.5rem;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .node-selector:hover {
          background: rgba(255, 184, 111, 0.08);
        }

        .chevron-down {
          opacity: 0.5;
        }

        /* Prev/Next navigation */
        .node-nav-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 184, 111, 0.04);
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 8px;
          padding: 0.25rem;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.625rem;
          border-radius: 6px;
          color: #a8a29e;
          text-decoration: none;
          transition: all 0.15s;
          font-size: 0.75rem;
        }

        .nav-link:hover {
          background: rgba(255, 184, 111, 0.12);
          color: #FFB86F;
        }

        .nav-link.disabled {
          opacity: 0.25;
          pointer-events: none;
          padding: 0.375rem;
        }

        .nav-link-name {
          font-family: 'Geist Mono', monospace;
          font-weight: 500;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .nav-counter {
          font-size: 0.8125rem;
          font-family: 'Geist Mono', monospace;
          font-weight: 600;
          color: #f0ede8;
          padding: 0.25rem 0.5rem;
          min-width: 48px;
          text-align: center;
        }

        .nav-sep {
          color: #6b6560;
          margin: 0 0.125rem;
        }

        /* Node dropdown */
        .node-nav-dropdown {
          position: fixed;
          top: 108px; /* VitrineHeader (60px) + NodeHeader (~48px) */
          left: 0;
          right: 0;
          background: #0f0f12;
          border-bottom: 1px solid rgba(255, 184, 111, 0.1);
          padding: 1rem 1.5rem;
          z-index: 89;
          max-height: 50vh;
          overflow-y: auto;
          animation: dropIn 0.15s ease-out;
        }

        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .node-nav-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .node-nav-item {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.5rem;
          font-size: 0.6875rem;
          color: #a8a29e;
          text-decoration: none;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.06);
          border-radius: 4px;
          transition: all 0.12s;
        }

        .node-nav-item:hover {
          background: rgba(255, 184, 111, 0.08);
          border-color: rgba(255, 184, 111, 0.2);
          color: #f0ede8;
        }

        .node-nav-item.current {
          background: rgba(255, 184, 111, 0.12);
          border-color: #FFB86F;
          color: #FFB86F;
        }

        .node-nav-icon {
          font-size: 0.75rem;
        }

        .node-nav-name {
          font-family: 'Geist Mono', monospace;
        }

        .node-nav-count {
          font-family: 'Geist Mono', monospace;
          font-size: 0.5625rem;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.06);
          padding: 0.0625rem 0.25rem;
          border-radius: 2px;
        }

        .node-nav-close {
          display: block;
          margin: 0.75rem auto 0;
          padding: 0.375rem 1rem;
          font-size: 0.6875rem;
          color: #6b6560;
          background: none;
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .node-nav-close:hover {
          border-color: rgba(255, 184, 111, 0.3);
          color: #a8a29e;
        }

        /* Info bar */
        .node-info-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.04);
        }

        .node-description {
          font-size: 0.875rem;
          color: #a8a29e;
          flex: 1;
          line-height: 1.4;
        }

        .search-wrapper {
          position: relative;
          width: 220px;
          flex-shrink: 0;
        }

        .search-icon {
          position: absolute;
          left: 0.625rem;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: #6b6560;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 0.4rem 0.625rem 0.4rem 2rem;
          font-size: 0.75rem;
          color: #f0ede8;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 6px;
          outline: none;
          transition: border-color 0.15s;
        }

        .search-input::placeholder {
          color: #6b6560;
        }

        .search-input:focus {
          border-color: rgba(255, 184, 111, 0.25);
        }

        /* Prefix filters */
        .prefix-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          padding: 0.75rem 1.5rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.04);
        }

        .prefix-pill {
          padding: 0.25rem 0.625rem;
          font-size: 0.6875rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: transparent;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .prefix-pill:hover {
          border-color: rgba(255, 184, 111, 0.2);
          color: #a8a29e;
        }

        .prefix-pill.active {
          background: rgba(255, 184, 111, 0.1);
          border-color: #FFB86F;
          color: #FFB86F;
        }

        .prefix-more {
          padding: 0.25rem 0.5rem;
          font-size: 0.6875rem;
          color: #6b6560;
        }

        /* Tools grid */
        .tools-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          padding: 1rem 1.5rem;
          min-height: 80px;
        }

        .tool-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.5rem;
          font-size: 0.6875rem;
          font-family: 'Geist Mono', monospace;
          color: #a8a29e;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.06);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s;
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tool-chip:hover {
          background: rgba(255, 184, 111, 0.06);
          border-color: rgba(255, 184, 111, 0.15);
          color: #f0ede8;
        }

        .tool-chip.selected {
          background: rgba(255, 184, 111, 0.12);
          border-color: #FFB86F;
          color: #FFB86F;
        }

        .tool-chip-name {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tool-chip-cloud {
          font-size: 0.625rem;
          opacity: 0.6;
        }

        .tools-empty {
          width: 100%;
          padding: 2rem;
          text-align: center;
          font-size: 0.8125rem;
          color: #6b6560;
        }

        /* Tool detail panel */
        .tool-detail-panel {
          margin: 0 1.5rem 1.5rem;
          background: #0f0f12;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 10px;
          overflow: hidden;
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tool-detail-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.06);
        }

        .tool-detail-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .tool-detail-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #FFB86F;
        }

        .tool-detail-close {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: #6b6560;
          font-size: 1.25rem;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .tool-detail-close:hover {
          background: rgba(255, 184, 111, 0.1);
          color: #FFB86F;
        }

        .tool-detail-desc {
          font-size: 0.8125rem;
          color: #a8a29e;
          line-height: 1.5;
        }

        /* Schema section */
        .tool-schema-section {
          padding: 1rem 1.25rem;
        }

        .schema-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .schema-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
        }

        .schema-params {
          font-size: 0.625rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.04);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .schema-empty {
          padding: 1rem;
          text-align: center;
          font-size: 0.75rem;
          color: #6b6560;
          background: rgba(255, 184, 111, 0.02);
          border-radius: 6px;
        }
        `}
      </style>
    </div>
  );
}

// Compact Schema viewer
function SchemaViewer({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties || {}) as Record<string, SchemaProperty>;
  const required = (schema.required || []) as string[];

  if (Object.keys(properties).length === 0) {
    return <div class="schema-empty">No parameters</div>;
  }

  return (
    <div class="schema-props">
      {Object.entries(properties).map(([name, prop]) => (
        <CompactPropertyRow
          key={name}
          name={name}
          property={prop}
          required={required.includes(name)}
        />
      ))}

      <style>
        {`
        .schema-props {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: rgba(255, 184, 111, 0.03);
          border-radius: 6px;
          overflow: hidden;
        }
        `}
      </style>
    </div>
  );
}

interface SchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  oneOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
}

function CompactPropertyRow({
  name,
  property,
  required,
  depth = 0,
}: {
  name: string;
  property: SchemaProperty;
  required: boolean;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasNested =
    property.properties ||
    property.items?.properties ||
    property.oneOf ||
    property.anyOf;

  const typeLabel = getTypeLabel(property);

  return (
    <div class="prop-row" style={{ "--depth": depth } as any}>
      <div class="prop-main">
        <div class="prop-left">
          {hasNested && (
            <button
              type="button"
              class={`prop-expand ${expanded ? "open" : ""}`}
              onClick={() => setExpanded(!expanded)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12">
                <path strokeWidth="2" strokeLinecap="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          <code class="prop-name">{name}</code>
          {required && <span class="prop-req">*</span>}
        </div>
        <div class="prop-right">
          {property.enum && (
            <span class="prop-enum-badge">enum</span>
          )}
          <span class="prop-type">{typeLabel}</span>
        </div>
      </div>

      {property.description && (
        <p class="prop-desc">{property.description}</p>
      )}

      {/* Inline enum values */}
      {property.enum && property.enum.length <= 6 && (
        <div class="prop-enum-vals">
          {property.enum.map((v, i) => (
            <code key={i} class="prop-enum-val">{JSON.stringify(v)}</code>
          ))}
        </div>
      )}

      {property.default !== undefined && (
        <div class="prop-default">
          default: <code>{JSON.stringify(property.default)}</code>
        </div>
      )}

      {/* Nested properties */}
      {expanded && hasNested && (
        <div class="prop-nested">
          {property.properties &&
            Object.entries(property.properties).map(([n, p]) => (
              <CompactPropertyRow
                key={n}
                name={n}
                property={p}
                required={(property.required || []).includes(n)}
                depth={depth + 1}
              />
            ))}
          {property.items?.properties &&
            Object.entries(property.items.properties).map(([n, p]) => (
              <CompactPropertyRow
                key={n}
                name={`[].${n}`}
                property={p}
                required={(property.items?.required || []).includes(n)}
                depth={depth + 1}
              />
            ))}
        </div>
      )}

      <style>
        {`
        .prop-row {
          background: #141418;
          padding: 0.5rem 0.75rem;
          padding-left: calc(0.75rem + var(--depth) * 1rem);
        }

        .prop-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .prop-left {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          min-width: 0;
        }

        .prop-expand {
          width: 16px;
          height: 16px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b6560;
          transition: transform 0.12s, color 0.12s;
          flex-shrink: 0;
        }

        .prop-expand:hover {
          color: #FFB86F;
        }

        .prop-expand.open {
          transform: rotate(90deg);
        }

        .prop-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
          color: #f0ede8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .prop-req {
          color: #f87171;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .prop-right {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          flex-shrink: 0;
        }

        .prop-enum-badge {
          font-size: 0.5625rem;
          font-weight: 500;
          text-transform: uppercase;
          padding: 0.0625rem 0.25rem;
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
          border-radius: 2px;
        }

        .prop-type {
          font-family: 'Geist Mono', monospace;
          font-size: 0.625rem;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.06);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
        }

        .prop-desc {
          margin-top: 0.25rem;
          font-size: 0.6875rem;
          line-height: 1.4;
          color: #6b6560;
        }

        .prop-enum-vals {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          margin-top: 0.25rem;
        }

        .prop-enum-val {
          font-family: 'Geist Mono', monospace;
          font-size: 0.5625rem;
          padding: 0.0625rem 0.25rem;
          background: rgba(74, 222, 128, 0.06);
          color: #4ade80;
          border-radius: 2px;
        }

        .prop-default {
          margin-top: 0.25rem;
          font-size: 0.625rem;
          color: #6b6560;
        }

        .prop-default code {
          font-family: 'Geist Mono', monospace;
          color: #60a5fa;
        }

        .prop-nested {
          margin: 0.375rem -0.75rem -0.5rem;
          border-top: 1px solid rgba(255, 184, 111, 0.03);
        }
        `}
      </style>
    </div>
  );
}

function getTypeLabel(property: SchemaProperty): string {
  if (property.oneOf || property.anyOf) {
    return "union";
  }
  if (property.type === "array") {
    const itemType = property.items?.type || "any";
    return `${itemType}[]`;
  }
  return property.type || "any";
}
