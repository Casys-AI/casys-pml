/**
 * Cycle Time Viewer UI for MCP Apps
 *
 * Displays cycle time analysis with summary metrics, a CSS-only
 * horizontal stacked bar chart, and a detailed parts table.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/cycle-time-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { interactive, typography, containers } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface PartCycleTime {
  partNumber: string;
  partName: string;
  quantity: number;
  setupTime_min: number;
  runTimePerUnit_min: number;
  totalRunTime_min: number;
  operationCount: number;
}

interface CycleTimeAnalysis {
  id: string;
  productName: string;
  batchSize: number;
  parts: PartCycleTime[];
  totals: {
    totalSetupTime_min: number;
    totalRunTime_min: number;
    totalCycleTime_min: number;
    cycleTimePerUnit_min: number;
    totalCycleTime_hours: number;
  };
  generatedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Cycle Time Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [
      { type: "text", text: `User ${event}: ${JSON.stringify(data)}` },
    ],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ============================================================================
// Component
// ============================================================================

function CycleTimeViewer() {
  const [data, setData] = useState<CycleTimeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

    app.ontoolresult = (result: {
      content?: Array<{ type: string; text?: string }>;
    }) => {
      setLoading(false);
      const textContent = result.content?.find((c) => c.type === "text");
      if (textContent?.text) {
        try {
          setData(JSON.parse(textContent.text));
        } catch (e) {
          console.error("Parse error:", e);
        }
      }
    };

    (app as any).ontoolinputpartial = () => setLoading(true);
  }, []);

  // Sort parts by total time (setup + totalRun) descending for the bar chart
  const sortedParts = useMemo(() => {
    if (!data?.parts) return [];
    return [...data.parts].sort(
      (a, b) =>
        b.setupTime_min + b.totalRunTime_min -
        (a.setupTime_min + a.totalRunTime_min)
    );
  }, [data?.parts]);

  // Max total for bar scaling
  const maxPartTotal = useMemo(() => {
    if (sortedParts.length === 0) return 1;
    return Math.max(
      ...sortedParts.map((p) => p.setupTime_min + p.totalRunTime_min)
    );
  }, [sortedParts]);

  // Loading
  if (loading) {
    return (
      <div class={cx(containers.root, "animate-pulse")}>
        <div class="h-8 w-48 bg-bg-muted rounded mb-2" />
        <div class="h-4 w-32 bg-bg-muted rounded mb-4" />
        <div class="grid grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="h-20 bg-bg-muted rounded" />
          ))}
        </div>
        <div class="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} class="h-8 bg-bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Empty
  if (!data) {
    return (
      <div class={containers.root}>
        <div class={containers.centered}>No cycle time data</div>
      </div>
    );
  }

  const handlePartClick = (part: PartCycleTime) => {
    setSelectedPart(
      selectedPart === part.partNumber ? null : part.partNumber
    );
    notifyModel("select_part", {
      partNumber: part.partNumber,
      partName: part.partName,
    });
  };

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class={typography.sectionTitle}>{data.productName}</h1>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20">
            Batch: {data.batchSize}
          </span>
        </div>
        <div class={cx("mt-1 flex items-baseline gap-2")}>
          <span class="text-3xl font-bold font-mono text-accent">
            {data.totals.totalCycleTime_hours.toFixed(1)}h
          </span>
          <span class={typography.muted}>total cycle time</span>
        </div>
        <div class={cx(typography.muted, "mt-1")}>
          Generated: {data.generatedAt}
        </div>
      </div>

      {/* Summary metric cards */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class={containers.card}>
          <div class={typography.muted}>Total Setup</div>
          <div class={typography.value}>
            {formatTime(data.totals.totalSetupTime_min)}
          </div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Total Run</div>
          <div class={typography.value}>
            {formatTime(data.totals.totalRunTime_min)}
          </div>
        </div>
        <div class={cx(containers.card, "border-accent/30")}>
          <div class={cx(typography.muted, "text-accent")}>Total Cycle</div>
          <div class={cx(typography.value, "text-accent")}>
            {formatTime(data.totals.totalCycleTime_min)}
          </div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Per Unit</div>
          <div class={typography.value}>
            {formatTime(data.totals.cycleTimePerUnit_min)}
          </div>
        </div>
      </div>

      {/* Horizontal stacked bar chart */}
      <div class="mb-5">
        <div class={cx(typography.label, "mb-3")}>
          Time Distribution by Part
        </div>

        {/* Legend */}
        <div class="flex gap-4 mb-3 text-xs text-fg-muted">
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded-sm bg-accent/40" />
            <span>Setup</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded-sm bg-accent" />
            <span>Run</span>
          </div>
        </div>

        <div class="space-y-2">
          {sortedParts.map((part) => {
            const total = part.setupTime_min + part.totalRunTime_min;
            const setupPct = (part.setupTime_min / maxPartTotal) * 100;
            const runPct = (part.totalRunTime_min / maxPartTotal) * 100;
            const isSelected = selectedPart === part.partNumber;

            return (
              <div
                key={part.partNumber}
                onClick={() => handlePartClick(part)}
                class={cx(
                  "rounded p-2",
                  interactive.rowHover,
                  isSelected && "bg-blue-950/30"
                )}
              >
                <div class="flex justify-between items-center mb-1">
                  <div class="text-xs font-medium text-fg-default truncate">
                    {part.partNumber}{" "}
                    <span class="text-fg-muted font-normal">
                      {part.partName}
                    </span>
                  </div>
                  <div class="text-xs font-mono text-fg-muted shrink-0 ml-2">
                    {formatTime(total)}
                  </div>
                </div>
                <div class="flex h-4 rounded overflow-hidden bg-bg-muted">
                  {part.setupTime_min > 0 && (
                    <div
                      class="h-full bg-accent/40 transition-all duration-300"
                      style={{ width: `${setupPct}%` }}
                      title={`Setup: ${formatTime(part.setupTime_min)}`}
                    />
                  )}
                  {part.totalRunTime_min > 0 && (
                    <div
                      class="h-full bg-accent transition-all duration-300"
                      style={{ width: `${runPct}%` }}
                      title={`Run: ${formatTime(part.totalRunTime_min)}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail table */}
      <div class="overflow-x-auto rounded-lg border border-border-default">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-border-default bg-bg-subtle">
              <th class="px-3 py-2 text-left font-medium">Part Number</th>
              <th class="px-3 py-2 text-left font-medium">Name</th>
              <th class="px-3 py-2 text-right font-medium">Qty</th>
              <th class="px-3 py-2 text-right font-medium">Setup</th>
              <th class="px-3 py-2 text-right font-medium">Run/Unit</th>
              <th class="px-3 py-2 text-right font-medium">Total Run</th>
              <th class="px-3 py-2 text-right font-medium">Ops</th>
            </tr>
          </thead>
          <tbody>
            {data.parts.map((part) => {
              const isSelected = selectedPart === part.partNumber;
              return (
                <tr
                  key={part.partNumber}
                  onClick={() => handlePartClick(part)}
                  class={cx(
                    "border-b border-border-subtle",
                    interactive.rowHover,
                    isSelected && interactive.rowSelected
                  )}
                >
                  <td class="px-3 py-2 font-mono">{part.partNumber}</td>
                  <td class="px-3 py-2">{part.partName}</td>
                  <td class="px-3 py-2 text-right font-mono">
                    {part.quantity}
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs">
                    {formatTime(part.setupTime_min)}
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs">
                    {formatTime(part.runTimePerUnit_min)}
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs">
                    {formatTime(part.totalRunTime_min)}
                  </td>
                  <td class="px-3 py-2 text-right font-mono">
                    {part.operationCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<CycleTimeViewer />, document.getElementById("app")!);
