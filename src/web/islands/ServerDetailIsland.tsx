/**
 * ServerDetailIsland - Server tools explorer
 *
 * Split-pane layout:
 * - Left: tools list (searchable)
 * - Right: selected tool schema viewer (Swagger-like)
 *
 * @module web/islands/ServerDetailIsland
 */

import { useMemo, useState } from "preact/hooks";
import CatalogLayout from "../components/layout/CatalogLayout.tsx";

interface ToolEntry {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  inputSchema: Record<string, unknown> | null;
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
}

/** Icon for server category */
function getServerIcon(displayName: string): string {
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

export default function ServerDetailIsland({
  serverId: _serverId,
  displayName,
  description: _description,
  tools,
  user,
  isCloudMode,
}: ServerDetailIslandProps) {
  // Note: serverId and description are passed for future use (breadcrumbs, SEO)
  void _serverId;
  void _description;

  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(tools[0] || null);

  // Filter tools by search
  const filteredTools = useMemo(() => {
    if (!search) return tools;
    const searchLower = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        (t.description?.toLowerCase().includes(searchLower) ?? false)
    );
  }, [tools, search]);

  const icon = getServerIcon(displayName);

  // Sidebar: tools list
  const sidebar = (
    <div class="server-sidebar">
      {/* Server header */}
      <div class="server-sidebar-header">
        <a href="/catalog" class="server-back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          Catalog
        </a>
        <div class="server-info">
          <span class="server-icon">{icon}</span>
          <div>
            <h2 class="server-name">{displayName}</h2>
            <span class="server-count">{tools.length} tools</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div class="server-search-wrapper">
        <svg class="server-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8" strokeWidth="2" />
          <path strokeWidth="2" d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          placeholder="Search tools..."
          class="server-search-input"
        />
      </div>

      {/* Tools list */}
      <div class="server-tools-list">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            class={`server-tool-item ${selectedTool?.id === tool.id ? "active" : ""}`}
            onClick={() => setSelectedTool(tool)}
          >
            <span class="server-tool-name">{tool.name}</span>
            <span class="server-tool-routing">
              {tool.routing === "cloud" ? "☁️" : "💻"}
            </span>
          </button>
        ))}
        {filteredTools.length === 0 && (
          <div class="server-tools-empty">No tools match your search</div>
        )}
      </div>

      <style>
        {`
        .server-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .server-sidebar-header {
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.08);
          margin-bottom: 1rem;
        }

        .server-back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
          color: #6b6560;
          text-decoration: none;
          margin-bottom: 1rem;
          transition: color 0.2s;
        }

        .server-back-link:hover {
          color: #FFB86F;
        }

        .server-back-link svg {
          width: 14px;
          height: 14px;
        }

        .server-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .server-icon {
          font-size: 2rem;
        }

        .server-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #f0ede8;
        }

        .server-count {
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
        }

        .server-search-wrapper {
          position: relative;
          margin-bottom: 1rem;
        }

        .server-search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: #6b6560;
          pointer-events: none;
        }

        .server-search-input {
          width: 100%;
          padding: 0.5rem 0.75rem 0.5rem 2rem;
          font-size: 0.8125rem;
          color: #f0ede8;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 6px;
          outline: none;
          transition: border-color 0.2s;
        }

        .server-search-input::placeholder {
          color: #6b6560;
        }

        .server-search-input:focus {
          border-color: rgba(255, 184, 111, 0.3);
        }

        .server-tools-list {
          flex: 1;
          overflow-y: auto;
          margin: 0 -1.5rem;
          padding: 0 0.5rem;
        }

        .server-tool-item {
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

        .server-tool-item:hover {
          background: rgba(255, 184, 111, 0.03);
        }

        .server-tool-item.active {
          background: rgba(255, 184, 111, 0.08);
          border-left-color: #FFB86F;
        }

        .server-tool-name {
          font-size: 0.8125rem;
          font-family: 'Geist Mono', monospace;
          color: #a8a29e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s;
        }

        .server-tool-item.active .server-tool-name {
          color: #FFB86F;
        }

        .server-tool-routing {
          font-size: 0.75rem;
          opacity: 0.5;
        }

        .server-tools-empty {
          padding: 1rem;
          text-align: center;
          font-size: 0.8125rem;
          color: #6b6560;
        }

        .server-tools-list::-webkit-scrollbar {
          width: 4px;
        }

        .server-tools-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .server-tools-list::-webkit-scrollbar-thumb {
          background: rgba(255, 184, 111, 0.15);
          border-radius: 2px;
        }
        `}
      </style>
    </div>
  );

  return (
    <CatalogLayout sidebar={sidebar} user={user} isCloudMode={isCloudMode}>
      {/* Tool detail / schema viewer */}
      {selectedTool ? (
        <div class="tool-detail">
          {/* Tool header */}
          <div class="tool-header">
            <div class="tool-header-main">
              <h1 class="tool-title">{selectedTool.name}</h1>
              <span class={`tool-routing-badge ${selectedTool.routing}`}>
                {selectedTool.routing === "cloud" ? "☁️ Cloud" : "💻 Local"}
              </span>
            </div>
            <p class="tool-description">
              {selectedTool.description || "No description available"}
            </p>
          </div>

          {/* Schema viewer */}
          <div class="tool-schema">
            <h2 class="schema-title">Input Schema</h2>
            {selectedTool.inputSchema ? (
              <SchemaViewer schema={selectedTool.inputSchema} />
            ) : (
              <div class="schema-empty">No input schema defined</div>
            )}
          </div>
        </div>
      ) : (
        <div class="tool-empty">
          <div class="tool-empty-icon">📋</div>
          <h2 class="tool-empty-title">Select a tool</h2>
          <p class="tool-empty-text">Choose a tool from the list to view its schema</p>
        </div>
      )}

      <style>
        {`
        .tool-detail {
          max-width: 800px;
        }

        .tool-header {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.08);
        }

        .tool-header-main {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }

        .tool-title {
          font-family: 'Geist Mono', monospace;
          font-size: 1.5rem;
          font-weight: 600;
          color: #f0ede8;
        }

        .tool-routing-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.625rem;
          border-radius: 4px;
          background: rgba(255, 184, 111, 0.1);
          color: #FFB86F;
        }

        .tool-routing-badge.cloud {
          background: rgba(96, 165, 250, 0.1);
          color: #60a5fa;
        }

        .tool-description {
          font-size: 1rem;
          line-height: 1.6;
          color: #a8a29e;
        }

        .tool-schema {
          background: #0f0f12;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 12px;
          padding: 1.5rem;
        }

        .schema-title {
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
          margin-bottom: 1.25rem;
        }

        .schema-empty {
          padding: 2rem;
          text-align: center;
          color: #6b6560;
          font-size: 0.875rem;
        }

        .tool-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          text-align: center;
          color: #6b6560;
        }

        .tool-empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .tool-empty-title {
          font-size: 1.25rem;
          color: #a8a29e;
          margin-bottom: 0.5rem;
        }

        .tool-empty-text {
          font-size: 0.875rem;
        }
        `}
      </style>
    </CatalogLayout>
  );
}

