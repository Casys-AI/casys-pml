/**
 * GraphLegendPanel Molecule - Legend panel for graph visualization
 * With view mode toggle, expand/collapse controls, and highlight depth
 */

import type { JSX } from "preact";
import Badge from "../atoms/Badge.tsx";
import Button from "../atoms/Button.tsx";
import Divider from "../atoms/Divider.tsx";
import Slider from "../atoms/Slider.tsx";

/** View mode for the graph */
export type ViewMode = "capabilities" | "tools" | "graph";

/** Node mode - definition (generic tools) vs invocation (actual calls) */
export type NodeMode = "definition" | "invocation";

interface GraphLegendPanelProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  showOrphanNodes: boolean;
  getServerColor: (server: string) => string;
  onToggleServer: (server: string) => void;
  onToggleOrphans: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  // Highlight depth control
  highlightDepth?: number;
  onHighlightDepthChange?: (d: number) => void;
  // View mode control
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export default function GraphLegendPanel({
  servers,
  hiddenServers,
  showOrphanNodes,
  getServerColor,
  onToggleServer,
  onToggleOrphans,
  onExportJson,
  onExportPng,
  // Highlight depth
  highlightDepth = 1,
  onHighlightDepthChange,
  // View mode
  viewMode = "capabilities",
  onViewModeChange,
}: GraphLegendPanelProps): JSX.Element {
  return (
    <div
      class="absolute top-5 left-5 p-4 rounded-xl z-10 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto"
      style={{
        background: "rgba(18, 17, 15, 0.95)",
        border: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
        minWidth: "200px",
      }}
    >
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-dim)" }}
          >
            View Mode
          </h3>
          <div class="flex gap-1 mb-3">
            {/* Capabilities - Boxes/Grid icon */}
            <button
              class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
              style={{
                background: viewMode === "capabilities"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: viewMode === "capabilities"
                  ? "var(--bg, #0a0908)"
                  : "var(--text-muted, #d5c3b5)",
                border: viewMode === "capabilities"
                  ? "1px solid var(--accent, #FFB86F)"
                  : "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
              onClick={() => onViewModeChange("capabilities")}
              title="Capabilities - Compound nodes with tools inside"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            {/* Tools - Wrench icon */}
            <button
              class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
              style={{
                background: viewMode === "tools"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: viewMode === "tools" ? "var(--bg, #0a0908)" : "var(--text-muted, #d5c3b5)",
                border: viewMode === "tools"
                  ? "1px solid var(--accent, #FFB86F)"
                  : "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
              onClick={() => onViewModeChange("tools")}
              title="Tools - Flat view of all tools"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </button>
            {/* Graph - Network/Force-directed icon */}
            <button
              class="flex-1 p-2 rounded-lg transition-all flex items-center justify-center"
              style={{
                background: viewMode === "graph"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: viewMode === "graph" ? "var(--bg, #0a0908)" : "var(--text-muted, #d5c3b5)",
                border: viewMode === "graph"
                  ? "1px solid var(--accent, #FFB86F)"
                  : "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
              onClick={() => onViewModeChange("graph")}
              title="Graph - Force-directed with deduplicated tools"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="18" r="3" />
                <circle cx="12" cy="12" r="3" />
                <line x1="8.5" y1="7.5" x2="10" y2="10" />
                <line x1="15.5" y1="7.5" x2="14" y2="10" />
                <line x1="8.5" y1="16.5" x2="10" y2="14" />
                <line x1="15.5" y1="16.5" x2="14" y2="14" />
              </svg>
            </button>
          </div>
          <Divider />
        </>
      )}

      {/* Hierarchy Legend (Graph mode) */}
      {viewMode === "graph" && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Hierarchy Level
          </h3>
          <div class="flex flex-col gap-2 mb-3">
            {/* Level 0 - Tools */}
            <div class="flex items-center gap-2">
              <div
                class="w-4 h-4 rounded-full"
                style={{ background: "#8b5cf6", opacity: 0.35 }}
              />
              <span class="text-xs" style={{ color: "var(--text-muted)" }}>
                Tools (level 0)
              </span>
            </div>
            {/* Level 1 - Capabilities */}
            <div class="flex items-center gap-2">
              <div
                class="w-4 h-4 rounded-full"
                style={{ background: "#8b5cf6", opacity: 0.6 }}
              />
              <span class="text-xs" style={{ color: "var(--text-muted)" }}>
                Capabilities (level 1)
              </span>
            </div>
            {/* Level 2 - Meta-capabilities */}
            <div class="flex items-center gap-2">
              <div
                class="w-4 h-4 rounded-full"
                style={{ background: "#8b5cf6", opacity: 0.8 }}
              />
              <span class="text-xs" style={{ color: "var(--text-muted)" }}>
                Meta-caps (level 2)
              </span>
            </div>
            {/* Level 3+ - Deep meta */}
            <div class="flex items-center gap-2">
              <div
                class="w-4 h-4 rounded-full"
                style={{ background: "#8b5cf6", opacity: 1.0 }}
              />
              <span class="text-xs" style={{ color: "var(--text-muted)" }}>
                Deep meta (level 3+)
              </span>
            </div>
          </div>
          <Divider />
        </>
      )}

      {/* MCP Servers (Capabilities/Tools modes only) */}
      {viewMode !== "graph" && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            MCP Servers
          </h3>
          {Array.from(servers).map((server) => (
            <Badge
              key={server}
              color={getServerColor(server)}
              label={server}
              active={!hiddenServers.has(server)}
              onClick={() => onToggleServer(server)}
            />
          ))}
          <Divider />
        </>
      )}

      {/* Orphan toggle */}
      <Badge
        color="transparent"
        label="Orphan nodes"
        active={showOrphanNodes}
        onClick={onToggleOrphans}
        class="border-2 border-dashed"
      />

      <Divider />

      {/* Highlight Depth Control */}
      {onHighlightDepthChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Highlight Depth
          </h3>

          <div class="mb-3">
            <Slider
              value={highlightDepth}
              min={1}
              max={10}
              step={1}
              label={highlightDepth >= 10 ? "∞" : String(highlightDepth)}
              onChange={(v) => onHighlightDepthChange(v >= 10 ? Infinity : v)}
            />
            <div class="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
              <span>Direct (1)</span>
              <span>Full stack (∞)</span>
            </div>
          </div>

          <Divider />
        </>
      )}

      {/* Export buttons */}
      <div class="flex gap-2">
        <Button variant="default" size="sm" onClick={onExportJson} class="flex-1">
          Export JSON
        </Button>
        <Button variant="default" size="sm" onClick={onExportPng} class="flex-1">
          Export PNG
        </Button>
      </div>
    </div>
  );
}
