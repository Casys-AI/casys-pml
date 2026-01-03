/**
 * CatalogPageIsland - Server catalog with grouped server cards
 *
 * Shows server cards (not individual tools). Clicking a server card
 * navigates to the server detail page with tools list and schema viewer.
 *
 * @module web/islands/CatalogPageIsland
 */

import { useMemo, useState } from "preact/hooks";
import CatalogLayout from "../components/layout/CatalogLayout.tsx";
import type { CatalogEntry, CatalogFilters } from "../../cloud/ui/catalog/types.ts";

interface CatalogPageIslandProps {
  entries: CatalogEntry[];
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
}

/** Server card data (grouped from tools) */
interface ServerCardData {
  id: string; // serverId or category for std
  displayName: string;
  toolCount: number;
  description: string | null;
  routing: "local" | "cloud";
  isStdCategory: boolean; // true if this is a std tool category
  sampleTools: string[]; // First 3 tool names for preview
}

/** Capability card data (grouped by namespace) */
interface CapabilityCardData {
  namespace: string;
  count: number;
  capabilities: CatalogEntry[];
}

/**
 * Get display name for a server.
 * For std tools, extract the category from the tool name.
 */
function getServerDisplayName(serverId: string | null, toolName: string): string {
  if (!serverId) return "Unknown";

  if (serverId === "std") {
    const underscoreIndex = toolName.indexOf("_");
    if (underscoreIndex > 0) {
      const category = toolName.substring(0, underscoreIndex);
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
    return "Std";
  }

  return serverId;
}

/**
 * Get URL-safe server ID for routing
 */
function getServerRouteId(serverId: string, toolName: string): string {
  if (serverId === "std") {
    const underscoreIndex = toolName.indexOf("_");
    if (underscoreIndex > 0) {
      return `std-${toolName.substring(0, underscoreIndex)}`;
    }
    return "std";
  }
  return serverId;
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

export default function CatalogPageIsland({
  entries,
  user,
  isCloudMode,
}: CatalogPageIslandProps) {
  const [filters, setFilters] = useState<CatalogFilters>({
    search: "",
    recordTypes: [],
  });

  // Group entries by server to create server cards
  const serverCards = useMemo(() => {
    const groups = new Map<string, {
      entries: CatalogEntry[];
      displayName: string;
      isStdCategory: boolean;
    }>();

    entries.forEach((e) => {
      if (e.recordType === "mcp-tool" && e.serverId) {
        const displayName = getServerDisplayName(e.serverId, e.name);
        const routeId = getServerRouteId(e.serverId, e.name);

        if (!groups.has(routeId)) {
          groups.set(routeId, {
            entries: [],
            displayName,
            isStdCategory: e.serverId === "std",
          });
        }
        groups.get(routeId)!.entries.push(e);
      }
    });

    // Convert to ServerCardData
    const cards: ServerCardData[] = [];
    groups.forEach((group, id) => {
      const firstEntry = group.entries[0];
      cards.push({
        id,
        displayName: group.displayName,
        toolCount: group.entries.length,
        description: generateServerDescription(group.entries, group.displayName),
        routing: firstEntry.routing,
        isStdCategory: group.isStdCategory,
        sampleTools: group.entries.slice(0, 3).map(e => e.name),
      });
    });

    // Sort by tool count (most tools first)
    return cards.sort((a, b) => b.toolCount - a.toolCount);
  }, [entries]);

  // Filter server cards
  const filteredCards = useMemo(() => {
    return serverCards.filter((card) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          card.displayName.toLowerCase().includes(searchLower) ||
          card.id.toLowerCase().includes(searchLower) ||
          card.sampleTools.some(t => t.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [serverCards, filters]);

  // Group capabilities by namespace
  const capabilityCards = useMemo(() => {
    const groups = new Map<string, CatalogEntry[]>();

    entries.forEach((e) => {
      if (e.recordType === "capability" && e.namespace) {
        if (!groups.has(e.namespace)) {
          groups.set(e.namespace, []);
        }
        groups.get(e.namespace)!.push(e);
      }
    });

    const cards: CapabilityCardData[] = [];
    groups.forEach((capabilities, namespace) => {
      cards.push({ namespace, count: capabilities.length, capabilities });
    });

    return cards.sort((a, b) => b.count - a.count);
  }, [entries]);

  // Filter capabilities by search
  const filteredCapabilities = useMemo(() => {
    if (!filters.search) return capabilityCards;
    const searchLower = filters.search.toLowerCase();
    return capabilityCards.filter((card) =>
      card.namespace.toLowerCase().includes(searchLower) ||
      card.capabilities.some((c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.action?.toLowerCase().includes(searchLower)
      )
    );
  }, [capabilityCards, filters]);

  const capabilityCount = entries.filter(e => e.recordType === "capability").length;

  const clearFilters = () => {
    setFilters({ search: "", recordTypes: [] });
  };

  const hasActiveFilters = filters.search.length > 0;

  // Sidebar content
  const sidebar = (
    <div class="catalog-filters">
      {/* Header */}
      <div class="catalog-filters-header">
        <h2 class="catalog-filters-title">Filters</h2>
        {hasActiveFilters && (
          <button type="button" class="catalog-filters-clear" onClick={clearFilters}>
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div class="catalog-filter-group">
        <label class="catalog-filter-label">Search</label>
        <div class="catalog-search-wrapper">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={filters.search}
            onInput={(e) => setFilters({ ...filters, search: (e.target as HTMLInputElement).value })}
            placeholder="Search servers & tools..."
            class="catalog-search-input"
          />
        </div>
      </div>

      {/* Stats */}
      <div class="catalog-stats">
        <div class="catalog-stat">
          <span class="catalog-stat-value">{serverCards.length}</span>
          <span class="catalog-stat-label">Servers</span>
        </div>
        <div class="catalog-stat">
          <span class="catalog-stat-value">{entries.filter(e => e.recordType === "mcp-tool").length}</span>
          <span class="catalog-stat-label">MCP Tools</span>
        </div>
        {capabilityCount > 0 && (
          <div class="catalog-stat">
            <span class="catalog-stat-value">{capabilityCount}</span>
            <span class="catalog-stat-label">Capabilities</span>
          </div>
        )}
      </div>

      {/* Results count */}
      <div class="catalog-results-count">
        Showing <strong>{filteredCards.length}</strong> of {serverCards.length} servers
      </div>

      <style>
        {`
        .catalog-filters {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .catalog-filters-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .catalog-filters-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #6b6560;
        }

        .catalog-filters-clear {
          font-size: 0.75rem;
          color: #FFB86F;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: opacity 0.2s;
        }

        .catalog-filters-clear:hover {
          opacity: 0.8;
        }

        .catalog-filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .catalog-filter-label {
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #a8a29e;
        }

        .catalog-search-wrapper {
          position: relative;
        }

        .catalog-search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          color: #6b6560;
          pointer-events: none;
        }

        .catalog-search-input {
          width: 100%;
          padding: 0.625rem 0.75rem 0.625rem 2.25rem;
          font-size: 0.875rem;
          color: #f0ede8;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .catalog-search-input::placeholder {
          color: #6b6560;
        }

        .catalog-search-input:focus {
          border-color: rgba(255, 184, 111, 0.3);
          box-shadow: 0 0 0 3px rgba(255, 184, 111, 0.05);
        }

        .catalog-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .catalog-stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.875rem;
          background: #141418;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 8px;
        }

        .catalog-stat-value {
          font-size: 1.5rem;
          font-weight: 600;
          font-family: 'Geist Mono', monospace;
          color: #FFB86F;
        }

        .catalog-stat-label {
          font-size: 0.75rem;
          color: #6b6560;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .catalog-results-count {
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 184, 111, 0.08);
          font-size: 0.8125rem;
          color: #6b6560;
        }

        .catalog-results-count strong {
          color: #FFB86F;
          font-weight: 600;
        }
        `}
      </style>
    </div>
  );

  return (
    <CatalogLayout sidebar={sidebar} user={user} isCloudMode={isCloudMode}>
      {/* Page Header */}
      <div class="catalog-header">
        <h1 class="catalog-title">MCP Server Catalog</h1>
        <p class="catalog-subtitle">
          Browse available MCP servers and their tools. Click a server to explore its API.
        </p>
      </div>

      {/* MCP Servers Grid */}
      {filteredCards.length > 0 && (
        <>
          <h2 class="catalog-section-title">MCP Servers</h2>
          <div class="catalog-grid">
            {filteredCards.map((card) => (
              <ServerCard key={card.id} card={card} />
            ))}
          </div>
        </>
      )}

      {/* Capabilities Section */}
      {filteredCapabilities.length > 0 && (
        <>
          <h2 class="catalog-section-title" style={{ marginTop: "2.5rem" }}>
            Learned Capabilities
          </h2>
          <div class="catalog-grid">
            {filteredCapabilities.map((card) => (
              <CapabilityCard key={card.namespace} card={card} />
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {filteredCards.length === 0 && filteredCapabilities.length === 0 && (
        <div class="catalog-empty">
          <svg class="catalog-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
            <path strokeWidth="1.5" d="m21 21-4.35-4.35" />
          </svg>
          <h3 class="catalog-empty-title">No results found</h3>
          <p class="catalog-empty-text">Try adjusting your search query</p>
        </div>
      )}

      <style>
        {`
        .catalog-header {
          margin-bottom: 2rem;
        }

        .catalog-title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 2rem;
          font-weight: 400;
          color: #f0ede8;
          margin-bottom: 0.5rem;
        }

        .catalog-subtitle {
          font-size: 1rem;
          color: #a8a29e;
          max-width: 600px;
        }

        .catalog-section-title {
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b6560;
          margin-bottom: 1rem;
        }

        .catalog-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.25rem;
        }

        .catalog-empty {
          text-align: center;
          padding: 4rem 2rem;
          background: #0f0f12;
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 12px;
        }

        .catalog-empty-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 1rem;
          color: #6b6560;
        }

        .catalog-empty-title {
          font-size: 1.125rem;
          color: #f0ede8;
          margin-bottom: 0.5rem;
        }

        .catalog-empty-text {
          font-size: 0.875rem;
          color: #6b6560;
        }
        `}
      </style>
    </CatalogLayout>
  );
}

/**
 * Generate description from tool descriptions (from DB)
 * Uses first tool's description as a sample
 */
function generateServerDescription(entries: CatalogEntry[], displayName: string): string {
  // Find first tool with a description
  const withDesc = entries.find((e) => e.description);
  if (withDesc && withDesc.description) {
    // Get first sentence
    const firstSentence = withDesc.description.split(".")[0];
    if (firstSentence.length > 0 && firstSentence.length < 80) {
      return firstSentence;
    }
  }
  return `${entries.length} tools from ${displayName}`;
}

// Server Card component
function ServerCard({ card }: { card: ServerCardData }) {
  const icon = getServerIcon(card.displayName);

  return (
    <a href={`/catalog/${card.id}`} class="server-card">
      {/* Icon */}
      <div class="server-card-icon">
        <span class="server-card-emoji">{icon}</span>
      </div>

      {/* Content */}
      <div class="server-card-content">
        <div class="server-card-header">
          <h3 class="server-card-name">{card.displayName}</h3>
          <span class="server-card-count">{card.toolCount} tools</span>
        </div>

        <p class="server-card-desc">{card.description}</p>

        {/* Sample tools preview */}
        <div class="server-card-tools">
          {card.sampleTools.map((tool, i) => (
            <span key={i} class="server-card-tool">{tool}</span>
          ))}
          {card.toolCount > 3 && (
            <span class="server-card-more">+{card.toolCount - 3}</span>
          )}
        </div>
      </div>

      {/* Routing badge */}
      <span class={`server-card-routing ${card.routing}`}>
        {card.routing === "cloud" ? "☁️ Cloud" : "💻 Local"}
      </span>

      {/* Arrow */}
      <svg class="server-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>

      <style>
        {`
        .server-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: linear-gradient(135deg, #0f0f12 0%, #111114 100%);
          border: 1px solid rgba(255, 184, 111, 0.08);
          border-radius: 16px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .server-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 184, 111, 0.03) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.25s;
        }

        .server-card:hover {
          border-color: rgba(255, 184, 111, 0.2);
          transform: translateY(-4px);
          box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.4);
        }

        .server-card:hover::before {
          opacity: 1;
        }

        .server-card-icon {
          width: 48px;
          height: 48px;
          background: rgba(255, 184, 111, 0.08);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .server-card-emoji {
          font-size: 1.5rem;
        }

        .server-card-content {
          flex: 1;
          min-width: 0;
        }

        .server-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.375rem;
        }

        .server-card-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #f0ede8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .server-card-count {
          font-size: 0.75rem;
          font-family: 'Geist Mono', monospace;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.1);
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .server-card-desc {
          font-size: 0.875rem;
          line-height: 1.5;
          color: #a8a29e;
          margin-bottom: 0.75rem;
        }

        .server-card-tools {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .server-card-tool {
          font-size: 0.6875rem;
          font-family: 'Geist Mono', monospace;
          color: #6b6560;
          background: rgba(255, 255, 255, 0.03);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          white-space: nowrap;
        }

        .server-card-more {
          font-size: 0.6875rem;
          font-family: 'Geist Mono', monospace;
          color: #FFB86F;
          padding: 0.125rem 0.375rem;
        }

        .server-card-routing {
          position: absolute;
          top: 1rem;
          right: 2.5rem;
          font-size: 0.6875rem;
          color: #6b6560;
        }

        .server-card-routing.cloud {
          color: #60a5fa;
        }

        .server-card-arrow {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          color: #6b6560;
          opacity: 0;
          transition: all 0.25s;
        }

        .server-card:hover .server-card-arrow {
          opacity: 1;
          color: #FFB86F;
          transform: translateY(-50%) translateX(4px);
        }
        `}
      </style>
    </a>
  );
}

// Capability Card component
function CapabilityCard({ card }: { card: CapabilityCardData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div class="capability-card">
      {/* Header */}
      <button
        type="button"
        class="capability-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div class="capability-card-icon">
          <span class="capability-card-emoji">⚡</span>
        </div>
        <div class="capability-card-info">
          <h3 class="capability-card-name">{card.namespace}</h3>
          <span class="capability-card-count">{card.count} capabilities</span>
        </div>
        <svg
          class={`capability-card-chevron ${expanded ? "expanded" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div class="capability-card-list">
          {card.capabilities.map((cap) => (
            <div key={cap.id} class="capability-item">
              <span class="capability-item-action">{cap.action}</span>
              <span class="capability-item-routing">
                {cap.routing === "cloud" ? "☁️" : "💻"}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>
        {`
        .capability-card {
          background: linear-gradient(135deg, #0f0f12 0%, #111114 100%);
          border: 1px solid rgba(74, 222, 128, 0.1);
          border-radius: 16px;
          overflow: hidden;
        }

        .capability-card-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          padding: 1.25rem;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.2s;
        }

        .capability-card-header:hover {
          background: rgba(74, 222, 128, 0.03);
        }

        .capability-card-icon {
          width: 48px;
          height: 48px;
          background: rgba(74, 222, 128, 0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .capability-card-emoji {
          font-size: 1.5rem;
        }

        .capability-card-info {
          flex: 1;
          min-width: 0;
        }

        .capability-card-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #f0ede8;
          font-family: 'Geist Mono', monospace;
        }

        .capability-card-count {
          font-size: 0.75rem;
          color: #4ade80;
        }

        .capability-card-chevron {
          width: 20px;
          height: 20px;
          color: #6b6560;
          transition: transform 0.2s;
        }

        .capability-card-chevron.expanded {
          transform: rotate(180deg);
        }

        .capability-card-list {
          border-top: 1px solid rgba(74, 222, 128, 0.08);
          padding: 0.5rem;
        }

        .capability-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          transition: background 0.15s;
        }

        .capability-item:hover {
          background: rgba(74, 222, 128, 0.05);
        }

        .capability-item-action {
          font-size: 0.8125rem;
          font-family: 'Geist Mono', monospace;
          color: #a8a29e;
        }

        .capability-item-routing {
          font-size: 0.75rem;
          opacity: 0.6;
        }
        `}
      </style>
    </div>
  );
}