// Schema viewer component (Swagger-like)
function SchemaViewer({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties || {}) as Record<string, SchemaProperty>;
  const required = (schema.required || []) as string[];

  if (Object.keys(properties).length === 0) {
    return <div class="schema-empty">No parameters</div>;
  }

  return (
    <div class="schema-properties">
      {Object.entries(properties).map(([name, prop]) => (
        <PropertyRow
          key={name}
          name={name}
          property={prop}
          required={required.includes(name)}
        />
      ))}

      <style>
        {`
        .schema-properties {
          display: flex;
          flex-direction: column;
          gap: 1px;
          background: rgba(255, 184, 111, 0.04);
          border-radius: 8px;
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

function PropertyRow({
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
  const [expanded, setExpanded] = useState(depth < 2);
  const hasNested =
    property.properties ||
    property.items?.properties ||
    property.oneOf ||
    property.anyOf;

  const typeLabel = getTypeLabel(property);

  return (
    <div class="property-row" style={{ "--depth": depth } as any}>
      <div class="property-header">
        <div class="property-name-section">
          {hasNested && (
            <button
              type="button"
              class={`property-expand ${expanded ? "expanded" : ""}`}
              onClick={() => setExpanded(!expanded)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          <span class="property-name">{name}</span>
          {required && <span class="property-required">required</span>}
        </div>
        <span class="property-type">{typeLabel}</span>
      </div>

      {property.description && (
        <p class="property-desc">{property.description}</p>
      )}

      {property.enum && (
        <div class="property-enum">
          <span class="property-enum-label">Enum:</span>
          {property.enum.map((v, i) => (
            <span key={i} class="property-enum-value">
              {JSON.stringify(v)}
            </span>
          ))}
        </div>
      )}

      {property.default !== undefined && (
        <div class="property-default">
          <span class="property-default-label">Default:</span>
          <code class="property-default-value">{JSON.stringify(property.default)}</code>
        </div>
      )}

      {/* Nested properties */}
      {expanded && hasNested && (
        <div class="property-nested">
          {property.properties &&
            Object.entries(property.properties).map(([n, p]) => (
              <PropertyRow
                key={n}
                name={n}
                property={p}
                required={(property.required || []).includes(n)}
                depth={depth + 1}
              />
            ))}
          {property.items?.properties &&
            Object.entries(property.items.properties).map(([n, p]) => (
              <PropertyRow
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
        .property-row {
          background: #141418;
          padding: 1rem 1.25rem;
          padding-left: calc(1.25rem + var(--depth) * 1.5rem);
        }

        .property-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .property-name-section {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .property-expand {
          width: 18px;
          height: 18px;
          padding: 0;
          background: none;
          border: none;
          cursor: pointer;
          color: #6b6560;
          transition: transform 0.15s, color 0.15s;
        }

        .property-expand:hover {
          color: #FFB86F;
        }

        .property-expand.expanded {
          transform: rotate(90deg);
        }

        .property-expand svg {
          width: 14px;
          height: 14px;
        }

        .property-name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.875rem;
          font-weight: 600;
          color: #f0ede8;
        }

        .property-required {
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          padding: 0.125rem 0.375rem;
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border-radius: 3px;
        }

        .property-type {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.08);
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
        }

        .property-desc {
          margin-top: 0.5rem;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: #a8a29e;
        }

        .property-enum {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.375rem;
          margin-top: 0.5rem;
        }

        .property-enum-label {
          font-size: 0.6875rem;
          font-weight: 500;
          text-transform: uppercase;
          color: #6b6560;
        }

        .property-enum-value {
          font-family: 'Geist Mono', monospace;
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          background: rgba(74, 222, 128, 0.08);
          color: #4ade80;
          border-radius: 3px;
        }

        .property-default {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .property-default-label {
          font-size: 0.6875rem;
          font-weight: 500;
          text-transform: uppercase;
          color: #6b6560;
        }

        .property-default-value {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          color: #60a5fa;
        }

        .property-nested {
          margin-top: 0.5rem;
          margin-left: -1.25rem;
          margin-right: -1.25rem;
          margin-bottom: -1rem;
          border-top: 1px solid rgba(255, 184, 111, 0.04);
        }
        `}
      </style>
    </div>
  );
}

function getTypeLabel(property: SchemaProperty): string {
  if (property.oneOf || property.anyOf) {
    return "oneOf";
  }
  if (property.type === "array") {
    const itemType = property.items?.type || "any";
    return `${itemType}[]`;
  }
  return property.type || "any";
}
