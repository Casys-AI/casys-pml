/**
 * GraphInsightsPanel - Right sidebar for graph/hypergraph algorithms
 *
 * Opens when clicking any node (tool, capability, meta-cap) in graph mode.
 * Shows selected node info + algorithm results (Adamic-Adar, PageRank, etc.)
 *
 * @module web/islands/GraphInsightsPanel
 */

import { useEffect, useRef, useState } from "preact/hooks";

/** Node type in the graph */
export type NodeType = "tool" | "capability" | "meta-capability";

/** Algorithm score with metadata */
export interface AlgorithmScore {
  score: number;
  rank?: number;
  metadata?: Record<string, unknown>;
}

/** Related item with algorithm badges (unified insights) */
export interface RelatedItem {
  id: string;
  name: string;
  type: NodeType;
  server?: string;
  score: number;
  confidence?: number;
  /** Algorithm badges - which algorithms found this item */
  algorithms?: Record<string, AlgorithmScore>;
  /** Combined score from all algorithms */
  combinedScore?: number;
}

/** Algorithm badge config for display */
export interface AlgorithmBadge {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

/** Algorithm badge configurations */
export const ALGORITHM_BADGES: Record<string, AlgorithmBadge> = {
  neighbors: {
    id: "neighbors",
    label: "Neighbors",
    shortLabel: "⟷", // Connection arrows
    color: "#3b82f6", // Blue
    description: "Direct connections by PageRank",
  },
  co_occurrence: {
    id: "co_occurrence",
    label: "Co-occurrence",
    shortLabel: "⏱", // Clock/history
    color: "#10b981", // Emerald
    description: "Executed together in traces",
  },
  louvain: {
    id: "louvain",
    label: "Louvain",
    shortLabel: "◎", // Target/community
    color: "#8b5cf6", // Violet
    description: "Same community cluster",
  },
  adamic_adar: {
    id: "adamic_adar",
    label: "Adamic-Adar",
    shortLabel: "≈", // Similarity
    color: "#f59e0b", // Amber
    description: "Similar connection patterns",
  },
  hyperedge: {
    id: "hyperedge",
    label: "Hyperedge",
    shortLabel: "⬡", // Hexagon/shared
    color: "#ec4899", // Pink
    description: "Shared tools (Jaccard)",
  },
  spectral: {
    id: "spectral",
    label: "Spectral",
    shortLabel: "◇", // Diamond/cluster
    color: "#06b6d4", // Cyan
    description: "Same spectral cluster",
  },
};

/** Selected node information */
export interface SelectedNodeInfo {
  id: string;
  name: string;
  type: NodeType;
  server?: string;
  pagerank?: number;
  degree?: number;
  communityId?: number;
  successRate?: number;
  usageCount?: number;
}

/** Tab types for the panel */
export type InsightTab = "structure" | "behavior";

/** Algorithm section data */
export interface AlgorithmSection {
  id: string;
  name: string;
  description?: string;
  tab: InsightTab;
  items: RelatedItem[];
  isLoading?: boolean;
}

/** Pinned set - a group of nodes from one algorithm section */
export interface PinnedSet {
  id: string;
  sourceNodeName: string;
  algorithm: string;
  color: string;
  nodeIds: string[];
}

/** Color palette for pinned sets (5 distinct colors) */
export const PIN_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Violet
];

interface GraphInsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: SelectedNodeInfo | null;
  algorithms: AlgorithmSection[];
  isLoading?: boolean;
  getServerColor: (server: string) => string;
  getNodeColor?: (type: NodeType) => string;
  onItemSelect: (id: string, type: NodeType) => void;
  /** Hover callback: nodeId + algoId for preview color */
  onItemHover?: (nodeId: string | null, algoId?: string) => void;
  /** Pinned sets for multi-selection */
  pinnedSets?: PinnedSet[];
  /** Callback to toggle pin on a badge (algoId, nodeId) */
  onTogglePin?: (algoId: string, nodeId: string, nodeName: string) => void;
  /** Callback to clear all pins */
  onClearPins?: () => void;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 320;
const STORAGE_KEY_WIDTH = "graph-insights-panel-width";

