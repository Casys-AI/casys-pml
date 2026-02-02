/**
 * NamespaceDetailIsland - Capability node explorer
 *
 * Compact design matching ServerDetailIsland:
 * - Top: breadcrumb + node info + search + nav
 * - Middle: horizontal chip grid for capabilities
 * - Bottom: selected capability details (code + tools + params)
 *
 * @module web/islands/NamespaceDetailIsland
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import CodeBlock from "../components/ui/atoms/CodeBlock.tsx";
import InputSchema from "../components/ui/atoms/InputSchema.tsx";
import ToolBadge from "../components/ui/atoms/ToolBadge.tsx";
import { parseToolId } from "../../capabilities/tool-id-utils.ts";

interface ParametersSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    examples?: unknown[];
    description?: string;
  }>;
  required?: string[];
}

interface CapabilityEntry {
  id: string;
  name: string;
  action: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
  inputSchema: ParametersSchema | null;
}

interface NodeNavItem {
  id: string;
  name: string;
  icon: string;
  toolCount: number;
}

interface NamespaceDetailIslandProps {
  namespace: string;
  capabilities: CapabilityEntry[];
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
  allNodes?: NodeNavItem[];
}

export default function NamespaceDetailIsland({
  namespace,
  capabilities,
  user: _user,
  isCloudMode: _isCloudMode,
  allNodes = [],
}: NamespaceDetailIslandProps) {
  void _user;
  void _isCloudMode;

  const [search, setSearch] = useState("");
  const [selectedCap, setSelectedCap] = useState<CapabilityEntry | null>(capabilities[0] || null);
  const [showNodeNav, setShowNodeNav] = useState(false);

  // Find current position in nodes (for ns/ routes, id is ns/namespace)
  const currentNodeId = `ns/${namespace}`;
  const currentIndex = allNodes.findIndex((n) => n.id === currentNodeId || n.name.toLowerCase() === namespace.toLowerCase());
  const prevNode = currentIndex > 0 ? allNodes[currentIndex - 1] : null;
  const nextNode = currentIndex < allNodes.length - 1 ? allNodes[currentIndex + 1] : null;

  // Filter capabilities by search
  const filteredCaps = useMemo(() => {
    if (!search) return capabilities;
    const searchLower = search.toLowerCase();
    return capabilities.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.action?.toLowerCase().includes(searchLower) ||
        (c.description?.toLowerCase().includes(searchLower) ?? false)
    );
  }, [capabilities, search]);

  // Auto-select first capability when filter changes
  useEffect(() => {
    if (filteredCaps.length > 0) {
      const stillVisible = selectedCap && filteredCaps.some(c => c.id === selectedCap.id);
      if (!stillVisible) {
        setSelectedCap(filteredCaps[0]);
      }
    } else {
      setSelectedCap(null);
    }
  }, [search]);

  // Group tools by server
  const groupedTools = useMemo(() => {
    if (!selectedCap?.toolsUsed.length) return new Map<string, string[]>();

    const groups = new Map<string, Set<string>>();
    for (const tool of selectedCap.toolsUsed) {
      const { namespace: server, action } = parseToolId(tool);
      if (!groups.has(server)) {
        groups.set(server, new Set());
      }
      groups.get(server)!.add(action);
    }

    const result = new Map<string, string[]>();
    for (const [server, actions] of groups) {
      result.set(server, [...actions].sort());
    }
    return result;
  }, [selectedCap]);

  // Get node URL helper
  const getNodeUrl = (node: NodeNavItem) => {
    if (node.id.startsWith("ns/")) return `/catalog/${node.id}`;
    if (node.id.startsWith("std-")) return `/catalog/${node.id}`;
    return `/catalog/${node.id}`;
  };

  return (
    <div class="cap-detail-page">
      {/* Site header */}
      <VitrineHeader activePage="catalog" />

      {/* Capability header bar */}
      <header class="cap-header-bar">
        <div class="cap-header-left">
          <a href="/catalog" class="back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeWidth="2" strokeLinecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div class="cap-breadcrumb">
            <a href="/catalog" class="breadcrumb-link">Catalog</a>
            <span class="breadcrumb-sep">/</span>
            <button
              type="button"
              class="breadcrumb-current cap-selector"
              onClick={() => setShowNodeNav(!showNodeNav)}
            >
              <span class="cap-icon">⚡</span>
              {namespace}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" class="chevron-down">
                <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        <div class="cap-header-right">
          {/* Prev/Next navigation */}
          {allNodes.length > 0 && (
            <div class="cap-nav-box">
              {prevNode ? (
                <a href={getNodeUrl(prevNode)} class="nav-link prev" title={prevNode.name}>
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
                <a href={getNodeUrl(nextNode)} class="nav-link next" title={nextNode.name}>
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
          )}
          <span class="cap-stat">{capabilities.length} caps</span>
        </div>
      </header>

      {/* Node dropdown navigation */}
      {showNodeNav && (
        <div class="cap-nav-dropdown">
          <div class="cap-nav-grid">
            {allNodes.map((node) => (
              <a
                key={node.id}
                href={getNodeUrl(node)}
                class={`cap-nav-item ${node.name.toLowerCase() === namespace.toLowerCase() ? "current" : ""}`}
              >
                <span class="cap-nav-icon">{node.icon}</span>
                <span class="cap-nav-name">{node.name}</span>
                <span class="cap-nav-count">{node.toolCount}</span>
              </a>
            ))}
          </div>
          <button
            type="button"
            class="cap-nav-close"
            onClick={() => setShowNodeNav(false)}
          >
            Close
          </button>
        </div>
      )}

      {/* Info bar + search */}
      <div class="cap-info-bar">
        <p class="cap-description">Learned capabilities in the <code>{namespace}</code> namespace</p>
        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Filter capabilities..."
            class="search-input"
          />
        </div>
      </div>

      {/* Capabilities grid (compact chips) */}
      <div class="caps-grid">
        {filteredCaps.map((cap) => (
          <button
            key={cap.id}
            type="button"
            class={`cap-chip ${selectedCap?.id === cap.id ? "selected" : ""}`}
            onClick={() => setSelectedCap(selectedCap?.id === cap.id ? null : cap)}
            title={cap.description || cap.name}
          >
            <span class="cap-chip-name">{cap.action || cap.name}</span>
            {cap.toolsUsed.length > 0 && (
              <span class="cap-chip-tools">{cap.toolsUsed.length}t</span>
            )}
          </button>
        ))}
        {filteredCaps.length === 0 && (
          <div class="caps-empty">No capabilities match "{search}"</div>
        )}
      </div>

      {/* Selected capability detail */}
      {selectedCap && (
        <div class="cap-detail-panel">
          {/* Header */}
          <div class="cap-detail-header">
            <div class="cap-detail-title-row">
              <code class="cap-detail-name">{namespace}:{selectedCap.action || selectedCap.name}</code>
              <div class="cap-detail-badges">
                <span class={`cap-routing-badge ${selectedCap.routing}`}>
                  {selectedCap.routing === "cloud" ? "☁️" : "💻"}
                </span>
                <button
                  type="button"
                  class="cap-detail-close"
                  onClick={() => setSelectedCap(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <p class="cap-detail-desc">
              {selectedCap.description || "No description"}
            </p>
          </div>

          {/* Content: code + sidebar */}
          <div class="cap-detail-content">
            {/* Code section */}
            <div class="cap-code-section">
              <div class="cap-section-header">
                <span class="cap-section-label">Implementation</span>
              </div>
              {selectedCap.code ? (
                <CodeBlock code={selectedCap.code} />
              ) : (
                <div class="cap-code-empty">No code available</div>
              )}
            </div>

            {/* Sidebar: params + tools */}
            <div class="cap-sidebar">
              {/* Input parameters */}
              {selectedCap.inputSchema && selectedCap.inputSchema.properties && (
                <div class="cap-params-section">
                  <div class="cap-section-header">
                    <span class="cap-section-label">Parameters</span>
                    <span class="cap-section-count">
                      {Object.keys(selectedCap.inputSchema.properties).length}
                    </span>
                  </div>
                  <InputSchema schema={selectedCap.inputSchema} />
                </div>
              )}

              {/* Tools used */}
              {groupedTools.size > 0 && (
                <div class="cap-tools-section">
                  <div class="cap-section-header">
                    <span class="cap-section-label">Tools Used</span>
                    <span class="cap-section-count">{selectedCap.toolsUsed.length}</span>
                  </div>
                  <div class="cap-tools-groups">
                    {[...groupedTools.entries()].map(([server, actions]) => (
                      <div key={server} class="cap-tools-group">
                        <div class="cap-tools-server">{server}</div>
                        <div class="cap-tools-list">
                          {actions.map((action) => (
                            <ToolBadge key={`${server}:${action}`} tool={`${server}:${action}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        .cap-detail-page {
          min-height: 100vh;
          background: #0a0908;
          color: #f0ede8;
          font-family: 'Inter', -apple-system, sans-serif;
          padding-top: 60px; /* Space for VitrineHeader */
        }

        /* Capability Header */
        .cap-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          background: rgba(15, 15, 18, 0.95);
          border-bottom: 1px solid rgba(74, 222, 128, 0.08);
          position: sticky;
          top: 60px; /* Below VitrineHeader */
          z-index: 90;
          backdrop-filter: blur(12px);
        }

        .cap-header-left {
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
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        .cap-breadcrumb {
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
          color: #4ade80;
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

        .cap-selector {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          margin: -0.25rem -0.5rem;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .cap-selector:hover {
          background: rgba(74, 222, 128, 0.1);
        }

        .cap-icon {
          font-size: 1rem;
        }

        .chevron-down {
          opacity: 0.5;
        }

        .cap-header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .cap-nav-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(74, 222, 128, 0.04);
          border: 1px solid rgba(74, 222, 128, 0.12);
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
          background: rgba(74, 222, 128, 0.12);
          color: #4ade80;
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

        .cap-stat {
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          color: #4ade80;
          background: rgba(74, 222, 128, 0.08);
          padding: 0.25rem 0.625rem;
          border-radius: 4px;
        }

        /* Node dropdown */
        .cap-nav-dropdown {
          position: fixed;
          top: 108px; /* VitrineHeader (60px) + CapHeader (~48px) */
          left: 0;
          right: 0;
          background: #0f0f12;
          border-bottom: 1px solid rgba(74, 222, 128, 0.1);
          padding: 1rem 1.5rem;
          z-index: 89;
          max-height: 50vh;
          overflow-y: auto;
          animation: dropIn 0.15s ease-out;
        }

        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cap-nav-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .cap-nav-item {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.5rem;
          font-size: 0.6875rem;
          color: #a8a29e;
          text-decoration: none;
          background: #141418;
          border: 1px solid rgba(74, 222, 128, 0.06);
          border-radius: 4px;
          transition: all 0.12s;
        }

        .cap-nav-item:hover {
          background: rgba(74, 222, 128, 0.08);
          border-color: rgba(74, 222, 128, 0.2);
          color: #f0ede8;
        }

        .cap-nav-item.current {
          background: rgba(74, 222, 128, 0.12);
          border-color: #4ade80;
          color: #4ade80;
        }

        .cap-nav-icon { font-size: 0.75rem; }
        .cap-nav-name { font-family: 'Geist Mono', monospace; }
        .cap-nav-count {
          font-family: 'Geist Mono', monospace;
          font-size: 0.5625rem;
          color: #6b6560;
          background: rgba(74, 222, 128, 0.06);
          padding: 0.0625rem 0.25rem;
          border-radius: 2px;
        }

        .cap-nav-close {
          display: block;
          margin: 0.75rem auto 0;
          padding: 0.375rem 1rem;
          font-size: 0.6875rem;
          color: #6b6560;
          background: none;
          border: 1px solid rgba(74, 222, 128, 0.1);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cap-nav-close:hover {
          border-color: rgba(74, 222, 128, 0.3);
          color: #a8a29e;
        }

        /* Info bar */
        .cap-info-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.04);
        }

        .cap-description {
          font-size: 0.875rem;
          color: #a8a29e;
          flex: 1;
        }

        .cap-description code {
          font-family: 'Geist Mono', monospace;
          color: #4ade80;
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
          border: 1px solid rgba(74, 222, 128, 0.1);
          border-radius: 6px;
          outline: none;
          transition: border-color 0.15s;
        }

        .search-input::placeholder { color: #6b6560; }
        .search-input:focus { border-color: rgba(74, 222, 128, 0.3); }

        /* Capabilities grid */
        .caps-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          padding: 1rem 1.5rem;
          min-height: 60px;
        }

        .cap-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.3rem 0.5rem;
          font-size: 0.6875rem;
          font-family: 'Geist Mono', monospace;
          color: #a8a29e;
          background: #141418;
          border: 1px solid rgba(74, 222, 128, 0.08);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s;
        }

        .cap-chip:hover {
          background: rgba(74, 222, 128, 0.08);
          border-color: rgba(74, 222, 128, 0.2);
          color: #f0ede8;
        }

        .cap-chip.selected {
          background: rgba(74, 222, 128, 0.15);
          border-color: #4ade80;
          color: #4ade80;
        }

        .cap-chip-tools {
          font-size: 0.5625rem;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.1);
          padding: 0.0625rem 0.25rem;
          border-radius: 2px;
        }

        .caps-empty {
          width: 100%;
          padding: 2rem;
          text-align: center;
          font-size: 0.8125rem;
          color: #6b6560;
        }

        /* Detail panel */
        .cap-detail-panel {
          margin: 0 1.5rem 1.5rem;
          background: #0f0f12;
          border: 1px solid rgba(74, 222, 128, 0.1);
          border-radius: 10px;
          overflow: hidden;
          animation: slideUp 0.2s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .cap-detail-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.08);
        }

        .cap-detail-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .cap-detail-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #4ade80;
        }

        .cap-detail-badges {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .cap-routing-badge {
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          background: rgba(74, 222, 128, 0.1);
        }

        .cap-routing-badge.cloud {
          background: rgba(96, 165, 250, 0.1);
        }

        .cap-detail-close {
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

        .cap-detail-close:hover {
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        .cap-detail-desc {
          font-size: 0.8125rem;
          color: #a8a29e;
          line-height: 1.5;
        }

        /* Content grid */
        .cap-detail-content {
          display: grid;
          grid-template-columns: 1fr 240px;
          gap: 1px;
          background: rgba(74, 222, 128, 0.06);
        }

        @media (max-width: 768px) {
          .cap-detail-content {
            grid-template-columns: 1fr;
          }
        }

        .cap-code-section {
          background: #0f0f12;
        }

        .cap-sidebar {
          background: #0f0f12;
          display: flex;
          flex-direction: column;
        }

        .cap-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 1rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.06);
        }

        .cap-section-label {
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
        }

        .cap-section-count {
          font-size: 0.5625rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(74, 222, 128, 0.06);
          padding: 0.0625rem 0.25rem;
          border-radius: 2px;
        }

        .cap-code-empty {
          padding: 2rem;
          text-align: center;
          color: #6b6560;
          font-size: 0.75rem;
        }

        .cap-params-section {
          border-bottom: 1px solid rgba(74, 222, 128, 0.06);
        }

        .cap-tools-section .cap-section-header {
          border-color: rgba(255, 184, 111, 0.08);
        }

        .cap-tools-groups {
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .cap-tools-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .cap-tools-server {
          font-size: 0.5625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
          padding-left: 0.25rem;
        }

        .cap-tools-list {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        `}
      </style>
    </div>
  );
}
