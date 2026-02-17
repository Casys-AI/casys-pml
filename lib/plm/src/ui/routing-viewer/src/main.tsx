/**
 * Routing Viewer UI for MCP Apps
 *
 * Displays manufacturing routing as a vertical timeline of operations
 * with setup/run times, work centers, and tooling chips.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/routing-viewer
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

interface RoutingOperation {
  operationNumber: string;
  name: string;
  type: string;
  workCenter: string;
  setupTime_min: number;
  runTime_min: number;
  tooling?: string[];
  notes?: string;
}

interface Routing {
  id: string;
  title: string;
  partNumber: string;
  partName: string;
  materialId?: string;
  operations: RoutingOperation[];
  summary: {
    totalOperations: number;
    totalSetupTime_min: number;
    totalRunTime_min: number;
    totalCycleTime_min: number;
  };
  generatedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Routing Viewer", version: "1.0.0" });
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
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ============================================================================
// Component
// ============================================================================

function RoutingViewer() {
  const [data, setData] = useState<Routing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);

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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="h-16 flex-1 bg-bg-muted rounded" />
          ))}
        </div>
        <div class="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="h-24 bg-bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Empty
  if (!data) {
    return (
      <div class={containers.root}>
        <div class={containers.centered}>No routing data</div>
      </div>
    );
  }

  const handleOpClick = (op: RoutingOperation) => {
    setSelectedOp(
      selectedOp === op.operationNumber ? null : op.operationNumber
    );
    notifyModel("select_operation", {
      operationNumber: op.operationNumber,
      name: op.name,
      type: op.type,
    });
  };

  const totalHours = (data.summary.totalCycleTime_min / 60).toFixed(1);

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class={typography.sectionTitle}>{data.title}</h1>
          {data.materialId && (
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20">
              Material: {data.materialId}
            </span>
          )}
        </div>
        <div class={cx(typography.muted, "mt-1 flex gap-3 flex-wrap")}>
          <span>Part: {data.partNumber}</span>
          <span>{data.partName}</span>
          <span>Generated: {data.generatedAt}</span>
        </div>
      </div>

      {/* Summary */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class={containers.card}>
          <div class={typography.muted}>Operations</div>
          <div class={typography.value}>{data.summary.totalOperations}</div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Setup Time</div>
          <div class={typography.value}>
            {formatTime(data.summary.totalSetupTime_min)}
          </div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Run Time</div>
          <div class={typography.value}>
            {formatTime(data.summary.totalRunTime_min)}
          </div>
        </div>
        <div class={cx(containers.card, "border-accent/30")}>
          <div class={cx(typography.muted, "text-accent")}>Total Cycle</div>
          <div class={cx(typography.value, "text-accent")}>
            {formatTime(data.summary.totalCycleTime_min)}
          </div>
          <div class={typography.muted}>{totalHours} hours</div>
        </div>
      </div>

      {/* Timeline */}
      <div class="relative pl-6">
        {/* Vertical connector line */}
        <div class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border-default" />

        <div class="space-y-3">
          {data.operations.map((op, idx) => {
            const isSelected = selectedOp === op.operationNumber;
            return (
              <div
                key={op.operationNumber}
                onClick={() => handleOpClick(op)}
                class={cx(
                  "relative flex gap-3",
                  interactive.rowHover,
                  "rounded-lg"
                )}
              >
                {/* Timeline dot */}
                <div class="absolute -left-6 top-4 w-5 h-5 rounded-full border-2 border-accent bg-bg-canvas flex items-center justify-center z-10">
                  <span class="text-[9px] font-bold text-accent">
                    {idx + 1}
                  </span>
                </div>

                {/* Card */}
                <div
                  class={cx(
                    "flex-1 p-3 rounded-lg border border-border-default bg-bg-subtle",
                    isSelected &&
                      "ring-2 ring-blue-500/30 border-blue-500/30"
                  )}
                >
                  <div class="flex items-center gap-2 flex-wrap mb-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-accent bg-accent-dim">
                      Op {op.operationNumber}
                    </span>
                    <span class="font-medium text-fg-default">{op.name}</span>
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15">
                      {op.type}
                    </span>
                  </div>

                  <div class="flex items-center gap-4 text-xs text-fg-muted flex-wrap">
                    <span>Work Center: {op.workCenter}</span>
                    <span>Setup: {formatTime(op.setupTime_min)}</span>
                    <span>Run: {formatTime(op.runTime_min)}</span>
                  </div>

                  {/* Tooling chips */}
                  {op.tooling && op.tooling.length > 0 && (
                    <div class="flex gap-1.5 mt-2 flex-wrap">
                      {op.tooling.map((tool) => (
                        <span
                          key={tool}
                          class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {op.notes && (
                    <p class="mt-1.5 text-xs text-fg-muted italic">
                      {op.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<RoutingViewer />, document.getElementById("app")!);
