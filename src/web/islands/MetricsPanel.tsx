/**
 * MetricsPanel Island - Story 6.3
 *
 * Interactive panel displaying live metrics about graph health and recommendations.
 * Fetches data from /api/metrics endpoint and updates via polling or SSE.
 */

import { useEffect, useState, useRef } from "preact/hooks";

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
    node_count: number;
    edge_count: number;
    density: number;
    adaptive_alpha: number;
    communities_count: number;
    pagerank_top_10: Array<{ tool_id: string; score: number }>;
  };
  timeseries: {
    edge_count: TimeSeriesPoint[];
    avg_confidence: TimeSeriesPoint[];
    workflow_rate: TimeSeriesPoint[];
  };
  period: {
    range: MetricsTimeRange;
    workflows_executed: number;
    workflows_success_rate: number;
    new_edges_created: number;
    new_nodes_added: number;
  };
}

export default function MetricsPanel({ apiBase: _apiBase, position = "sidebar" }: MetricsPanelProps) {
  const apiBase = "http://localhost:3001";

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
              edge_count: data.edge_count ?? prev.current.edge_count,
              node_count: data.node_count ?? prev.current.node_count,
              density: data.density ?? prev.current.density,
              pagerank_top_10: data.pagerank_top_10 ?? prev.current.pagerank_top_10,
              communities_count: data.communities_count ?? prev.current.communities_count,
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
    if (typeof window === "undefined" || !chartRef.current || !metrics) return;

    // @ts-ignore
    const Chart = window.Chart;
    if (!Chart) return;

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    let chartData: TimeSeriesPoint[] = [];
    let label = "";
    let color = "";

    switch (activeChart) {
      case "edges":
        chartData = metrics.timeseries.edge_count;
        label = "Edge Count";
        color = "rgb(59, 130, 246)";
        break;
      case "confidence":
        chartData = metrics.timeseries.avg_confidence;
        label = "Avg Confidence";
        color = "rgb(16, 185, 129)";
        break;
      case "workflows":
        chartData = metrics.timeseries.workflow_rate;
        label = "Workflows/Hour";
        color = "rgb(245, 158, 11)";
        break;
    }

    const ctx = chartRef.current.getContext("2d");
    chartInstanceRef.current = new Chart(ctx, {
      type: activeChart === "workflows" ? "bar" : "line",
      data: {
        labels: chartData.map((p) => new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
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
          x: { grid: { color: "#374151" }, ticks: { color: "#9ca3af", maxRotation: 45 } },
          y: { grid: { color: "#374151" }, ticks: { color: "#9ca3af" }, beginAtZero: true },
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
    if (!metrics) return;
    const headers = ["timestamp", "edge_count", "avg_confidence", "workflow_rate"];
    const maxLen = Math.max(
      metrics.timeseries.edge_count.length,
      metrics.timeseries.avg_confidence.length,
      metrics.timeseries.workflow_rate.length
    );
    const rows: string[][] = [];
    for (let i = 0; i < maxLen; i++) {
      rows.push([
        metrics.timeseries.edge_count[i]?.timestamp || "",
        String(metrics.timeseries.edge_count[i]?.value || ""),
        String(metrics.timeseries.avg_confidence[i]?.value || ""),
        String(metrics.timeseries.workflow_rate[i]?.value || ""),
      ]);
    }
    rows.push([]);
    rows.push(["# Current Metrics"]);
    rows.push(["node_count", String(metrics.current.node_count)]);
    rows.push(["edge_count", String(metrics.current.edge_count)]);
    rows.push(["density", String(metrics.current.density.toFixed(6))]);
    rows.push(["adaptive_alpha", String(metrics.current.adaptive_alpha.toFixed(4))]);
    rows.push(["communities_count", String(metrics.current.communities_count)]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentcards-metrics-${dateRange}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 90) return "text-green-400";
    if (rate >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getAlphaIndicator = (alpha: number): { label: string; color: string } => {
    if (alpha >= 0.9) return { label: "Semantic", color: "text-blue-400" };
    if (alpha >= 0.7) return { label: "Balanced", color: "text-green-400" };
    return { label: "Graph-heavy", color: "text-purple-400" };
  };

  if (collapsed) {
    return (
      <div
        class="fixed right-5 top-1/2 -translate-y-1/2 bg-slate-800/80 border border-slate-700/50 rounded-xl p-3.5 cursor-pointer z-20 backdrop-blur-xl transition-all duration-300 hover:bg-blue-500/10 hover:border-blue-500/30 hover:shadow-glow-blue"
        onClick={() => setCollapsed(false)}
        title="Expand metrics panel"
      >
        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
    );
  }

  return (
    <div class={`w-[340px] bg-gradient-to-b from-slate-900/95 to-slate-900/98 border-l border-slate-700/30 p-5 overflow-y-auto flex flex-col gap-4 backdrop-blur-xl scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/30 ${position === "overlay" ? "absolute right-0 top-0 h-full z-20" : ""}`}>
      {/* Header */}
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
          Metrics
        </h2>
        <div class="flex gap-1.5">
          <button
            class="p-2 rounded-lg bg-white/5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/20 border border-transparent transition-all duration-200"
            onClick={exportMetricsCSV}
            title="Download CSV"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            class="p-2 rounded-lg bg-white/5 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/20 border border-transparent transition-all duration-200"
            onClick={() => setCollapsed(true)}
            title="Collapse panel"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div class="flex gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-700/30">
        {(["1h", "24h", "7d"] as MetricsTimeRange[]).map((range) => (
          <button
            key={range}
            class={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
              dateRange === range
                ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-glow-blue"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
            }`}
            onClick={() => setDateRange(range)}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div class="flex flex-col items-center justify-center gap-3 py-8 text-slate-500">
          <div class="w-8 h-8 border-3 border-blue-500/10 border-t-blue-500 rounded-full animate-spin" />
          <span>Loading metrics...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div class="flex flex-col items-center justify-center gap-3 py-8 text-red-400">
          <span>Error: {error}</span>
          <button
            class="mt-3 px-5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-all"
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
              { label: "Nodes", value: metrics.current.node_count },
              { label: "Edges", value: metrics.current.edge_count },
              { label: "Density", value: `${(metrics.current.density * 100).toFixed(2)}%` },
              { label: "Communities", value: metrics.current.communities_count },
            ].map((metric) => (
              <div
                key={metric.label}
                class="relative bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700/30 rounded-xl p-4 transition-all duration-300 overflow-hidden group hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-lg"
              >
                <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span class="block text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-medium">
                  {metric.label}
                </span>
                <span class="block text-2xl font-bold text-slate-100 tabular-nums">
                  {metric.value}
                </span>
              </div>
            ))}
          </div>

          {/* Alpha Indicator */}
          <div class="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <div class="flex justify-between items-center mb-3">
              <span class="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Adaptive Alpha
              </span>
              <span class={getAlphaIndicator(metrics.current.adaptive_alpha).color}>
                {getAlphaIndicator(metrics.current.adaptive_alpha).label}
              </span>
            </div>
            <div class="h-2 bg-slate-800 rounded overflow-hidden shadow-inner">
              <div
                class="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 rounded transition-all duration-500 shadow-glow-purple"
                style={{ width: `${metrics.current.adaptive_alpha * 100}%` }}
              />
            </div>
            <div class="text-sm text-slate-400 text-right mt-2 font-medium tabular-nums">
              {metrics.current.adaptive_alpha.toFixed(3)}
            </div>
          </div>

          {/* Workflow Stats */}
          <div class="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            {[
              { label: `Workflows (${dateRange})`, value: metrics.period.workflows_executed },
              { label: "Success Rate", value: `${metrics.period.workflows_success_rate.toFixed(1)}%`, color: getSuccessRateColor(metrics.period.workflows_success_rate) },
              { label: "New Edges", value: metrics.period.new_edges_created },
            ].map((stat, i, arr) => (
              <div
                key={stat.label}
                class={`flex justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-slate-700/20" : ""}`}
              >
                <span class="text-sm text-slate-500">{stat.label}</span>
                <span class={`text-sm font-semibold tabular-nums ${stat.color || "text-slate-100"}`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* PageRank Top 10 */}
          <div class="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <h3 class="text-[11px] text-slate-500 uppercase tracking-widest mb-3 font-semibold">
              Top Tools (PageRank)
            </h3>
            <div class={metrics.current.pagerank_top_10.length > 6 ? "max-h-60 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/30" : ""}>
              {metrics.current.pagerank_top_10.map((tool, idx) => (
                <div
                  key={tool.tool_id}
                  class="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                >
                  <span class="text-slate-600 w-7 text-center font-semibold text-xs">
                    #{idx + 1}
                  </span>
                  <span
                    class="flex-1 text-slate-200 truncate font-medium text-sm"
                    title={tool.tool_id}
                  >
                    {tool.tool_id.split("__").pop() || tool.tool_id}
                  </span>
                  <span class="text-cyan-400 font-mono text-xs">
                    {tool.score.toFixed(4)}
                  </span>
                </div>
              ))}
              {metrics.current.pagerank_top_10.length === 0 && (
                <div class="text-slate-600 text-sm py-3 text-center">No tools yet</div>
              )}
            </div>
          </div>

          {/* Chart Section */}
          <div class="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <div class="flex gap-1.5 mb-4">
              {(["edges", "confidence", "workflows"] as const).map((tab) => (
                <button
                  key={tab}
                  class={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                    activeChart === tab
                      ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-glow-blue border-transparent"
                      : "bg-slate-900/50 text-slate-500 border-transparent hover:bg-blue-500/10 hover:border-blue-500/20 hover:text-slate-300"
                  }`}
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
            <div class="text-xs text-slate-600 text-center py-2 bg-slate-900/30 rounded-lg">
              Updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
