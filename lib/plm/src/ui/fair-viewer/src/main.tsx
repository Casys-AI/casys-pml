/**
 * FAIR Viewer UI for MCP Apps
 *
 * Displays First Article Inspection Reports with measurement status,
 * verdict badge, and pass/fail/pending/waived summary.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/fair-viewer
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

interface FairMeasurement {
  characteristicId: string;
  partNumber: string;
  partName: string;
  characteristicName: string;
  nominal?: string;
  tolerance?: string;
  actualValue?: string;
  status: "pending" | "pass" | "fail" | "waived";
  method:
    | "cmm"
    | "caliper"
    | "micrometer"
    | "visual"
    | "gauge"
    | "functional_test"
    | "other";
  notes?: string;
}

interface FairReport {
  id: string;
  title: string;
  productName: string;
  inspectionPlanId: string;
  serialNumber: string;
  measurements: FairMeasurement[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    pending: number;
    waived: number;
  };
  verdict: "pending" | "accepted" | "rejected" | "conditional";
  generatedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "FAIR Viewer", version: "1.0.0" });
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

const VERDICT_STYLES: Record<string, string> = {
  pending:
    "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
  accepted:
    "text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20",
  rejected:
    "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  conditional:
    "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
};

const STATUS_STYLES: Record<string, string> = {
  pass: "text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20",
  fail: "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  pending:
    "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
  waived:
    "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
};

const METHOD_LABELS: Record<string, string> = {
  cmm: "CMM",
  caliper: "Caliper",
  micrometer: "Micrometer",
  visual: "Visual",
  gauge: "Gauge",
  functional_test: "Func. Test",
  other: "Other",
};

// ============================================================================
// Component
// ============================================================================

function FairViewer() {
  const [data, setData] = useState<FairReport | null>(null);
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
          {Array.from({ length: 4 }).map((_, i) => (
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
        <div class={containers.centered}>No FAIR report data</div>
      </div>
    );
  }

  const handleRowClick = (m: FairMeasurement) => {
    const id = m.characteristicId;
    setSelectedId(selectedId === id ? null : id);
    notifyModel("select_measurement", {
      characteristicId: id,
      status: m.status,
    });
  };

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class={typography.sectionTitle}>{data.title}</h1>
          <span
            class={cx(
              "inline-flex items-center px-2.5 py-1 rounded text-xs font-bold uppercase",
              VERDICT_STYLES[data.verdict]
            )}
          >
            {data.verdict}
          </span>
        </div>
        <div class={cx(typography.muted, "mt-1 flex gap-3 flex-wrap")}>
          <span>S/N: {data.serialNumber}</span>
          <span>Product: {data.productName}</span>
          <span>Plan: {data.inspectionPlanId}</span>
          <span>Generated: {data.generatedAt}</span>
        </div>
      </div>

      {/* Summary bar */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div
          class={cx(
            containers.card,
            "border-green-500/30"
          )}
        >
          <div class={cx(typography.muted, "text-green-400")}>Pass</div>
          <div class={cx(typography.value, "text-green-400")}>
            {data.summary.pass}
          </div>
        </div>
        <div class={cx(containers.card, "border-red-500/30")}>
          <div class={cx(typography.muted, "text-red-400")}>Fail</div>
          <div class={cx(typography.value, "text-red-400")}>
            {data.summary.fail}
          </div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Pending</div>
          <div class={typography.value}>{data.summary.pending}</div>
        </div>
        <div
          class={cx(
            containers.card,
            "border-yellow-500/30"
          )}
        >
          <div class={cx(typography.muted, "text-yellow-400")}>Waived</div>
          <div class={cx(typography.value, "text-yellow-400")}>
            {data.summary.waived}
          </div>
        </div>
      </div>

      {/* Table */}
      <div class="overflow-x-auto rounded-lg border border-border-default">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-border-default bg-bg-subtle">
              <th class="px-3 py-2 text-left font-medium">Char ID</th>
              <th class="px-3 py-2 text-left font-medium">Part Number</th>
              <th class="px-3 py-2 text-left font-medium">Part Name</th>
              <th class="px-3 py-2 text-left font-medium">Characteristic</th>
              <th class="px-3 py-2 text-left font-medium">Nominal</th>
              <th class="px-3 py-2 text-left font-medium">Tolerance</th>
              <th class="px-3 py-2 text-left font-medium">Actual</th>
              <th class="px-3 py-2 text-left font-medium">Status</th>
              <th class="px-3 py-2 text-left font-medium">Method</th>
            </tr>
          </thead>
          <tbody>
            {data.measurements.map((m) => {
              const isSelected = selectedId === m.characteristicId;
              return (
                <tr
                  key={m.characteristicId}
                  onClick={() => handleRowClick(m)}
                  class={cx(
                    "border-b border-border-subtle",
                    interactive.rowHover,
                    isSelected && interactive.rowSelected
                  )}
                >
                  <td class="px-3 py-2 font-mono text-xs">
                    {m.characteristicId}
                  </td>
                  <td class="px-3 py-2 font-mono">{m.partNumber}</td>
                  <td class="px-3 py-2">{m.partName}</td>
                  <td class="px-3 py-2 font-medium">
                    {m.characteristicName}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs">
                    {m.nominal || "--"}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs">
                    {m.tolerance || "--"}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs font-medium">
                    {m.actualValue || "--"}
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class={cx(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        STATUS_STYLES[m.status]
                      )}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15">
                      {METHOD_LABELS[m.method] || m.method}
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

render(<FairViewer />, document.getElementById("app")!);
