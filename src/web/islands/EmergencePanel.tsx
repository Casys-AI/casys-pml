/**
 * EmergencePanel Island - CAS (Complex Adaptive Systems) Metrics Dashboard
 *
 * Displays emergence metrics based on SYMBIOSIS/ODI framework (arxiv:2503.13754)
 * and Holland's CAS theory. Replaces the "Tools" view mode.
 *
 * @module web/islands/EmergencePanel
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { MetricCard, ProgressBar, SectionCard } from "../components/ui/atoms/mod.ts";

interface EmergencePanelProps {
  apiBase: string;
}

type TimeRange = "1h" | "24h" | "7d" | "30d";
type Trend = "rising" | "falling" | "stable";

interface PhaseTransition {
  detected: boolean;
  type: "expansion" | "consolidation" | "none";
  confidence: number;
  description: string;
}

interface Recommendation {
  type: "warning" | "info" | "success";
  metric: string;
  message: string;
  action?: string;
}

interface EmergenceMetrics {
  current: {
    graphEntropy: number;
    clusterStability: number;
    capabilityDiversity: number;
    learningVelocity: number;
    speculationAccuracy: number;
    thresholdConvergence: number;
    capabilityCount: number;
    parallelizationRate: number;
  };
  trends: Record<string, Trend>;
  phaseTransition: PhaseTransition;
  recommendations: Recommendation[];
  timeseries: {
    entropy: Array<{ timestamp: string; value: number }>;
    stability: Array<{ timestamp: string; value: number }>;
    velocity: Array<{ timestamp: string; value: number }>;
  };
  thresholds: {
    entropyHealthy: [number, number];
    stabilityHealthy: number;
    diversityHealthy: number;
  };
}

// Trend indicator component
function TrendIndicator({ trend, size = "sm" }: { trend: Trend; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "text-xs" : "text-sm";
  const colors = {
    rising: "var(--success, #4ade80)",
    falling: "var(--error, #f87171)",
    stable: "var(--text-dim, #8a8078)",
  };
  const arrows = { rising: "↑", falling: "↓", stable: "→" };

  return (
    <span class={`font-bold ${sizeClass}`} style={{ color: colors[trend] }}>
      {arrows[trend]}
    </span>
  );
}

// Phase transition banner
function PhaseTransitionBanner({
  transition,
  onDismiss,
}: {
  transition: PhaseTransition;
  onDismiss: () => void;
}) {
  if (!transition.detected) return null;

  const bgColor = transition.type === "expansion"
    ? "rgba(74, 222, 128, 0.15)"
    : "rgba(251, 191, 36, 0.15)";
  const borderColor = transition.type === "expansion"
    ? "rgba(74, 222, 128, 0.3)"
    : "rgba(251, 191, 36, 0.3)";
  const icon = transition.type === "expansion" ? "🌱" : "🔮";

  return (
    <div
      class="p-3 rounded-lg mb-4 flex items-center justify-between animate-pulse"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div class="flex items-center gap-2">
        <span class="text-lg">{icon}</span>
        <div>
          <div class="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Phase Transition: {transition.type.charAt(0).toUpperCase() + transition.type.slice(1)}
          </div>
          <div class="text-xs" style={{ color: "var(--text-muted)" }}>
            {transition.description} ({(transition.confidence * 100).toFixed(0)}% confidence)
          </div>
        </div>
      </div>
      <button
        type="button"
        class="p-1 rounded hover:bg-white/10 transition-colors"
        style={{ color: "var(--text-dim)" }}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

// Recommendations panel
function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  const [collapsed, setCollapsed] = useState(recommendations.length === 0);

  if (recommendations.length === 0) return null;

  const typeColors = {
    warning: { bg: "rgba(251, 191, 36, 0.1)", border: "#fbbf24", icon: "⚠️" },
    info: { bg: "rgba(96, 165, 250, 0.1)", border: "#60a5fa", icon: "ℹ️" },
    success: { bg: "rgba(74, 222, 128, 0.1)", border: "#4ade80", icon: "✓" },
  };

  return (
    <div
      class="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        class="w-full p-2 flex items-center justify-between text-sm font-semibold"
        style={{ color: "var(--text)" }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Recommendations ({recommendations.length})</span>
        <span style={{ color: "var(--text-dim)" }}>{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <div class="px-2 pb-2 space-y-2">
          {recommendations.map((rec, idx) => {
            const style = typeColors[rec.type];
            return (
              <div
                key={idx}
                class="p-2 rounded text-xs"
                style={{ background: style.bg, borderLeft: `3px solid ${style.border}` }}
              >
                <div class="flex items-start gap-1.5">
                  <span>{style.icon}</span>
                  <div>
                    <div style={{ color: "var(--text)" }}>{rec.message}</div>
                    {rec.action && (
                      <div class="mt-1" style={{ color: "var(--text-muted)" }}>
                        → {rec.action}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EmergencePanel({ apiBase: apiBaseProp }: EmergencePanelProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [metrics, setMetrics] = useState<EmergenceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [showPhaseTransition, setShowPhaseTransition] = useState(true);

  const entropyChartRef = useRef<HTMLCanvasElement>(null);
  const stabilityChartRef = useRef<HTMLCanvasElement>(null);
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

  // Render charts
  useEffect(() => {
    if (!metrics?.timeseries) return;

    const Chart = (globalThis as unknown as { Chart?: unknown }).Chart;
    if (!Chart) return;

    // Cleanup
    Object.values(chartInstances.current).forEach((c: unknown) => {
      if (c && typeof c === "object" && "destroy" in c) {
        (c as { destroy: () => void }).destroy();
      }
    });
    chartInstances.current = {};

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(30, 27, 24, 0.95)",
          titleColor: "#f5f0e8",
          bodyColor: "#c9c2b8",
          padding: 8,
          cornerRadius: 6,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,184,111,0.08)" },
          ticks: { color: "#8a8078", maxRotation: 45, font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(255,184,111,0.08)" },
          ticks: { color: "#8a8078", font: { size: 10 } },
          beginAtZero: true,
          max: 1,
        },
      },
    };

    // Entropy chart
    if (entropyChartRef.current) {
      const ChartClass = Chart as new (ctx: CanvasRenderingContext2D | null, config: unknown) => unknown;
      chartInstances.current.entropy = new ChartClass(entropyChartRef.current.getContext("2d"), {
        type: "line",
        data: {
          labels: metrics.timeseries.entropy.map((p) =>
            new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          ),
          datasets: [
            {
              label: "Graph Entropy",
              data: metrics.timeseries.entropy.map((p) => p.value),
              borderColor: "#ffb86f",
              backgroundColor: "rgba(255, 184, 111, 0.1)",
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 2,
            },
          ],
        },
        options: {
          ...baseOptions,
          plugins: {
            ...baseOptions.plugins,
            annotation: {
              annotations: {
                healthyZone: {
                  type: "box",
                  yMin: metrics.thresholds.entropyHealthy[0],
                  yMax: metrics.thresholds.entropyHealthy[1],
                  backgroundColor: "rgba(74, 222, 128, 0.05)",
                  borderColor: "rgba(74, 222, 128, 0.2)",
                  borderWidth: 1,
                },
              },
            },
          },
        },
      });
    }

    // Stability chart
    if (stabilityChartRef.current) {
      const ChartClass = Chart as new (ctx: CanvasRenderingContext2D | null, config: unknown) => unknown;
      chartInstances.current.stability = new ChartClass(stabilityChartRef.current.getContext("2d"), {
        type: "line",
        data: {
          labels: metrics.timeseries.stability.map((p) =>
            new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          ),
          datasets: [
            {
              label: "Cluster Stability",
              data: metrics.timeseries.stability.map((p) => p.value),
              borderColor: "#4ade80",
              backgroundColor: "rgba(74, 222, 128, 0.1)",
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 2,
            },
          ],
        },
        options: baseOptions,
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach((c: unknown) => {
        if (c && typeof c === "object" && "destroy" in c) {
          (c as { destroy: () => void }).destroy();
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

      {/* Secondary metrics */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Capabilities"
          value={current.capabilityCount}
          color="var(--accent)"
          compact
        />
        <MetricCard
          label="Speculation"
          value={`${(current.speculationAccuracy * 100).toFixed(0)}%`}
          color={current.speculationAccuracy > 0.7 ? "var(--success)" : "var(--text-muted)"}
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

      {/* Charts */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Graph Entropy" badge="over time">
          <div class="h-40">
            <canvas ref={entropyChartRef} />
          </div>
          <div class="mt-2 flex justify-between text-xs" style={{ color: "var(--text-dim)" }}>
            <span>Healthy: {thresholds.entropyHealthy[0]} - {thresholds.entropyHealthy[1]}</span>
            <span>Current: {current.graphEntropy.toFixed(2)}</span>
          </div>
        </SectionCard>

        <SectionCard title="Cluster Stability" badge="Louvain">
          <div class="h-40">
            <canvas ref={stabilityChartRef} />
          </div>
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
