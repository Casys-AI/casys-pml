/**
 * EmergencePanel Island - CAS (Complex Adaptive Systems) Metrics Dashboard
 *
 * Displays emergence metrics based on SYMBIOSIS/ODI framework (arxiv:2503.13754)
 * and Holland's CAS theory. Replaces the "Tools" view mode.
 *
 * Story 9.8: Added scope filtering support for per-user metrics.
 *
 * @module web/islands/EmergencePanel
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  GaugeChart,
  LegendItem,
  MetricCard,
  ProgressBar,
  SectionCard,
  TrendIndicator,
} from "../components/ui/atoms/mod.ts";
import { useSSE } from "../hooks/mod.ts";
import {
  PhaseTransitionBanner,
  RecommendationsPanel,
  ScopeToggle,
  type Scope,
} from "../components/ui/molecules/mod.ts";
import type {
  EmergenceMetricsResponse,
  EmergenceTimeRange,
} from "../../shared/emergence.types.ts";

interface EmergencePanelProps {
  apiBase: string;
  /** Story 9.8: Scope filter (default: "user") */
  scope?: Scope;
  /** Callback when scope changes */
  onScopeChange?: (scope: Scope) => void;
  /** Whether in local/single-user mode */
  isLocalMode?: boolean;
}

// Use shared types - alias for backward compatibility
type TimeRange = EmergenceTimeRange;
type EmergenceMetrics = EmergenceMetricsResponse;

