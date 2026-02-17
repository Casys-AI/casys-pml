/**
 * BOM Cost Viewer — native PLM viewer for CostResult
 *
 * Consumes CostResult { model, parts, totals, distribution } directly.
 *
 * @module lib/plm/src/ui/bom-cost-viewer
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

interface PartCostBreakdown {
  partNumber: string;
  name: string;
  quantity: number;
  materialCostPerUnit: number;
  machiningCostPerUnit: number;
  overheadCostPerUnit: number;
  unitCost: number;
  totalCost: number;
}

interface CostResult {
  model: string;
  parts: PartCostBreakdown[];
  totals: {
    materialCost: number;
    machiningCost: number;
    overheadCost: number;
    totalCost: number;
  };
  distribution: {
    material_pct: number;
    machining_pct: number;
    overhead_pct: number;
  };
  currency: string;
  computedAt: string;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "BOM Cost Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Cost Bar Component
// ============================================================================

function CostBar({ material, machining, overhead }: { material: number; machining: number; overhead: number }) {
  const total = material + machining + overhead;
  if (total === 0) return <span className="text-gray-600">-</span>;
  const pM = (material / total) * 100;
  const pMa = (machining / total) * 100;
  const pO = (overhead / total) * 100;

  return (
    <div className="flex h-3 rounded overflow-hidden w-24" title={`Mat: ${pM.toFixed(0)}% | Mach: ${pMa.toFixed(0)}% | OH: ${pO.toFixed(0)}%`}>
      {pM > 0 && <div style={{ width: `${pM}%` }} className="bg-amber-500" />}
      {pMa > 0 && <div style={{ width: `${pMa}%` }} className="bg-blue-500" />}
      {pO > 0 && <div style={{ width: `${pO}%` }} className="bg-gray-500" />}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function BomCostViewer() {
  const [data, setData] = useState<CostResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("totalCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        setData(JSON.parse(text) as CostResult);
      } catch (e) {
        setError(`Failed to parse cost data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const sortedParts = useMemo(() => {
    if (!data) return [];
    const parts = [...data.parts];
    parts.sort((a, b) => {
      const av = a[sortBy as keyof PartCostBreakdown] as number;
      const bv = b[sortBy as keyof PartCostBreakdown] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return parts;
  }, [data, sortBy, sortDir]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const fmt = (n: number) => n.toFixed(2);

  if (loading) return <TableSkeleton />;
  if (error) return <div className="p-4 text-red-400 text-sm">{error}</div>;
  if (!data) return <div className="p-6 text-center text-gray-500 text-sm">No cost data</div>;

  return (
    <div className="p-4 font-sans text-sm bg-[#08080a] min-h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-gray-200 font-semibold">Cost Analysis</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-blue-500/15 text-blue-400 rounded">
          {data.model}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-white/10 text-gray-400 rounded">
          {data.currency}
        </span>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-[120px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Total Cost</div>
          <div className="text-lg font-bold text-amber-400 font-mono tabular-nums">
            {data.currency === "EUR" ? "\u20AC" : "$"}{fmt(data.totals.totalCost)}
          </div>
        </div>
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Material</div>
          <div className="text-sm font-semibold text-amber-500 font-mono tabular-nums">{fmt(data.totals.materialCost)}</div>
          <div className="text-[10px] text-gray-500">{data.distribution.material_pct}%</div>
        </div>
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Machining</div>
          <div className="text-sm font-semibold text-blue-400 font-mono tabular-nums">{fmt(data.totals.machiningCost)}</div>
          <div className="text-[10px] text-gray-500">{data.distribution.machining_pct}%</div>
        </div>
        <div className="flex-1 min-w-[100px] p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase text-gray-500 mb-1">Overhead</div>
          <div className="text-sm font-semibold text-gray-400 font-mono tabular-nums">{fmt(data.totals.overheadCost)}</div>
          <div className="text-[10px] text-gray-500">{data.distribution.overhead_pct}%</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Material</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Machining</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-500 inline-block" /> Overhead</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-white/10 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              {[
                { key: "partNumber", label: "Part #", align: "left" },
                { key: "name", label: "Name", align: "left" },
                { key: "quantity", label: "Qty", align: "right" },
                { key: "", label: "Breakdown", align: "left" },
                { key: "unitCost", label: "Unit", align: "right" },
                { key: "totalCost", label: "Total", align: "right" },
              ].map((col) => (
                <th
                  key={col.label}
                  className={cx(
                    "px-3 py-2 font-semibold text-gray-400 uppercase text-[10px] tracking-wide whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left",
                    col.key && "cursor-pointer hover:text-gray-200"
                  )}
                  onClick={() => col.key && handleSort(col.key)}
                >
                  {col.label}
                  {sortBy === col.key && <span className="ml-1">{sortDir === "desc" ? "\u2193" : "\u2191"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedParts.map((p) => (
              <tr key={p.partNumber} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-3 py-2 font-mono text-gray-500">{p.partNumber}</td>
                <td className="px-3 py-2 text-gray-200">{p.name}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{p.quantity}</td>
                <td className="px-3 py-2">
                  <CostBar
                    material={p.materialCostPerUnit}
                    machining={p.machiningCostPerUnit}
                    overhead={p.overheadCostPerUnit}
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-400">{fmt(p.unitCost)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-200 font-semibold">{fmt(p.totalCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.03]">
              <td colSpan={3} className="px-3 py-2 font-semibold text-gray-400">Total</td>
              <td />
              <td />
              <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-400 font-bold text-sm">
                {fmt(data.totals.totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-2 text-right text-xs text-gray-600">
        {data.parts.length} parts | {data.model} model
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<BomCostViewer />, document.getElementById("app")!);