/** Default colors for node types */
const DEFAULT_NODE_COLORS: Record<NodeType, string> = {
  tool: "#FFB86F",
  capability: "#FFB86F",
  "meta-capability": "#FF9933",
};

export default function GraphInsightsPanel({
  isOpen,
  onClose,
  selectedNode,
  algorithms,
  isLoading = false,
  getServerColor,
  getNodeColor,
  onItemSelect,
  onItemHover,
  pinnedSets = [],
  onTogglePin,
  onClearPins,
}: GraphInsightsPanelProps) {
  // Helper to check if a badge is pinned
  const isBadgePinned = (algoId: string, nodeId: string) => {
    return pinnedSets.some((p) => p.id === `${algoId}-${nodeId}`);
  };
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem(STORAGE_KEY_WIDTH);
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))) : DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const nodeColor = (type: NodeType) => getNodeColor?.(type) ?? DEFAULT_NODE_COLORS[type];

  // Persist width
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_WIDTH, String(panelWidth));
    }
  }, [panelWidth]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = globalThis.innerWidth - e.clientX;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatScore = (score: number): string => {
    if (score >= 10) return score.toFixed(1);
    if (score >= 1) return score.toFixed(2);
    return score.toFixed(3);
  };

  const getTypeLabel = (type: NodeType): string => {
    switch (type) {
      case "tool":
        return "Tool";
      case "capability":
        return "Capability";
      case "meta-capability":
        return "Meta-cap";
    }
  };

  const getTypeIcon = (type: NodeType): string => {
    switch (type) {
      case "tool":
        return "🔧";
      case "capability":
        return "⚡";
      case "meta-capability":
        return "🔶";
    }
  };

  return (
    <div
      ref={panelRef}
      class="fixed right-0 bottom-0 flex flex-col"
      style={{
        top: "56px",
        zIndex: 110,
        background: "linear-gradient(to bottom, var(--bg-elevated, #12110f), var(--bg, #0a0908))",
        borderLeft: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
        boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.3)",
        width: `${panelWidth}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      {/* Resize handle */}
      <div
        class="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10"
        onMouseDown={() => setIsResizing(true)}
        style={{
          background: isResizing ? "var(--accent, #FFB86F)" : "transparent",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--accent-medium, rgba(255, 184, 111, 0.3))";
        }}
        onMouseOut={(e) => {
          if (!isResizing) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }
        }}
      />

      {/* Header */}
      <div
        class="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))" }}
      >
        <h2 class="text-sm font-semibold" style={{ color: "var(--text, #f5f0ea)" }}>
          Graph Insights
        </h2>
        <button
          type="button"
          class="p-1.5 rounded-lg transition-all hover:bg-red-500/20"
          onClick={onClose}
          title="Close (Esc)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: "var(--text-muted, #8a8078)" }}
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div
          class="px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))" }}
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="text-base">{getTypeIcon(selectedNode.type)}</span>
            <div
              class="w-3 h-3 rounded-full shrink-0"
              style={{
                background: selectedNode.server
                  ? getServerColor(selectedNode.server)
                  : nodeColor(selectedNode.type),
              }}
            />
            <span
              class="text-sm font-semibold truncate"
              style={{ color: "var(--text, #f5f0ea)" }}
              title={selectedNode.name}
            >
              {selectedNode.name}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span
              class="px-2 py-0.5 rounded-md"
              style={{
                background: "var(--bg-surface, #1a1816)",
                color: "var(--text-dim, #8a8078)",
              }}
            >
              {getTypeLabel(selectedNode.type)}
            </span>
            {selectedNode.server && (
              <span
                class="px-2 py-0.5 rounded-md"
                style={{
                  background: "var(--bg-surface, #1a1816)",
                  color: "var(--text-dim, #8a8078)",
                }}
              >
                {selectedNode.server}
              </span>
            )}
            {selectedNode.pagerank !== undefined && (
              <span style={{ color: "var(--accent, #FFB86F)" }}>
                PR: {selectedNode.pagerank.toFixed(3)}
              </span>
            )}
            {selectedNode.degree !== undefined && (
              <span style={{ color: "var(--text-muted, #8a8078)" }}>
                deg: {selectedNode.degree}
              </span>
            )}
            {selectedNode.successRate !== undefined && (
              <span
                style={{
                  color: selectedNode.successRate >= 0.8
                    ? "var(--success, #4ade80)"
                    : "var(--warning, #fbbf24)",
                }}
              >
                {(selectedNode.successRate * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {/* Algorithm badges - interactive, hover to visualize */}
          {(() => {
            // Collect all unique algorithms and their node IDs
            const allItems = algorithms.flatMap((s) => s.items);
            const algoNodeIds = new Map<string, string[]>();
            for (const item of allItems) {
              if (item.algorithms) {
                for (const algoId of Object.keys(item.algorithms)) {
                  if (!algoNodeIds.has(algoId)) {
                    algoNodeIds.set(algoId, []);
                  }
                  algoNodeIds.get(algoId)!.push(item.id);
                }
              }
            }
            if (algoNodeIds.size === 0) return null;
            return (
              <div class="flex flex-wrap gap-1.5 mt-2">
                {Array.from(algoNodeIds.entries()).map(([algoId, nodeIds]) => {
                  const badge = ALGORITHM_BADGES[algoId];
                  if (!badge) return null;
                  return (
                    <button
                      key={algoId}
                      type="button"
                      class="px-1.5 py-0.5 rounded text-[9px] font-semibold cursor-pointer transition-all"
                      style={{
                        background: `${badge.color}20`,
                        color: badge.color,
                        border: `1px solid ${badge.color}40`,
                      }}
                      onMouseEnter={() => {
                        // Trigger visualization for all nodes of this algo
                        // Pass first nodeId + algoId to trigger clusterViz
                        if (nodeIds.length > 0) {
                          onItemHover?.(nodeIds[0], algoId);
                        }
                      }}
                      onMouseLeave={() => onItemHover?.(null)}
                      title={`${badge.label}: ${nodeIds.length} results - hover to visualize`}
                    >
                      {badge.shortLabel} {nodeIds.length}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Related Items List */}
      <div class="flex-1 overflow-y-auto">
        {isLoading
          ? (
            <div class="flex items-center justify-center py-8">
              <div
                class="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"
                style={{ color: "var(--accent, #FFB86F)" }}
              />
            </div>
          )
          : (() => {
            // Flatten all items from all sections (unified list)
            const allItems = algorithms.flatMap((section) => section.items);
            if (allItems.length === 0) {
              return (
                <div class="text-center py-8 px-4">
                  <p class="text-sm" style={{ color: "var(--text-dim, #8a8078)" }}>
                    Select a node to see related items
                  </p>
                </div>
              );
            }
            const maxScore = Math.max(...allItems.map((i) => i.score), 0.001);

            // Section header (simple, non-collapsible)
            return (
              <div class="px-4 py-3 space-y-2">
                {/* Header with count */}
                <div class="flex items-center gap-2 mb-2">
                  <span
                    class="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-dim, #6a6560)" }}
                  >
                    Related
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
                      color: "var(--accent, #FFB86F)",
                    }}
                  >
                    {allItems.length}
                  </span>
                </div>

                {/* Items list - always visible */}
                {allItems.length === 0
                  ? (
                    <p class="text-xs py-2" style={{ color: "var(--text-dim, #8a8078)" }}>
                      No results
                    </p>
                  )
                  : (
                    allItems.map((item, index) => (
                      <div
                        key={item.id}
                        class="p-2.5 rounded-lg cursor-pointer transition-all duration-200"
                        style={{
                          background: "var(--bg-surface, #1a1816)",
                          border: "1px solid var(--border, rgba(255, 184, 111, 0.08))",
                        }}
                        onClick={() => onItemSelect(item.id, item.type)}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--accent-dim, rgba(255, 184, 111, 0.1))";
                          (e.currentTarget as HTMLElement).style.transform = "translateX(2px)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--bg-surface, #1a1816)";
                          (e.currentTarget as HTMLElement).style.transform = "translateX(0)";
                        }}
                      >
                        <div class="flex items-center gap-2 mb-1.5">
                          <span
                            class="text-[10px] font-bold w-5 text-center"
                            style={{ color: "var(--accent, #FFB86F)" }}
                          >
                            #{index + 1}
                          </span>
                          <span class="text-xs">{getTypeIcon(item.type)}</span>
                          <div
                            class="w-2 h-2 rounded-full shrink-0"
                            style={{
                              background: item.server
                                ? getServerColor(item.server)
                                : nodeColor(item.type),
                            }}
                          />
                          <span
                            class="text-sm font-medium truncate flex-1"
                            style={{ color: "var(--text, #f5f0ea)" }}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <span
                            class="text-[10px] font-semibold"
                            style={{ color: "var(--accent, #FFB86F)" }}
                          >
                            {formatScore(item.score)}
                          </span>
                        </div>
                        {/* Algorithm badges */}
                        {item.algorithms && Object.keys(item.algorithms).length > 0 && (
                          <div class="flex flex-wrap gap-1 ml-5 mb-1.5">
                            {Object.entries(item.algorithms).map(([algoId, algoData]) => {
                              const badge = ALGORITHM_BADGES[algoId];
                              if (!badge) return null;
                              const isPinned = isBadgePinned(algoId, item.id);
                              return (
                                <button
                                  key={algoId}
                                  type="button"
                                  class="px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all"
                                  style={{
                                    background: isPinned ? badge.color : `${badge.color}20`,
                                    color: isPinned ? "#000" : badge.color,
                                    border: `1px solid ${badge.color}`,
                                    boxShadow: isPinned ? `0 0 8px ${badge.color}80` : "none",
                                    transform: isPinned ? "scale(1.05)" : "scale(1)",
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onTogglePin) {
                                      onTogglePin(algoId, item.id, item.name);
                                    }
                                  }}
                                  onMouseEnter={() => onItemHover?.(item.id, algoId)}
                                  onMouseLeave={() => onItemHover?.(null)}
                                  title={`${badge.label}: ${badge.description}\nScore: ${
                                    algoData.score.toFixed(3)
                                  }${algoData.rank ? ` (Rank #${algoData.rank})` : ""}\n${
                                    isPinned ? "Click to unpin" : "Click to pin"
                                  }`}
                                >
                                  {badge.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* Score bar */}
                        <div
                          class="h-1 rounded-full overflow-hidden ml-5"
                          style={{ background: "var(--bg, #0a0908)" }}
                        >
                          <div
                            class="h-full rounded-full"
                            style={{
                              background: "var(--accent, #FFB86F)",
                              width: `${(item.score / maxScore) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
              </div>
            );
          })()}
      </div>

      {/* Footer with pinned sets legend */}
      <div
        class="px-4 py-2 shrink-0"
        style={{ borderTop: "1px solid var(--border, rgba(255, 184, 111, 0.1))" }}
      >
        {/* Pinned sets legend */}
        {pinnedSets.length > 0 && (
          <div class="mb-2 space-y-1.5">
            <div class="flex items-center justify-between">
              <span
                class="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                Pinned Sets ({pinnedSets.length})
              </span>
              {onClearPins && (
                <button
                  type="button"
                  class="text-[10px] px-2 py-0.5 rounded transition-all hover:bg-red-500/20"
                  onClick={onClearPins}
                  style={{ color: "var(--error, #ef4444)" }}
                >
                  Clear all
                </button>
              )}
            </div>
            {pinnedSets.map((pin) => (
              <div key={pin.id} class="flex items-center gap-2">
                <div
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: pin.color }}
                />
                <span
                  class="text-[10px] truncate flex-1"
                  style={{ color: "var(--text-muted, #a0a0a0)" }}
                  title={`${pin.sourceNodeName} - ${pin.algorithm}`}
                >
                  {pin.sourceNodeName} · {pin.algorithm}
                </span>
                <span
                  class="text-[10px] px-1 rounded"
                  style={{
                    background: "var(--bg-surface, #1a1816)",
                    color: "var(--text-dim, #6a6560)",
                  }}
                >
                  {pin.nodeIds.length}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Help text */}
        <div class="text-center">
          <span class="text-[10px]" style={{ color: "var(--text-dim, #6a6560)" }}>
            Click item to navigate | + to pin | Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}

// Re-export old types for backward compatibility
export type { SelectedNodeInfo as SelectedToolInfo };
export type { RelatedItem as RelatedTool };
