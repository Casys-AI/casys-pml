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

interface ServerCardData {
  id: string;
  displayName: string;
  toolCount: number;
  description: string | null;
  routing: "local" | "cloud";
  isStdCategory: boolean;
  sampleTools: string[];
}

interface CapabilityCardData {
  namespace: string;
  count: number;
  capabilities: CatalogEntry[];
}

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

    return cards.sort((a, b) => b.toolCount - a.toolCount);
  }, [entries]);

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

  const sidebar = (
    <div class="flex flex-col gap-6">
      <div class="flex justify-between items-center">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-stone-500">Filters</h2>
        {hasActiveFilters && (
          <button type="button" class="text-xs text-amber-400 bg-transparent border-none cursor-pointer p-0 transition-opacity duration-200 hover:opacity-80" onClick={clearFilters}>
            Clear all
          </button>
        )}
      </div>

      <div class="flex flex-col gap-3">
        <label class="text-xs font-medium uppercase tracking-wide text-stone-400">Search</label>
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={filters.search}
            onInput={(e) => setFilters({ ...filters, search: (e.target as HTMLInputElement).value })}
            placeholder="Search servers & tools..."
            class="w-full py-2.5 px-3 pl-9 text-sm text-stone-100 bg-stone-950 border border-amber-500/10 rounded-lg outline-none transition-all duration-200 placeholder:text-stone-500 focus:border-amber-500/30 focus:shadow-[0_0_0_3px_rgba(255,184,111,0.05)]"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1 p-3.5 bg-stone-950 border border-amber-500/10 rounded-lg">
          <span class="text-2xl font-semibold font-mono text-amber-400">{serverCards.length}</span>
          <span class="text-xs text-stone-500 uppercase tracking-wide">Servers</span>
        </div>
        <div class="flex flex-col gap-1 p-3.5 bg-stone-950 border border-amber-500/10 rounded-lg">
          <span class="text-2xl font-semibold font-mono text-amber-400">{entries.filter(e => e.recordType === "mcp-tool").length}</span>
          <span class="text-xs text-stone-500 uppercase tracking-wide">MCP Tools</span>
        </div>
        {capabilityCount > 0 && (
          <div class="flex flex-col gap-1 p-3.5 bg-stone-950 border border-amber-500/10 rounded-lg">
            <span class="text-2xl font-semibold font-mono text-amber-400">{capabilityCount}</span>
            <span class="text-xs text-stone-500 uppercase tracking-wide">Capabilities</span>
          </div>
        )}
      </div>

      <div class="pt-4 border-t border-amber-500/10 text-[0.8125rem] text-stone-500">
        Showing <strong class="text-amber-400 font-semibold">{filteredCards.length}</strong> of {serverCards.length} servers
      </div>
    </div>
  );

  return (
    <CatalogLayout sidebar={sidebar} user={user} isCloudMode={isCloudMode}>
      <div class="mb-8">
        <h1 class="font-serif text-[2rem] font-normal text-stone-100 mb-2">MCP Server Catalog</h1>
        <p class="text-base text-stone-400 max-w-[600px]">
          Browse available MCP servers and their tools. Click a server to explore its API.
        </p>
      </div>

      {filteredCapabilities.length > 0 && (
        <>
          <h2 class="text-sm font-semibold uppercase tracking-wide text-stone-500 mb-4">Learned Capabilities</h2>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
            {filteredCapabilities.map((card) => (
              <CapabilityCard key={card.namespace} card={card} />
            ))}
          </div>
        </>
      )}

      {filteredCards.length > 0 && (
        <>
          <h2 class="text-sm font-semibold uppercase tracking-wide text-stone-500 mb-4 mt-10">
            MCP Servers
          </h2>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
            {filteredCards.map((card) => (
              <ServerCard key={card.id} card={card} />
            ))}
          </div>
        </>
      )}

      {filteredCards.length === 0 && filteredCapabilities.length === 0 && (
        <div class="text-center py-16 px-8 bg-stone-950 border border-amber-500/10 rounded-xl">
          <svg class="w-12 h-12 mx-auto mb-4 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
            <path strokeWidth="1.5" d="m21 21-4.35-4.35" />
          </svg>
          <h3 class="text-lg text-stone-100 mb-2">No results found</h3>
          <p class="text-sm text-stone-500">Try adjusting your search query</p>
        </div>
      )}
    </CatalogLayout>
  );
}

