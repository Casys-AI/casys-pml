/**
 * Control Plan Viewer UI for MCP Apps
 *
 * Displays manufacturing control plans with process descriptions,
 * control methods, frequencies, and reaction plan badges.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/control-plan-viewer
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { interactive, typography, containers } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ControlPlanEntry {
  id: string;
  operationNumber: string;
  processDescription: string;
  partNumber: string;
  partName: string;
  characteristic: string;
  specification?: string;
  method: string;
  frequency: string;
  controlMethod: string;
  reactionPlan:
    | "stop_production"
    | "quarantine"
    | "rework"
    | "scrap"
    | "notify_engineering"
    | "document_only";
}

interface ControlPlan {
  id: string;
  title: string;
  productName: string;
  bomRevision: string;
  entries: ControlPlanEntry[];
  summary: {
    totalEntries: number;
    uniqueParts: number;
    stopProductionCount: number;
  };
  generatedAt: string;
  standard?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Control Plan Viewer", version: "1.0.0" });
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

const REACTION_STYLES: Record<string, string> = {
  stop_production:
    "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  quarantine:
    "text-orange-600 bg-orange-500/15 dark:text-orange-400 dark:bg-orange-500/20",
  rework:
    "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  scrap: "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
  notify_engineering:
    "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
  document_only:
    "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
};

const REACTION_LABELS: Record<string, string> = {
  stop_production: "Stop Production",
  quarantine: "Quarantine",
  rework: "Rework",
  scrap: "Scrap",
  notify_engineering: "Notify Eng.",
  document_only: "Document Only",
};

// ============================================================================
// Component
// ============================================================================

function ControlPlanViewer() {
  const [data, setData] = useState<ControlPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Loading
  if (loading) {
    return (
      <div class={cx(containers.root, "animate-pulse")}>
        <div class="h-6 w-48 bg-bg-muted rounded mb-4" />
        <div class="flex gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} class="h-16 flex-1 bg-bg-muted rounded" />
          ))}
        </div>
        <div class="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
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
        <div class={containers.centered}>No control plan data</div>
      </div>
    );
  }

  const handleRowClick = (entry: ControlPlanEntry) => {
    setSelectedId(selectedId === entry.id ? null : entry.id);
    notifyModel("select_control", {
      id: entry.id,
      partNumber: entry.partNumber,
      reactionPlan: entry.reactionPlan,
    });
  };

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class={typography.sectionTitle}>{data.title}</h1>
          {data.standard && (
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20">
              {data.standard}
            </span>
          )}
        </div>
        <div class={cx(typography.muted, "mt-1 flex gap-3 flex-wrap")}>
          <span>Product: {data.productName}</span>
          <span>BOM Rev: {data.bomRevision}</span>
          <span>Generated: {data.generatedAt}</span>
        </div>
      </div>

      {/* Summary */}
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class={containers.card}>
          <div class={typography.muted}>Total Entries</div>
          <div class={typography.value}>{data.summary.totalEntries}</div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Unique Parts</div>
          <div class={typography.value}>{data.summary.uniqueParts}</div>
        </div>
        <div
          class={cx(
            containers.card,
            data.summary.stopProductionCount > 0 && "border-red-500/30"
          )}
        >
          <div
            class={cx(
              typography.muted,
              data.summary.stopProductionCount > 0 && "text-red-400"
            )}
          >
            Stop Production
          </div>
          <div
            class={cx(
              typography.value,
              data.summary.stopProductionCount > 0 && "text-red-400"
            )}
          >
            {data.summary.stopProductionCount}
          </div>
        </div>
      </div>

      {/* Table */}
      <div class="overflow-x-auto rounded-lg border border-border-default">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-border-default bg-bg-subtle">
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">Op#</th>
              <th class="px-3 py-2 text-left font-medium">Process</th>
              <th class="px-3 py-2 text-left font-medium">Part</th>
              <th class="px-3 py-2 text-left font-medium">Characteristic</th>
              <th class="px-3 py-2 text-left font-medium">Spec</th>
              <th class="px-3 py-2 text-left font-medium">Method</th>
              <th class="px-3 py-2 text-left font-medium">Frequency</th>
              <th class="px-3 py-2 text-left font-medium">Control</th>
              <th class="px-3 py-2 text-left font-medium">Reaction Plan</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => {
              const isSelected = selectedId === entry.id;
              return (
                <tr
                  key={entry.id}
                  onClick={() => handleRowClick(entry)}
                  class={cx(
                    "border-b border-border-subtle",
                    interactive.rowHover,
                    isSelected && interactive.rowSelected
                  )}
                >
                  <td class="px-3 py-2 font-mono text-xs">{entry.id}</td>
                  <td class="px-3 py-2 font-mono">{entry.operationNumber}</td>
                  <td class="px-3 py-2">{entry.processDescription}</td>
                  <td class="px-3 py-2">
                    <div class="font-mono text-xs">{entry.partNumber}</div>
                    <div class="text-fg-muted text-xs">{entry.partName}</div>
                  </td>
                  <td class="px-3 py-2 font-medium">{entry.characteristic}</td>
                  <td class="px-3 py-2 font-mono text-xs">
                    {entry.specification || "--"}
                  </td>
                  <td class="px-3 py-2 text-xs">{entry.method}</td>
                  <td class="px-3 py-2 text-xs">{entry.frequency}</td>
                  <td class="px-3 py-2 text-xs">{entry.controlMethod}</td>
                  <td class="px-3 py-2">
                    <span
                      class={cx(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                        REACTION_STYLES[entry.reactionPlan]
                      )}
                    >
                      {REACTION_LABELS[entry.reactionPlan] ||
                        entry.reactionPlan}
                    </span>
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

render(<ControlPlanViewer />, document.getElementById("app")!);
