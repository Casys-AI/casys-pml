/**
 * Metrics Panel UI - Grafana-style dashboard
 *
 * Grid of metrics with:
 * - Multiple visualization types (gauge, sparkline, stat, bar)
 * - Thresholds with color coding
 * - Time range display
 * - Auto-refresh indicator
 * - Responsive grid layout
 *
 * @module lib/std/src/ui/metrics-panel
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface MetricData {
  id: string;
  label: string;
  value: number;
  unit?: string;
  history?: number[];
  min?: number;
  max?: number;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  type?: "gauge" | "sparkline" | "stat" | "bar";
  description?: string;
}

interface PanelData {
  title?: string;
  metrics: MetricData[];
  columns?: number;
  refreshInterval?: number;
  timestamp?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Metrics Panel", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getColor(value: number, thresholds?: { warning?: number; critical?: number }): string {
  if (!thresholds) return "var(--colors-blue-500)";
  if (thresholds.critical !== undefined && value >= thresholds.critical) return "var(--colors-red-500)";
  if (thresholds.warning !== undefined && value >= thresholds.warning) return "var(--colors-yellow-500)";
  return "var(--colors-green-500)";
}

function formatValue(value: number, unit?: string): string {
  let formatted: string;
  if (value >= 1000000000) {
    formatted = (value / 1000000000).toFixed(1) + "G";
  } else if (value >= 1000000) {
    formatted = (value / 1000000).toFixed(1) + "M";
  } else if (value >= 1000) {
    formatted = (value / 1000).toFixed(1) + "K";
  } else if (Number.isInteger(value)) {
    formatted = String(value);
  } else {
    formatted = value.toFixed(1);
  }
  return unit ? `${formatted}${unit}` : formatted;
}

// ============================================================================
// Metric Components
// ============================================================================

function GaugeMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit } = metric;
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = getColor(value, thresholds);

  const radius = 40;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;

  return (
    <div class={styles.gaugeContainer}>
      <svg viewBox="0 0 100 100" class={styles.gaugeSvg}>
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          stroke-dashoffset={offset}
          transform="rotate(135 50 50)"
          class={styles.gaugeArc}
        />
      </svg>
      <div class={styles.gaugeValue}>
        <span class={styles.bigValue}>{formatValue(value, unit)}</span>
      </div>
      <div class={styles.metricLabel}>{label}</div>
    </div>
  );
}

function SparklineMetric({ metric }: { metric: MetricData }) {
  const { value, history = [], thresholds, label, unit, min, max } = metric;
  const color = getColor(value, thresholds);

  const values = history.length ? history : [value];
  const dataMin = min ?? Math.min(...values);
  const dataMax = max ?? Math.max(...values);
  const range = dataMax - dataMin || 1;

  const width = 120;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1 || 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) - ((v - dataMin) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div class={styles.sparklineContainer}>
      <div class={styles.sparklineHeader}>
        <span class={styles.metricLabel}>{label}</span>
        <span class={styles.sparklineValue} style={{ color }}>
          {formatValue(value, unit)}
        </span>
      </div>
      <svg width={width} height={height} class={styles.sparklineSvg}>
        <path d={areaPath} fill={color} opacity={0.15} />
        <path d={linePath} fill="none" stroke={color} stroke-width={1.5} stroke-linecap="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={3} fill={color} />
      </svg>
    </div>
  );
}

function StatMetric({ metric }: { metric: MetricData }) {
  const { value, thresholds, label, unit, description } = metric;
  const color = getColor(value, thresholds);

  return (
    <div class={styles.statContainer}>
      <div class={styles.metricLabel}>{label}</div>
      <div class={styles.statValue} style={{ color }}>
        {formatValue(value, unit)}
      </div>
      {description && <div class={styles.statDescription}>{description}</div>}
    </div>
  );
}

function BarMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit } = metric;
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = getColor(value, thresholds);

  return (
    <div class={styles.barContainer}>
      <div class={styles.barHeader}>
        <span class={styles.metricLabel}>{label}</span>
        <span class={styles.barValue}>{formatValue(value, unit)}</span>
      </div>
      <div class={styles.barTrack}>
        <div class={styles.barFill} style={{ width: `${percentage}%`, backgroundColor: color }} />
        {thresholds?.warning && (
          <div class={styles.barThreshold} style={{ left: `${((thresholds.warning - min) / (max - min)) * 100}%` }} />
        )}
        {thresholds?.critical && (
          <div class={styles.barThresholdCritical} style={{ left: `${((thresholds.critical - min) / (max - min)) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricData }) {
  const type = metric.type || (metric.history?.length ? "sparkline" : "stat");

  return (
    <div class={styles.card} onClick={() => notifyModel("selectMetric", { id: metric.id, metric })}>
      {type === "gauge" && <GaugeMetric metric={metric} />}
      {type === "sparkline" && <SparklineMetric metric={metric} />}
      {type === "stat" && <StatMetric metric={metric} />}
      {type === "bar" && <BarMetric metric={metric} />}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MetricsPanel() {
  const [data, setData] = useState<PanelData | null>(null);
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
          // Handle array of metrics or full panel data
          if (Array.isArray(parsed)) {
            setData({ metrics: parsed });
          } else if (parsed.metrics) {
            setData(parsed);
          } else {
            // Single metric object - convert to array
            setData({ metrics: [{ id: "metric", label: "Value", ...parsed }] });
          }
        }
      } catch (e) {
        console.error("Failed to parse metrics data", e);
      }
    };
  }, []);

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading metrics...</div></div>;
  }

  if (!data?.metrics?.length) {
    return <div class={styles.container}><div class={styles.empty}>No metrics</div></div>;
  }

  const columns = data.columns || Math.min(4, Math.max(2, data.metrics.length));

  return (
    <div class={styles.container}>
      {/* Header */}
      {(data.title || data.timestamp) && (
        <div class={styles.header}>
          {data.title && <h2 class={styles.title}>{data.title}</h2>}
          <div class={styles.headerRight}>
            {data.refreshInterval && (
              <span class={styles.refreshBadge}>
                ↻ {data.refreshInterval}s
              </span>
            )}
            {data.timestamp && (
              <span class={styles.timestamp}>{data.timestamp}</span>
            )}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div
        class={styles.grid}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    p: "3",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
    pb: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  title: css({
    fontSize: "lg",
    fontWeight: "semibold",
    m: 0,
  }),
  headerRight: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
  }),
  refreshBadge: css({
    px: "2",
    py: "0.5",
    bg: "blue.100",
    color: "blue.700",
    fontSize: "xs",
    rounded: "full",
    _dark: { bg: "blue.900", color: "blue.300" },
  }),
  timestamp: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  grid: css({
    display: "grid",
    gap: "3",
  }),
  card: css({
    p: "3",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    cursor: "pointer",
    transition: "all 0.15s",
    _hover: { borderColor: "border.emphasized", shadow: "sm" },
  }),
  metricLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
    textTransform: "uppercase",
    letterSpacing: "wide",
  }),
  // Gauge
  gaugeContainer: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  }),
  gaugeSvg: css({
    w: "80px",
    h: "80px",
  }),
  gaugeArc: css({
    transition: "stroke-dashoffset 0.5s ease",
  }),
  gaugeValue: css({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -40%)",
    textAlign: "center",
  }),
  bigValue: css({
    fontSize: "xl",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  // Sparkline
  sparklineContainer: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
  }),
  sparklineHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  }),
  sparklineValue: css({
    fontSize: "lg",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  sparklineSvg: css({
    display: "block",
    w: "100%",
  }),
  // Stat
  statContainer: css({
    textAlign: "center",
  }),
  statValue: css({
    fontSize: "2xl",
    fontWeight: "bold",
    fontFamily: "mono",
    my: "1",
  }),
  statDescription: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  // Bar
  barContainer: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
  }),
  barHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  }),
  barValue: css({
    fontWeight: "semibold",
    fontFamily: "mono",
  }),
  barTrack: css({
    position: "relative",
    h: "8px",
    bg: "bg.muted",
    rounded: "full",
    overflow: "hidden",
  }),
  barFill: css({
    h: "100%",
    rounded: "full",
    transition: "width 0.5s ease",
  }),
  barThreshold: css({
    position: "absolute",
    top: 0,
    bottom: 0,
    w: "2px",
    bg: "yellow.500",
  }),
  barThresholdCritical: css({
    position: "absolute",
    top: 0,
    bottom: 0,
    w: "2px",
    bg: "red.500",
  }),
  loading: css({ p: "6", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "6", textAlign: "center", color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<MetricsPanel />, document.getElementById("app")!);
