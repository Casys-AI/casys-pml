/**
 * Mass Properties Viewer — Onshape mass properties visualization
 *
 * Displays per-body mass, volume, density, center of gravity,
 * and inertia tensor from Onshape's mass properties API.
 *
 * @module lib/onshape/src/ui/mass-viewer
 */

import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { ContentSkeleton, OnshapeBadge, fmtNum, cx } from "../../shared";

// ============================================================================
// Types
// ============================================================================

interface BodyMass {
  mass: [number, number];
  volume: [number, number];
  density?: [number, number];
  centroid: number[];
  inertia: number[];
  periphery?: number[];
  hasMass: boolean;
}

interface MassData {
  bodies: Record<string, BodyMass>;
  hasMass?: boolean;
  massMissingCount?: number;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Mass Properties", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Summary Card
// ============================================================================

function SummaryCard({
  label,
  value,
  unit,
  variant,
}: {
  label: string;
  value: string;
  unit?: string;
  variant?: "accent" | "warning" | "default";
}) {
  const valueColor =
    variant === "accent"
      ? "text-accent"
      : variant === "warning"
        ? "text-warning"
        : "text-fg-default";

  return (
    <div className="bg-bg-muted rounded-lg p-3 border border-border-subtle">
      <div className={cx("text-lg font-mono font-bold", valueColor)}>
        {value}
        {unit && (
          <span className="text-xs font-normal text-fg-dim ml-1">{unit}</span>
        )}
      </div>
      <div className="text-[10px] text-fg-dim uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

// ============================================================================
// Inertia Tensor Grid
// ============================================================================

function InertiaTensor({ values }: { values: number[] }) {
  // inertia array: [Ixx, Ixy, Ixz, Iyx, Iyy, Iyz, Izx, Izy, Izz]
  const labels = ["xx", "xy", "xz", "yx", "yy", "yz", "zx", "zy", "zz"];

  return (
    <div>
      <div className="text-[10px] text-fg-dim uppercase tracking-wider mb-1.5">
        Inertia Tensor
      </div>
      <div className="grid grid-cols-3 gap-px bg-border-subtle rounded overflow-hidden">
        {values.slice(0, 9).map((v, i) => {
          const isDiag = i === 0 || i === 4 || i === 8;
          return (
            <div
              key={labels[i]}
              className={cx(
                "px-2 py-1.5 font-mono text-[11px] text-center",
                isDiag ? "bg-bg-muted text-fg-default" : "bg-bg-subtle text-fg-muted"
              )}
              title={`I${labels[i]}`}
            >
              {v.toExponential(4)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Body Accordion Item
// ============================================================================

function BodyItem({
  bodyId,
  body,
  isExpanded,
  onToggle,
}: {
  bodyId: string;
  body: BodyMass;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const truncatedId =
    bodyId.length > 20 ? bodyId.slice(0, 8) + "..." + bodyId.slice(-8) : bodyId;

  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-muted/50 transition-colors"
      >
        {/* Chevron */}
        <span
          className={cx(
            "text-fg-dim text-xs transition-transform shrink-0",
            isExpanded && "rotate-90"
          )}
        >
          {"\u25B6"}
        </span>

        {/* Body ID */}
        <span className="font-mono text-xs text-fg-muted truncate" title={bodyId}>
          {truncatedId}
        </span>

        {/* Mass value or warning */}
        {body.hasMass ? (
          <span className="ml-auto shrink-0 font-mono text-sm text-accent font-medium">
            {fmtNum(body.mass[0], 6)} kg
          </span>
        ) : (
          <span className="ml-auto shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-warning/15 text-warning">
            No mass data
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border-subtle px-3 py-3 bg-bg-subtle/50 space-y-4">
          {/* Properties grid */}
          <div className="grid grid-cols-2 gap-3">
            <PropRow label="Mass" value={fmtNum(body.mass[0], 6)} unit="kg" accuracy={body.mass[1]} />
            <PropRow label="Volume" value={fmtNum(body.volume[0], 6)} unit="m^3" accuracy={body.volume[1]} />
            {body.density && (
              <PropRow label="Density" value={fmtNum(body.density[0], 2)} unit="kg/m^3" accuracy={body.density[1]} />
            )}
          </div>

          {/* Center of Gravity */}
          {body.centroid.length >= 3 && (
            <div>
              <div className="text-[10px] text-fg-dim uppercase tracking-wider mb-1.5">
                Center of Gravity
              </div>
              <div className="flex gap-3 font-mono text-xs text-fg-default">
                <span>
                  <span className="text-fg-dim mr-1">X</span>
                  {body.centroid[0].toFixed(6)}
                </span>
                <span>
                  <span className="text-fg-dim mr-1">Y</span>
                  {body.centroid[1].toFixed(6)}
                </span>
                <span>
                  <span className="text-fg-dim mr-1">Z</span>
                  {body.centroid[2].toFixed(6)}
                </span>
              </div>
            </div>
          )}

          {/* Inertia Tensor */}
          {body.inertia.length >= 9 && <InertiaTensor values={body.inertia} />}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Property Row
// ============================================================================

function PropRow({
  label,
  value,
  unit,
  accuracy,
}: {
  label: string;
  value: string;
  unit: string;
  accuracy?: number;
}) {
  return (
    <div className="bg-bg-muted rounded px-2.5 py-2">
      <div className="text-[10px] text-fg-dim uppercase tracking-wider">{label}</div>
      <div className="font-mono text-sm text-fg-default font-medium mt-0.5">
        {value}
        <span className="text-xs text-fg-dim ml-1">{unit}</span>
      </div>
      {accuracy != null && accuracy < 1 && (
        <div className="text-[9px] text-fg-dim mt-0.5">
          accuracy: {(accuracy * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MassViewer() {
  const [data, setData] = useState<MassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set());

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const parsed = JSON.parse(text) as MassData;
        setData(parsed);
        // Auto-expand if 3 or fewer bodies
        const bodyIds = Object.keys(parsed.bodies ?? {});
        if (bodyIds.length <= 3) {
          setExpandedBodies(new Set(bodyIds));
        } else {
          setExpandedBodies(new Set());
        }
      } catch (e) {
        setError(`Failed to parse mass data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };
    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const bodyEntries = useMemo(() => {
    if (!data?.bodies) return [];
    return Object.entries(data.bodies);
  }, [data]);

  const totals = useMemo(() => {
    if (!bodyEntries.length) return { mass: 0, volume: 0, count: 0, missingCount: 0 };
    let mass = 0;
    let volume = 0;
    let missingCount = 0;
    for (const [, body] of bodyEntries) {
      if (body.hasMass) {
        mass += body.mass[0];
        volume += body.volume[0];
      } else {
        missingCount++;
      }
    }
    return {
      mass,
      volume,
      count: bodyEntries.length,
      missingCount: data?.massMissingCount ?? missingCount,
    };
  }, [bodyEntries, data]);

  const toggleBody = useCallback((id: string) => {
    setExpandedBodies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    notifyModel("select-body", { id });
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) return <ContentSkeleton lines={5} />;

  if (error) {
    return (
      <div className="p-4 text-sm text-error">
        {error}
      </div>
    );
  }

  if (!data || !bodyEntries.length) {
    return (
      <div className="p-6 text-center text-fg-dim text-sm">
        No mass properties data available.
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <OnshapeBadge />
        <span className="text-fg-default font-semibold">Mass Properties</span>
        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-accent/10 text-accent">
          {totals.count} {totals.count === 1 ? "body" : "bodies"}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard
          label="Total Mass"
          value={fmtNum(totals.mass, 6)}
          unit="kg"
          variant="accent"
        />
        <SummaryCard
          label="Total Volume"
          value={totals.volume.toExponential(4)}
          unit="m^3"
        />
        <SummaryCard
          label={totals.missingCount > 0 ? "Missing" : "Bodies"}
          value={
            totals.missingCount > 0
              ? `${totals.missingCount} / ${totals.count}`
              : String(totals.count)
          }
          variant={totals.missingCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Per-body accordion */}
      <div className="space-y-2">
        {bodyEntries.map(([bodyId, body]) => (
          <BodyItem
            key={bodyId}
            bodyId={bodyId}
            body={body}
            isExpanded={expandedBodies.has(bodyId)}
            onToggle={() => toggleBody(bodyId)}
          />
        ))}
      </div>
    </div>
  );
}
