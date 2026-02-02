/**
 * Sparkline UI - Inline mini chart
 *
 * Compact line/bar chart showing trend with:
 * - Min/max markers
 * - Current value highlight
 * - Optional label
 *
 * @module lib/std/src/ui/sparkline
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface SparklineData {
  values: number[];
  label?: string;
  type?: "line" | "bar" | "area";
  color?: string;
  showMinMax?: boolean;
  showCurrent?: boolean;
  height?: number;
  width?: number;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Sparkline", version: "1.0.0" });

// ============================================================================
// Main Component
// ============================================================================

function Sparkline() {
  const [data, setData] = useState<SparklineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Handle array directly or object with values
          if (Array.isArray(parsed)) {
            setData({ values: parsed });
          } else {
            setData(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to parse sparkline data", e);
      }
    };
  }, []);

  const computed = useMemo(() => {
    if (!data?.values?.length) return null;

    const { values } = data;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const current = values[values.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : current;
    const trend = current > prev ? "up" : current < prev ? "down" : "flat";

    return { min, max, range, current, trend };
  }, [data]);

  if (loading) {
    return <div class={styles.container}>...</div>;
  }

  if (!data?.values?.length || !computed) {
    return <div class={styles.container}>No data</div>;
  }

  const {
    values,
    label,
    type = "line",
    color = "var(--colors-blue-500)",
    showMinMax = false,
    showCurrent = true,
    height = 32,
    width = 120,
  } = data;

  const { min, max, range, current, trend } = computed;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // Generate path or bars
  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * innerWidth,
    y: padding + innerHeight - ((v - min) / range) * innerHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div class={styles.container}>
      {label && <span class={styles.label}>{label}</span>}

      <div class={styles.chartContainer}>
        <svg width={width} height={height} class={styles.svg}>
          {type === "area" && (
            <path d={areaPath} fill={color} opacity={0.2} />
          )}

          {type === "line" || type === "area" ? (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              stroke-width={1.5}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          ) : (
            // Bar chart
            values.map((v, i) => {
              const barWidth = (innerWidth / values.length) * 0.8;
              const barHeight = ((v - min) / range) * innerHeight;
              const x = padding + (i / values.length) * innerWidth + barWidth * 0.1;
              const y = height - padding - barHeight;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  opacity={i === values.length - 1 ? 1 : 0.6}
                  rx={1}
                />
              );
            })
          )}

          {/* Current point */}
          {(type === "line" || type === "area") && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={3}
              fill={color}
            />
          )}
        </svg>
      </div>

      {showCurrent && (
        <div class={styles.currentValue}>
          <span class={css(
            styles.trendArrow,
            trend === "up" && styles.trendUp,
            trend === "down" && styles.trendDown
          )}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          </span>
          <span class={styles.value}>{Number.isInteger(current) ? current : current.toFixed(1)}</span>
        </div>
      )}

      {showMinMax && (
        <div class={styles.minMax}>
          <span>{min.toFixed(0)}</span>
          <span>{max.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    display: "inline-flex",
    alignItems: "center",
    gap: "2",
    p: "2",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  label: css({
    color: "fg.muted",
    fontSize: "xs",
    minW: "40px",
  }),
  chartContainer: css({
    position: "relative",
  }),
  svg: css({
    display: "block",
  }),
  currentValue: css({
    display: "flex",
    alignItems: "center",
    gap: "1",
    fontFamily: "mono",
    fontWeight: "semibold",
  }),
  value: css({
    fontSize: "sm",
  }),
  trendArrow: css({
    fontSize: "xs",
  }),
  trendUp: css({
    color: "green.500",
  }),
  trendDown: css({
    color: "red.500",
  }),
  minMax: css({
    display: "flex",
    flexDirection: "column",
    fontSize: "xs",
    color: "fg.muted",
    lineHeight: "1",
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<Sparkline />, document.getElementById("app")!);
