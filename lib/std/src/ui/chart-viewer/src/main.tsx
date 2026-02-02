/**
 * Chart Viewer UI for MCP Apps
 *
 * Simple SVG-based charts:
 * - Bar chart
 * - Line chart
 * - Pie chart
 *
 * @module lib/std/src/ui/chart-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface ChartData {
  type: "bar" | "line" | "pie";
  title?: string;
  labels: string[];
  datasets: {
    label?: string;
    data: number[];
    color?: string;
  }[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Chart Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Chart Components
// ============================================================================

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function BarChart({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.datasets.flatMap((d) => d.data);
  const maxValue = Math.max(...allValues, 0) * 1.1;
  const barGroupWidth = chartWidth / data.labels.length;
  const barWidth = (barGroupWidth * 0.8) / data.datasets.length;
  const gap = barGroupWidth * 0.1;

  return (
    <svg width={width} height={height} class={css({ bg: "bg.default", rounded: "lg" })}>
      {/* Y axis */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="currentColor" strokeOpacity={0.2} />

      {/* X axis */}
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="currentColor" strokeOpacity={0.2} />

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + chartHeight * (1 - ratio);
        return (
          <g key={ratio}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4" />
            <text x={padding.left - 5} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>
              {Math.round(maxValue * ratio)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.datasets.map((dataset, di) =>
        dataset.data.map((value, i) => {
          const barHeight = (value / maxValue) * chartHeight;
          const x = padding.left + gap + i * barGroupWidth + di * barWidth;
          const y = height - padding.bottom - barHeight;

          return (
            <rect
              key={`${di}-${i}`}
              x={x}
              y={y}
              width={barWidth - 2}
              height={barHeight}
              fill={dataset.color || COLORS[di % COLORS.length]}
              rx={2}
              class={css({ cursor: "pointer", _hover: { opacity: 0.8 } })}
              onClick={() => notifyModel("click", { label: data.labels[i], value, dataset: dataset.label })}
            >
              <title>{`${data.labels[i]}: ${value}`}</title>
            </rect>
          );
        })
      )}

      {/* X labels */}
      {data.labels.map((label, i) => (
        <text
          key={i}
          x={padding.left + gap + i * barGroupWidth + (barGroupWidth * 0.8) / 2}
          y={height - padding.bottom + 20}
          textAnchor="middle"
          fontSize={11}
          fill="currentColor"
          fillOpacity={0.7}
        >
          {label.length > 10 ? label.slice(0, 10) + "…" : label}
        </text>
      ))}
    </svg>
  );
}

