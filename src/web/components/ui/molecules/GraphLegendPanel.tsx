/**
 * GraphLegendPanel Molecule - Legend panel for graph visualization
 * With view mode toggle, expand/collapse controls, and highlight depth
 */

import type { JSX } from "preact";
import Badge from "../atoms/Badge.tsx";
import Button from "../atoms/Button.tsx";
import Divider from "../atoms/Divider.tsx";
import Slider from "../atoms/Slider.tsx";

export type ViewMode = "capabilities" | "emergence" | "graph";

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
  highlightDepth?: number;
  onHighlightDepthChange?: (d: number) => void;
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
  highlightDepth = 1,
  onHighlightDepthChange,
  viewMode = "capabilities",
  onViewModeChange,
}: GraphLegendPanelProps): JSX.Element {
  return (
    <div class="absolute top-5 left-5 p-4 rounded-xl z-10 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto min-w-[200px] bg-stone-900/95 border border-amber-500/10 backdrop-blur-md">
      {onViewModeChange && (
        <>
          <h3 class="text-xs font-semibold uppercase tracking-widest mb-2 text-stone-500">
            View Mode
          </h3>
          <div class="flex gap-1 mb-3">
            <button
              class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                viewMode === "capabilities"
                  ? "bg-pml-accent text-stone-950 border-pml-accent"
                  : "bg-stone-900 text-stone-300 border-amber-500/10 hover:border-pml-accent/50"
              }`}
              onClick={() => onViewModeChange("capabilities")}
              title="Capabilities - Compound nodes with tools inside"
            >
              <svg
                width="16"
                height="16"
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
            <button
              class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                viewMode === "emergence"
                  ? "bg-pml-accent text-stone-950 border-pml-accent"
                  : "bg-stone-900 text-stone-300 border-amber-500/10 hover:border-pml-accent/50"
              }`}
              onClick={() => onViewModeChange("emergence")}
              title="Emergence - CAS metrics dashboard"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
            <button
              class={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center border ${
                viewMode === "graph"
                  ? "bg-pml-accent text-stone-950 border-pml-accent"
                  : "bg-stone-900 text-stone-300 border-amber-500/10 hover:border-pml-accent/50"
              }`}
              onClick={() => onViewModeChange("graph")}
              title="Graph - Force-directed with deduplicated tools"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
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

      {viewMode === "graph" && (
        <>
          <h3 class="text-xs font-semibold uppercase tracking-widest mb-3 text-stone-500">
            Hierarchy Level
          </h3>
          <div class="flex flex-col gap-2 mb-3">
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded-full bg-pml-accent opacity-40" />
              <span class="text-xs text-stone-400">
                Leaf (level 0)
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded-full bg-pml-accent opacity-70" />
              <span class="text-xs text-stone-400">
                Meta (level 1)
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded-full bg-pml-accent" />
              <span class="text-xs text-stone-400">
                Deep meta (level 2+)
              </span>
            </div>
          </div>
          <Divider />
        </>
      )}

      {viewMode !== "graph" && (
        <>
          <h3 class="text-xs font-semibold uppercase tracking-widest mb-3 text-stone-500">
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

      <Badge
        color="transparent"
        label="Orphan nodes"
        active={showOrphanNodes}
        onClick={onToggleOrphans}
        class="border-2 border-dashed"
      />

      <Divider />

      {onHighlightDepthChange && (
        <>
          <h3 class="text-xs font-semibold uppercase tracking-widest mb-3 text-stone-500">
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
            <div class="flex justify-between text-[10px] mt-1 text-stone-500">
              <span>Direct (1)</span>
              <span>Full stack (∞)</span>
            </div>
          </div>

          <Divider />
        </>
      )}

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
