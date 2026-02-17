/**
 * Work Instruction Viewer UI for MCP Apps
 *
 * Displays step-by-step work instructions with numbered steps,
 * safety warnings, quality checks, tool chips, and time estimates.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/work-instruction-viewer
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

interface WorkInstructionStep {
  step: number;
  instruction: string;
  safetyWarning?: string;
  tools?: string[];
  qualityCheck?: string;
  estimatedTime_min?: number;
  notes?: string;
}

interface WorkInstruction {
  id: string;
  title: string;
  partNumber: string;
  partName: string;
  operationNumber: string;
  operationName: string;
  steps: WorkInstructionStep[];
  summary: {
    totalSteps: number;
    estimatedTotalTime_min: number;
    safetyWarnings: number;
    qualityChecks: number;
  };
  generatedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Work Instruction Viewer", version: "1.0.0" });
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

function WorkInstructionViewer() {
  const [data, setData] = useState<WorkInstruction | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

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
        <div class="h-6 w-56 bg-bg-muted rounded mb-4" />
        <div class="flex gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="h-16 flex-1 bg-bg-muted rounded" />
          ))}
        </div>
        <div class="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} class="h-28 bg-bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Empty
  if (!data) {
    return (
      <div class={containers.root}>
        <div class={containers.centered}>No work instruction data</div>
      </div>
    );
  }

  const handleStepClick = (step: WorkInstructionStep) => {
    setSelectedStep(selectedStep === step.step ? null : step.step);
    notifyModel("select_step", {
      step: step.step,
      instruction: step.instruction,
    });
  };

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class={typography.sectionTitle}>{data.title}</h1>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-accent bg-accent-dim">
            Op {data.operationNumber}: {data.operationName}
          </span>
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
          <div class={typography.muted}>Steps</div>
          <div class={typography.value}>{data.summary.totalSteps}</div>
        </div>
        <div class={containers.card}>
          <div class={typography.muted}>Est. Time</div>
          <div class={typography.value}>
            {formatTime(data.summary.estimatedTotalTime_min)}
          </div>
        </div>
        <div
          class={cx(
            containers.card,
            data.summary.safetyWarnings > 0 && "border-orange-500/30"
          )}
        >
          <div
            class={cx(
              typography.muted,
              data.summary.safetyWarnings > 0 && "text-orange-400"
            )}
          >
            Safety Warnings
          </div>
          <div
            class={cx(
              typography.value,
              data.summary.safetyWarnings > 0 && "text-orange-400"
            )}
          >
            {data.summary.safetyWarnings}
          </div>
        </div>
        <div
          class={cx(
            containers.card,
            data.summary.qualityChecks > 0 && "border-blue-500/30"
          )}
        >
          <div
            class={cx(
              typography.muted,
              data.summary.qualityChecks > 0 && "text-blue-400"
            )}
          >
            Quality Checks
          </div>
          <div
            class={cx(
              typography.value,
              data.summary.qualityChecks > 0 && "text-blue-400"
            )}
          >
            {data.summary.qualityChecks}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div class="space-y-3">
        {data.steps.map((step) => {
          const isSelected = selectedStep === step.step;
          return (
            <div
              key={step.step}
              onClick={() => handleStepClick(step)}
              class={cx(
                "flex gap-3 rounded-lg border border-border-default p-3",
                interactive.rowHover,
                isSelected && "ring-2 ring-blue-500/30 border-blue-500/30"
              )}
            >
              {/* Step number circle */}
              <div class="shrink-0 w-8 h-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
                <span class="text-sm font-bold text-accent">{step.step}</span>
              </div>

              {/* Step content */}
              <div class="flex-1 min-w-0">
                {/* Instruction text */}
                <p class="text-sm text-fg-default leading-relaxed">
                  {step.instruction}
                </p>

                {/* Safety warning */}
                {step.safetyWarning && (
                  <div class="mt-2 p-2 rounded border border-orange-500/30 bg-orange-500/10">
                    <div class="flex items-start gap-1.5">
                      <span class="text-orange-500 font-bold text-xs shrink-0">
                        /!\
                      </span>
                      <span class="text-xs text-orange-400 leading-relaxed">
                        {step.safetyWarning}
                      </span>
                    </div>
                  </div>
                )}

                {/* Quality check */}
                {step.qualityCheck && (
                  <div class="mt-2 p-2 rounded border border-blue-500/30 bg-blue-500/10">
                    <div class="flex items-start gap-1.5">
                      <span class="text-blue-500 font-bold text-xs shrink-0">
                        QC
                      </span>
                      <span class="text-xs text-blue-400 leading-relaxed">
                        {step.qualityCheck}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tools and time row */}
                <div class="flex items-center gap-3 mt-2 flex-wrap">
                  {/* Tool chips */}
                  {step.tools && step.tools.length > 0 && (
                    <div class="flex gap-1 flex-wrap">
                      {step.tools.map((tool) => (
                        <span
                          key={tool}
                          class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Time badge */}
                  {step.estimatedTime_min != null && (
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15">
                      {formatTime(step.estimatedTime_min)}
                    </span>
                  )}
                </div>

                {/* Notes */}
                {step.notes && (
                  <p class="mt-1.5 text-xs text-fg-muted italic">
                    {step.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<WorkInstructionViewer />, document.getElementById("app")!);