export default function EmergencePanel({
  apiBase: apiBaseProp,
  scope: scopeProp = "user",
  onScopeChange,
  isLocalMode = false,
}: EmergencePanelProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [metrics, setMetrics] = useState<EmergenceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [showPhaseTransition, setShowPhaseTransition] = useState(true);
  // Story 9.8: Local scope state if no prop/callback provided
  const [localScope, setLocalScope] = useState<Scope>(scopeProp);
  const scope = scopeProp ?? localScope;
  const handleScopeChange = onScopeChange ?? setLocalScope;

  const entropyChartRef = useRef<HTMLDivElement>(null);
  const stabilityChartRef = useRef<HTMLDivElement>(null);
  const chartInstances = useRef<Record<string, unknown>>({});

  // Fetch metrics function - Story 9.8: Add scope parameter
  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${apiBase}/api/metrics/emergence?range=${timeRange}&scope=${scope}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
      setError(null);
      setShowPhaseTransition(data.phaseTransition?.detected || false);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, timeRange, scope]);

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // SSE for real-time updates with robust reconnection
  useSSE({
    url: `${apiBase}/events/stream?filter=capability.*,emergence.*`,
    events: {
      "capability.learned": () => fetchMetrics(),
      "emergence.updated": () => fetchMetrics(),
    },
    onOpen: () => {
      console.log("[EmergencePanel] SSE connected");
    },
  });

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

    // Calculate time range bounds for x-axis
    const now = Date.now();
    const rangeMs = timeRange === "1h" ? 60 * 60 * 1000
      : timeRange === "24h" ? 24 * 60 * 60 * 1000
      : timeRange === "7d" ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
    const xAxisMin = now - rangeMs;
    const xAxisMax = now;

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
        type: "time",
        boundaryGap: false,
        min: xAxisMin,
        max: xAxisMax,
        axisLine: { lineStyle: { color: "rgba(255, 184, 111, 0.2)" } },
        axisLabel: {
          color: "#8a8078",
          fontSize: 10,
          formatter: (value: number) => {
            const d = new Date(value);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          },
        },
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

    // Entropy chart - Story 6.6: Now shows structural, semantic, and dual entropy
    if (entropyChartRef.current) {
      const chart = echarts.init(entropyChartRef.current);
      chartInstances.current.entropy = chart;

      // Build series array dynamically based on available data
      const series: unknown[] = [
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
        // Structural entropy (orange) - use [timestamp, value] for time axis
        {
          name: "Structural",
          type: "line",
          smooth: 0.3,
          symbol: "circle",
          symbolSize: 3,
          lineStyle: { color: "#ffb86f", width: 2 },
          itemStyle: { color: "#ffb86f" },
          data: metrics.timeseries.entropy.map((p) => [new Date(p.timestamp).getTime(), p.value]),
        },
      ];

      // Add semantic entropy if available (purple)
      if (metrics.timeseries.semanticEntropy && metrics.timeseries.semanticEntropy.length > 0) {
        series.push({
          name: "Semantic",
          type: "line",
          smooth: 0.3,
          symbol: "diamond",
          symbolSize: 3,
          lineStyle: { color: "#a78bfa", width: 2, type: "dashed" },
          itemStyle: { color: "#a78bfa" },
          data: metrics.timeseries.semanticEntropy.map((p) => [new Date(p.timestamp).getTime(), p.value]),
        });
      }

      // Add dual entropy if available (green - PRIMARY metric)
      if (metrics.timeseries.dualEntropy && metrics.timeseries.dualEntropy.length > 0) {
        series.push({
          name: "Dual",
          type: "line",
          smooth: 0.3,
          symbol: "roundRect",
          symbolSize: 4,
          lineStyle: { color: "#4ade80", width: 2.5 },
          itemStyle: { color: "#4ade80" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(74, 222, 128, 0.2)" },
                { offset: 1, color: "rgba(74, 222, 128, 0.02)" },
              ],
            },
          },
          data: metrics.timeseries.dualEntropy.map((p) => [new Date(p.timestamp).getTime(), p.value]),
        });
      }

      chart.setOption({
        ...baseOption,
        legend: {
          show: true,
          top: 0,
          right: 0,
          textStyle: { color: "#8a8078", fontSize: 10 },
          itemWidth: 12,
          itemHeight: 8,
        },
        // xAxis uses type: "time" from baseOption, no data override needed
        series,
      });
    }

    // Stability chart - use [timestamp, value] for time axis
    if (stabilityChartRef.current) {
      const chart = echarts.init(stabilityChartRef.current);
      chartInstances.current.stability = chart;

      chart.setOption({
        ...baseOption,
        // xAxis uses type: "time" from baseOption, no data override needed
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
            data: metrics.timeseries.stability.map((p) => [new Date(p.timestamp).getTime(), p.value]),
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
  }, [metrics, timeRange]);

  // Health color helpers
  const getEntropyColor = (entropy: number, thresholds: [number, number]) => {
    if (entropy >= thresholds[0] && entropy <= thresholds[1]) return "var(--success)";
    return "var(--warning)";
  };

  const getStabilityColor = (stability: number, threshold: number) => {
    return stability >= threshold ? "var(--success)" : "var(--warning)";
  };

  // Health status badge helper (uses tensor entropy health classification)
  const getHealthBadge = (health: "rigid" | "healthy" | "chaotic" | undefined) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      rigid: { bg: "rgba(59, 130, 246, 0.2)", color: "#3b82f6", label: "Rigid" },
      healthy: { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e", label: "Healthy" },
      chaotic: { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444", label: "Chaotic" },
    };
    const style = styles[health || "healthy"];
    return style;
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
      {/* Header with Scope Toggle (Story 9.8) */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-4">
          <h2 class="text-lg font-bold" style={{ color: "var(--text)" }}>
            Emergence Metrics
          </h2>
          {/* Story 9.8: Scope Toggle */}
          <ScopeToggle
            scope={scope}
            onChange={handleScopeChange}
            isLocalMode={isLocalMode}
          />
        </div>
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
          <div class="absolute top-2 right-2 flex items-center gap-1">
            {/* Health status badge from tensor entropy */}
            {current.tensorEntropy && (
              <span
                class="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  background: getHealthBadge(current.tensorEntropy.health).bg,
                  color: getHealthBadge(current.tensorEntropy.health).color,
                }}
              >
                {getHealthBadge(current.tensorEntropy.health).label}
              </span>
            )}
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
        <SectionCard
          title="Entropy Analysis"
          badge={current.tensorEntropy ? `${current.tensorEntropy.graphSize.nodes} nodes` : "over time"}
        >
          <div ref={entropyChartRef} class="h-40 w-full" />
          <div class="mt-2 flex justify-between items-center text-xs" style={{ color: "var(--text-dim)" }}>
            <span>
              Healthy: {thresholds.entropyHealthy[0].toFixed(2)} - {thresholds.entropyHealthy[1].toFixed(2)}
              {thresholds.isAdjusted && <span class="ml-1 opacity-60">(size-adjusted)</span>}
            </span>
            <div class="flex items-center gap-2">
              {current.tensorEntropy && (
                <span
                  class="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{
                    background: getHealthBadge(current.tensorEntropy.health).bg,
                    color: getHealthBadge(current.tensorEntropy.health).color,
                  }}
                >
                  {getHealthBadge(current.tensorEntropy.health).label}
                </span>
              )}
            </div>
          </div>
          {/* Story 6.6: Show all 3 entropy values with colors matching the chart */}
          {current.tensorEntropy && (
            <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
              <LegendItem
                color="#ffb86f"
                label="Structural"
                value={current.tensorEntropy.structural}
              />
              <LegendItem
                color="#a78bfa"
                label="Semantic"
                value={current.tensorEntropy.semantic ?? "N/A"}
              />
              <LegendItem
                color="#4ade80"
                label="Dual"
                value={current.tensorEntropy.dual ?? current.tensorEntropy.normalized}
                primary
              />
            </div>
          )}
          {/* Embedding count info */}
          {current.tensorEntropy?.embeddingCount && (
            <div class="mt-1 text-xs opacity-50" style={{ color: "var(--text-dim)" }}>
              {current.tensorEntropy.embeddingCount} embeddings • {current.tensorEntropy.graphSize.hyperedges} hyperedges
            </div>
          )}
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
