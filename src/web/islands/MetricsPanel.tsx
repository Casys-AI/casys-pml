/**
 * MetricsPanel Island - Story 6.3
 *
 * Interactive panel displaying live metrics about graph health and recommendations.
 * Styled with Casys.ai design system
 */

import { useEffect, useRef, useState } from "preact/hooks";

interface MetricsPanelProps {
  apiBase: string;
  position?: "sidebar" | "overlay";
}

type MetricsTimeRange = "1h" | "24h" | "7d";

interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

interface GraphMetricsResponse {
  current: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    adaptiveAlpha: number;
    communitiesCount: number;
    pagerankTop10: Array<{ toolId: string; score: number }>;
  };
  timeseries: {
    edgeCount: TimeSeriesPoint[];
    avgConfidence: TimeSeriesPoint[];
    workflowRate: TimeSeriesPoint[];
  };
  period: {
    range: MetricsTimeRange;
    workflowsExecuted: number;
    workflowsSuccessRate: number;
    newEdgesCreated: number;
    newNodesAdded: number;
  };
}

export default function MetricsPanel(
  { apiBase: apiBaseProp, position = "sidebar" }: MetricsPanelProps,
) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [metrics, setMetrics] = useState<GraphMetricsResponse | null>(null);
  const [dateRange, setDateRange] = useState<MetricsTimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeChart, setActiveChart] = useState<"edges" | "confidence" | "workflows">("edges");

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${apiBase}/api/metrics?range=${dateRange}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: GraphMetricsResponse = await res.json();
      setMetrics(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${apiBase}/events/stream`);
      eventSource.addEventListener("metrics_updated", (event: any) => {
        const data = JSON.parse(event.data);
        setMetrics((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            current: {
              ...prev.current,
              edgeCount: data.edgeCount ?? prev.current.edgeCount,
              nodeCount: data.nodeCount ?? prev.current.nodeCount,
              density: data.density ?? prev.current.density,
              pagerankTop10: data.pagerankTop10 ?? prev.current.pagerankTop10,
              communitiesCount: data.communitiesCount ?? prev.current.communitiesCount,
            },
          };
        });
        setLastUpdated(new Date());
      });
      eventSource.onerror = () => console.warn("SSE connection error, falling back to polling");
    } catch { /* SSE not supported */ }

    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
  }, [dateRange]);

  useEffect(() => {
    if (typeof window === "undefined" || !chartRef.current || !metrics || !metrics.timeseries) return;

    // @ts-ignore
    const Chart = globalThis.Chart;
    if (!Chart) return;

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    let chartData: TimeSeriesPoint[] = [];
    let label = "";
    let color = "";

    switch (activeChart) {
      case "edges":
        chartData = metrics.timeseries.edgeCount ?? [];
        label = "Edge Count";
        color = "rgb(255, 184, 111)"; // accent
        break;
      case "confidence":
        chartData = metrics.timeseries.avgConfidence ?? [];
        label = "Avg Confidence";
        color = "rgb(74, 222, 128)"; // success
        break;
      case "workflows":
        chartData = metrics.timeseries.workflowRate ?? [];
        label = "Workflows/Hour";
        color = "rgb(251, 191, 36)"; // warning
        break;
    }

    const ctx = chartRef.current.getContext("2d");
    chartInstanceRef.current = new Chart(ctx, {
      type: activeChart === "workflows" ? "bar" : "line",
      data: {
        labels: chartData.map((p) =>
          new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        ),
        datasets: [{
          label,
          data: chartData.map((p) => p.value),
          borderColor: color,
          backgroundColor: activeChart === "workflows" ? color : `${color}33`,
          fill: activeChart !== "workflows",
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: "rgba(255, 184, 111, 0.1)" },
            ticks: { color: "#8a8078", maxRotation: 45 },
          },
          y: {
            grid: { color: "rgba(255, 184, 111, 0.1)" },
            ticks: { color: "#8a8078" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [metrics, activeChart]);

  const exportMetricsCSV = () => {
    if (!metrics || !metrics.timeseries) return;
    const headers = ["timestamp", "edgeCount", "avgConfidence", "workflowRate"];
    const edgeCount = metrics.timeseries.edgeCount ?? [];
    const avgConfidence = metrics.timeseries.avgConfidence ?? [];
    const workflowRate = metrics.timeseries.workflowRate ?? [];
    const maxLen = Math.max(edgeCount.length, avgConfidence.length, workflowRate.length);
    const rows: string[][] = [];
    for (let i = 0; i < maxLen; i++) {
      rows.push([
        edgeCount[i]?.timestamp || "",
        String(edgeCount[i]?.value || ""),
        String(avgConfidence[i]?.value || ""),
        String(workflowRate[i]?.value || ""),
      ]);
    }
    rows.push([]);
    rows.push(["# Current Metrics"]);
    rows.push(["nodeCount", String(metrics.current.nodeCount)]);
    rows.push(["edgeCount", String(metrics.current.edgeCount)]);
    rows.push(["density", String(metrics.current.density.toFixed(6))]);
    rows.push(["adaptiveAlpha", String(metrics.current.adaptiveAlpha.toFixed(4))]);
    rows.push(["communitiesCount", String(metrics.current.communitiesCount)]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cai-metrics-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 90) return "var(--success)";
    if (rate >= 70) return "var(--warning)";
    return "var(--error)";
  };

  const getAlphaIndicator = (alpha: number): { label: string; color: string } => {
    if (alpha >= 0.9) return { label: "Semantic", color: "var(--info)" };
    if (alpha >= 0.7) return { label: "Balanced", color: "var(--success)" };
    return { label: "Graph-heavy", color: "var(--accent)" };
  };

  // Casys design tokens
  const styles = {
    sidebar: {
      background: "linear-gradient(to bottom, var(--bg-elevated), var(--bg))",
      borderLeft: "1px solid var(--border)",
      fontFamily: "var(--font-sans)",
    },
    card: {
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
    },
    button: {
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
    },
    buttonActive: {
      background: "var(--accent)",
      border: "1px solid var(--accent)",
      color: "var(--bg)",
    },
  };

  if (collapsed) {
    return (
      <div
        class="fixed right-5 top-1/2 -translate-y-1/2 p-3.5 rounded-xl cursor-pointer z-20 transition-all duration-300"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
        onClick={() => setCollapsed(false)}
        title="Expand metrics panel"
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "var(--accent-medium)";
          e.currentTarget.style.background = "var(--accent-dim)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "var(--bg-elevated)";
        }}
      >
        <svg
          class="w-5 h-5"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      class={`w-[340px] p-5 overflow-y-auto flex flex-col gap-4 ${
        position === "overlay" ? "absolute right-0 top-0 h-full z-20" : ""
      }`}
      style={styles.sidebar}
    >
      {/* Header */}
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-bold" style={{ color: "var(--text)" }}>
          Metrics
        </h2>
        <div class="flex gap-1.5">
          <button
            class="p-2 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={exportMetricsCSV}
            title="Download CSV"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
          <button
            class="p-2 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={() => setCollapsed(true)}
            title="Collapse panel"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div
        class="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        {(["1h", "24h", "7d"] as MetricsTimeRange[]).map((range) => (
          <button
            key={range}
            class="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200"
            style={dateRange === range ? styles.buttonActive : styles.button}
            onClick={() => setDateRange(range)}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div
          class="flex flex-col items-center justify-center gap-3 py-8"
          style={{ color: "var(--text-dim)" }}
        >
          <div
            class="w-8 h-8 rounded-full animate-spin"
            style={{ border: "3px solid var(--accent-dim)", borderTopColor: "var(--accent)" }}
          />
          <span>Loading metrics...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          class="flex flex-col items-center justify-center gap-3 py-8"
          style={{ color: "var(--error)" }}
        >
          <span>Error: {error}</span>
          <button
            class="mt-3 px-5 py-2.5 rounded-lg transition-all"
            style={{
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              color: "var(--error)",
            }}
            onClick={fetchMetrics}
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Content */}
      {metrics && !loading && (
        <>
          {/* Metrics Grid */}
          <div class="grid grid-cols-2 gap-3">
            {[
              { label: "Nodes", value: metrics.current.nodeCount },
              { label: "Edges", value: metrics.current.edgeCount },
              { label: "Density", value: `${(metrics.current.density * 100).toFixed(2)}%` },
              { label: "Communities", value: metrics.current.communitiesCount },
            ].map((metric) => (
              <div
                key={metric.label}
                class="relative p-4 rounded-xl transition-all duration-300 overflow-hidden group"
                style={styles.card}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent-medium)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  class="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "var(--accent)" }}
                />
                <span
                  class="block text-[11px] uppercase tracking-wider mb-2 font-medium"
                  style={{ color: "var(--text-dim)" }}
                >
                  {metric.label}
                </span>
                <span
                  class="block text-2xl font-bold tabular-nums"
                  style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>

          {/* Alpha Indicator */}
          <div class="p-4 rounded-xl" style={styles.card}>
            <div class="flex justify-between items-center mb-3">
              <span
                class="text-[11px] uppercase tracking-wider font-medium"
                style={{ color: "var(--text-dim)" }}
              >
                Adaptive Alpha
              </span>
              <span style={{ color: getAlphaIndicator(metrics.current.adaptiveAlpha).color }}>
                {getAlphaIndicator(metrics.current.adaptiveAlpha).label}
              </span>
            </div>
            <div class="h-2 rounded overflow-hidden" style={{ background: "var(--bg)" }}>
              <div
                class="h-full rounded transition-all duration-500"
                style={{
                  width: `${metrics.current.adaptiveAlpha * 100}%`,
                  background: "linear-gradient(to right, var(--accent), var(--warning))",
                }}
              />
            </div>
            <div
              class="text-sm text-right mt-2 font-medium tabular-nums"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              {metrics.current.adaptiveAlpha.toFixed(3)}
            </div>
          </div>

          {/* Workflow Stats */}
          <div class="p-4 rounded-xl" style={styles.card}>
            {[
              { label: `Workflows (${dateRange})`, value: metrics.period.workflowsExecuted },
              {
                label: "Success Rate",
                value: `${metrics.period.workflowsSuccessRate.toFixed(1)}%`,
                color: getSuccessRateColor(metrics.period.workflowsSuccessRate),
              },
              { label: "New Edges", value: metrics.period.newEdgesCreated },
            ].map((stat, i, arr) => (
              <div
                key={stat.label}
                class="flex justify-between py-2.5"
                style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <span class="text-sm" style={{ color: "var(--text-dim)" }}>{stat.label}</span>
                <span
                  class="text-sm font-semibold tabular-nums"
                  style={{ color: stat.color || "var(--text)", fontFamily: "var(--font-mono)" }}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* PageRank Top 10 */}
          <div class="p-4 rounded-xl" style={styles.card}>
            <h3
              class="text-[11px] uppercase tracking-widest mb-3 font-semibold"
              style={{ color: "var(--text-dim)" }}
            >
              Top Tools (PageRank)
            </h3>
            <div
              class={(metrics.current.pagerankTop10?.length ?? 0) > 6 ? "max-h-60 overflow-y-auto" : ""}
            >
              {(metrics.current.pagerankTop10 ?? []).map((tool, idx) => (
                <div
                  key={tool.toolId}
                  class="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors"
                  onMouseOver={(e) => e.currentTarget.style.background = "var(--accent-dim)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span
                    class="w-7 text-center font-semibold text-xs"
                    style={{ color: "var(--text-dim)" }}
                  >
                    #{idx + 1}
                  </span>
                  <span
                    class="flex-1 truncate font-medium text-sm"
                    title={tool.toolId}
                    style={{ color: "var(--text)" }}
                  >
                    {tool.toolId.split("__").pop() || tool.toolId}
                  </span>
                  <span
                    class="text-xs"
                    style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
                  >
                    {tool.score.toFixed(4)}
                  </span>
                </div>
              ))}
              {(metrics.current.pagerankTop10?.length ?? 0) === 0 && (
                <div class="text-sm py-3 text-center" style={{ color: "var(--text-dim)" }}>
                  No tools yet
                </div>
              )}
            </div>
          </div>

          {/* Chart Section */}
          <div class="p-4 rounded-xl" style={styles.card}>
            <div class="flex gap-1.5 mb-4">
              {(["edges", "confidence", "workflows"] as const).map((tab) => (
                <button
                  key={tab}
                  class="flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200"
                  style={activeChart === tab ? styles.buttonActive : styles.button}
                  onClick={() => setActiveChart(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div class="h-40">
              <canvas ref={chartRef} />
            </div>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div
              class="text-xs text-center py-2 rounded-lg"
              style={{ color: "var(--text-dim)", background: "var(--bg-surface)" }}
            >
              Updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
