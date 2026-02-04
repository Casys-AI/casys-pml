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

function extractPrefixGroups(tools: ToolEntry[]): Map<string, ToolEntry[]> {
  const groups = new Map<string, ToolEntry[]>();

  for (const tool of tools) {
    const parts = tool.name.split("_");
    const prefix = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : parts[0];

    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(tool);
  }

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

  const currentIndex = allNodes.findIndex((n) => n.id === serverId);
  const prevNode = currentIndex > 0 ? allNodes[currentIndex - 1] : null;
  const nextNode = currentIndex < allNodes.length - 1 ? allNodes[currentIndex + 1] : null;

  const prefixGroups = useMemo(() => extractPrefixGroups(tools), [tools]);
  const prefixes = useMemo(() => [...prefixGroups.keys()], [prefixGroups]);

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

  useEffect(() => {
    if (filteredTools.length > 0) {
      const stillVisible = selectedTool && filteredTools.some(t => t.id === selectedTool.id);
      if (!stillVisible) {
        setSelectedTool(filteredTools[0]);
      }
    } else {
      setSelectedTool(null);
    }
  }, [activePrefix, search]);

  const getShortName = (tool: ToolEntry): string => {
    if (!activePrefix) return tool.name;
    if (tool.name.startsWith(activePrefix + "_")) {
      return tool.name.slice(activePrefix.length + 1);
    }
    return tool.name;
  };

  return (
    <div class="min-h-screen bg-stone-950 text-stone-100 font-sans pt-[60px]">
      <VitrineHeader activePage="catalog" />

      <header class="flex items-center justify-between py-3 px-6 bg-stone-950/95 border-b border-amber-500/5 sticky top-[60px] z-[90] backdrop-blur-xl">
        <div class="flex items-center gap-2">
          <a href="/catalog" class="flex items-center justify-center w-7 h-7 rounded-md text-stone-500 no-underline transition-all duration-150 hover:bg-amber-500/10 hover:text-amber-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeWidth="2" strokeLinecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div class="flex items-center gap-2 text-[0.8125rem]">
            <a href="/catalog" class="text-stone-500 no-underline transition-colors duration-150 hover:text-amber-400">Catalog</a>
            <span class="text-stone-700">/</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-stone-100 font-medium bg-transparent border-none cursor-pointer py-1 px-2 -my-1 -mx-2 rounded transition-colors duration-150 hover:bg-amber-500/10"
              onClick={() => setShowNodeNav(!showNodeNav)}
            >
              <span class="text-base">{icon}</span>
              {displayName}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" class="opacity-50">
                <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 bg-amber-500/5 border border-amber-500/10 rounded-lg p-1">
            {prevNode ? (
              <a href={`/catalog/${prevNode.id}`} class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-amber-500/15 hover:text-amber-400" title={prevNode.name}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
                <span class="font-mono font-medium max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">{prevNode.name}</span>
              </a>
            ) : (
              <span class="flex items-center gap-1.5 py-1.5 px-1.5 opacity-25 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            )}
            <span class="text-[0.8125rem] font-mono font-semibold text-stone-100 py-1 px-2 min-w-[48px] text-center">{currentIndex + 1}<span class="text-stone-500 mx-0.5">/</span>{allNodes.length}</span>
            {nextNode ? (
              <a href={`/catalog/${nextNode.id}`} class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-amber-500/15 hover:text-amber-400" title={nextNode.name}>
                <span class="font-mono font-medium max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">{nextNode.name}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <span class="flex items-center gap-1.5 py-1.5 px-1.5 opacity-25 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </span>
            )}
          </div>
          <span class="text-xs font-mono text-stone-500 bg-amber-500/5 py-1 px-2.5 rounded">{tools.length} tools</span>
        </div>
      </header>

      {showNodeNav && (
        <div class="fixed top-[108px] left-0 right-0 bg-stone-950 border-b border-amber-500/10 p-6 z-[89] max-h-[50vh] overflow-y-auto animate-[dropIn_0.15s_ease-out]">
          <div class="flex flex-wrap gap-1.5">
            {allNodes.map((node) => (
              <a
                key={node.id}
                href={`/catalog/${node.id}`}
                class={`inline-flex items-center gap-1 py-1.5 px-2 text-[0.6875rem] text-stone-400 no-underline bg-stone-900 border border-amber-500/5 rounded transition-all duration-150 hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-stone-100 ${node.id === serverId ? "bg-amber-500/15 border-amber-400 text-amber-400" : ""}`}
              >
                <span class="text-xs">{node.icon}</span>
                <span class="font-mono">{node.name}</span>
                <span class="font-mono text-[0.5625rem] text-stone-500 bg-amber-500/5 py-0.5 px-1 rounded-sm">{node.toolCount}</span>
              </a>
            ))}
          </div>
          <button
            type="button"
            class="block mx-auto mt-3 py-1.5 px-4 text-[0.6875rem] text-stone-500 bg-transparent border border-amber-500/10 rounded cursor-pointer transition-all duration-150 hover:border-amber-500/30 hover:text-stone-400"
            onClick={() => setShowNodeNav(false)}
          >
            Close
          </button>
        </div>
      )}

      <div class="flex items-center justify-between gap-8 py-4 px-6 border-b border-amber-500/5">
        <p class="text-sm text-stone-400 flex-1 leading-relaxed">{description || `Tools for ${displayName.toLowerCase()} operations`}</p>
        <div class="relative w-[220px] shrink-0">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Filter tools..."
            class="w-full py-1.5 px-2.5 pl-8 text-xs text-stone-100 bg-stone-900 border border-amber-500/10 rounded-md outline-none transition-colors duration-150 placeholder:text-stone-500 focus:border-amber-500/25"
          />
        </div>
      </div>

      {prefixes.length > 1 && (
        <div class="flex flex-wrap gap-1.5 py-3 px-6 border-b border-amber-500/5">
          <button
            type="button"
            class={`py-1 px-2.5 text-[0.6875rem] font-mono text-stone-500 bg-transparent border border-amber-500/10 rounded cursor-pointer transition-all duration-150 hover:border-amber-500/20 hover:text-stone-400 ${!activePrefix ? "bg-amber-500/10 border-amber-400 text-amber-400" : ""}`}
            onClick={() => setActivePrefix(null)}
          >
            All ({tools.length})
          </button>
          {prefixes.slice(0, 8).map((prefix) => (
            <button
              key={prefix}
              type="button"
              class={`py-1 px-2.5 text-[0.6875rem] font-mono text-stone-500 bg-transparent border border-amber-500/10 rounded cursor-pointer transition-all duration-150 hover:border-amber-500/20 hover:text-stone-400 ${activePrefix === prefix ? "bg-amber-500/10 border-amber-400 text-amber-400" : ""}`}
              onClick={() => setActivePrefix(activePrefix === prefix ? null : prefix)}
            >
              {prefix.replace(/_/g, " ")} ({prefixGroups.get(prefix)?.length})
            </button>
          ))}
          {prefixes.length > 8 && (
            <span class="py-1 px-2 text-[0.6875rem] text-stone-500">+{prefixes.length - 8} more</span>
          )}
        </div>
      )}

      <div class="flex flex-wrap gap-1.5 py-4 px-6 min-h-[80px]">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            class={`inline-flex items-center gap-1 py-1.5 px-2 text-[0.6875rem] font-mono text-stone-400 bg-stone-900 border border-amber-500/5 rounded cursor-pointer transition-all duration-150 max-w-[180px] whitespace-nowrap overflow-hidden text-ellipsis hover:bg-amber-500/5 hover:border-amber-500/15 hover:text-stone-100 ${selectedTool?.id === tool.id ? "bg-amber-500/15 border-amber-400 text-amber-400" : ""}`}
            onClick={() => setSelectedTool(selectedTool?.id === tool.id ? null : tool)}
            title={tool.description || tool.name}
          >
            <span class="overflow-hidden text-ellipsis">{getShortName(tool)}</span>
            {tool.routing === "cloud" && <span class="text-[0.625rem] opacity-60">☁</span>}
          </button>
        ))}
        {filteredTools.length === 0 && (
          <div class="w-full py-8 text-center text-[0.8125rem] text-stone-500">No tools match "{search}"</div>
        )}
      </div>

      {selectedTool && (
        <div class="mx-6 mb-6 bg-stone-950 border border-amber-500/10 rounded-[10px] overflow-hidden animate-[slideUp_0.2s_ease-out]">
          <div class="p-5 border-b border-amber-500/5">
            <div class="flex items-center justify-between mb-2">
              <code class="font-mono text-[0.9375rem] font-semibold text-amber-400">{selectedTool.name}</code>
              <button
                type="button"
                class="w-6 h-6 flex items-center justify-center bg-transparent border-none text-stone-500 text-xl cursor-pointer rounded transition-all duration-150 hover:bg-amber-500/10 hover:text-amber-400"
                onClick={() => setSelectedTool(null)}
              >
                ×
              </button>
            </div>
            <p class="text-[0.8125rem] text-stone-400 leading-relaxed">
              {selectedTool.description || "No description"}
            </p>
          </div>

          <div class="p-5">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-500">Input Schema</span>
              {selectedTool.inputSchema && (
                <span class="text-[0.625rem] font-mono text-stone-500 bg-amber-500/5 py-0.5 px-1.5 rounded-sm">
                  {Object.keys((selectedTool.inputSchema as any).properties || {}).length} params
                </span>
              )}
            </div>
            {selectedTool.inputSchema ? (
              <SchemaViewer schema={selectedTool.inputSchema} />
            ) : (
              <div class="p-4 text-center text-xs text-stone-500 bg-amber-500/[0.02] rounded-md">No parameters required</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SchemaViewer({ schema }: { schema: Record<string, unknown> }) {
  const properties = (schema.properties || {}) as Record<string, SchemaProperty>;
  const required = (schema.required || []) as string[];

  if (Object.keys(properties).length === 0) {
    return <div class="p-4 text-center text-xs text-stone-500 bg-amber-500/[0.02] rounded-md">No parameters</div>;
  }

  return (
    <div class="flex flex-col gap-px bg-amber-500/[0.03] rounded-md overflow-hidden">
      {Object.entries(properties).map(([name, prop]) => (
        <CompactPropertyRow
          key={name}
          name={name}
          property={prop}
          required={required.includes(name)}
        />
      ))}
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
    <div class="bg-stone-900" style={{ paddingLeft: `calc(0.75rem + ${depth}rem)` }}>
      <div class="flex items-center justify-between gap-2 py-2 pr-3">
        <div class="flex items-center gap-1.5 min-w-0">
          {hasNested && (
            <button
              type="button"
              class={`w-4 h-4 p-0 flex items-center justify-center bg-transparent border-none cursor-pointer text-stone-500 transition-all duration-150 shrink-0 hover:text-amber-400 ${expanded ? "rotate-90" : ""}`}
              onClick={() => setExpanded(!expanded)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12">
                <path strokeWidth="2" strokeLinecap="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          <code class="font-mono text-xs font-medium text-stone-100 whitespace-nowrap overflow-hidden text-ellipsis">{name}</code>
          {required && <span class="text-red-400 font-semibold text-xs">*</span>}
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          {property.enum && (
            <span class="text-[0.5625rem] font-medium uppercase py-0.5 px-1 bg-green-400/10 text-green-400 rounded-sm">enum</span>
          )}
          <span class="font-mono text-[0.625rem] text-amber-400 bg-amber-500/5 py-0.5 px-1.5 rounded-sm">{typeLabel}</span>
        </div>
      </div>

      {property.description && (
        <p class="mt-1 text-[0.6875rem] leading-relaxed text-stone-500 pr-3">{property.description}</p>
      )}

      {property.enum && property.enum.length <= 6 && (
        <div class="flex flex-wrap gap-1 mt-1 pr-3">
          {property.enum.map((v, i) => (
            <code key={i} class="font-mono text-[0.5625rem] py-0.5 px-1 bg-green-400/5 text-green-400 rounded-sm">{JSON.stringify(v)}</code>
          ))}
        </div>
      )}

      {property.default !== undefined && (
        <div class="mt-1 text-[0.625rem] text-stone-500 pr-3">
          default: <code class="font-mono text-blue-400">{JSON.stringify(property.default)}</code>
        </div>
      )}

      {expanded && hasNested && (
        <div class="mt-1.5 -mx-3 -mb-2 border-t border-amber-500/[0.03]">
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
