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

  const currentNodeId = `ns/${namespace}`;
  const currentIndex = allNodes.findIndex((n) => n.id === currentNodeId || n.name.toLowerCase() === namespace.toLowerCase());
  const prevNode = currentIndex > 0 ? allNodes[currentIndex - 1] : null;
  const nextNode = currentIndex < allNodes.length - 1 ? allNodes[currentIndex + 1] : null;

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

  const getNodeUrl = (node: NodeNavItem) => {
    if (node.id.startsWith("ns/")) return `/catalog/${node.id}`;
    if (node.id.startsWith("std-")) return `/catalog/${node.id}`;
    return `/catalog/${node.id}`;
  };

  return (
    <div class="min-h-screen bg-stone-950 text-stone-100 font-sans pt-[60px]">
      <VitrineHeader activePage="catalog" />

      <header class="flex items-center justify-between py-3 px-6 bg-stone-950/95 border-b border-green-400/10 sticky top-[60px] z-[90] backdrop-blur-xl">
        <div class="flex items-center gap-2">
          <a href="/catalog" class="flex items-center justify-center w-7 h-7 rounded-md text-stone-500 no-underline transition-all duration-150 hover:bg-green-400/10 hover:text-green-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="16" height="16">
              <path strokeWidth="2" strokeLinecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div class="flex items-center gap-2 text-[0.8125rem]">
            <a href="/catalog" class="text-stone-500 no-underline transition-colors duration-150 hover:text-green-400">Catalog</a>
            <span class="text-stone-700">/</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-stone-100 font-medium bg-transparent border-none cursor-pointer py-1 px-2 -my-1 -mx-2 rounded transition-colors duration-150 hover:bg-green-400/10"
              onClick={() => setShowNodeNav(!showNodeNav)}
            >
              <span class="text-base">⚡</span>
              {namespace}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12" class="opacity-50">
                <path strokeWidth="2" strokeLinecap="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        <div class="flex items-center gap-4">
          {allNodes.length > 0 && (
            <div class="flex items-center gap-2 bg-green-400/5 border border-green-400/15 rounded-lg p-1">
              {prevNode ? (
                <a href={getNodeUrl(prevNode)} class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-green-400/15 hover:text-green-400" title={prevNode.name}>
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
                <a href={getNodeUrl(nextNode)} class="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-stone-400 no-underline transition-all duration-150 text-xs hover:bg-green-400/15 hover:text-green-400" title={nextNode.name}>
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
          )}
          <span class="text-xs font-mono text-green-400 bg-green-400/10 py-1 px-2.5 rounded">{capabilities.length} caps</span>
        </div>
      </header>

      {showNodeNav && (
        <div class="fixed top-[108px] left-0 right-0 bg-stone-950 border-b border-green-400/10 p-6 z-[89] max-h-[50vh] overflow-y-auto animate-[dropIn_0.15s_ease-out]">
          <div class="flex flex-wrap gap-1.5">
            {allNodes.map((node) => (
              <a
                key={node.id}
                href={getNodeUrl(node)}
                class={`inline-flex items-center gap-1 py-1.5 px-2 text-[0.6875rem] text-stone-400 no-underline bg-stone-900 border border-green-400/5 rounded transition-all duration-150 hover:bg-green-400/10 hover:border-green-400/20 hover:text-stone-100 ${node.name.toLowerCase() === namespace.toLowerCase() ? "bg-green-400/15 border-green-400 text-green-400" : ""}`}
              >
                <span class="text-xs">{node.icon}</span>
                <span class="font-mono">{node.name}</span>
                <span class="font-mono text-[0.5625rem] text-stone-500 bg-green-400/5 py-0.5 px-1 rounded-sm">{node.toolCount}</span>
              </a>
            ))}
          </div>
          <button
            type="button"
            class="block mx-auto mt-3 py-1.5 px-4 text-[0.6875rem] text-stone-500 bg-transparent border border-green-400/10 rounded cursor-pointer transition-all duration-150 hover:border-green-400/30 hover:text-stone-400"
            onClick={() => setShowNodeNav(false)}
          >
            Close
          </button>
        </div>
      )}

      <div class="flex items-center justify-between gap-8 py-4 px-6 border-b border-green-400/5">
        <p class="text-sm text-stone-400 flex-1">Learned capabilities in the <code class="font-mono text-green-400">{namespace}</code> namespace</p>
        <div class="relative w-[220px] shrink-0">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Filter capabilities..."
            class="w-full py-1.5 px-2.5 pl-8 text-xs text-stone-100 bg-stone-900 border border-green-400/10 rounded-md outline-none transition-colors duration-150 placeholder:text-stone-500 focus:border-green-400/30"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5 py-4 px-6 min-h-[60px]">
        {filteredCaps.map((cap) => (
          <button
            key={cap.id}
            type="button"
            class={`inline-flex items-center gap-1.5 py-1.5 px-2 text-[0.6875rem] font-mono text-stone-400 bg-stone-900 border border-green-400/10 rounded cursor-pointer transition-all duration-150 hover:bg-green-400/10 hover:border-green-400/20 hover:text-stone-100 ${selectedCap?.id === cap.id ? "bg-green-400/15 border-green-400 text-green-400" : ""}`}
            onClick={() => setSelectedCap(selectedCap?.id === cap.id ? null : cap)}
            title={cap.description || cap.name}
          >
            <span>{cap.action || cap.name}</span>
            {cap.toolsUsed.length > 0 && (
              <span class="text-[0.5625rem] text-pml-accent bg-amber-500/10 py-0.5 px-1 rounded-sm">{cap.toolsUsed.length}t</span>
            )}
          </button>
        ))}
        {filteredCaps.length === 0 && (
          <div class="w-full py-8 text-center text-[0.8125rem] text-stone-500">No capabilities match "{search}"</div>
        )}
      </div>

      {selectedCap && (
        <div class="mx-6 mb-6 bg-stone-950 border border-green-400/10 rounded-[10px] overflow-hidden animate-[slideUp_0.2s_ease-out]">
          <div class="p-5 border-b border-green-400/10">
            <div class="flex items-center justify-between mb-2">
              <code class="font-mono text-[0.9375rem] font-semibold text-green-400">{namespace}:{selectedCap.action || selectedCap.name}</code>
              <div class="flex items-center gap-2">
                <span class={`text-[0.6875rem] py-0.5 px-1.5 rounded-sm ${selectedCap.routing === "cloud" ? "bg-blue-400/10" : "bg-green-400/10"}`}>
                  {selectedCap.routing === "cloud" ? "☁️" : "💻"}
                </span>
                <button
                  type="button"
                  class="w-6 h-6 flex items-center justify-center bg-transparent border-none text-stone-500 text-xl cursor-pointer rounded transition-all duration-150 hover:bg-green-400/10 hover:text-green-400"
                  onClick={() => setSelectedCap(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <p class="text-[0.8125rem] text-stone-400 leading-relaxed">
              {selectedCap.description || "No description"}
            </p>
          </div>

          <div class="grid grid-cols-[1fr_240px] gap-px bg-green-400/5 md:grid-cols-[1fr_240px] max-md:grid-cols-1">
            <div class="bg-stone-950">
              <div class="flex items-center justify-between py-2.5 px-4 border-b border-green-400/5">
                <span class="text-[0.625rem] font-semibold uppercase tracking-wide text-stone-500">Implementation</span>
              </div>
              {selectedCap.code ? (
                <CodeBlock code={selectedCap.code} />
              ) : (
                <div class="py-8 text-center text-xs text-stone-500">No code available</div>
              )}
            </div>

            <div class="bg-stone-950 flex flex-col">
              {selectedCap.inputSchema && selectedCap.inputSchema.properties && (
                <div class="border-b border-green-400/5">
                  <div class="flex items-center justify-between py-2.5 px-4 border-b border-green-400/5">
                    <span class="text-[0.625rem] font-semibold uppercase tracking-wide text-stone-500">Parameters</span>
                    <span class="text-[0.5625rem] font-mono text-stone-500 bg-green-400/5 py-0.5 px-1 rounded-sm">
                      {Object.keys(selectedCap.inputSchema.properties).length}
                    </span>
                  </div>
                  <InputSchema schema={selectedCap.inputSchema} />
                </div>
              )}

              {groupedTools.size > 0 && (
                <div>
                  <div class="flex items-center justify-between py-2.5 px-4 border-b border-amber-500/10">
                    <span class="text-[0.625rem] font-semibold uppercase tracking-wide text-stone-500">Tools Used</span>
                    <span class="text-[0.5625rem] font-mono text-stone-500 bg-green-400/5 py-0.5 px-1 rounded-sm">{selectedCap.toolsUsed.length}</span>
                  </div>
                  <div class="p-2 flex flex-col gap-3">
                    {[...groupedTools.entries()].map(([server, actions]) => (
                      <div key={server} class="flex flex-col gap-1">
                        <div class="text-[0.5625rem] font-semibold uppercase tracking-wide text-stone-500 pl-1">{server}</div>
                        <div class="flex flex-col gap-1">
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
    </div>
  );
}
