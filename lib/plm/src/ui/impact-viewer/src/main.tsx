/**
 * Impact Viewer UI for MCP Apps
 *
 * Displays impact analysis results as severity-grouped cards
 * with colored left bars, element details, and relationship badges.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/plm/src/ui/impact-viewer
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

interface ImpactFinding {
  elementId: string;
  elementName: string;
  kind: string;
  relationship:
    | "parent"
    | "child"
    | "sibling"
    | "referenced_by"
    | "references";
  description: string;
  severity: "info" | "warning" | "critical";
}

interface ImpactAnalysis {
  sourceElementId: string;
  sourceElementName: string;
  findings: ImpactFinding[];
  summary: {
    totalAffected: number;
    critical: number;
    warning: number;
    info: number;
  };
  analyzedAt: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Impact Viewer", version: "1.0.0" });
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

const SEVERITY_CONFIG: Record<
  string,
  { bar: string; icon: string; label: string; counter: string }
> = {
  critical: {
    bar: "bg-red-500",
    icon: "!!",
    label: "Critical",
    counter:
      "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  },
  warning: {
    bar: "bg-yellow-500",
    icon: "!",
    label: "Warning",
    counter:
      "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  },
  info: {
    bar: "bg-blue-500",
    icon: "i",
    label: "Info",
    counter:
      "text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20",
  },
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  referenced_by: "Referenced By",
  references: "References",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ============================================================================
// Component
// ============================================================================

function ImpactViewer() {
  const [data, setData] = useState<ImpactAnalysis | null>(null);
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

  // Group findings by severity, sorted critical -> warning -> info
  const grouped = useMemo(() => {
    if (!data?.findings) return [];
    const sorted = [...data.findings].sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    );

    const groups: Array<{ severity: string; items: ImpactFinding[] }> = [];
    let currentSeverity: string | null = null;
    let currentGroup: ImpactFinding[] = [];

    for (const finding of sorted) {
      if (finding.severity !== currentSeverity) {
        if (currentSeverity !== null) {
          groups.push({ severity: currentSeverity, items: currentGroup });
        }
        currentSeverity = finding.severity;
        currentGroup = [finding];
      } else {
        currentGroup.push(finding);
      }
    }
    if (currentSeverity !== null) {
      groups.push({ severity: currentSeverity, items: currentGroup });
    }

    return groups;
  }, [data?.findings]);

  // Loading
  if (loading) {
    return (
      <div class={cx(containers.root, "animate-pulse")}>
        <div class="h-6 w-64 bg-bg-muted rounded mb-4" />
        <div class="flex gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} class="h-14 flex-1 bg-bg-muted rounded" />
          ))}
        </div>
        <div class="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} class="h-20 bg-bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Empty
  if (!data) {
    return (
      <div class={containers.root}>
        <div class={containers.centered}>No impact analysis data</div>
      </div>
    );
  }

  const handleCardClick = (finding: ImpactFinding) => {
    setSelectedId(
      selectedId === finding.elementId ? null : finding.elementId
    );
    notifyModel("select_finding", {
      elementId: finding.elementId,
      elementName: finding.elementName,
      severity: finding.severity,
    });
  };

  return (
    <div class={containers.root}>
      {/* Header */}
      <div class="mb-4">
        <h1 class={typography.sectionTitle}>
          Impact Analysis — {data.sourceElementName}
        </h1>
        <div class={cx(typography.muted, "mt-1")}>
          Analyzed: {data.analyzedAt}
        </div>
      </div>

      {/* Summary bar */}
      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class={cx(containers.card, "border-red-500/30")}>
          <div class={cx(typography.muted, "text-red-400")}>Critical</div>
          <div class={cx(typography.value, "text-red-400")}>
            {data.summary.critical}
          </div>
        </div>
        <div class={cx(containers.card, "border-yellow-500/30")}>
          <div class={cx(typography.muted, "text-yellow-400")}>Warning</div>
          <div class={cx(typography.value, "text-yellow-400")}>
            {data.summary.warning}
          </div>
        </div>
        <div class={cx(containers.card, "border-blue-500/30")}>
          <div class={cx(typography.muted, "text-blue-400")}>Info</div>
          <div class={cx(typography.value, "text-blue-400")}>
            {data.summary.info}
          </div>
        </div>
      </div>

      {/* Findings grouped by severity */}
      <div class="space-y-5">
        {grouped.map((group) => {
          const config = SEVERITY_CONFIG[group.severity];
          return (
            <div key={group.severity}>
              <div class="flex items-center gap-2 mb-2">
                <span
                  class={cx(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold",
                    config.counter
                  )}
                >
                  {config.label} ({group.items.length})
                </span>
              </div>

              <div class="space-y-2">
                {group.items.map((finding) => {
                  const isSelected = selectedId === finding.elementId;
                  return (
                    <div
                      key={finding.elementId}
                      onClick={() => handleCardClick(finding)}
                      class={cx(
                        "flex rounded-lg border border-border-default overflow-hidden",
                        interactive.rowHover,
                        isSelected &&
                          "ring-2 ring-blue-500/30 border-blue-500/30"
                      )}
                    >
                      {/* Severity color bar */}
                      <div
                        class={cx("w-1.5 shrink-0", config.bar)}
                      />

                      {/* Content */}
                      <div class="flex-1 p-3">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                          <span class="font-medium text-fg-default">
                            {finding.elementName}
                          </span>
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15">
                            {finding.kind}
                          </span>
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20">
                            {RELATIONSHIP_LABELS[finding.relationship] ||
                              finding.relationship}
                          </span>
                        </div>
                        <p class="text-xs text-fg-muted leading-relaxed">
                          {finding.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
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

render(<ImpactViewer />, document.getElementById("app")!);
