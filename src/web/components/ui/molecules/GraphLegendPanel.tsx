/**
 * GraphLegendPanel Molecule - Legend panel for graph visualization
 * Story 6.4: MCP servers, edge types, confidence legend, orphan toggle, export
 * Holten 2006: HEB tension control (beta parameter for curveBundle)
 */

import type { JSX } from "preact";
import Badge from "../atoms/Badge.tsx";
import Button from "../atoms/Button.tsx";
import Divider from "../atoms/Divider.tsx";
import Slider from "../atoms/Slider.tsx";
import LegendItem from "./LegendItem.tsx";

/** Edge type identifiers matching radial-heb-layout.ts */
export type EdgeType = "hierarchy" | "hyperedge" | "capability_link" | "tool_sequence";

interface GraphLegendPanelProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  showOrphanNodes: boolean;
  getServerColor: (server: string) => string;
  onToggleServer: (server: string) => void;
  onToggleOrphans: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  // HEB tension control (Holten 2006)
  tension?: number;
  onTensionChange?: (t: number) => void;
  // Highlight depth control
  highlightDepth?: number;
  onHighlightDepthChange?: (d: number) => void;
  // Edge type visibility toggles
  hiddenEdgeTypes?: Set<EdgeType>;
  onToggleEdgeType?: (edgeType: EdgeType) => void;
  // Legacy FDEB controls (deprecated)
  straightening?: number;
  onStraighteningChange?: (s: number) => void;
  smoothing?: number;
  onSmoothingChange?: (s: number) => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  heatmapColors?: string[];
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
  // HEB tension
  tension = 0.85,
  onTensionChange,
  // Highlight depth
  highlightDepth = 1,
  onHighlightDepthChange,
  // Edge type toggles
  hiddenEdgeTypes = new Set(),
  onToggleEdgeType,
  // Legacy FDEB (deprecated)
  straightening = 0,
  onStraighteningChange,
  smoothing = 0,
  onSmoothingChange,
  // Heatmap removed in HEB refactor
  showHeatmap: _showHeatmap = false,
  onToggleHeatmap: _onToggleHeatmap,
  heatmapColors: _heatmapColors,
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
      {/* MCP Servers */}
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

      {/* Edge Types */}
      <h3
        class="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        Edge Types
      </h3>
      <LegendItem
        label="Contains (cap→tool)"
        color="#888888"
        lineStyle="solid"
        active={!hiddenEdgeTypes.has("hierarchy")}
        onClick={onToggleEdgeType ? () => onToggleEdgeType("hierarchy") : undefined}
      />
      <LegendItem
        label="Sequence (tool→tool)"
        color="#10b981"
        lineStyle="solid"
        active={!hiddenEdgeTypes.has("tool_sequence")}
        onClick={onToggleEdgeType ? () => onToggleEdgeType("tool_sequence") : undefined}
      />

      <Divider />

      {/* Confidence */}
      <h3
        class="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        Confidence
      </h3>
      <LegendItem label="Observed (3+ runs)" color="var(--text-dim)" lineStyle="solid" />
      <LegendItem label="Inferred (1-2 runs)" color="var(--text-dim)" lineStyle="dashed" />
      <LegendItem
        label="Template (bootstrap)"
        color="var(--text-dim)"
        lineStyle="dotted"
        opacity={0.5}
      />

      <Divider />

      {/* Orphan toggle */}
      <Badge
        color="transparent"
        label="Orphan nodes"
        active={showOrphanNodes}
        onClick={onToggleOrphans}
        class="border-2 border-dashed"
      />

      <Divider />

      {/* Bundle Controls - HEB Tension (Holten 2006) */}
      {onTensionChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Bundle Tension
          </h3>

          <div class="mb-3">
            <Slider
              value={tension}
              min={0}
              max={1}
              step={0.05}
              label="Tension"
              onChange={onTensionChange}
            />
            <div class="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
              <span>Bundled</span>
              <span>Straight</span>
            </div>
          </div>

          <Divider />
        </>
      )}

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

      {/* Legacy FDEB controls (deprecated - hidden when HEB tension is used) */}
      {!onTensionChange && (onStraighteningChange || onSmoothingChange) && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Bundle Controls
          </h3>

          {onStraighteningChange && (
            <div class="mb-3">
              <Slider
                value={straightening}
                min={0}
                max={1}
                step={0.01}
                label="Straightening"
                onChange={onStraighteningChange}
              />
            </div>
          )}

          {onSmoothingChange && (
            <div class="mb-3">
              <Slider
                value={smoothing}
                min={0}
                max={1}
                step={0.01}
                label="Smoothing"
                onChange={onSmoothingChange}
              />
            </div>
          )}

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
