/**
 * CapabilityTimeline - Multi-mode timeline view for capabilities
 *
 * Displays capabilities grouped by time period with three distinct layouts:
 * - compact: Terminal-style table with rows and ASCII tree
 * - normal: Card grid (responsive)
 * - extended: Tree explorer with full details
 *
 * @module web/islands/CapabilityTimeline
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { TimelineSeparator } from "../components/ui/atoms/TimelineSeparator.tsx";
import {
  CapabilityCard,
  CardDensity,
  ChildCapabilityInfo,
  ToolInfo,
  TraceInfo,
} from "../components/ui/molecules/CapabilityCard.tsx";
import type { ExecutionTrace } from "./CytoscapeGraph.tsx";

// Server color palette
const SERVER_COLORS = [
  "#FFB86F", // accent orange
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#FFE66D", // bright yellow
  "#95E1D3", // mint green
  "#F38181", // salmon pink
  "#AA96DA", // lavender
  "#FCBAD3", // light pink
  "#A8D8EA", // sky blue
  "#FF9F43", // bright orange
  "#6C5CE7", // purple
  "#00CEC9", // cyan
];

// Capability accent color
const CAPABILITY_ACCENT = "#FFB86F";

export interface TimelineCapability {
  id: string;
  name: string;
  /** Description/intent of the capability */
  description?: string;
  successRate: number;
  usageCount: number;
  lastUsed?: string;
  communityId?: number;
  pagerank?: number;
  fqdn?: string;
  parentId?: string;
  tools: Array<{
    id: string;
    name: string;
    server: string;
  }>;
  traces?: ExecutionTrace[];
  codeSnippet?: string;
  /** Story 10.1: 0=leaf (tools only), 1+=meta-capability */
  hierarchyLevel?: number;
}

interface CapabilityTimelineProps {
  apiBase: string;
  onCapabilitySelect?: (capability: TimelineCapability | null) => void;
  onToolSelect?: (toolId: string | null) => void;
  refreshKey?: number;
  onServersDiscovered?: (servers: Set<string>) => void;
  /** Callback when capabilities are loaded (for search) */
  onCapabilitiesLoaded?: (capabilities: TimelineCapability[]) => void;
  density?: CardDensity;
  /** Search query from header (filters view in real-time) */
  searchQuery?: string;
}

interface TimeGroup {
  label: string;
  threshold: number;
  capabilities: TimelineCapability[];
}

