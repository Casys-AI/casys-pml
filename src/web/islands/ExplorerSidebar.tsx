/**
 * ExplorerSidebar - Collapsible and resizable sidebar for graph explorer
 *
 * Follows the TracingPanel pattern: collapsible, draggable width, localStorage persistence.
 * Contains view mode toggle, server filtering, sort/filter options.
 *
 * @module web/islands/ExplorerSidebar
 */

import { useEffect, useRef, useState } from "preact/hooks";
import Badge from "../components/ui/atoms/Badge.tsx";
import Divider from "../components/ui/atoms/Divider.tsx";

/** View mode for the graph */
export type ViewMode = "capabilities" | "emergence" | "graph";

/** Sort options for capabilities */
export type SortBy = "date" | "usage" | "success";

/** Success rate filter */
export type SuccessFilter = "all" | "high" | "medium" | "low";

/** Card density mode */
export type CardDensity = "compact" | "normal" | "extended";

interface ExplorerSidebarProps {
  /** Available servers */
  servers: Set<string>;
  /** Hidden (filtered out) servers */
  hiddenServers: Set<string>;
  /** Get color for a server */
  getServerColor: (server: string) => string;
  /** Toggle server visibility */
  onToggleServer: (server: string) => void;
  /** Export graph as JSON */
  onExportJson: () => void;
  /** Export graph as PNG */
  onExportPng: () => void;
  /** Current view mode */
  viewMode?: ViewMode;
  /** Change view mode */
  onViewModeChange?: (mode: ViewMode) => void;
  /** Current sort option */
  sortBy?: SortBy;
  /** Change sort option */
  onSortChange?: (sort: SortBy) => void;
  /** Current success filter */
  successFilter?: SuccessFilter;
  /** Change success filter */
  onSuccessFilterChange?: (filter: SuccessFilter) => void;
  /** Card density mode */
  density?: CardDensity;
  /** Change density mode */
  onDensityChange?: (density: CardDensity) => void;
  /** Current highlight depth for graph mode */
  highlightDepth?: number;
  /** Change highlight depth */
  onDepthChange?: (depth: number) => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

const styles = {
  sidebar: {
    background: "linear-gradient(to bottom, var(--bg-elevated, #12110f), var(--bg, #0a0908))",
    borderRight: "1px solid var(--border)",
  },
};

export default function ExplorerSidebar({
  servers,
  hiddenServers,
  getServerColor,
  onToggleServer,
  onExportJson,
  onExportPng,
  viewMode = "capabilities",
  onViewModeChange,
  sortBy = "date",
  onSortChange,
  successFilter = "all",
  onSuccessFilterChange,
  density = "normal",
  onDensityChange,
  highlightDepth = 1,
  onDepthChange,
}: ExplorerSidebarProps) {
  // Collapsed state with localStorage persistence
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("explorer-sidebar-collapsed");
    return saved === "true";
  });

  // Panel width with localStorage persistence
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem("explorer-sidebar-width");
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))) : DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Persist collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("explorer-sidebar-collapsed", String(collapsed));
    }
  }, [collapsed]);

  // Persist width
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("explorer-sidebar-width", String(panelWidth));
    }
  }, [panelWidth]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
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

  // Collapsed view - small floating button
  if (collapsed) {
    return (
      <div
        class="flex items-center justify-center cursor-pointer h-full transition-all hover:bg-white/5"
        style={{
          ...styles.sidebar,
          width: "40px",
        }}
        onClick={() => setCollapsed(false)}
        title="Ouvrir le panneau"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          style={{ color: "var(--text-muted, #8a8078)" }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      class="flex flex-col h-full relative overflow-hidden"
      style={{
        ...styles.sidebar,
        width: `${panelWidth}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      {/* Resize handle (right edge) */}
      <div
        class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group"
        onMouseDown={() => setIsResizing(true)}
        style={{
          background: isResizing ? "var(--accent)" : "transparent",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "var(--accent-medium, rgba(255, 184, 111, 0.3))";
        }}
        onMouseOut={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        <div
          class="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-16 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "var(--accent, #FFB86F)" }}
        />
      </div>

      {/* Header */}
      <div
        class="flex items-center justify-between px-3 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h2
          class="text-sm font-semibold"
          style={{ color: "var(--text, #f5f0ea)" }}
        >
          Explorer
        </h2>
        <button
          type="button"
          class="p-1.5 rounded-lg transition-all hover:bg-white/10"
          onClick={() => setCollapsed(true)}
          title="Réduire"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style={{ color: "var(--text-muted, #8a8078)" }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        {/* View Mode Toggle */}
        {onViewModeChange && (
          <div>
            <h3
              class="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-dim, #6a6560)" }}
            >
              Mode
            </h3>
            <div class="flex gap-1">
              {/* Capabilities */}
              <button
                type="button"
                class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
                style={{
                  background: viewMode === "capabilities"
                    ? "var(--accent, #FFB86F)"
                    : "var(--bg-surface, #1a1816)",
                  color: viewMode === "capabilities" ? "var(--bg, #0a0908)" : "var(--text-muted)",
                  border: viewMode === "capabilities"
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
                onClick={() => onViewModeChange("capabilities")}
                title="Capabilities"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              {/* Emergence - CAS metrics dashboard */}
              <button
                type="button"
                class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
                style={{
                  background: viewMode === "emergence"
                    ? "var(--accent, #FFB86F)"
                    : "var(--bg-surface, #1a1816)",
                  color: viewMode === "emergence" ? "var(--bg, #0a0908)" : "var(--text-muted)",
                  border: viewMode === "emergence"
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
                onClick={() => onViewModeChange("emergence")}
                title="Emergence - CAS metrics"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  {/* Sparkles icon for emergence */}
                  <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </button>
              {/* Graph */}
              <button
                type="button"
                class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
                style={{
                  background: viewMode === "graph"
                    ? "var(--accent, #FFB86F)"
                    : "var(--bg-surface, #1a1816)",
                  color: viewMode === "graph" ? "var(--bg, #0a0908)" : "var(--text-muted)",
                  border: viewMode === "graph"
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
                onClick={() => onViewModeChange("graph")}
                title="Graph"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="12" cy="12" r="2" />
                  <line x1="8" y1="8" x2="10" y2="10" />
                  <line x1="14" y1="14" x2="16" y2="16" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <Divider />

        {/* Card Density (only in capabilities mode) - Primary UI control */}
        {viewMode === "capabilities" && onDensityChange && (
          <>
            <div>
              <h3
                class="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                Densité
              </h3>
              <div class="flex gap-1">
                {[
                  { key: "compact" as CardDensity, label: "Compact", icon: "≡" },
                  { key: "normal" as CardDensity, label: "Normal", icon: "☰" },
                  { key: "extended" as CardDensity, label: "Étendu", icon: "▤" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                    style={{
                      background: density === key ? "var(--accent)" : "var(--bg-surface)",
                      color: density === key ? "var(--bg)" : "var(--text-muted)",
                      border: density === key
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    }}
                    onClick={() => onDensityChange(key)}
                    title={label}
                  >
                    <span>{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* Sort By (only in capabilities mode) */}
        {viewMode === "capabilities" && onSortChange && (
          <>
            <div>
              <h3
                class="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                Trier par
              </h3>
              <div class="flex gap-1">
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: sortBy === "date" ? "var(--accent)" : "var(--bg-surface)",
                    color: sortBy === "date" ? "var(--bg)" : "var(--text-muted)",
                    border: sortBy === "date"
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                  onClick={() => onSortChange("date")}
                >
                  Date
                </button>
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: sortBy === "usage" ? "var(--accent)" : "var(--bg-surface)",
                    color: sortBy === "usage" ? "var(--bg)" : "var(--text-muted)",
                    border: sortBy === "usage"
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                  onClick={() => onSortChange("usage")}
                >
                  Usage
                </button>
                <button
                  type="button"
                  class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: sortBy === "success" ? "var(--accent)" : "var(--bg-surface)",
                    color: sortBy === "success" ? "var(--bg)" : "var(--text-muted)",
                    border: sortBy === "success"
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                  onClick={() => onSortChange("success")}
                >
                  Succès
                </button>
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* Success Filter (only in capabilities mode) */}
        {viewMode === "capabilities" && onSuccessFilterChange && (
          <>
            <div>
              <h3
                class="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                Taux de succès
              </h3>
              <div class="flex flex-wrap gap-1">
                {[
                  { key: "all" as SuccessFilter, label: "Tous" },
                  { key: "high" as SuccessFilter, label: ">80%" },
                  { key: "medium" as SuccessFilter, label: "50-80%" },
                  { key: "low" as SuccessFilter, label: "<50%" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    class="px-2 py-1 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: successFilter === key ? "var(--accent)" : "var(--bg-surface)",
                      color: successFilter === key ? "var(--bg)" : "var(--text-muted)",
                      border: successFilter === key
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    }}
                    onClick={() => onSuccessFilterChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* MCP Servers (hidden in graph mode - not relevant) */}
        {servers.size > 0 && viewMode !== "graph" && (
          <div>
            <h3
              class="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-dim, #6a6560)" }}
            >
              Serveurs MCP
            </h3>
            <div class="space-y-1">
              {Array.from(servers).map((server) => (
                <Badge
                  key={server}
                  color={getServerColor(server)}
                  label={server}
                  active={!hiddenServers.has(server)}
                  onClick={() => onToggleServer(server)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Graph Mode Controls */}
        {viewMode === "graph" && (
          <>
            <Divider />
            {/* Highlight Depth Slider */}
            {onDepthChange && (
              <div>
                <h3
                  class="text-[10px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-dim, #6a6560)" }}
                >
                  Profondeur
                </h3>
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={highlightDepth}
                    onChange={(e) =>
                      onDepthChange(parseInt((e.target as HTMLInputElement).value, 10))}
                    class="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background:
                        `linear-gradient(to right, var(--accent, #FFB86F) 0%, var(--accent, #FFB86F) ${
                          ((highlightDepth - 1) / 4) * 100
                        }%, var(--bg-surface, #1a1816) ${
                          ((highlightDepth - 1) / 4) * 100
                        }%, var(--bg-surface, #1a1816) 100%)`,
                    }}
                  />
                  <span
                    class="text-sm font-semibold w-6 text-center"
                    style={{ color: "var(--accent, #FFB86F)" }}
                  >
                    {highlightDepth}
                  </span>
                </div>
                <div
                  class="flex justify-between text-[9px] mt-1"
                  style={{ color: "var(--text-dim, #6a6560)" }}
                >
                  <span>Direct</span>
                  <span>Deep</span>
                </div>
              </div>
            )}

            <Divider />

            {/* Hierarchy Legend */}
            <div>
              <h3
                class="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                Hiérarchie
              </h3>
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full"
                    style={{ background: "var(--accent, #FFB86F)", opacity: 0.35 }}
                  />
                  <span class="text-xs" style={{ color: "var(--text-muted)" }}>Tools</span>
                </div>
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full"
                    style={{ background: "var(--accent, #FFB86F)", opacity: 0.6 }}
                  />
                  <span class="text-xs" style={{ color: "var(--text-muted)" }}>Capabilities</span>
                </div>
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full"
                    style={{ background: "#FF9933", opacity: 0.9 }}
                  />
                  <span class="text-xs" style={{ color: "var(--text-muted)" }}>Meta-caps</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer - Export buttons */}
      <div
        class="p-3 shrink-0 flex gap-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          type="button"
          class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110"
          style={{
            background: "var(--bg-surface, #1a1816)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
          onClick={onExportJson}
        >
          JSON
        </button>
        <button
          type="button"
          class="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110"
          style={{
            background: "var(--bg-surface, #1a1816)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
          onClick={onExportPng}
        >
          PNG
        </button>
      </div>
    </div>
  );
}