function LineChart({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.datasets.flatMap((d) => d.data);
  const maxValue = Math.max(...allValues, 0) * 1.1;
  const stepX = chartWidth / (data.labels.length - 1 || 1);

  return (
    <svg width={width} height={height} class={css({ bg: "bg.default", rounded: "lg" })}>
      {/* Axes and grid */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="currentColor" strokeOpacity={0.2} />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + chartHeight * (1 - ratio);
        return (
          <g key={ratio}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4" />
            <text x={padding.left - 5} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>
              {Math.round(maxValue * ratio)}
            </text>
          </g>
        );
      })}

      {/* Lines */}
      {data.datasets.map((dataset, di) => {
        const points = dataset.data.map((value, i) => {
          const x = padding.left + i * stepX;
          const y = height - padding.bottom - (value / maxValue) * chartHeight;
          return `${x},${y}`;
        }).join(" ");

        const color = dataset.color || COLORS[di % COLORS.length];

        return (
          <g key={di}>
            <polyline fill="none" stroke={color} strokeWidth={2} points={points} />
            {dataset.data.map((value, i) => {
              const x = padding.left + i * stepX;
              const y = height - padding.bottom - (value / maxValue) * chartHeight;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={color}
                  class={css({ cursor: "pointer", _hover: { r: "6" } })}
                  onClick={() => notifyModel("click", { label: data.labels[i], value, dataset: dataset.label })}
                >
                  <title>{`${data.labels[i]}: ${value}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}

      {/* X labels */}
      {data.labels.map((label, i) => (
        <text
          key={i}
          x={padding.left + i * stepX}
          y={height - padding.bottom + 20}
          textAnchor="middle"
          fontSize={11}
          fill="currentColor"
          fillOpacity={0.7}
        >
          {label.length > 8 ? label.slice(0, 8) + "…" : label}
        </text>
      ))}
    </svg>
  );
}

function PieChart({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const dataset = data.datasets[0];
  if (!dataset) return null;

  const total = dataset.data.reduce((a, b) => a + b, 0);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  let currentAngle = -Math.PI / 2;

  const slices = dataset.data.map((value, i) => {
    const angle = (value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return { path, color: COLORS[i % COLORS.length], label: data.labels[i], value, percent: ((value / total) * 100).toFixed(1) };
  });

  return (
    <svg width={width} height={height} class={css({ bg: "bg.default", rounded: "lg" })}>
      {slices.map((slice, i) => (
        <path
          key={i}
          d={slice.path}
          fill={slice.color}
          class={css({ cursor: "pointer", _hover: { opacity: 0.8 } })}
          onClick={() => notifyModel("click", { label: slice.label, value: slice.value, percent: slice.percent })}
        >
          <title>{`${slice.label}: ${slice.value} (${slice.percent}%)`}</title>
        </path>
      ))}

      {/* Legend */}
      {slices.map((slice, i) => (
        <g key={i} transform={`translate(${width - 100}, ${20 + i * 20})`}>
          <rect width={12} height={12} fill={slice.color} rx={2} />
          <text x={16} y={10} fontSize={11} fill="currentColor" fillOpacity={0.8}>
            {slice.label.slice(0, 10)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ChartViewer() {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartData["type"]>("bar");

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[chart-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[chart-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setChartData(null);
          return;
        }
        const data = JSON.parse(textContent.text) as ChartData;
        setChartData(data);
        if (data.type) setChartType(data.type);
      } catch (e) {
        setError(`Failed to parse chart data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Dimensions
  const width = 500;
  const height = 300;

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading chart...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!chartData) {
    return <div class={styles.container}><div class={styles.empty}>No chart data</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        {chartData.title && <h2 class={styles.title}>{chartData.title}</h2>}
        <div class={styles.typeSelector}>
          {(["bar", "line", "pie"] as const).map((type) => (
            <button
              key={type}
              class={css(styles.typeBtn, chartType === type && styles.typeBtnActive)}
              onClick={() => setChartType(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div class={styles.chartContainer}>
        {chartType === "bar" && <BarChart data={chartData} width={width} height={height} />}
        {chartType === "line" && <LineChart data={chartData} width={width} height={height} />}
        {chartType === "pie" && <PieChart data={chartData} width={width} height={height} />}
      </div>

      {/* Legend for multi-dataset */}
      {chartData.datasets.length > 1 && chartType !== "pie" && (
        <div class={styles.legend}>
          {chartData.datasets.map((ds, i) => (
            <div key={i} class={styles.legendItem}>
              <span class={css({ w: "3", h: "3", rounded: "sm", bg: ds.color || COLORS[i % COLORS.length] })} />
              <span>{ds.label || `Dataset ${i + 1}`}</span>
            </div>
          ))}
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
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "4",
    flexWrap: "wrap",
    gap: "2",
  }),
  title: css({
    fontSize: "lg",
    fontWeight: "semibold",
  }),
  typeSelector: css({
    display: "flex",
    gap: "1",
  }),
  typeBtn: css({
    px: "3",
    py: "1",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  typeBtnActive: css({
    bg: "blue.600",
    color: "white",
    borderColor: "blue.600",
    _hover: { bg: "blue.700" },
  }),
  chartContainer: css({
    display: "flex",
    justifyContent: "center",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    p: "2",
  }),
  legend: css({
    display: "flex",
    gap: "4",
    mt: "3",
    justifyContent: "center",
    flexWrap: "wrap",
  }),
  legendItem: css({
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    fontSize: "xs",
    color: "fg.muted",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({ p: "4", bg: "red.50", color: "red.700", rounded: "md", _dark: { bg: "red.950", color: "red.300" } }),
};

// ============================================================================
// Mount
// ============================================================================

render(<ChartViewer />, document.getElementById("app")!);
