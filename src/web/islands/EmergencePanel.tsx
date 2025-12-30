/**
 * EmergencePanel Island - CAS (Complex Adaptive Systems) Metrics Dashboard
 *
 * Displays emergence metrics based on SYMBIOSIS/ODI framework (arxiv:2503.13754)
 * and Holland's CAS theory. Replaces the "Tools" view mode.
 *
 * @module web/islands/EmergencePanel
 */

import { useEffect, useRef, useState } from "preact/hooks";
import {
  GaugeChart,
  MetricCard,
  ProgressBar,
  SectionCard,
  TrendIndicator,
} from "../components/ui/atoms/mod.ts";
import {
  PhaseTransitionBanner,
  RecommendationsPanel,
} from "../components/ui/molecules/mod.ts";
import type {
  EmergenceMetricsResponse,
  EmergenceTimeRange,
} from "../../shared/emergence.types.ts";

interface EmergencePanelProps {
  apiBase: string;
}

// Use shared types - alias for backward compatibility
type TimeRange = EmergenceTimeRange;
type EmergenceMetrics = EmergenceMetricsResponse;

export default function EmergencePanel({ apiBase: apiBaseProp }: EmergencePanelProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [metrics, setMetrics] = useState<EmergenceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [showPhaseTransition, setShowPhaseTransition] = useState(true);

  const entropyChartRef = useRef<HTMLDivElement>(null);
  const stabilityChartRef = useRef<HTMLDivElement>(null);
  const chartInstances = useRef<Record<string, unknown>>({});

  // Fetch metrics
  useEffect(() => {
    const controller = new AbortController();

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${apiBase}/api/metrics/emergence?range=${timeRange}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setMetrics(data);
        setError(null);
        setShowPhaseTransition(data.phaseTransition?.detected || false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    // SSE for real-time updates
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${apiBase}/events/stream`);
      eventSource.addEventListener("capability.learned", () => fetchMetrics());
      eventSource.addEventListener("emergence.updated", () => fetchMetrics());
    } catch {
      // SSE not available
    }

    return () => {
      controller.abort();
      eventSource?.close();
    };
  }, [apiBase, timeRange]);

  // Render ECharts
  useEffect(() => {
    if (!metrics?.timeseries) return;

    const echarts = (globalThis as unknown as { echarts?: unknown }).echarts as {
      init: (el: HTMLElement) => {
        setOption: (opt: unknown) => void;
        dispose: () => void;
        resize: () => void;
      };
    } | undefined;

    if (!echarts) return;

    // Cleanup previous instances
    Object.values(chartInstances.current).forEach((c: unknown) => {
      if (c && typeof c === "object" && "dispose" in c) {
        (c as { dispose: () => void }).dispose();
      }
    });
    chartInstances.current = {};

    // Common chart options for dark theme
    const baseOption = {
      backgroundColor: "transparent",
      grid: {
        top: 20,
        right: 20,
        bottom: 30,
        left: 40,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(30, 27, 24, 0.95)",
        borderColor: "rgba(255, 184, 111, 0.2)",
        textStyle: { color: "#f5f0e8", fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: "rgba(255, 184, 111, 0.3)" } },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLine: { lineStyle: { color: "rgba(255, 184, 111, 0.2)" } },
        axisLabel: { color: "#8a8078", fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLine: { show: false },
        axisLabel: { color: "#8a8078", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(255, 184, 111, 0.08)" } },
      },
    };

    // Entropy chart
    if (entropyChartRef.current) {
      const chart = echarts.init(entropyChartRef.current);
      chartInstances.current.entropy = chart;

      chart.setOption({
        ...baseOption,
        xAxis: {
          ...baseOption.xAxis,
          data: metrics.timeseries.entropy.map((p) =>
            new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          ),
        },
        series: [
          // Healthy zone (markArea)
          {
            type: "line",
            data: [],
            markArea: {
              silent: true,
              itemStyle: {
                color: "rgba(74, 222, 128, 0.05)",
                borderColor: "rgba(74, 222, 128, 0.2)",
                borderWidth: 1,
              },
              data: [
                [
                  { yAxis: metrics.thresholds.entropyHealthy[0] },
                  { yAxis: metrics.thresholds.entropyHealthy[1] },
                ],
              ],
            },
          },
          // Main line
          {
            name: "Graph Entropy",
            type: "line",
            smooth: 0.3,
            symbol: "circle",
            symbolSize: 4,
            lineStyle: { color: "#ffb86f", width: 2 },
            itemStyle: { color: "#ffb86f" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(255, 184, 111, 0.3)" },
                  { offset: 1, color: "rgba(255, 184, 111, 0.02)" },
                ],
              },
            },
            data: metrics.timeseries.entropy.map((p) => p.value),
          },
        ],
      });
    }

    // Stability chart
    if (stabilityChartRef.current) {
      const chart = echarts.init(stabilityChartRef.current);
      chartInstances.current.stability = chart;

      chart.setOption({
        ...baseOption,
        xAxis: {
          ...baseOption.xAxis,
          data: metrics.timeseries.stability.map((p) =>
            new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          ),
        },
        series: [
          {
            name: "Cluster Stability",
            type: "line",
            smooth: 0.3,
            symbol: "circle",
            symbolSize: 4,
            lineStyle: { color: "#4ade80", width: 2 },
            itemStyle: { color: "#4ade80" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(74, 222, 128, 0.3)" },
                  { offset: 1, color: "rgba(74, 222, 128, 0.02)" },
                ],
              },
            },
            data: metrics.timeseries.stability.map((p) => p.value),
          },
        ],
      });
    }

    // Handle resize
    const handleResize = () => {
      Object.values(chartInstances.current).forEach((c: unknown) => {
        if (c && typeof c === "object" && "resize" in c) {
          (c as { resize: () => void }).resize();
        }
      });
    };
    globalThis.addEventListener("resize", handleResize);

    return () => {
      globalThis.removeEventListener("resize", handleResize);
      Object.values(chartInstances.current).forEach((c: unknown) => {
        if (c && typeof c === "object" && "dispose" in c) {
          (c as { dispose: () => void }).dispose();
        }
      });
    };
  }, [metrics]);

  // Health color helpers
  const getEntropyColor = (entropy: number, thresholds: [number, number]) => {
    if (entropy >= thresholds[0] && entropy <= thresholds[1]) return "var(--success)";
    return "var(--warning)";
  };

  const getStabilityColor = (stability: number, threshold: number) => {
    return stability >= threshold ? "var(--success)" : "var(--warning)";
  };

  if (loading && !metrics) {
    return (
      <div class="h-full flex items-center justify-center" style={{ color: "var(--text-dim)" }}>
        Loading emergence metrics...
      </div>
    );
  }

  if (error) {
    return (
      <div class="h-full flex items-center justify-center" style={{ color: "var(--error)" }}>
        Error: {error}
      </div>
    );
  }

  if (!metrics) return null;

  const { current, trends, thresholds, phaseTransition, recommendations } = metrics;

  return (
    <div
      class="h-full overflow-auto p-4"
      style={{
        background: "linear-gradient(to bottom, var(--bg-elevated), var(--bg))",
      }}
    >
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold" style={{ color: "var(--text)" }}>
          Emergence Metrics
        </h2>
        <div
          class="flex gap-1 p-0.5 rounded-lg"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          {(["1h", "24h", "7d", "30d"] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              class="py-1.5 px-3 rounded text-xs font-semibold transition-colors"
              style={
                timeRange === r
                  ? { background: "var(--accent)", color: "var(--bg)" }
                  : { color: "var(--text-muted)" }
              }
              onClick={() => setTimeRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Phase Transition Banner */}
      {showPhaseTransition && phaseTransition.detected && (
        <PhaseTransitionBanner
          transition={phaseTransition}
          onDismiss={() => setShowPhaseTransition(false)}
        />
      )}

      {/* KPI Cards Grid */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="relative">
          <MetricCard
            label="Graph Entropy"
            value={current.graphEntropy.toFixed(2)}
            color={getEntropyColor(current.graphEntropy, thresholds.entropyHealthy)}
          />
          <div class="absolute top-2 right-2">
            <TrendIndicator trend={trends.graphEntropy || "stable"} />
          </div>
        </div>
        <div class="relative">
          <MetricCard
            label="Cluster Stability"
            value={current.clusterStability.toFixed(2)}
            color={getStabilityColor(current.clusterStability, thresholds.stabilityHealthy)}
          />
          <div class="absolute top-2 right-2">
            <TrendIndicator trend={trends.clusterStability || "stable"} />
          </div>
        </div>
        <div class="relative">
          <MetricCard
            label="Diversity"
            value={current.capabilityDiversity.toFixed(2)}
            color={
              current.capabilityDiversity >= thresholds.diversityHealthy
                ? "var(--success)"
                : "var(--text-muted)"
            }
          />
          <div class="absolute top-2 right-2">
            <TrendIndicator trend={trends.capabilityDiversity || "stable"} />
          </div>
        </div>
        <div class="relative">
          <MetricCard
            label="Learning Velocity"
            value={`${current.learningVelocity.toFixed(1)}/h`}
            color="var(--info)"
          />
          <div class="absolute top-2 right-2">
            <TrendIndicator trend={trends.learningVelocity || "stable"} />
          </div>
        </div>
      </div>

      {/* Secondary metrics with Speculation Gauge (CR-6) */}
      <div class="flex flex-wrap gap-3 mb-4 items-center">
        {/* Gauge for speculation accuracy */}
        <div
          class="p-3 rounded-lg flex-shrink-0 relative"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <GaugeChart
            value={current.speculationAccuracy}
            label="Speculation Accuracy"
            color={current.speculationAccuracy > 0.8 ? "#4ade80" : current.speculationAccuracy > 0.5 ? "#fbbf24" : "#f87171"}
          />
          <div class="absolute top-1 right-1">
            <TrendIndicator trend={trends.speculationAccuracy || "stable"} />
          </div>
        </div>
        {/* Other secondary metrics */}
        <div class="grid grid-cols-3 gap-3 flex-1">
          <MetricCard
            label="Capabilities"
            value={current.capabilityCount}
            color="var(--accent)"
            compact
          />
          <MetricCard
            label="Threshold α"
            value={current.thresholdConvergence.toFixed(2)}
            color="var(--accent)"
            compact
          />
          <MetricCard
            label="Parallel Rate"
            value={`${(current.parallelizationRate * 100).toFixed(0)}%`}
            color="var(--info)"
            compact
          />
        </div>
      </div>

      {/* Charts (ECharts) */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Graph Entropy" badge="over time">
          <div ref={entropyChartRef} class="h-40 w-full" />
          <div class="mt-2 flex justify-between text-xs" style={{ color: "var(--text-dim)" }}>
            <span>Healthy: {thresholds.entropyHealthy[0]} - {thresholds.entropyHealthy[1]}</span>
            <span>Current: {current.graphEntropy.toFixed(2)}</span>
          </div>
        </SectionCard>

        <SectionCard title="Cluster Stability" badge="Louvain">
          <div ref={stabilityChartRef} class="h-40 w-full" />
          <div class="mt-2">
            <ProgressBar
              value={current.clusterStability}
              label={`${(current.clusterStability * 100).toFixed(0)}%`}
              color={getStabilityColor(current.clusterStability, thresholds.stabilityHealthy)}
              height={6}
            />
          </div>
        </SectionCard>
      </div>

      {/* Recommendations */}
      <RecommendationsPanel recommendations={recommendations} />

      {/* Footer */}
      <div
        class="mt-4 pt-3 text-xs text-center"
        style={{ borderTop: "1px solid var(--border)", color: "var(--text-dim)" }}
      >
        Based on CAS theory (Holland 1992) &amp; SYMBIOSIS/ODI (arxiv:2503.13754)
      </div>
    </div>
  );
}
