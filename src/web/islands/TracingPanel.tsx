/**
 * TracingPanel Island - Algorithm Scoring Visualization
 *
 * Loads traces from DB via API, uses SSE as refresh trigger.
 * Shows scoring breakdown in table format: Timestamp | Algorithm | Target | Intent | Score | Decision
 * Styled with Casys.ai design system
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { useSSE } from "../hooks/mod.ts";

// API response format (snake_case)
interface ApiTrace {
  trace_id: string;
  timestamp: string;
  correlation_id?: string;
  algorithm_name?: string;
  algorithm_mode: string;
  target_type: "tool" | "capability";
  intent?: string;
  signals: {
    semantic_score?: number;
    graph_score?: number;
    success_rate?: number;
    pagerank?: number;
    adamic_adar?: number;
    local_alpha?: number;
    alpha_algorithm?: string;
    // SHGAT V1 K-head attention
    num_heads?: number;
    avg_head_score?: number;
    head_scores?: number[];
    head_weights?: number[];
    recursive_contribution?: number;
    // Feature contributions
    feature_contrib_semantic?: number;
    feature_contrib_structure?: number;
    feature_contrib_temporal?: number;
    feature_contrib_reliability?: number;
    // Target identification
    target_id?: string;
    target_name?: string;
    target_success_rate?: number;
    target_usage_count?: number;
    reliability_mult?: number;
    // DRDSP pathfinding
    path_found?: boolean;
    path_length?: number;
    path_weight?: number;
    // Operation type
    pure?: boolean;
  };
  params: {
    alpha: number;
    reliability_factor: number;
    structural_boost: number;
  };
  final_score: number;
  threshold_used: number;
  decision: string;
  outcome?: {
    user_action?: string;
    execution_success?: boolean;
    duration_ms?: number;
  };
}

// Internal format (camelCase)
interface TraceEvent {
  traceId: string;
  timestamp: number;
  correlationId?: string;
  algorithmName?: string;
  algorithmMode: string;
  targetType: "tool" | "capability";
  intent?: string;
  signals: {
    semanticScore?: number;
    graphScore?: number;
    successRate?: number;
    pagerank?: number;
    adamicAdar?: number;
    localAlpha?: number;
    alphaAlgorithm?: string;
    // SHGAT V1 K-head attention
    numHeads?: number;
    avgHeadScore?: number;
    headScores?: number[];
    headWeights?: number[];
    recursiveContribution?: number;
    // Feature contributions
    featureContribSemantic?: number;
    featureContribStructure?: number;
    featureContribTemporal?: number;
    featureContribReliability?: number;
    // Target identification
    targetId?: string;
    targetName?: string;
    targetSuccessRate?: number;
    targetUsageCount?: number;
    reliabilityMult?: number;
    // DRDSP pathfinding
    pathFound?: boolean;
    pathLength?: number;
    pathWeight?: number;
    // Operation type
    pure?: boolean;
  };
  params: {
    alpha: number;
    reliabilityFactor: number;
    structuralBoost: number;
  };
  finalScore: number;
  thresholdUsed: number;
  decision: string;
}

// Map API snake_case to internal camelCase
function mapApiTrace(api: ApiTrace): TraceEvent {
  return {
    traceId: api.trace_id,
    timestamp: new Date(api.timestamp).getTime(),
    correlationId: api.correlation_id,
    algorithmName: api.algorithm_name,
    algorithmMode: api.algorithm_mode,
    targetType: api.target_type,
    intent: api.intent,
    signals: {
      semanticScore: api.signals.semantic_score,
      graphScore: api.signals.graph_score,
      successRate: api.signals.success_rate,
      pagerank: api.signals.pagerank,
      adamicAdar: api.signals.adamic_adar,
      localAlpha: api.signals.local_alpha,
      alphaAlgorithm: api.signals.alpha_algorithm,
      // SHGAT V1 K-head attention
      numHeads: api.signals.num_heads,
      avgHeadScore: api.signals.avg_head_score,
      headScores: api.signals.head_scores,
      headWeights: api.signals.head_weights,
      recursiveContribution: api.signals.recursive_contribution,
      // Feature contributions
      featureContribSemantic: api.signals.feature_contrib_semantic,
      featureContribStructure: api.signals.feature_contrib_structure,
      featureContribTemporal: api.signals.feature_contrib_temporal,
      featureContribReliability: api.signals.feature_contrib_reliability,
      // Target identification
      targetId: api.signals.target_id,
      targetName: api.signals.target_name,
      targetSuccessRate: api.signals.target_success_rate,
      targetUsageCount: api.signals.target_usage_count,
      reliabilityMult: api.signals.reliability_mult,
      // DRDSP pathfinding
      pathFound: api.signals.path_found,
      pathLength: api.signals.path_length,
      pathWeight: api.signals.path_weight,
      // Operation type
      pure: api.signals.pure,
    },
    params: {
      alpha: api.params.alpha,
      reliabilityFactor: api.params.reliability_factor,
      structuralBoost: api.params.structural_boost,
    },
    finalScore: api.final_score,
    thresholdUsed: api.threshold_used,
    decision: api.decision,
  };
}

interface TracingPanelProps {
  apiBase: string;
  apiKey?: string | null;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 480;

export default function TracingPanel({ apiBase, apiKey: _apiKey }: TracingPanelProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("tracing-panel-collapsed");
    return saved !== null ? saved === "true" : true;
  });

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem("tracing-panel-width");
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))) : DEFAULT_WIDTH;
  });

  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const eventsContainerRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Persist panel width
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tracing-panel-width", String(panelWidth));
    }
  }, [panelWidth]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const newWidth = globalThis.innerWidth - e.clientX;
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Persist collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tracing-panel-collapsed", String(collapsed));
    }
  }, [collapsed]);

  // Fetch traces from API (Fresh server, not MCP)
  const fetchTraces = async (since?: string) => {
    try {
      const params = new URLSearchParams({ type: "traces", limit: "50" });
      if (since) params.set("since", since);

      // Use relative URL to call Fresh server (same origin), not apiBase (MCP)
      const resp = await fetch(`/api/algorithm-feedback?${params}`);
      if (!resp.ok) return;

      const data = await resp.json();
      if (data.success && data.traces) {
        const mapped = data.traces.map(mapApiTrace);

        if (since) {
          // Prepend new traces
          setEvents((prev) => {
            const newIds = new Set(mapped.map((t: TraceEvent) => t.traceId));
            const filtered = prev.filter((t) => !newIds.has(t.traceId));
            return [...mapped, ...filtered].slice(0, 50);
          });
        } else {
          // Initial load
          setEvents(mapped);
        }

        // Update last timestamp for incremental fetches
        if (mapped.length > 0) {
          lastTimestampRef.current = new Date(mapped[0].timestamp).toISOString();
        }
      }
    } catch (err) {
      console.warn("[TracingPanel] Failed to fetch traces:", err);
    }
  };

  // Initial load when expanded
  useEffect(() => {
    if (collapsed || typeof window === "undefined") return;

    setLoading(true);
    fetchTraces().finally(() => setLoading(false));
  }, [collapsed, apiBase]);

  // SSE for real-time updates with robust reconnection
  useSSE({
    url: `${apiBase}/events/stream?filter=algorithm.*`,
    disabled: collapsed || paused,
    events: {
      "algorithm.scored": () => {
        console.debug("[TracingPanel] SSE algorithm.scored received");
        fetchTraces(lastTimestampRef.current || undefined);
      },
    },
    onOpen: () => {
      console.log("[TracingPanel] SSE connected - real-time updates active");
    },
    onReconnected: () => {
      // After reconnection, do a full refresh to catch missed events
      console.log("[TracingPanel] SSE reconnected - refreshing all traces");
      lastTimestampRef.current = null;
      fetchTraces();
    },
  });

  // Auto-scroll to top on new events
  useEffect(() => {
    if (eventsContainerRef.current && !paused) {
      eventsContainerRef.current.scrollTop = 0;
    }
  }, [events, paused]);

  const clearEvents = () => setEvents([]);

  const refreshEvents = () => {
    lastTimestampRef.current = null;
    setLoading(true);
    fetchTraces().finally(() => setLoading(false));
  };

  const getDecisionColor = (decision: string) => {
    return decision === "accepted" ? "var(--success)" : "var(--error)";
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "var(--success)";
    if (score >= 0.5) return "var(--warning)";
    return "var(--error)";
  };

  const getAlgorithmColor = (name?: string) => {
    switch (name) {
      case "SHGAT":
        return { bg: "rgba(147, 51, 234, 0.2)", text: "#a855f7" }; // purple
      case "DRDSP":
        return { bg: "rgba(236, 72, 153, 0.2)", text: "#ec4899" }; // pink
      case "HybridSearch":
        return { bg: "rgba(59, 130, 246, 0.2)", text: "#3b82f6" }; // blue
      case "CapabilityMatcher":
        return { bg: "rgba(34, 197, 94, 0.2)", text: "#22c55e" }; // green
      case "DAGSuggester":
        return { bg: "rgba(249, 115, 22, 0.2)", text: "#f97316" }; // orange
      case "AlternativesPrediction":
      case "CapabilitiesPrediction":
        return { bg: "rgba(234, 179, 8, 0.2)", text: "#eab308" }; // yellow
      default:
        return { bg: "var(--bg-surface)", text: "var(--text-muted)" };
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Compute group stats for correlation groups
  const getGroupStats = (correlationId: string) => {
    const groupEvents = events.filter((e) => e.correlationId === correlationId);
    const accepted = groupEvents.filter((e) => e.decision === "accepted").length;
    const rejected = groupEvents.length - accepted;
    const avgScore = groupEvents.reduce((sum, e) => sum + e.finalScore, 0) / groupEvents.length;
    const algorithms = [...new Set(groupEvents.map((e) => e.algorithmName || e.algorithmMode))];
    const intent = groupEvents[0]?.intent; // All events in group share same intent
    return { count: groupEvents.length, accepted, rejected, avgScore, algorithms, intent };
  };

  // Check if this is the first item of a correlation group
  const isGroupStart = (event: TraceEvent, idx: number) => {
    if (!event.correlationId) return false;
    const prevEvent = idx > 0 ? events[idx - 1] : null;
    return prevEvent?.correlationId !== event.correlationId;
  };

  const styles = {
    sidebar: {
      background: "linear-gradient(to bottom, var(--bg-elevated), var(--bg))",
      borderLeft: "1px solid var(--border)",
      fontFamily: "var(--font-sans)",
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
        class="fixed right-5 top-1/2 mt-2 p-3.5 rounded-xl cursor-pointer z-20 transition-all duration-300"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
        onClick={() => setCollapsed(false)}
        title="Algorithm Tracing"
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
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      class="p-4 overflow-hidden flex flex-col gap-3 h-full relative"
      style={{
        ...styles.sidebar,
        width: `${panelWidth}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      {/* Resize handle */}
      <div
        class="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group"
        onMouseDown={() => setIsResizing(true)}
        style={{
          background: isResizing ? "var(--accent)" : "transparent",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "var(--accent-medium)";
        }}
        onMouseOut={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        <div
          class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "var(--accent)" }}
        />
      </div>

      {/* Header */}
      <div class="flex justify-between items-center shrink-0">
        <h2 class="text-lg font-bold" style={{ color: "var(--text)" }}>
          Algorithm Traces
        </h2>
        <div class="flex gap-1">
          <button
            type="button"
            class="p-1.5 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={refreshEvents}
            title="Refresh"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg
              class={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg transition-all duration-200"
            style={paused ? styles.buttonActive : styles.button}
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume" : "Pause"}
          >
            {paused
              ? (
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )
              : (
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={clearEvents}
            title="Clear"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={() => setCollapsed(true)}
            title="Collapse"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Status bar */}
      <div
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs shrink-0"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <span
          class="w-2 h-2 rounded-full"
          style={{ background: paused ? "var(--warning)" : "var(--success)" }}
        />
        <span style={{ color: "var(--text-muted)" }}>
          {paused ? "Paused" : "Live"} · {events.length} traces
        </span>
      </div>

      {/* Table container */}
      <div
        ref={eventsContainerRef}
        class="flex-1 overflow-auto rounded-lg"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          minHeight: 0,
        }}
      >
        {loading && events.length === 0
          ? (
            <div class="p-4 text-center">
              <p class="text-sm" style={{ color: "var(--text-dim)" }}>
                Loading traces...
              </p>
            </div>
          )
          : events.length === 0
          ? (
            <div class="p-4 text-center">
              <p class="text-sm" style={{ color: "var(--text-dim)" }}>
                No algorithm traces yet
              </p>
              <p class="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Execute a search or DAG to see scoring
              </p>
            </div>
          )
          : (
            <table class="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-elevated)",
                    borderBottom: "1px solid var(--border)",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  <th
                    class="px-2 py-1.5 text-left font-medium"
                    style={{ color: "var(--text-muted)", width: "70px" }}
                  >
                    Time
                  </th>
                  <th
                    class="px-2 py-1.5 text-left font-medium"
                    style={{ color: "var(--text-muted)", width: "80px" }}
                  >
                    Algorithm
                  </th>
                  <th
                    class="px-2 py-1.5 text-left font-medium"
                    style={{ color: "var(--text-muted)", width: "30px" }}
                  >
                    T
                  </th>
                  <th
                    class="px-2 py-1.5 text-left font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Target
                  </th>
                  <th
                    class="px-2 py-1.5 text-right font-medium"
                    style={{ color: "var(--text-muted)", width: "45px" }}
                  >
                    Score
                  </th>
                  <th
                    class="px-2 py-1.5 text-center font-medium"
                    style={{ color: "var(--text-muted)", width: "20px" }}
                  >
                    ✓
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, idx) => {
                  const algoColor = getAlgorithmColor(event.algorithmName);

                  // Tree grouping logic
                  const prevEvent = idx > 0 ? events[idx - 1] : null;
                  const nextEvent = idx < events.length - 1 ? events[idx + 1] : null;
                  const hasSameCorrelation = event.correlationId &&
                    prevEvent?.correlationId === event.correlationId;
                  const isLastInGroup = event.correlationId &&
                    nextEvent?.correlationId !== event.correlationId;
                  const isInGroup = hasSameCorrelation;
                  const showGroupHeader = isGroupStart(event, idx);
                  const groupStats = showGroupHeader && event.correlationId
                    ? getGroupStats(event.correlationId)
                    : null;

                  // Tree branch characters
                  const treeBranch = isInGroup ? (isLastInGroup ? "└─" : "├─") : "";
                  const treeConnector = isInGroup && !isLastInGroup;

                  return (
                    <>
                      {/* Group header row */}
                      {showGroupHeader && groupStats && (
                        <tr
                          key={`group-${event.correlationId}`}
                          style={{
                            background: "linear-gradient(90deg, var(--accent-dim), transparent)",
                            borderBottom: "1px solid var(--accent-medium)",
                          }}
                        >
                          <td
                            colSpan={6}
                            class="px-2 py-1 text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                              ⬡ {groupStats.count} traces
                            </span>
                            <span class="mx-2">·</span>
                            <span style={{ color: "var(--success)" }}>
                              ✓ {groupStats.accepted}
                            </span>
                            <span class="mx-1">/</span>
                            <span style={{ color: "var(--error)" }}>
                              ✗ {groupStats.rejected}
                            </span>
                            <span class="mx-2">·</span>
                            <span>
                              avg:{" "}
                              <strong style={{ color: getScoreColor(groupStats.avgScore) }}>
                                {groupStats.avgScore.toFixed(2)}
                              </strong>
                            </span>
                            <span class="mx-2">·</span>
                            <span style={{ opacity: 0.7 }}>
                              {groupStats.algorithms.join(", ")}
                            </span>
                            {groupStats.intent && (
                              <>
                                <span class="mx-2">·</span>
                                <span
                                  style={{ color: "var(--text)", fontStyle: "italic" }}
                                  title={groupStats.intent}
                                >
                                  "{groupStats.intent.substring(0, 40)}
                                  {groupStats.intent.length > 40 ? "..." : ""}"
                                </span>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                      <tr
                        key={`${event.traceId}-${idx}`}
                        class="cursor-pointer transition-colors"
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: selectedEvent?.traceId === event.traceId
                            ? "var(--accent-dim)"
                            : isInGroup
                            ? "rgba(var(--accent-rgb, 139, 92, 246), 0.03)"
                            : "transparent",
                        }}
                        onClick={() =>
                          setSelectedEvent(
                            selectedEvent?.traceId === event.traceId ? null : event,
                          )}
                        onMouseOver={(e) => {
                          if (selectedEvent?.traceId !== event.traceId) {
                            e.currentTarget.style.background = isInGroup
                              ? "rgba(var(--accent-rgb, 139, 92, 246), 0.08)"
                              : "var(--bg-elevated)";
                          }
                        }}
                        onMouseOut={(e) => {
                          if (selectedEvent?.traceId !== event.traceId) {
                            e.currentTarget.style.background = isInGroup
                              ? "rgba(var(--accent-rgb, 139, 92, 246), 0.03)"
                              : "transparent";
                          }
                        }}
                      >
                        <td
                          class="px-2 py-1.5 tabular-nums relative"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {/* Tree branch indicator */}
                          {isInGroup && (
                            <span
                              class="absolute left-0 text-[10px] font-mono"
                              style={{ color: "var(--accent-medium)", opacity: 0.7 }}
                            >
                              {treeBranch}
                            </span>
                          )}
                          {/* Vertical connector line for middle items */}
                          {treeConnector && (
                            <span
                              class="absolute left-[3px] top-full w-[1px] h-full"
                              style={{ background: "var(--accent-medium)", opacity: 0.3 }}
                            />
                          )}
                          <span style={{ marginLeft: isInGroup ? "16px" : "0" }}>
                            {formatTime(event.timestamp)}
                          </span>
                        </td>
                        <td class="px-2 py-1.5">
                          <span
                            class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              background: algoColor.bg,
                              color: algoColor.text,
                            }}
                          >
                            {event.algorithmName || event.algorithmMode}
                          </span>
                        </td>
                        <td class="px-2 py-1.5">
                          <span class="flex items-center gap-0.5">
                            <span
                              class="px-1 py-0.5 rounded text-[9px] font-bold"
                              style={{
                                background: event.targetType === "tool"
                                  ? "var(--accent-dim)"
                                  : "rgba(59, 130, 246, 0.2)",
                                color: event.targetType === "tool" ? "var(--accent)" : "#3b82f6",
                              }}
                            >
                              {event.targetType === "tool" ? "T" : "C"}
                            </span>
                            {event.signals?.pure && (
                              <span
                                class="px-1 py-0.5 rounded text-[8px] font-bold"
                                style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}
                                title="Pure operation (no side effects)"
                              >
                                P
                              </span>
                            )}
                          </span>
                        </td>
                        <td
                          class="px-2 py-1.5 truncate max-w-[120px]"
                          style={{ color: "var(--text)" }}
                          title={event.signals?.targetName || event.signals?.targetId ||
                            event.intent || event.traceId}
                        >
                          {/* Show targetName if available, otherwise intent */}
                          {event.signals?.targetName ||
                            event.signals?.targetId?.split(":").pop()?.substring(0, 20) ||
                            event.intent?.substring(0, 25) ||
                            event.traceId.substring(0, 8)}
                        </td>
                        <td
                          class="px-2 py-1.5 text-right tabular-nums font-bold"
                          style={{ color: getScoreColor(event.finalScore) }}
                        >
                          {event.finalScore.toFixed(2)}
                        </td>
                        <td class="px-2 py-1.5 text-center">
                          <span
                            class="inline-block w-2 h-2 rounded-full"
                            style={{ background: getDecisionColor(event.decision) }}
                            title={event.decision}
                          />
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {/* Details panel */}
      {selectedEvent && (
        <div
          class="shrink-0 p-3 rounded-lg text-xs"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            maxHeight: selectedEvent.algorithmName === "SHGAT" ? "280px" : "180px",
            overflow: "auto",
          }}
        >
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold" style={{ color: "var(--text)" }}>
              {selectedEvent.algorithmName || "Unknown"} Details
            </span>
            <button
              type="button"
              class="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-muted)",
              }}
              onClick={() => setSelectedEvent(null)}
            >
              ✕
            </button>
          </div>
          <div
            class="grid grid-cols-2 gap-x-3 gap-y-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {/* Signals */}
            {selectedEvent.signals.semanticScore !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Semantic:</span>
                <span style={{ color: getScoreColor(selectedEvent.signals.semanticScore) }}>
                  {(selectedEvent.signals.semanticScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {selectedEvent.signals.graphScore !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Graph:</span>
                <span style={{ color: getScoreColor(selectedEvent.signals.graphScore) }}>
                  {(selectedEvent.signals.graphScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {selectedEvent.signals.successRate !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Success:</span>
                <span style={{ color: getScoreColor(selectedEvent.signals.successRate) }}>
                  {(selectedEvent.signals.successRate * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {selectedEvent.signals.localAlpha !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Alpha:</span>
                <span style={{ color: "var(--text)" }}>
                  {selectedEvent.signals.localAlpha.toFixed(2)}
                </span>
              </div>
            )}
            {/* DRDSP pathfinding */}
            {selectedEvent.signals.pathFound !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Path:</span>
                <span
                  style={{
                    color: selectedEvent.signals.pathFound ? "var(--success)" : "var(--error)",
                  }}
                >
                  {selectedEvent.signals.pathFound ? "Found" : "Not found"}
                </span>
              </div>
            )}
            {selectedEvent.signals.pathLength !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Path Len:</span>
                <span style={{ color: "var(--text)" }}>
                  {selectedEvent.signals.pathLength}
                </span>
              </div>
            )}
            {selectedEvent.signals.pathWeight !== undefined && (
              <div>
                <span style={{ color: "var(--text-dim)" }}>Path Wt:</span>
                <span style={{ color: "var(--text)" }}>
                  {selectedEvent.signals.pathWeight.toFixed(2)}
                </span>
              </div>
            )}
            {/* Params */}
            <div>
              <span style={{ color: "var(--text-dim)" }}>Threshold:</span>
              <span style={{ color: "var(--text)" }}>
                {selectedEvent.thresholdUsed.toFixed(2)}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>Decision:</span>
              <span style={{ color: getDecisionColor(selectedEvent.decision) }}>
                {selectedEvent.decision}
              </span>
            </div>
          </div>

          {/* SHGAT V1 K-Head Attention Section */}
          {selectedEvent.algorithmName === "SHGAT" && (
            <div
              class="mt-2 pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              {/* Target info */}
              {selectedEvent.signals.targetName && (
                <div class="mb-2">
                  <span style={{ color: "var(--text-dim)" }}>Target:</span>{" "}
                  <span
                    class="px-1.5 py-0.5 rounded font-medium"
                    style={{ background: "rgba(147, 51, 234, 0.2)", color: "#a855f7" }}
                  >
                    {selectedEvent.signals.targetName}
                  </span>
                  {selectedEvent.signals.targetSuccessRate !== undefined && (
                    <span class="ml-2" style={{ color: "var(--text-dim)" }}>
                      ({(selectedEvent.signals.targetSuccessRate * 100).toFixed(0)}% success,{" "}
                      {selectedEvent.signals.targetUsageCount ?? 0} uses)
                    </span>
                  )}
                </div>
              )}

              {/* K-Head Scores visualization */}
              {selectedEvent.signals.headScores && selectedEvent.signals.headScores.length > 0 && (
                <div class="mb-2">
                  <div class="flex items-center gap-2 mb-1">
                    <span style={{ color: "var(--text-dim)" }}>
                      K={selectedEvent.signals.numHeads} Head Scores:
                    </span>
                    <span
                      style={{ color: getScoreColor(selectedEvent.signals.avgHeadScore ?? 0) }}
                    >
                      avg {((selectedEvent.signals.avgHeadScore ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div class="flex gap-1 items-end h-6">
                    {selectedEvent.signals.headScores.map((score, i) => (
                      <div
                        key={i}
                        class="flex-1 rounded-t"
                        style={{
                          height: `${Math.max(4, score * 100)}%`,
                          background: getScoreColor(score),
                          opacity: 0.8,
                          minWidth: "8px",
                        }}
                        title={`Head ${i + 1}: ${(score * 100).toFixed(1)}%`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Head Weights visualization */}
              {selectedEvent.signals.headWeights && selectedEvent.signals.headWeights.length > 0 &&
                (
                  <div class="mb-2">
                    <span style={{ color: "var(--text-dim)" }}>Head Weights:</span>
                    {selectedEvent.signals.headWeights.map((w, i) => (
                      <span
                        key={i}
                        class="inline-block px-1 mr-1 rounded text-[9px]"
                        style={{
                          background: `rgba(139, 92, 246, ${0.2 + w * 0.6})`,
                          color: w > 0.3 ? "#fff" : "var(--text)",
                        }}
                      >
                        {(w * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}

              {/* Recursive contribution */}
              {selectedEvent.signals.recursiveContribution !== undefined && (
                <div class="mb-1">
                  <span style={{ color: "var(--text-dim)" }}>Recursive Contrib:</span>{" "}
                  <span style={{ color: "var(--text)" }}>
                    {(selectedEvent.signals.recursiveContribution * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Feature contributions */}
              {(selectedEvent.signals.featureContribSemantic !== undefined ||
                selectedEvent.signals.featureContribStructure !== undefined) && (
                <div class="flex flex-wrap gap-2">
                  {selectedEvent.signals.featureContribSemantic !== undefined && (
                    <span style={{ color: "var(--text-dim)" }}>
                      Sem:{" "}
                      <span style={{ color: "var(--text)" }}>
                        {(selectedEvent.signals.featureContribSemantic * 100).toFixed(0)}%
                      </span>
                    </span>
                  )}
                  {selectedEvent.signals.featureContribStructure !== undefined && (
                    <span style={{ color: "var(--text-dim)" }}>
                      Struct:{" "}
                      <span style={{ color: "var(--text)" }}>
                        {(selectedEvent.signals.featureContribStructure * 100).toFixed(0)}%
                      </span>
                    </span>
                  )}
                  {selectedEvent.signals.featureContribTemporal !== undefined && (
                    <span style={{ color: "var(--text-dim)" }}>
                      Temp:{" "}
                      <span style={{ color: "var(--text)" }}>
                        {(selectedEvent.signals.featureContribTemporal * 100).toFixed(0)}%
                      </span>
                    </span>
                  )}
                  {selectedEvent.signals.reliabilityMult !== undefined && (
                    <span style={{ color: "var(--text-dim)" }}>
                      Rel×:{" "}
                      <span style={{ color: "var(--text)" }}>
                        {selectedEvent.signals.reliabilityMult.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedEvent.intent && (
            <div class="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-dim)" }}>Intent:</span>
              <span style={{ color: "var(--text)" }}>{selectedEvent.intent}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