function generateServerDescription(entries: CatalogEntry[], displayName: string): string {
  const withDesc = entries.find((e) => e.description);
  if (withDesc && withDesc.description) {
    const firstSentence = withDesc.description.split(".")[0];
    if (firstSentence.length > 0 && firstSentence.length < 80) {
      return firstSentence;
    }
  }
  return `${entries.length} tools from ${displayName}`;
}

function ServerCard({ card }: { card: ServerCardData }) {
  const icon = getServerIcon(card.displayName);

  return (
    <a
      href={`/catalog/${card.id}`}
      class="group flex items-start gap-4 p-5 bg-gradient-to-br from-stone-950 to-stone-900 border border-amber-500/10 rounded-2xl cursor-pointer no-underline transition-all duration-300 ease-out relative overflow-hidden hover:border-amber-500/20 hover:-translate-y-1 hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.4)]"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div class="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
        <span class="text-2xl">{icon}</span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-1.5">
          <h3 class="text-lg font-semibold text-stone-100 whitespace-nowrap overflow-hidden text-ellipsis">{card.displayName}</h3>
          <span class="text-xs font-mono text-amber-400 bg-amber-500/10 py-0.5 px-2 rounded shrink-0">{card.toolCount} tools</span>
        </div>

        <p class="text-sm leading-relaxed text-stone-400 mb-3">{card.description}</p>

        <div class="flex flex-wrap gap-1.5">
          {card.sampleTools.map((tool, i) => (
            <span key={i} class="text-[0.6875rem] font-mono text-stone-500 bg-white/[0.03] py-0.5 px-1.5 rounded-sm whitespace-nowrap">{tool}</span>
          ))}
          {card.toolCount > 3 && (
            <span class="text-[0.6875rem] font-mono text-amber-400 py-0.5 px-1.5">+{card.toolCount - 3}</span>
          )}
        </div>
      </div>

      <span class={`absolute top-4 right-10 text-[0.6875rem] ${card.routing === "cloud" ? "text-blue-400" : "text-stone-500"}`}>
        {card.routing === "cloud" ? "☁️ Cloud" : "💻 Local"}
      </span>

      <svg class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-amber-400 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </a>
  );
}

function CapabilityCard({ card }: { card: CapabilityCardData }) {
  const sampleActions = card.capabilities.slice(0, 3).map((c) => c.action || c.name);

  return (
    <a
      href={`/catalog/ns/${encodeURIComponent(card.namespace)}`}
      class="group flex items-start gap-4 p-5 bg-gradient-to-br from-stone-950 to-stone-900 border border-green-400/10 rounded-2xl cursor-pointer no-underline transition-all duration-300 ease-out relative overflow-hidden hover:border-green-400/25 hover:-translate-y-1 hover:shadow-[0_12px_24px_-8px_rgba(0,0,0,0.4)]"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-green-400/[0.03] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div class="w-12 h-12 bg-green-400/10 rounded-xl flex items-center justify-center shrink-0">
        <span class="text-2xl">⚡</span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-2">
          <h3 class="text-lg font-semibold text-stone-100 font-mono whitespace-nowrap overflow-hidden text-ellipsis">{card.namespace}</h3>
          <span class="text-xs font-mono text-green-400 bg-green-400/10 py-0.5 px-2 rounded shrink-0">{card.count} capabilities</span>
        </div>

        <div class="flex flex-wrap gap-1.5">
          {sampleActions.map((action, i) => (
            <span key={i} class="text-[0.6875rem] font-mono text-stone-500 bg-white/[0.03] py-0.5 px-1.5 rounded-sm whitespace-nowrap">{action}</span>
          ))}
          {card.count > 3 && (
            <span class="text-[0.6875rem] font-mono text-green-400 py-0.5 px-1.5">+{card.count - 3}</span>
          )}
        </div>
      </div>

      <svg class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-green-400 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </svg>
    </a>
  );
}
