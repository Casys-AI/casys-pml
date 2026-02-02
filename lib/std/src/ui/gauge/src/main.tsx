/**
 * Gauge UI - Metric display with thresholds
 *
 * Circular or linear gauge showing a value with:
 * - Min/max range
 * - Color thresholds (green/yellow/red)
 * - Optional label and unit
 *
 * @module lib/std/src/ui/gauge
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface GaugeData {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  format?: "circular" | "linear" | "compact";
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Gauge", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Components
// ============================================================================

function CircularGauge({ value, min, max, color, label, unit, displayValue }: {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  const angle = (percentage / 100) * 270; // 270 degree arc
  const radius = 45;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <div class={styles.circularContainer}>
      <svg viewBox="0 0 120 120" class={styles.svg}>
        {/* Background arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          transform="rotate(135 60 60)"
        />
        {/* Value arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          stroke-dashoffset={offset}
          transform="rotate(135 60 60)"
          class={styles.valueArc}
        />
      </svg>
      <div class={styles.circularValue}>
        <span class={styles.valueText}>{displayValue}</span>
        {unit && <span class={styles.unit}>{unit}</span>}
      </div>
      {label && <div class={styles.label}>{label}</div>}
    </div>
  );
}

function LinearGauge({ value, min, max, color, label, unit, displayValue }: {
  value: number;
  min: number;
  max: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div class={styles.linearContainer}>
      <div class={styles.linearHeader}>
        {label && <span class={styles.label}>{label}</span>}
        <span class={styles.linearValue}>
          {displayValue}{unit && <span class={styles.unit}>{unit}</span>}
        </span>
      </div>
      <div class={styles.linearTrack}>
        <div
          class={styles.linearFill}
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <div class={styles.linearRange}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function CompactGauge({ value, color, label, unit, displayValue }: {
  value: number;
  color: string;
  label?: string;
  unit?: string;
  displayValue: string;
}) {
  return (
    <div class={styles.compactContainer}>
      <div class={styles.compactDot} style={{ backgroundColor: color }} />
      <div class={styles.compactContent}>
        {label && <span class={styles.compactLabel}>{label}</span>}
        <span class={styles.compactValue}>
          {displayValue}{unit && <span class={styles.unit}>{unit}</span>}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function Gauge() {
  const [data, setData] = useState<GaugeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          setData(parsed);
        }
      } catch (e) {
        console.error("Failed to parse gauge data", e);
      }
    };
  }, []);

  const { color, displayValue } = useMemo(() => {
    if (!data) return { color: "var(--colors-fg-muted)", displayValue: "—" };

    const { value, thresholds } = data;
    let color = "var(--colors-green-500)";

    if (thresholds) {
      if (thresholds.critical !== undefined && value >= thresholds.critical) {
        color = "var(--colors-red-500)";
      } else if (thresholds.warning !== undefined && value >= thresholds.warning) {
        color = "var(--colors-yellow-500)";
      }
    }

    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

    return { color, displayValue };
  }, [data]);

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading...</div></div>;
  }

  if (!data) {
    return <div class={styles.container}><div class={styles.empty}>No data</div></div>;
  }

  const { value, min = 0, max = 100, label, unit, format = "circular" } = data;

  const props = { value, min, max, color, label, unit, displayValue };

  return (
    <div class={styles.container}>
      {format === "circular" && <CircularGauge {...props} />}
      {format === "linear" && <LinearGauge {...props} />}
      {format === "compact" && <CompactGauge {...props} />}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    p: "3",
    fontFamily: "sans",
    color: "fg.default",
    bg: "bg.canvas",
    display: "inline-flex",
  }),
  // Circular
  circularContainer: css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    w: "120px",
  }),
  svg: css({
    w: "100%",
    h: "auto",
  }),
  valueArc: css({
    transition: "stroke-dashoffset 0.5s ease",
  }),
  circularValue: css({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  }),
  valueText: css({
    fontSize: "2xl",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  unit: css({
    fontSize: "xs",
    color: "fg.muted",
    ml: "0.5",
  }),
  label: css({
    fontSize: "sm",
    color: "fg.muted",
    mt: "1",
    textAlign: "center",
  }),
  // Linear
  linearContainer: css({
    w: "200px",
  }),
  linearHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    mb: "1",
  }),
  linearValue: css({
    fontSize: "lg",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  linearTrack: css({
    h: "8px",
    bg: "bg.subtle",
    rounded: "full",
    overflow: "hidden",
  }),
  linearFill: css({
    h: "100%",
    rounded: "full",
    transition: "width 0.5s ease",
  }),
  linearRange: css({
    display: "flex",
    justifyContent: "space-between",
    fontSize: "xs",
    color: "fg.muted",
    mt: "1",
  }),
  // Compact
  compactContainer: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  compactDot: css({
    w: "12px",
    h: "12px",
    rounded: "full",
    flexShrink: 0,
  }),
  compactContent: css({
    display: "flex",
    flexDirection: "column",
  }),
  compactLabel: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  compactValue: css({
    fontSize: "lg",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  loading: css({ p: "4", color: "fg.muted" }),
  empty: css({ p: "4", color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<Gauge />, document.getElementById("app")!);
