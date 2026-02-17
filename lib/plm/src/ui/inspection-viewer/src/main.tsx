/**
 * Inspection Viewer UI for MCP Apps
 *
 * Displays inspection plans with characteristics table,
 * CTQ flags, method/level badges, and summary counters.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/inspection-viewer
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

interface InspectionCharacteristic {
  id: string;
  partNumber: string;
  partName: string;
  characteristicName: string;
  nominal?: string;
  tolerance?: string;
  method:
    | "cmm"
    | "caliper"
    | "micrometer"
    | "visual"
    | "gauge"
    | "functional_test"
    | "other";
  level: "full" | "sampling" | "skip";
  sampleSize?: string;
  ctq: boolean;
  source?: string;
}

interface InspectionPlan {
  id: string;
  title: string;
  productName: string;
  bomRevision: string;
  characteristics: InspectionCharacteristic[];
  summary: {
    totalCharacteristics: number;
    ctqCount: number;
    fullInspection: number;
    samplingInspection: number;
    skipped: number;
  };
  generatedAt: string;
  standard?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Inspection Viewer", version: "1.0.0" });
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

const METHOD_LABELS: Record<string, string> = {
  cmm: "CMM",
  caliper: "Caliper",
  micrometer: "Micrometer",
  visual: "Visual",
  gauge: "Gauge",
  functional_test: "Func. Test",
  other: "Other",
};

const LEVEL_STYLES: Record<string, string> = {
  full: "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  sampling:
    "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  skip: "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
};

// ============================================================================
// Component
// ============================================================================

function InspectionViewer() {
  const [data, setData] = useState<InspectionPlan | null>(null);
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
        <div class={containers.centered}>No inspection plan data</div>
      </div>
    );
  }

  const handleRowClick = (char: InspectionCharacteristic) => {
    setSelectedId(selectedId === char.id ? null : char.id);
    notifyModel("select_characteristic", {
      id: char.id,
      partNumber: char.partNumber,
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

      {/* Summary bar */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class={containers.card}>
          <div class={typography.muted}>Total</div>
          <div class={typography.value}>{data.summary.totalCharacteristics}</div>
        </div>
        <div class={cx(containers.card, "border-red-500/30")}>
          <div class={cx(typography.muted, "text-red-400")}>CTQ</div>
          <div class={cx(typography.value, "text-red-400")}>
            {data.summary.ctqCount}
          </div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Full Inspection</div>
          <div class={typography.value}>{data.summary.fullInspection}</div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Sampling</div>
          <div class={typography.value}>{data.summary.samplingInspection}</div>
        </div>
      </div>

      {/* Table */}
      <div class="overflow-x-auto rounded-lg border border-border-default">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-border-default bg-bg-subtle">
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">Part Number</th>
              <th class="px-3 py-2 text-left font-medium">Part Name</th>
              <th class="px-3 py-2 text-left font-medium">Characteristic</th>
              <th class="px-3 py-2 text-left font-medium">Method</th>
              <th class="px-3 py-2 text-left font-medium">Level</th>
              <th class="px-3 py-2 text-center font-medium">CTQ</th>
              <th class="px-3 py-2 text-left font-medium">Nominal</th>
              <th class="px-3 py-2 text-left font-medium">Tolerance</th>
            </tr>
          </thead>
          <tbody>
            {data.characteristics.map((char) => {
              const isSelected = selectedId === char.id;
              return (
                <tr
                  key={char.id}
                  onClick={() => handleRowClick(char)}
                  class={cx(
                    "border-b border-border-subtle",
                    interactive.rowHover,
                    isSelected && interactive.rowSelected
                  )}
                >
                  <td class="px-3 py-2 font-mono text-xs">{char.id}</td>
                  <td class="px-3 py-2 font-mono">{char.partNumber}</td>
                  <td class="px-3 py-2">{char.partName}</td>
                  <td class="px-3 py-2 font-medium">
                    {char.characteristicName}
                  </td>
                  <td class="px-3 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15">
                      {METHOD_LABELS[char.method] || char.method}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class={cx(
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        LEVEL_STYLES[char.level]
                      )}
                    >
                      {char.level}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-center">
                    {char.ctq ? (
                      <span class="text-red-500 font-bold">CTQ</span>
                    ) : (
                      <span class="text-fg-muted">--</span>
                    )}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs">
                    {char.nominal || "--"}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs">
                    {char.tolerance || "--"}
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

render(<InspectionViewer />, document.getElementById("app")!);
