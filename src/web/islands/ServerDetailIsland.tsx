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

import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import VitrineHeader from "../components/layout/VitrineHeader.tsx";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { getMockData } from "../data/ui-mock-data.ts";
import SchemaViewer from "../components/shared/SchemaViewer.tsx";

interface ToolEntry {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  inputSchema: Record<string, unknown> | null;
  uiMeta: {
    resourceUri: string;
    emits?: string[];
    accepts?: string[];
  } | null;
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
    <div class="min-h-screen bg-[#0a0908] text-[#f0ede8] font-['Inter',-apple-system,sans-serif] pt-[60px] flex flex-col">
      {/* Site header */}
      <VitrineHeader activePage="catalog" />

      {/* Node header bar */}
      <header class="flex items-center justify-between px-6 py-3 bg-[rgba(15,15,18,0.95)] border-b border-pml-accent/[0.06] sticky top-[60px] z-[90] backdrop-blur-[12px]">
        <div class="flex items-center gap-2">
          <a
            href="/catalog"
            class="flex items-center justify-center w-7 h-7 rounded-md text-stone-500 no-underline transition-all duration-150 hover:bg-pml-accent/[0.08] hover:text-pml-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeWidth="2" strokeLinecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div class="flex items-center gap-2 text-[0.8125rem]">
            <a href="/catalog" class="text-stone-500 no-underline transition-colors duration-150 hover:text-pml-accent">
              Catalog
            </a>
            <span class="text-[#3a3835]">/</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-[#f0ede8] font-medium bg-transparent border-none cursor-pointer px-2 py-1 -mx-2 -my-1 rounded transition-colors duration-150 hover:bg-pml-accent/[0.08]"
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
          {/* Prev/Next navigation */}
          <div class="flex items-center gap-2 bg-pml-accent/[0.04] border border-pml-accent/10 rounded-lg p-1">
            {prevNode ? (
              <a
                href={`/catalog/${prevNode.id}`}
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-pml-accent/[0.12] hover:text-pml-accent"
                title={prevNode.name}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
                <span class="font-['Geist_Mono',monospace] font-medium max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {prevNode.name}
                </span>
              </a>
            ) : (
              <span class="flex items-center gap-1.5 p-1.5 rounded-md text-stone-400 opacity-25 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6" />
                </svg>
              </span>
            )}
            <span class="text-[0.8125rem] font-['Geist_Mono',monospace] font-semibold text-[#f0ede8] px-2 py-1 min-w-[48px] text-center">
              {currentIndex + 1}<span class="text-stone-500 mx-0.5">/</span>{allNodes.length}
            </span>
            {nextNode ? (
              <a
                href={`/catalog/${nextNode.id}`}
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-pml-accent/[0.12] hover:text-pml-accent"
                title={nextNode.name}
              >
                <span class="font-['Geist_Mono',monospace] font-medium max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {nextNode.name}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <span class="flex items-center gap-1.5 p-1.5 rounded-md text-stone-400 opacity-25 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
                  <path strokeWidth="2.5" strokeLinecap="round" d="M9 6l6 6-6 6" />
                </svg>
              </span>
            )}
          </div>
          <span class="text-xs font-['Geist_Mono',monospace] text-stone-500 bg-pml-accent/[0.06] px-2.5 py-1 rounded">
            {tools.length} tools
          </span>
        </div>
      </header>

      {/* Node dropdown navigation */}
      {showNodeNav && (
        <div class="fixed top-[108px] left-0 right-0 bg-[#0f0f12] border-b border-pml-accent/10 p-6 z-[89] max-h-[50vh] overflow-y-auto animate-[dropIn_0.15s_ease-out]">
          <div class="flex flex-wrap gap-1.5">
            {allNodes.map((node) => (
              <a
                key={node.id}
                href={`/catalog/${node.id}`}
                class={`inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] no-underline bg-[#141418] border rounded transition-all duration-[120ms] ${
                  node.id === serverId
                    ? "bg-pml-accent/[0.12] border-pml-accent text-pml-accent"
                    : "text-stone-400 border-pml-accent/[0.06] hover:bg-pml-accent/[0.08] hover:border-pml-accent/20 hover:text-[#f0ede8]"
                }`}
              >
                <span class="text-xs">{node.icon}</span>
                <span class="font-['Geist_Mono',monospace]">{node.name}</span>
                <span class="font-['Geist_Mono',monospace] text-[0.5625rem] text-stone-500 bg-pml-accent/[0.06] px-1 py-px rounded-sm">
                  {node.toolCount}
                </span>
              </a>
            ))}
          </div>
          <button
            type="button"
            class="block mx-auto mt-3 px-4 py-1.5 text-[0.6875rem] text-stone-500 bg-transparent border border-pml-accent/10 rounded cursor-pointer transition-all duration-150 hover:border-pml-accent/30 hover:text-stone-400"
            onClick={() => setShowNodeNav(false)}
          >
            Close
          </button>
        </div>
      )}

      {/* Node info + search */}
      <div class="flex items-center justify-between gap-8 px-6 py-4 border-b border-pml-accent/[0.04]">
        <p class="text-sm text-stone-400 flex-1 leading-relaxed">
          {description || `Tools for ${displayName.toLowerCase()} operations`}
        </p>
        <div class="relative w-[220px] flex-shrink-0">
          <svg
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Filter tools..."
            class="w-full py-1.5 pl-8 pr-2.5 text-xs text-[#f0ede8] bg-[#141418] border border-pml-accent/[0.08] rounded-md outline-none transition-colors duration-150 placeholder:text-stone-500 focus:border-pml-accent/25"
          />
        </div>
      </div>

      {/* Prefix filter pills */}
      {prefixes.length > 1 && (
        <div class="flex flex-wrap gap-1.5 px-6 py-3 border-b border-pml-accent/[0.04]">
          <button
            type="button"
            class={`px-2.5 py-1 text-[0.6875rem] font-['Geist_Mono',monospace] bg-transparent border rounded cursor-pointer transition-all duration-150 ${
              !activePrefix
                ? "bg-pml-accent/10 border-pml-accent text-pml-accent"
                : "text-stone-500 border-pml-accent/[0.08] hover:border-pml-accent/20 hover:text-stone-400"
            }`}
            onClick={() => setActivePrefix(null)}
          >
            All ({tools.length})
          </button>
          {prefixes.slice(0, 8).map((prefix) => (
            <button
              key={prefix}
              type="button"
              class={`px-2.5 py-1 text-[0.6875rem] font-['Geist_Mono',monospace] bg-transparent border rounded cursor-pointer transition-all duration-150 ${
                activePrefix === prefix
                  ? "bg-pml-accent/10 border-pml-accent text-pml-accent"
                  : "text-stone-500 border-pml-accent/[0.08] hover:border-pml-accent/20 hover:text-stone-400"
              }`}
              onClick={() => setActivePrefix(activePrefix === prefix ? null : prefix)}
            >
              {prefix.replace(/_/g, " ")} ({prefixGroups.get(prefix)?.length})
            </button>
          ))}
          {prefixes.length > 8 && (
            <span class="px-2 py-1 text-[0.6875rem] text-stone-500">
              +{prefixes.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* Tools grid (compact chips) */}
      <div class="flex flex-wrap gap-1.5 px-6 py-4 min-h-[80px]">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            class={`inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-['Geist_Mono',monospace] border rounded cursor-pointer transition-all duration-[120ms] max-w-[180px] whitespace-nowrap overflow-hidden text-ellipsis ${
              selectedTool?.id === tool.id
                ? tool.uiMeta?.resourceUri
                  ? "bg-pml-accent/[0.12] border-cyan-400 text-pml-accent shadow-[0_0_0_1px_rgba(78,205,196,0.2)]"
                  : "bg-pml-accent/[0.12] border-pml-accent text-pml-accent"
                : tool.uiMeta?.resourceUri
                  ? "text-stone-400 bg-[#141418] border-cyan-400/15 hover:bg-pml-accent/[0.06] hover:border-cyan-400/30 hover:text-[#f0ede8]"
                  : "text-stone-400 bg-[#141418] border-pml-accent/[0.06] hover:bg-pml-accent/[0.06] hover:border-pml-accent/15 hover:text-[#f0ede8]"
            }`}
            onClick={() => setSelectedTool(selectedTool?.id === tool.id ? null : tool)}
            title={tool.description || tool.name}
          >
            <span class="overflow-hidden text-ellipsis">{getShortName(tool)}</span>
            {tool.uiMeta?.resourceUri && <span class="text-[0.5rem] text-cyan-400 -ml-px">◉</span>}
            {tool.routing === "cloud" && <span class="text-[0.625rem] opacity-60">☁</span>}
          </button>
        ))}
        {filteredTools.length === 0 && (
          <div class="w-full py-8 text-center text-[0.8125rem] text-stone-500">
            No tools match "{search}"
          </div>
        )}
      </div>

      {/* Selected tool detail - Split layout with UI preview */}
      {selectedTool && (
        <div
          class={`mx-6 mb-6 bg-[#0f0f12] border rounded-[10px] overflow-hidden animate-[slideUp_0.2s_ease-out] ${
            selectedTool.uiMeta?.resourceUri
              ? "grid grid-cols-2 max-[900px]:grid-cols-1 border-cyan-400/15"
              : "border-pml-accent/[0.08]"
          }`}
        >
          {/* Left column: Info + Schema */}
          <div class="flex flex-col">
            <div class="px-5 py-4 border-b border-pml-accent/[0.06]">
              <div class="flex items-center gap-3 mb-2">
                <code class="font-['Geist_Mono',monospace] text-[0.9375rem] font-semibold text-pml-accent">
                  {selectedTool.name}
                </code>
                <div class="flex gap-1.5 flex-1">
                  {selectedTool.uiMeta?.resourceUri && (
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 text-[0.625rem] font-['Geist_Mono',monospace] font-medium rounded bg-cyan-400/[0.12] text-cyan-400 border border-cyan-400/25 uppercase tracking-wide"
                      title="Has UI Component"
                    >
                      <span class="text-[0.5rem]">◉</span> UI
                    </span>
                  )}
                  {selectedTool.routing === "cloud" && (
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[0.625rem] font-['Geist_Mono',monospace] font-medium rounded bg-blue-400/10 text-blue-400 uppercase tracking-wide">
                      ☁ Cloud
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  class="w-6 h-6 flex items-center justify-center bg-transparent border-none text-stone-500 text-xl cursor-pointer rounded transition-all duration-150 ml-auto hover:bg-pml-accent/10 hover:text-pml-accent"
                  onClick={() => setSelectedTool(null)}
                >
                  ×
                </button>
              </div>
              <p class="text-[0.8125rem] text-stone-400 leading-normal">
                {selectedTool.description || "No description"}
              </p>
            </div>

            {/* UI Capabilities (emits/accepts) */}
            {selectedTool.uiMeta && (selectedTool.uiMeta.emits?.length || selectedTool.uiMeta.accepts?.length) && (
              <div class="flex gap-6 px-5 py-3 bg-cyan-400/[0.03] border-b border-cyan-400/[0.08]">
                {selectedTool.uiMeta.emits && selectedTool.uiMeta.emits.length > 0 && (
                  <div class="flex items-center gap-2">
                    <span class="text-[0.625rem] font-semibold uppercase tracking-wider text-stone-500">
                      Emits
                    </span>
                    <div class="flex flex-wrap gap-1">
                      {selectedTool.uiMeta.emits.map((e) => (
                        <span
                          key={e}
                          class="text-[0.625rem] font-['Geist_Mono',monospace] px-1.5 py-0.5 rounded-sm bg-pml-accent/10 text-pml-accent"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedTool.uiMeta.accepts && selectedTool.uiMeta.accepts.length > 0 && (
                  <div class="flex items-center gap-2">
                    <span class="text-[0.625rem] font-semibold uppercase tracking-wider text-stone-500">
                      Accepts
                    </span>
                    <div class="flex flex-wrap gap-1">
                      {selectedTool.uiMeta.accepts.map((a) => (
                        <span
                          key={a}
                          class="text-[0.625rem] font-['Geist_Mono',monospace] px-1.5 py-0.5 rounded-sm bg-green-400/10 text-green-400"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Schema */}
            <div class="p-5 flex-1 overflow-y-auto max-h-[350px]">
              <div class="flex items-center justify-between mb-3">
                <span class="text-[0.6875rem] font-semibold uppercase tracking-wider text-stone-500">
                  Input Schema
                </span>
                {selectedTool.inputSchema && (
                  <span class="text-[0.625rem] font-['Geist_Mono',monospace] text-stone-500 bg-pml-accent/[0.04] px-1.5 py-0.5 rounded-sm">
                    {Object.keys((selectedTool.inputSchema as any).properties || {}).length} params
                  </span>
                )}
              </div>
              {selectedTool.inputSchema ? (
                <SchemaViewer schema={selectedTool.inputSchema} />
              ) : (
                <div class="text-[0.8125rem] text-stone-500">No parameters required</div>
              )}
            </div>
          </div>

          {/* Right column: UI Preview - Uses real component with AppBridge */}
          {selectedTool.uiMeta?.resourceUri && (
            <div class="flex flex-col bg-gradient-to-br from-cyan-400/[0.03] to-cyan-400/[0.01] border-l border-cyan-400/10">
              <div class="flex items-center justify-between px-4 py-3 border-b border-cyan-400/[0.08] bg-cyan-400/[0.04]">
                <span class="text-[0.6875rem] font-semibold uppercase tracking-wider text-cyan-400">
                  Component Preview
                </span>
                <code class="text-[0.625rem] font-['Geist_Mono',monospace] text-stone-500 bg-black/20 px-1.5 py-0.5 rounded-sm">
                  {selectedTool.uiMeta.resourceUri.replace("ui://mcp-std/", "")}
                </code>
              </div>
              <div class="flex-1 relative min-h-[280px] flex items-stretch">
                <UiPreviewWithBridge
                  resourceUri={selectedTool.uiMeta.resourceUri}
                  toolName={selectedTool.name}
                />
                <div class="absolute bottom-2 right-2 pointer-events-none">
                  <span class="text-[0.5625rem] font-['Geist_Mono',monospace] text-[#4a4540] bg-black/60 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                    Live component preview
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vitrine Footer */}
      <footer class="mt-auto p-8 bg-[#08080a] border-t border-pml-accent/[0.08]">
        <div class="max-w-[1200px] mx-auto flex justify-between items-center max-[768px]:flex-col max-[768px]:gap-6 max-[768px]:text-center">
          <div class="flex items-center gap-4">
            <span class="font-['Instrument_Serif',Georgia,serif] text-[1.375rem] text-pml-accent">
              Casys PML
            </span>
            <span class="text-xs text-stone-500 uppercase tracking-widest">
              Procedural Memory Layer
            </span>
          </div>
          <div class="flex gap-8">
            <a href="https://casys.ai" target="_blank" rel="noopener" class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-pml-accent">
              Casys.ai
            </a>
            <a href="https://github.com/Casys-AI/casys-pml" target="_blank" rel="noopener" class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-pml-accent">
              GitHub
            </a>
            <a href="/docs" class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-pml-accent">
              Docs
            </a>
            <a href="/catalog" class="text-stone-400 no-underline text-sm transition-colors duration-200 hover:text-pml-accent">
              Catalog
            </a>
          </div>
        </div>
      </footer>

      {/* Minimal style block for keyframe animations only */}
      <style>
        {`
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
        `}
      </style>
    </div>
  );
}

/**
 * UI Preview component that loads the real MCP Apps component
 * and sends mock data via AppBridge protocol
 */
function UiPreviewWithBridge({
  resourceUri,
  toolName,
}: {
  resourceUri: string;
  toolName: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");

  // Convert mock data to MCP content format
  const resultToMcpContent = useCallback((result: unknown): Array<{ type: "text"; text: string }> => {
    if (result === null || result === undefined) {
      return [{ type: "text", text: "null" }];
    }
    if (typeof result === "string") {
      return [{ type: "text", text: result }];
    }
    return [{ type: "text", text: JSON.stringify(result, null, 2) }];
  }, []);

  // Setup bridge when iframe loads
  const setupBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      console.warn("[UiPreviewWithBridge] No contentWindow");
      return;
    }

    // Clean up existing bridge
    if (bridgeRef.current) {
      bridgeRef.current.close().catch(() => {});
    }

    // Create new bridge
    const bridge = new AppBridge(
      null, // No MCP client - we're not proxying to a server
      { name: "Catalog Preview", version: "1.0.0" },
      { openLinks: {}, logging: {} },
      { hostContext: { theme: "dark", displayMode: "inline" } },
    );

    // Get mock data for this component
    const mockData = getMockData(resourceUri);

    // When UI initializes, send mock data
    bridge.oninitialized = () => {
      console.log(`[UiPreviewWithBridge] UI initialized: ${toolName}`);
      setStatus("connected");

      // Send mock data as tool result
      bridge.sendToolResult({
        content: resultToMcpContent(mockData),
        isError: false,
      });
    };

    bridgeRef.current = bridge;

    // Create transport and connect
    const transport = new PostMessageTransport(
      iframe.contentWindow,
      iframe.contentWindow,
    );

    bridge.connect(transport).then(() => {
      console.log(`[UiPreviewWithBridge] Bridge connected, loading iframe`);
      // Set iframe src after bridge is ready
      iframe.src = `/api/ui/resource?uri=${encodeURIComponent(resourceUri)}`;
    }).catch((err) => {
      console.error(`[UiPreviewWithBridge] Bridge error:`, err);
      setStatus("error");
    });
  }, [resourceUri, toolName, resultToMcpContent]);

  // Initialize on mount
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      setupBridge();
    }

    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.close().catch(() => {});
        bridgeRef.current = null;
      }
    };
  }, [resourceUri]);

  return (
    <div class="relative w-full h-full min-h-[280px]">
      <iframe
        ref={iframeRef}
        title={`UI Preview: ${toolName}`}
        sandbox="allow-scripts allow-same-origin"
        class="w-full h-full min-h-[280px] border-none bg-[#1a1a1a]"
      />
      {status === "loading" && (
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-['Geist_Mono',monospace] flex items-center gap-2 px-4 py-2 rounded-md bg-black/80 text-cyan-400">
          <span class="w-2 h-2 rounded-full bg-current animate-[pulse_1.5s_ease-in-out_infinite]" />
          Connecting...
        </div>
      )}
      {status === "error" && (
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-['Geist_Mono',monospace] flex items-center gap-2 px-4 py-2 rounded-md bg-black/80 text-red-400">
          Connection failed
        </div>
      )}

      {/* Minimal style block for pulse animation */}
      <style>
        {`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        `}
      </style>
    </div>
  );
}
