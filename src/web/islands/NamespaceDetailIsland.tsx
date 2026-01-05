/**
 * NamespaceDetailIsland - Namespace capabilities explorer
 *
 * Split-pane layout:
 * - Left: capabilities list (searchable)
 * - Right: selected capability details (code viewer + MCP tools)
 *
 * @module web/islands/NamespaceDetailIsland
 */

import { useMemo, useState } from "preact/hooks";
import CatalogLayout from "../components/layout/CatalogLayout.tsx";
import CodeBlock from "../components/ui/atoms/CodeBlock.tsx";
import ToolBadge from "../components/ui/atoms/ToolBadge.tsx";

interface CapabilityEntry {
  id: string;
  name: string;
  action: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
}

interface NamespaceDetailIslandProps {
  namespace: string;
  capabilities: CapabilityEntry[];
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
}

export default function NamespaceDetailIsland({
  namespace,
  capabilities,
  user,
  isCloudMode,
}: NamespaceDetailIslandProps) {
  const [search, setSearch] = useState("");
  const [selectedCapability, setSelectedCapability] = useState<CapabilityEntry | null>(
    capabilities[0] || null
  );

  // Filter capabilities by search
  const filteredCapabilities = useMemo(() => {
    if (!search) return capabilities;
    const searchLower = search.toLowerCase();
    return capabilities.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.action?.toLowerCase().includes(searchLower) ||
        (c.description?.toLowerCase().includes(searchLower) ?? false)
    );
  }, [capabilities, search]);

  // Sidebar: capabilities list
  const sidebar = (
    <div class="ns-sidebar">
      {/* Namespace header */}
      <div class="ns-sidebar-header">
        <a href="/catalog" class="ns-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          Catalog
        </a>
        <div class="ns-info">
          <span class="ns-icon">⚡</span>
          <div>
            <h2 class="ns-name">{namespace}</h2>
            <span class="ns-count">{capabilities.length} capabilities</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div class="ns-search-wrapper">
        <svg class="ns-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8" strokeWidth="2" />
          <path strokeWidth="2" d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          placeholder="Search capabilities..."
          class="ns-search-input"
        />
      </div>

      {/* Capabilities list */}
      <div class="ns-caps-list">
        {filteredCapabilities.map((cap) => (
          <button
            key={cap.id}
            type="button"
            class={`ns-cap-item ${selectedCapability?.id === cap.id ? "active" : ""}`}
            onClick={() => setSelectedCapability(cap)}
          >
            <div class="ns-cap-info">
              <span class="ns-cap-action">{cap.action || cap.name}</span>
              {cap.action && cap.action !== cap.name && (
                <span class="ns-cap-name-sub">{cap.name}</span>
              )}
            </div>
            <span class="ns-cap-routing">
              {cap.routing === "cloud" ? "☁️" : "💻"}
            </span>
          </button>
        ))}
        {filteredCapabilities.length === 0 && (
          <div class="ns-caps-empty">No capabilities match your search</div>
        )}
      </div>

      <style>
        {`
        .ns-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .ns-sidebar-header {
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.1);
          margin-bottom: 1rem;
        }

        .ns-back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
          color: #6b6560;
          text-decoration: none;
          margin-bottom: 1rem;
          transition: color 0.2s;
        }

        .ns-back-link:hover {
          color: #4ade80;
        }

        .ns-back-link svg {
          width: 14px;
          height: 14px;
        }

        .ns-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .ns-icon {
          font-size: 2rem;
        }

        .ns-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #f0ede8;
          font-family: 'Geist Mono', monospace;
        }

        .ns-count {
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          color: #4ade80;
        }

        .ns-search-wrapper {
          position: relative;
          margin-bottom: 1rem;
        }

        .ns-search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: #6b6560;
          pointer-events: none;
        }

        .ns-search-input {
          width: 100%;
          padding: 0.5rem 0.75rem 0.5rem 2rem;
          font-size: 0.8125rem;
          color: #f0ede8;
          background: #141418;
          border: 1px solid rgba(74, 222, 128, 0.15);
          border-radius: 6px;
          outline: none;
          transition: border-color 0.2s;
        }

        .ns-search-input::placeholder {
          color: #6b6560;
        }

        .ns-search-input:focus {
          border-color: rgba(74, 222, 128, 0.4);
        }

        .ns-caps-list {
          flex: 1;
          overflow-y: auto;
          margin: 0 -1.5rem;
          padding: 0 0.5rem;
        }

        .ns-cap-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.625rem 1rem;
          background: none;
          border: none;
          border-left: 2px solid transparent;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .ns-cap-item:hover {
          background: rgba(74, 222, 128, 0.05);
        }

        .ns-cap-item.active {
          background: rgba(74, 222, 128, 0.1);
          border-left-color: #4ade80;
        }

        .ns-cap-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          min-width: 0;
        }

        .ns-cap-action {
          font-size: 0.8125rem;
          font-family: 'Geist Mono', monospace;
          color: #a8a29e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s;
        }

        .ns-cap-item.active .ns-cap-action {
          color: #4ade80;
        }

        .ns-cap-name-sub {
          font-size: 0.6875rem;
          color: #6b6560;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ns-cap-routing {
          font-size: 0.75rem;
          opacity: 0.5;
          flex-shrink: 0;
        }

        .ns-caps-empty {
          padding: 1rem;
          text-align: center;
          font-size: 0.8125rem;
          color: #6b6560;
        }

        .ns-caps-list::-webkit-scrollbar {
          width: 4px;
        }

        .ns-caps-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .ns-caps-list::-webkit-scrollbar-thumb {
          background: rgba(74, 222, 128, 0.2);
          border-radius: 2px;
        }
        `}
      </style>
    </div>
  );

  return (
    <CatalogLayout sidebar={sidebar} user={user} isCloudMode={isCloudMode}>
      {/* Capability detail */}
      {selectedCapability ? (
        <div class="cap-detail">
          {/* Header */}
          <div class="cap-header">
            <div class="cap-header-main">
              <h1 class="cap-title">
                {namespace}:{selectedCapability.action || selectedCapability.name}
              </h1>
              <span class={`cap-routing-badge ${selectedCapability.routing}`}>
                {selectedCapability.routing === "cloud" ? "☁️ Cloud" : "💻 Local"}
              </span>
            </div>
            <p class="cap-description">
              {selectedCapability.description || "No description available"}
            </p>
          </div>

          {/* Content grid: code + tools */}
          <div class="cap-content-grid">
            {/* Code viewer */}
            <div class="cap-code-section">
              <h2 class="cap-section-title">Implementation</h2>
              {selectedCapability.code ? (
                <CodeBlock code={selectedCapability.code} />
              ) : (
                <div class="cap-code-empty">No code available</div>
              )}
            </div>

            {/* Tools used */}
            {selectedCapability.toolsUsed.length > 0 && (
              <div class="cap-tools-section">
                <h2 class="cap-section-title">MCP Tools Used</h2>
                <div class="cap-tools-list">
                  {selectedCapability.toolsUsed.map((tool) => (
                    <ToolBadge key={tool} tool={tool} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div class="cap-empty">
          <div class="cap-empty-icon">⚡</div>
          <h2 class="cap-empty-title">Select a capability</h2>
          <p class="cap-empty-text">Choose a capability from the list to view its details</p>
        </div>
      )}

      <style>
        {`
        .cap-detail {
          max-width: 900px;
        }

        .cap-header {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.1);
        }

        .cap-header-main {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }

        .cap-title {
          font-family: 'Geist Mono', monospace;
          font-size: 1.5rem;
          font-weight: 600;
          color: #f0ede8;
        }

        .cap-routing-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.625rem;
          border-radius: 4px;
          background: rgba(74, 222, 128, 0.1);
          color: #4ade80;
        }

        .cap-routing-badge.cloud {
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
        }

        .cap-description {
          font-size: 1rem;
          line-height: 1.6;
          color: #a8a29e;
        }

        .cap-content-grid {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 1.5rem;
        }

        @media (max-width: 900px) {
          .cap-content-grid {
            grid-template-columns: 1fr;
          }
        }

        .cap-code-section {
          background: #0f0f12;
          border: 1px solid rgba(74, 222, 128, 0.1);
          border-radius: 12px;
          overflow: hidden;
        }

        .cap-section-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
          padding: 0.875rem 1.25rem;
          border-bottom: 1px solid rgba(74, 222, 128, 0.08);
          margin: 0;
        }

        .cap-code-empty {
          padding: 2rem;
          text-align: center;
          color: #6b6560;
          font-size: 0.875rem;
        }

        .cap-tools-section {
          background: #0f0f12;
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 12px;
          height: fit-content;
        }

        .cap-tools-section .cap-section-title {
          border-color: rgba(255, 184, 111, 0.08);
        }

        .cap-tools-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 1rem;
        }

        .cap-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          text-align: center;
          color: #6b6560;
        }

        .cap-empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .cap-empty-title {
          font-size: 1.25rem;
          color: #a8a29e;
          margin-bottom: 0.5rem;
        }

        .cap-empty-text {
          font-size: 0.875rem;
        }

        .cap-code::-webkit-scrollbar {
          height: 6px;
        }

        .cap-code::-webkit-scrollbar-track {
          background: transparent;
        }

        .cap-code::-webkit-scrollbar-thumb {
          background: rgba(74, 222, 128, 0.2);
          border-radius: 3px;
        }
        `}
      </style>
    </CatalogLayout>
  );
}
