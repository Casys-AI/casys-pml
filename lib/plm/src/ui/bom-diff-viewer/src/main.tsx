/**
 * BOM Diff Viewer — native PLM viewer for BomDiff
 *
 * Consumes BomDiff { baselineRevision, comparisonRevision, changes, summary, impact } directly.
 *
 * @module lib/plm/src/ui/bom-diff-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { TableSkeleton } from "../../shared";
import "../../global.css";

// ============================================================================
// Types (mirrors lib/plm/src/data/bom-types.ts)
// ============================================================================

type BomDiffSeverity = "info" | "warning" | "critical";
type BomDiffChangeType = "added" | "removed" | "quantity_changed" | "material_changed" | "cost_changed";

interface BomDiffEntry {
  partNumber: string;
  name: string;
  changeType: BomDiffChangeType;
  severity: BomDiffSeverity;
  baselineValue?: string | number;
  comparisonValue?: string | number;
  description: string;
}

interface BomDiff {
  baselineRevision: string;
  comparisonRevision: string;
  changes: BomDiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    totalChanges: number;
  };
  impact: {
    massDelta_kg: number;
    costDelta: number;
    maxSeverity: BomDiffSeverity;
  };
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "BOM Diff Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Severity styles
// ============================================================================

const severityStyles: Record<BomDiffSeverity, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", label: "Critical" },
  warning: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30", label: "Warning" },
  info: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", label: "Info" },
};

const changeTypeLabels: Record<BomDiffChangeType, { icon: string; label: string; color: string }> = {
  added: { icon: "+", label: "Added", color: "text-emerald-400" },
  removed: { icon: "-", label: "Removed", color: "text-red-400" },
  quantity_changed: { icon: "#", label: "Qty Changed", color: "text-amber-400" },
  material_changed: { icon: "M", label: "Material", color: "text-purple-400" },
  cost_changed: { icon: "$", label: "Cost", color: "text-blue-400" },
};

// ============================================================================
// Change Row Component
// ============================================================================

function ChangeRow({ entry, onClick, isSelected }: { entry: BomDiffEntry; onClick: () => void; isSelected: boolean }) {
  const sev = severityStyles[entry.severity];
  const ct = changeTypeLabels[entry.changeType];

  return (
    <tr
      className={cx(
        "border-b border-white/5 cursor-pointer",
        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      )}
      onClick={onClick}
    >
      {/* Severity */}
      <td className="px-3 py-2">
        <span className={cx("px-1.5 py-0.5 text-[10px] font-semibold rounded", sev.bg, sev.text)}>
          {sev.label}
        </span>
      </td>

      {/* Change type */}
      <td className="px-3 py-2">
        <span className={cx("flex items-center gap-1.5 text-xs", ct.color)}>
          <span className="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center bg-white/5">
            {ct.icon}
          </span>
          {ct.label}
        </span>
      </td>

      {/* Part */}
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-gray-500">{entry.partNumber}</span>
        <span className="ml-2 text-gray-300 text-xs">{entry.name}</span>
      </td>

      {/* Values */}
      <td className="px-3 py-2 text-right">
        {entry.baselineValue != null && (
          <span className="font-mono text-xs text-red-400/70 line-through mr-2">{entry.baselineValue}</span>
        )}
        {entry.comparisonValue != null && (
          <span className="font-mono text-xs text-emerald-400">{entry.comparisonValue}</span>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function BomDiffViewer() {
  const [data, setData] = useState<BomDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<BomDiffSeverity | "all">("all");
  const [filterType, setFilterType] = useState<BomDiffChangeType | "all">("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        setData(JSON.parse(text) as BomDiff);
      } catch (e) {
        setError(`Failed to parse diff data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const filteredChanges = useMemo(() => {
    if (!data) return [];
    return data.changes.filter((c) => {
      if (filterSeverity !== "all" && c.severity !== filterSeverity) return false;
      if (filterType !== "all" && c.changeType !== filterType) return false;
      return true;
    });
  }, [data, filterSeverity, filterType]);

  const handleSelect = (idx: number) => {
    setSelectedIdx(idx === selectedIdx ? null : idx);
    if (filteredChanges[idx]) {
      notifyModel("select_change", {
        partNumber: filteredChanges[idx].partNumber,
        changeType: filteredChanges[idx].changeType,
      });
    }
  };

  const fmtDelta = (n: number, unit: string) => {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)} ${unit}`;
  };

  if (loading) return <TableSkeleton />;
  if (error) return <div className="p-4 text-red-400 text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-gray-500 text-sm">No diff data</div>;

  const maxSev = severityStyles[data.impact.maxSeverity];

  return (
    <div className="p-4 font-sans text-sm bg-[#08080a] min-h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-gray-200 font-semibold">BOM Diff</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-red-500/10 text-red-400 rounded">
          {data.baselineRevision}
        </span>
        <span className="text-gray-600">vs</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 rounded">
          {data.comparisonRevision}
        </span>
        <span className={cx("px-2 py-0.5 text-[10px] font-semibold rounded", maxSev.bg, maxSev.text)}>
          {maxSev.label}
        </span>
      </div>

      {/* Impact summary */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Changes</div>
          <div className="text-lg font-bold text-gray-200 font-mono tabular-nums">
            {data.summary.totalChanges}
          </div>
          <div className="flex gap-2 mt-1 text-[10px]">
            {data.summary.added > 0 && <span className="text-emerald-400">+{data.summary.added}</span>}
            {data.summary.removed > 0 && <span className="text-red-400">-{data.summary.removed}</span>}
            {data.summary.modified > 0 && <span className="text-amber-400">~{data.summary.modified}</span>}
          </div>
        </div>
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Mass Impact</div>
          <div className={cx(
            "text-sm font-semibold font-mono tabular-nums",
            data.impact.massDelta_kg > 0 ? "text-red-400" : data.impact.massDelta_kg < 0 ? "text-emerald-400" : "text-gray-400"
          )}>
            {fmtDelta(data.impact.massDelta_kg, "kg")}
          </div>
        </div>
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Cost Impact</div>
          <div className={cx(
            "text-sm font-semibold font-mono tabular-nums",
            data.impact.costDelta > 0 ? "text-red-400" : data.impact.costDelta < 0 ? "text-emerald-400" : "text-gray-400"
          )}>
            {fmtDelta(data.impact.costDelta, "\u20AC")}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center text-xs">
        <span className="text-gray-500">Filter:</span>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity((e.target as HTMLSelectElement).value as BomDiffSeverity | "all")}
          className="px-2 py-1 bg-white/5 border border-white/10 rounded text-gray-300 text-xs"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType((e.target as HTMLSelectElement).value as BomDiffChangeType | "all")}
          className="px-2 py-1 bg-white/5 border border-white/10 rounded text-gray-300 text-xs"
        >
          <option value="all">All types</option>
          <option value="added">Added</option>
          <option value="removed">Removed</option>
          <option value="quantity_changed">Qty Changed</option>
          <option value="material_changed">Material</option>
          <option value="cost_changed">Cost</option>
        </select>
        <span className="text-gray-600 ml-auto">
          {filteredChanges.length} / {data.changes.length} changes
        </span>
      </div>

      {/* Selected change detail */}
      {selectedIdx != null && filteredChanges[selectedIdx] && (
        <div className="mb-3 p-3 bg-white/5 rounded-md border border-white/10">
          <div className="text-xs text-gray-200 font-medium">{filteredChanges[selectedIdx].description}</div>
        </div>
      )}

      {/* Changes table */}
      {filteredChanges.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm border border-white/10 rounded-lg">
          No changes match current filters
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-20">Severity</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-28">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Part</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-32">Values</th>
              </tr>
            </thead>
            <tbody>
              {filteredChanges.map((entry, i) => (
                <ChangeRow
                  key={`${entry.partNumber}-${entry.changeType}-${i}`}
                  entry={entry}
                  onClick={() => handleSelect(i)}
                  isSelected={selectedIdx === i}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-right text-xs text-gray-600">
        {data.baselineRevision} vs {data.comparisonRevision} | {data.summary.totalChanges} changes
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<BomDiffViewer />, document.getElementById("app")!);