export default function CapabilityTimeline({
  apiBase,
  onCapabilitySelect,
  onToolSelect: _onToolSelect,
  refreshKey = 0,
  onServersDiscovered,
  onCapabilitiesLoaded,
  density = "normal",
  searchQuery = "",
}: CapabilityTimelineProps) {
  const [capabilities, setCapabilities] = useState<TimelineCapability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Track new capability IDs for animation
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Server color map
  const serverColorMap = useMemo(() => new Map<string, string>(), []);

  const getServerColor = useCallback(
    (server: string): string => {
      if (server === "unknown") return "#8a8078";
      if (!serverColorMap.has(server)) {
        const index = serverColorMap.size % SERVER_COLORS.length;
        serverColorMap.set(server, SERVER_COLORS[index]);
      }
      return serverColorMap.get(server)!;
    },
    [serverColorMap],
  );

  const getCapabilityColor = useCallback(
    (_capId: string, _communityId?: number): string => {
      return CAPABILITY_ACCENT;
    },
    [],
  );

  // Fetch data (silent refresh skips loading indicator for smoother SSE updates)
  const loadData = useCallback(async (silentRefresh = false) => {
    if (!silentRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `${apiBase}/api/graph/hypergraph?include_traces=true`,
        { cache: "no-store" }, // Ensure fresh data after SSE refresh
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Transform API data
      const caps: TimelineCapability[] = [];
      const toolsById = new Map<
        string,
        { id: string; name: string; server: string; parents: string[] }
      >();
      const serversSet = new Set<string>();

      // First pass: collect tools
      for (const node of data.nodes) {
        if (node.data.type === "tool") {
          const parents = node.data.parents ?? (node.data.parent ? [node.data.parent] : []);
          if (parents.length > 0) {
            const baseServer = node.data.server ?? "unknown";
            const module = node.data.module;
            // Use module as server when std (e.g., "database" instead of "std")
            const serverDisplay = baseServer === "std" && module ? module : baseServer;

            toolsById.set(node.data.id, {
              id: node.data.id,
              name: node.data.label,
              server: serverDisplay,
              parents,
            });
            serversSet.add(serverDisplay);
          }
        }
      }

      // Build capability ID set
      const capabilityIds = new Set<string>();
      for (const node of data.nodes) {
        if (
          node.data.type === "capability" &&
          (node.data.usage_count ?? 0) > 0
        ) {
          capabilityIds.add(node.data.id);
        }
      }

      // Extract parent-child relationships
      const parentMap = new Map<string, string>();
      for (const edge of data.edges ?? []) {
        const edgeType = edge.data.edge_type || edge.data.edgeType;
        if (edgeType === "contains") {
          const parentId = edge.data.source;
          const childId = edge.data.target;
          if (capabilityIds.has(parentId) && capabilityIds.has(childId)) {
            parentMap.set(childId, parentId);
          }
        }
      }

      // Second pass: build capabilities
      for (const node of data.nodes) {
        if (node.data.type === "capability") {
          const usageCount = node.data.usage_count ?? 0;
          if (usageCount === 0) continue;

          let lastUsed = node.data.last_used;
          if (!lastUsed && node.data.traces?.length > 0) {
            lastUsed = node.data.traces[0].executed_at;
          }

          const capTools: TimelineCapability["tools"] = [];
          for (const [toolId, tool] of toolsById) {
            if (tool.parents.includes(node.data.id)) {
              capTools.push({
                id: toolId,
                name: tool.name,
                server: tool.server,
              });
            }
          }

          const traces: ExecutionTrace[] | undefined = node.data.traces?.map(
            (t: {
              id: string;
              capability_id?: string;
              executed_at: string;
              success: boolean;
              duration_ms: number;
              error_message?: string;
              priority: number;
              task_results: Array<{
                task_id: string;
                tool: string;
                args: Record<string, unknown>;
                result: unknown;
                success: boolean;
                duration_ms: number;
                layer_index?: number;
                // Loop Abstraction metadata
                loop_id?: string;
                loop_type?: "for" | "while" | "forOf" | "forIn" | "doWhile";
                loop_condition?: string;
                body_tools?: string[];
              }>;
            }) => ({
              id: t.id,
              capabilityId: t.capability_id,
              executedAt: t.executed_at,
              success: t.success,
              durationMs: t.duration_ms,
              errorMessage: t.error_message,
              priority: t.priority,
              taskResults: t.task_results?.map((tr) => ({
                taskId: tr.task_id,
                tool: tr.tool,
                args: tr.args,
                result: tr.result,
                success: tr.success,
                durationMs: tr.duration_ms,
                layerIndex: tr.layer_index,
                // Loop Abstraction metadata
                loopId: tr.loop_id,
                loopType: tr.loop_type,
                loopCondition: tr.loop_condition,
                bodyTools: tr.body_tools,
              })) ?? [],
            }),
          );

          caps.push({
            id: node.data.id,
            name: node.data.label,
            description: node.data.description || node.data.intent,
            successRate: node.data.success_rate ?? 0,
            usageCount,
            lastUsed,
            communityId: node.data.community_id,
            pagerank: node.data.pagerank ?? 0,
            fqdn: node.data.fqdn,
            parentId: parentMap.get(node.data.id),
            tools: capTools,
            traces,
            codeSnippet: node.data.code_snippet,
            hierarchyLevel: node.data.hierarchy_level ?? 0, // Story 10.1
          });
        }
      }

      // Sort by lastUsed
      caps.sort((a, b) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateB - dateA;
      });

      // Detect new capabilities
      const currentIds = new Set(caps.map((c) => c.id));
      const freshIds = new Set<string>();
      for (const id of currentIds) {
        if (!seenIdsRef.current.has(id)) {
          freshIds.add(id);
        }
      }
      seenIdsRef.current = currentIds;
      if (freshIds.size > 0) {
        setNewIds(freshIds);
        setTimeout(() => setNewIds(new Set()), 600);
      }

      setCapabilities(caps);
      onServersDiscovered?.(serversSet);
      onCapabilitiesLoaded?.(caps);
      setIsLoading(false);
    } catch (err) {
      console.error("[CapabilityTimeline] Failed to load:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
      setIsLoading(false);
    }
  }, [apiBase, onServersDiscovered, onCapabilitiesLoaded]);

  // Track if initial load is done for silent SSE refreshes
  const initialLoadDone = useRef(false);

  useEffect(() => {
    // Silent refresh after initial load (SSE-triggered)
    const isSilent = initialLoadDone.current && refreshKey > 0;
    loadData(isSilent);
    initialLoadDone.current = true;
  }, [loadData, refreshKey]);

  // Build children map
  const childrenMap = useMemo(() => {
    const map = new Map<string, TimelineCapability[]>();
    for (const cap of capabilities) {
      if (cap.parentId) {
        const existing = map.get(cap.parentId) || [];
        existing.push(cap);
        map.set(cap.parentId, existing);
      }
    }
    return map;
  }, [capabilities]);

  // Top-level capabilities only
  const topLevelCaps = useMemo(
    () => capabilities.filter((c) => !c.parentId),
    [capabilities],
  );

  // Fuzzy match: all query words must appear in target (with typo tolerance)
  const fuzzyMatch = useCallback((target: string, query: string): boolean => {
    const targetLower = target.toLowerCase().replace(/[_-]/g, " ");
    const queryLower = query.toLowerCase().replace(/[_-]/g, " ");

    // Exact or contains
    if (targetLower.includes(queryLower)) return true;

    // Split into words
    const targetWords = targetLower.split(/\s+/);
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

    if (queryWords.length === 0) return false;

    // Check each query word: must be found OR be a prefix OR be 1-2 chars off
    return queryWords.every((qWord) => {
      // Exact contains
      if (targetLower.includes(qWord)) return true;

      // Prefix match or typo tolerance
      for (const tWord of targetWords) {
        if (tWord.startsWith(qWord) || qWord.startsWith(tWord)) return true;

        // Typo tolerance: if words are similar length and differ by 1-2 chars
        if (Math.abs(tWord.length - qWord.length) <= 2 && qWord.length >= 4) {
          let diffs = 0;
          const minLen = Math.min(tWord.length, qWord.length);
          for (let i = 0; i < minLen; i++) {
            if (tWord[i] !== qWord[i]) diffs++;
            if (diffs > 2) break;
          }
          diffs += Math.abs(tWord.length - qWord.length);
          if (diffs <= 2) return true;
        }
      }
      return false;
    });
  }, []);

  // Filter capabilities based on search query (fuzzy matching)
  const filteredCaps = useMemo(() => {
    if (!searchQuery.trim()) return topLevelCaps;

    const query = searchQuery.trim();

    return topLevelCaps.filter((cap) => {
      // Match capability name
      if (fuzzyMatch(cap.name, query)) return true;

      // Match description/intent
      if (cap.description && fuzzyMatch(cap.description, query)) return true;

      // Match tool names
      if (cap.tools.some((t) => fuzzyMatch(t.name, query))) return true;

      // Match tool servers
      if (cap.tools.some((t) => fuzzyMatch(t.server, query))) return true;

      // Match FQDN
      if (cap.fqdn && fuzzyMatch(cap.fqdn, query)) return true;

      return false;
    });
  }, [topLevelCaps, searchQuery, fuzzyMatch]);

  // Group by time period (uses filtered caps)
  const timeGroups = useMemo((): TimeGroup[] => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;

    const groups: TimeGroup[] = [
      { label: "Aujourd'hui", threshold: DAY, capabilities: [] },
      { label: "Cette semaine", threshold: WEEK, capabilities: [] },
      { label: "Ce mois", threshold: MONTH, capabilities: [] },
      { label: "Plus ancien", threshold: Infinity, capabilities: [] },
    ];

    for (const cap of filteredCaps) {
      const lastUsedTime = cap.lastUsed ? new Date(cap.lastUsed).getTime() : 0;
      const age = now - lastUsedTime;

      for (const group of groups) {
        if (age < group.threshold) {
          group.capabilities.push(cap);
          break;
        }
      }
    }

    return groups.filter((g) => g.capabilities.length > 0);
  }, [filteredCaps]);

  // Convert ExecutionTrace[] to TraceInfo[] for sparkline
  const toTraceInfos = useCallback(
    (traces: ExecutionTrace[] | undefined): TraceInfo[] => {
      if (!traces) return [];
      return traces.map((t) => ({
        success: t.success,
        durationMs: t.durationMs,
      }));
    },
    [],
  );

  // Build toolsByLayer from traces for flow visualization
  const buildToolsByLayer = useCallback(
    (
      traces: ExecutionTrace[] | undefined,
      tools: Array<{ id: string; name: string; server: string }>,
    ): Map<number, ToolInfo[]> => {
      const layerMap = new Map<number, ToolInfo[]>();

      if (!traces || traces.length === 0) {
        // Fallback: all tools in layer 0
        if (tools.length > 0) {
          layerMap.set(
            0,
            tools.map((t) => ({
              id: t.id,
              name: t.name,
              server: t.server,
              color: getServerColor(t.server),
            })),
          );
        }
        return layerMap;
      }

      // Use the most recent trace to get layer structure
      const recentTrace = traces[0];
      if (!recentTrace.taskResults || recentTrace.taskResults.length === 0) {
        // Fallback: all tools in layer 0
        layerMap.set(
          0,
          tools.map((t) => ({
            id: t.id,
            name: t.name,
            server: t.server,
            color: getServerColor(t.server),
          })),
        );
        return layerMap;
      }

      // Build map from tool name to ToolInfo
      const toolInfoMap = new Map<string, ToolInfo>();
      for (const t of tools) {
        toolInfoMap.set(t.name, {
          id: t.id,
          name: t.name,
          server: t.server,
          color: getServerColor(t.server),
        });
      }

      // Group tasks by layer, deduplicate tools
      const seenToolsPerLayer = new Map<number, Set<string>>();
      for (const task of recentTrace.taskResults) {
        const layer = task.layerIndex ?? 0;
        if (!layerMap.has(layer)) {
          layerMap.set(layer, []);
          seenToolsPerLayer.set(layer, new Set());
        }
        const taskTool = task.tool;
        const seen = seenToolsPerLayer.get(layer)!;
        if (!seen.has(taskTool)) {
          seen.add(taskTool);

          // Try exact match first, then try short name (after colon)
          let toolInfo = toolInfoMap.get(taskTool);
          if (!toolInfo && taskTool.includes(":")) {
            const shortName = taskTool.split(":").pop()!;
            toolInfo = toolInfoMap.get(shortName);
          }

          if (toolInfo) {
            layerMap.get(layer)!.push(toolInfo);
          } else {
            // Tool not in tools list - extract server from task.tool if possible
            const parts = taskTool.split(":");
            const server = parts.length > 1 ? parts[0] : "unknown";
            const name = parts.length > 1 ? parts.slice(1).join(":") : taskTool;
            layerMap.get(layer)!.push({
              id: taskTool,
              name,
              server,
              color: getServerColor(server),
            });
          }
        }
      }

      return layerMap;
    },
    [getServerColor],
  );

  // Build children info
  const buildChildrenInfo = useCallback(
    (parentId: string): ChildCapabilityInfo[] => {
      const children = childrenMap.get(parentId) || [];
      return children.map((child) => ({
        id: child.id,
        name: child.name,
        successRate: child.successRate,
        usageCount: child.usageCount,
        color: getCapabilityColor(child.id, child.communityId),
        tools: child.tools.map((t) => ({
          id: t.id,
          name: t.name,
          server: t.server,
          color: getServerColor(t.server),
        })),
        toolsByLayer: buildToolsByLayer(child.traces, child.tools),
        traces: toTraceInfos(child.traces),
      }));
    },
    [childrenMap, getCapabilityColor, getServerColor, buildToolsByLayer, toTraceInfos],
  );

  // Handle selection
  const handleCapabilityClick = useCallback(
    (cap: TimelineCapability) => {
      const newSelected = selectedId === cap.id ? null : cap.id;
      setSelectedId(newSelected);
      onCapabilitySelect?.(newSelected ? cap : null);
    },
    [selectedId, onCapabilitySelect],
  );

  // Loading state
  if (isLoading) {
    return (
      <div class="w-full h-full flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <div
            class="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: "var(--accent, #FFB86F)" }}
          />
          <span class="text-sm" style={{ color: "var(--text-muted)" }}>
            Chargement...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div class="w-full h-full flex items-center justify-center p-6">
        <div
          class="text-center p-6 rounded-xl max-w-md"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border)",
          }}
        >
          <div class="text-4xl mb-3">⚠️</div>
          <p style={{ color: "var(--text-muted)" }}>{error}</p>
          <button
            onClick={() => loadData()}
            class="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--accent, #FFB86F)",
              color: "var(--bg, #0a0908)",
            }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (capabilities.length === 0) {
    return (
      <div class="w-full h-full flex items-center justify-center p-6">
        <div
          class="text-center p-6 rounded-xl max-w-md"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border)",
          }}
        >
          <div class="text-4xl mb-3">📭</div>
          <p style={{ color: "var(--text-muted)" }}>
            Aucune capability trouvée
          </p>
        </div>
      </div>
    );
  }

  // Render capabilities based on density mode
  const renderCapabilities = (caps: TimelineCapability[]) => {
    if (density === "compact") {
      // COMPACT MODE: Table-like rows
      return (
        <div
          class="rounded-lg overflow-hidden mb-4"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Table header */}
          <div
            class="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold"
            style={{
              background: "var(--bg-surface, #1a1816)",
              color: "var(--text-dim, #6a6560)",
              fontFamily: "'JetBrains Mono', monospace",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span class="w-4" /> {/* Expand toggle */}
            <span class="flex-1">Capability</span>
            <span class="w-12 text-center">Rate</span>
            <span class="w-10 text-right">Uses</span>
            <span class="w-12 text-right">Age</span>
            <span class="w-16 text-right">Tools</span>
            <span class="w-8" /> {/* Children badge */}
          </div>

          {/* Rows */}
          {caps.map((cap) => {
            const color = getCapabilityColor(cap.id, cap.communityId);
            const toolInfos: ToolInfo[] = cap.tools.map((t) => ({
              id: t.id,
              name: t.name,
              server: t.server,
              color: getServerColor(t.server),
            }));
            const childrenInfo = buildChildrenInfo(cap.id);
            const traceInfos = toTraceInfos(cap.traces);
            const isNew = newIds.has(cap.id);

            return (
              <CapabilityCard
                key={cap.id}
                id={cap.id}
                name={cap.name}
                successRate={cap.successRate}
                usageCount={cap.usageCount}
                lastUsed={cap.lastUsed}
                tools={toolInfos}
                toolsByLayer={buildToolsByLayer(cap.traces, cap.tools)}
                traces={traceInfos}
                children={childrenInfo}
                color={color}
                isSelected={selectedId === cap.id}
                onClick={() => handleCapabilityClick(cap)}
                isNew={isNew}
                density="compact"
                hierarchyLevel={cap.hierarchyLevel}
              />
            );
          })}
        </div>
      );
    }

    if (density === "extended") {
      // EXTENDED MODE: Tree panels
      return (
        <div class="space-y-2 pb-4">
          {caps.map((cap) => {
            const color = getCapabilityColor(cap.id, cap.communityId);
            const toolInfos: ToolInfo[] = cap.tools.map((t) => ({
              id: t.id,
              name: t.name,
              server: t.server,
              color: getServerColor(t.server),
            }));
            const childrenInfo = buildChildrenInfo(cap.id);
            const traceInfos = toTraceInfos(cap.traces);
            const isNew = newIds.has(cap.id);

            return (
              <CapabilityCard
                key={cap.id}
                id={cap.id}
                name={cap.name}
                description={cap.description}
                successRate={cap.successRate}
                usageCount={cap.usageCount}
                lastUsed={cap.lastUsed}
                tools={toolInfos}
                toolsByLayer={buildToolsByLayer(cap.traces, cap.tools)}
                traces={traceInfos}
                children={childrenInfo}
                color={color}
                isSelected={selectedId === cap.id}
                onClick={() => handleCapabilityClick(cap)}
                isNew={isNew}
                density="extended"
                depth={0}
                fqdn={cap.fqdn}
                pagerank={cap.pagerank}
                communityId={cap.communityId}
                hierarchyLevel={cap.hierarchyLevel}
              />
            );
          })}
        </div>
      );
    }

    // NORMAL MODE: Card grid
    return (
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
        {caps.map((cap) => {
          const color = getCapabilityColor(cap.id, cap.communityId);
          const toolInfos: ToolInfo[] = cap.tools.map((t) => ({
            id: t.id,
            name: t.name,
            server: t.server,
            color: getServerColor(t.server),
          }));
          const childrenInfo = buildChildrenInfo(cap.id);
          const traceInfos = toTraceInfos(cap.traces);
          const isNew = newIds.has(cap.id);

          return (
            <CapabilityCard
              key={cap.id}
              id={cap.id}
              name={cap.name}
              description={cap.description}
              successRate={cap.successRate}
              usageCount={cap.usageCount}
              lastUsed={cap.lastUsed}
              tools={toolInfos}
              toolsByLayer={buildToolsByLayer(cap.traces, cap.tools)}
              traces={traceInfos}
              children={childrenInfo}
              color={color}
              isSelected={selectedId === cap.id}
              onClick={() => handleCapabilityClick(cap)}
              isNew={isNew}
              density="normal"
              hierarchyLevel={cap.hierarchyLevel}
            />
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Animation keyframes */}
      <style>
        {`
        @keyframes slideInFade {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes rowFlash {
          0% {
            background: rgba(255, 184, 111, 0.3);
          }
          100% {
            background: transparent;
          }
        }
      `}
      </style>

      <div
        class="w-full h-full overflow-y-auto"
        style={{ background: "var(--bg, #0a0908)" }}
      >
        <div
          class={`mx-auto px-4 pb-8 ${density === "extended" ? "max-w-3xl" : "max-w-5xl"}`}
        >
          {/* Results count when searching */}
          {searchQuery && (
            <div class="sticky top-0 z-10 py-3" style={{ background: "var(--bg, #0a0908)" }}>
              <div class="text-xs" style={{ color: "var(--text-dim, #6a6560)" }}>
                {filteredCaps.length} résultat{filteredCaps.length !== 1 ? "s" : ""}{" "}
                pour "{searchQuery}"
              </div>
            </div>
          )}

          {timeGroups.length === 0 && searchQuery
            ? (
              <div class="py-12 text-center">
                <svg
                  class="w-12 h-12 mx-auto mb-4"
                  style={{ color: "var(--text-dim, #6a6560)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p class="text-sm" style={{ color: "var(--text-muted, #8a8078)" }}>
                  Aucune capability trouvée pour "{searchQuery}"
                </p>
                <p class="text-xs mt-2" style={{ color: "var(--text-dim, #6a6560)" }}>
                  Effacez la recherche dans le header pour voir toutes les capabilities
                </p>
              </div>
            )
            : (
              timeGroups.map((group) => (
                <div key={group.label}>
                  <TimelineSeparator label={group.label} />
                  {renderCapabilities(group.capabilities)}
                </div>
              ))
            )}
        </div>
      </div>
    </>
  );
}
