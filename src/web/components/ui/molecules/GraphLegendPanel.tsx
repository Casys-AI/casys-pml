/**
 * GraphLegendPanel Molecule - Legend panel for graph visualization
 * Story 6.4: MCP servers, edge types, confidence legend, orphan toggle, export
 */

import type { JSX } from "preact";
import Badge from "../atoms/Badge.tsx";
import Button from "../atoms/Button.tsx";
import Divider from "../atoms/Divider.tsx";
import LegendItem from "./LegendItem.tsx";

interface GraphLegendPanelProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  showOrphanNodes: boolean;
  getServerColor: (server: string) => string;
  onToggleServer: (server: string) => void;
  onToggleOrphans: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
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
      <LegendItem label="Contains (parent→child)" color="#22c55e" lineStyle="solid" />
      <LegendItem label="Sequence (siblings)" color="#FFB86F" lineStyle="solid" />
      <LegendItem label="Dependency (explicit)" color="#f5f0ea" lineStyle="solid" />

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
