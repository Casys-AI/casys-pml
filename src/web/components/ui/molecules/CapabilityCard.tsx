/**
 * CapabilityCard - Multi-mode component for displaying capabilities
 *
 * Three distinct density modes:
 * - compact: Terminal-style table row with ASCII tree for children
 * - normal: Dashboard card with balanced info
 * - extended: Full tree panel with all details and visual hierarchy
 *
 * Features:
 * - Sparkline showing recent execution history (success/fail)
 * - Trend indicator (improving/stable/declining)
 *
 * @module web/components/ui/molecules/CapabilityCard
 */

import { useState } from "preact/hooks";

export interface ToolInfo {
  id: string;
  name: string;
  server: string;
  color: string;
}

/** Simplified trace info for sparkline */
export interface TraceInfo {
  success: boolean;
  durationMs?: number;
}

/** Tool info with layer for flow visualization */
export interface LayeredToolInfo extends ToolInfo {
  layerIndex: number;
}

/** Nested capability (child of a compound capability) */
export interface ChildCapabilityInfo {
  id: string;
  name: string;
  successRate: number;
  usageCount: number;
  tools: ToolInfo[];
  /** Tools organized by execution layer for flow visualization */
  toolsByLayer?: Map<number, ToolInfo[]>;
  color: string;
  traces?: TraceInfo[];
}

/** Card density mode */
export type CardDensity = "compact" | "normal" | "extended";

/** Trend direction */
export type TrendDirection = "up" | "stable" | "down";

export interface CapabilityCardProps {
  /** Capability ID */
  id: string;
  /** Capability display name */
  name: string;
  /** Success rate (0-1) */
  successRate: number;
  /** Number of times used */
  usageCount: number;
  /** Last used timestamp (ISO string) */
  lastUsed?: string;
  /** Tools contained in this capability */
  tools: ToolInfo[];
  /** Tools organized by execution layer for flow visualization */
  toolsByLayer?: Map<number, ToolInfo[]>;
  /** Recent execution traces for sparkline */
  traces?: TraceInfo[];
  /** Child capabilities (nested/compound) */
  children?: ChildCapabilityInfo[];
  /** Border/accent color */
  color: string;
  /** Whether this card is currently selected */
  isSelected?: boolean;
  /** Whether this card is newly added (for animation) */
  isNew?: boolean;
  /** Nesting depth (for extended mode tree) */
  depth?: number;
  /** Is this the last child in its parent? (for tree lines) */
  isLastChild?: boolean;
  /** Click handler for the card */
  onClick?: () => void;
  /** Click handler for a tool */
  onToolClick?: (toolId: string) => void;
  /** Click handler for a child capability */
  onChildClick?: (childId: string) => void;
  /** Card density mode */
  density?: CardDensity;
  /** Fully qualified domain name (Extended mode) */
  fqdn?: string;
  /** PageRank score 0-1 (Extended mode) */
  pagerank?: number;
  /** Community/cluster ID (Extended mode) */
  communityId?: number;
  /** Description/intent of the capability (Extended mode) */
  description?: string;
}

// Format full date + time for last used display
// compact: always show date (no "Aujourd'hui"/"Hier")
function formatFullDateTime(iso: string | undefined, compact = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const timeStr = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  if (!compact) {
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return `Aujourd'hui ${timeStr}`;
    if (isYesterday) return `Hier ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: date.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
  });
  return `${dateStr} ${timeStr}`;
}

// Success rate color
function getSuccessColor(rate: number): { bg: string; text: string } {
  if (rate >= 0.8) return { bg: "#22c55e20", text: "#22c55e" };
  if (rate >= 0.5) return { bg: "#f59e0b20", text: "#f59e0b" };
  return { bg: "#ef444420", text: "#ef4444" };
}

/**
 * Calculate trend from traces
 * Compares first half vs second half success rate
 */
function calculateTrend(traces: TraceInfo[] | undefined): TrendDirection {
  if (!traces || traces.length < 4) return "stable";

  const mid = Math.floor(traces.length / 2);
  // traces[0] is most recent, so first half = recent, second half = older
  const recentHalf = traces.slice(0, mid);
  const olderHalf = traces.slice(mid);

  const recentSuccess = recentHalf.filter((t) => t.success).length / recentHalf.length;
  const olderSuccess = olderHalf.filter((t) => t.success).length / olderHalf.length;

  const diff = recentSuccess - olderSuccess;
  if (diff > 0.15) return "up";
  if (diff < -0.15) return "down";
  return "stable";
}

/**
 * Sparkline component - mini bar chart of recent executions
 */
function Sparkline({
  traces,
  maxBars = 8,
  barWidth = 3,
  barGap = 1,
  height = 12,
}: {
  traces: TraceInfo[];
  maxBars?: number;
  barWidth?: number;
  barGap?: number;
  height?: number;
}) {
  // Take last N traces (reversed so oldest is first visually)
  const displayTraces = traces.slice(0, maxBars).reverse();
  const width = displayTraces.length * (barWidth + barGap) - barGap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      class="shrink-0"
    >
      {displayTraces.map((trace, i) => (
        <rect
          key={i}
          x={i * (barWidth + barGap)}
          y={0}
          width={barWidth}
          height={height}
          rx={1}
          fill={trace.success ? "#22c55e" : "#ef4444"}
          opacity={0.9}
        />
      ))}
    </svg>
  );
}

/**
 * Trend indicator component
 */
function TrendIndicator({ trend, size = 14 }: { trend: TrendDirection; size?: number }) {
  if (trend === "stable") return null;

  const isUp = trend === "up";
  const color = isUp ? "#22c55e" : "#ef4444";
  const rotation = isUp ? 0 : 180;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)` }}
      class="shrink-0"
      title={isUp ? "Amélioration" : "Dégradation"}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

/**
 * COMPACT MODE - Table row with dot flow visualization
 * Minimal: ●● → [●→●] → ●●● with metrics
 */
function CompactRow({
  name,
  successRate,
  usageCount,
  lastUsed,
  tools,
  toolsByLayer,
  traces = [],
  children = [],
  isSelected,
  isNew,
  depth = 0,
  isLastChild = true,
  onClick,
}: CapabilityCardProps) {
  const hasChildren = children.length > 0;
  const successColors = getSuccessColor(successRate);
  const trend = calculateTrend(traces);

  // Build tree prefix for nested items
  const treePrefix = depth > 0
    ? Array(depth - 1).fill("│  ").join("") + (isLastChild ? "└─ " : "├─ ")
    : "";

  // Get sorted layers
  const layers = toolsByLayer && toolsByLayer.size > 0
    ? Array.from(toolsByLayer.entries()).sort((a, b) => a[0] - b[0])
    : tools.length > 0
    ? [[0, tools] as [number, ToolInfo[]]]
    : [];

  return (
    <>
      <div
        class={`
          flex items-center gap-3 px-3 py-1.5 cursor-pointer
          transition-all duration-150 hover:bg-white/5
          ${isSelected ? "bg-white/8" : ""}
        `}
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
          fontSize: "11px",
          animation: isNew ? "rowFlash 0.5s ease-out" : undefined,
          borderLeft: isSelected ? "3px solid var(--accent, #FFB86F)" : "3px solid transparent",
        }}
        onClick={onClick}
      >
        {/* Tree prefix */}
        {depth > 0 && (
          <span style={{ color: "var(--text-dim, #4a4540)", whiteSpace: "pre" }}>
            {treePrefix}
          </span>
        )}

        {/* Name */}
        <span
          class="w-40 truncate font-medium shrink-0"
          style={{ color: isSelected ? "var(--accent, #FFB86F)" : "var(--text, #f5f0ea)" }}
          title={name}
        >
          {name}
        </span>

        {/* Flow as dots: ●● → [●→●] → ●●● */}
        <div class="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {layers.map(([layerIndex, layerTools], i) => (
            <div key={`l-${layerIndex}`} class="flex items-center gap-1">
              <div class="flex items-center gap-0.5">
                {layerTools.slice(0, 4).map((tool) => (
                  <span
                    key={tool.id}
                    class="w-2 h-2 rounded-full"
                    style={{ background: tool.color || "#FFB86F" }}
                    title={`${tool.name} (${tool.server})`}
                  />
                ))}
                {layerTools.length > 4 && (
                  <span class="text-[9px]" style={{ color: "var(--text-dim)" }}>
                    +{layerTools.length - 4}
                  </span>
                )}
              </div>
              {(i < layers.length - 1 || hasChildren) && (
                <span style={{ color: "var(--text-dim, #6a6560)" }}>→</span>
              )}
            </div>
          ))}

          {/* Children inline as bracketed mini-flows */}
          {children.slice(0, 2).map((child, ci) => {
            const childLayers = child.toolsByLayer && child.toolsByLayer.size > 0
              ? Array.from(child.toolsByLayer.entries()).sort((a, b) => a[0] - b[0])
              : child.tools.length > 0
              ? [[0, child.tools] as [number, ToolInfo[]]]
              : [];
            return (
              <div key={child.id} class="flex items-center gap-1">
                <div
                  class="flex items-center gap-0.5 px-1 rounded"
                  style={{ background: `${child.color}15` }}
                  title={child.name}
                >
                  {childLayers.map(([li, lt], idx) => (
                    <div key={li} class="flex items-center gap-0.5">
                      {lt.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          class="w-1.5 h-1.5 rounded-full"
                          style={{ background: t.color || "#FFB86F" }}
                        />
                      ))}
                      {idx < childLayers.length - 1 && (
                        <span class="text-[8px]" style={{ color: "var(--text-dim)" }}>→</span>
                      )}
                    </div>
                  ))}
                </div>
                {ci < children.length - 1 && <span style={{ color: "var(--text-dim)" }}>→</span>}
              </div>
            );
          })}
          {children.length > 2 && (
            <span class="text-[9px]" style={{ color: "var(--text-dim)" }}>
              +{children.length - 2}
            </span>
          )}
        </div>

        {/* Trend */}
        <TrendIndicator trend={trend} size={12} />

        {/* Success rate */}
        <span class="w-10 text-right tabular-nums shrink-0" style={{ color: successColors.text }}>
          {Math.round(successRate * 100)}%
        </span>

        {/* Usage */}
        <span class="w-10 text-right tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
          {usageCount}×
        </span>

        {/* Last used date/time (compact: no "Aujourd'hui") */}
        <span class="w-28 text-right tabular-nums shrink-0 truncate" style={{ color: "var(--text-dim)" }} title={lastUsed}>
          {formatFullDateTime(lastUsed, true)}
        </span>
      </div>
    </>
  );
}

/**
 * Compute health status from success rate, trend, and recency
 */
function computeHealthStatus(
  successRate: number,
  trend: TrendDirection,
  lastUsed: string | undefined,
): { label: string; color: string; bg: string } {
  const now = Date.now();
  const lastUsedTime = lastUsed ? new Date(lastUsed).getTime() : 0;
  const daysSinceUse = (now - lastUsedTime) / (24 * 60 * 60 * 1000);
  const isDormant = daysSinceUse > 7;

  if (isDormant) {
    return { label: "Dormant", color: "#6b7280", bg: "#6b728020" };
  }
  if (successRate >= 0.8 && trend !== "down") {
    return { label: "Healthy", color: "#22c55e", bg: "#22c55e20" };
  }
  if (successRate >= 0.5 || trend === "up") {
    return { label: "Warning", color: "#f59e0b", bg: "#f59e0b20" };
  }
  return { label: "Failing", color: "#ef4444", bg: "#ef444420" };
}

/**
 * NORMAL MODE - Visual flow card
 * Focus on workflow visualization, not metrics
 */
function NormalCard({
  name,
  successRate,
  usageCount,
  lastUsed,
  tools,
  toolsByLayer,
  traces = [],
  children = [],
  color,
  isSelected,
  isNew,
  onClick,
  description,
}: CapabilityCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = children.length > 0;
  const trend = calculateTrend(traces);
  const health = computeHealthStatus(successRate, trend, lastUsed);

  // Get sorted layers (fallback to tools if no layer info)
  const layers = toolsByLayer && toolsByLayer.size > 0
    ? Array.from(toolsByLayer.entries()).sort((a, b) => a[0] - b[0])
    : tools.length > 0
    ? [[0, tools] as [number, ToolInfo[]]]
    : [];

  return (
    <div
      class={`
        w-full text-left rounded-lg
        border transition-all duration-200 cursor-pointer
        ${isSelected ? "ring-2 ring-offset-1" : ""}
      `}
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`
          : `linear-gradient(135deg, ${color}08 0%, ${color}03 100%)`,
        borderColor: isSelected ? color : isHovered ? `${color}60` : `${color}30`,
        boxShadow: isSelected
          ? `0 4px 20px ${color}20`
          : isHovered
          ? `0 4px 12px ${color}10`
          : "none",
        transform: isHovered && !isSelected ? "translateY(-1px)" : "translateY(0)",
        animation: isNew ? "slideInFade 0.4s ease-out" : undefined,
        ringColor: color,
        ringOffsetColor: "var(--bg, #0a0908)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div class="p-3">
        {/* Header: Name + Health badge */}
        <div class="flex items-center gap-2 mb-3">
          <h4
            class="font-semibold text-sm leading-tight truncate flex-1 min-w-0"
            style={{ color }}
            title={name}
          >
            {name}
          </h4>

          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0"
            style={{ background: health.bg, color: health.color }}
          >
            {health.label}
          </span>
        </div>

        {/* Description / Intent */}
        {description && (
          <p
            class="text-xs mb-3 line-clamp-2"
            style={{ color: "var(--text-dim, #6a6560)" }}
            title={description}
          >
            {description}
          </p>
        )}

        {/* Flow with tool names: [toolA, toolB] → [child: toolC→toolD] → [toolE] */}
        {(layers.length > 0 || hasChildren) && (
          <div class="flex items-center gap-1.5 mb-3 flex-wrap">
            {/* Parent layers with names */}
            {layers.map(([layerIndex, layerTools], i) => (
              <div key={`layer-${layerIndex}`} class="flex items-center gap-1.5">
                <div class="flex items-center gap-1">
                  {layerTools.slice(0, 3).map((tool) => (
                    <span
                      key={tool.id}
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: `${tool.color || "#FFB86F"}15`,
                        color: tool.color || "#FFB86F",
                      }}
                      title={tool.server}
                    >
                      <span
                        class="w-1.5 h-1.5 rounded-full"
                        style={{ background: tool.color || "#FFB86F" }}
                      />
                      {tool.name}
                    </span>
                  ))}
                  {layerTools.length > 3 && (
                    <span class="text-[9px]" style={{ color: "var(--text-dim)" }}>
                      +{layerTools.length - 3}
                    </span>
                  )}
                </div>
                {(i < layers.length - 1 || hasChildren) && (
                  <span style={{ color: "var(--text-dim, #6a6560)" }}>→</span>
                )}
              </div>
            ))}

            {/* Children with names in brackets */}
            {children.slice(0, 2).map((child, ci) => {
              const childLayers = child.toolsByLayer && child.toolsByLayer.size > 0
                ? Array.from(child.toolsByLayer.entries()).sort((a, b) => a[0] - b[0])
                : child.tools.length > 0
                ? [[0, child.tools] as [number, ToolInfo[]]]
                : [];

              return (
                <div key={child.id} class="flex items-center gap-1.5">
                  <div
                    class="flex items-center gap-1 px-1.5 py-0.5 rounded"
                    style={{ background: `${child.color}12`, border: `1px solid ${child.color}25` }}
                    title={child.name}
                  >
                    {childLayers.map(([layerIdx, layerTools], li) => (
                      <div key={layerIdx} class="flex items-center gap-1">
                        {layerTools.slice(0, 2).map((tool) => (
                          <span
                            key={tool.id}
                            class="inline-flex items-center gap-0.5 text-[9px]"
                            style={{ color: tool.color || "#FFB86F" }}
                          >
                            <span
                              class="w-1.5 h-1.5 rounded-full"
                              style={{ background: tool.color || "#FFB86F" }}
                            />
                            {tool.name}
                          </span>
                        ))}
                        {li < childLayers.length - 1 && (
                          <span class="text-[8px]" style={{ color: "var(--text-dim)" }}>→</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {ci < children.length - 1 && (
                    <span style={{ color: "var(--text-dim, #6a6560)" }}>→</span>
                  )}
                </div>
              );
            })}
            {children.length > 2 && (
              <span class="text-[10px]" style={{ color: "var(--text-dim)" }}>
                +{children.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Footer: usage count + last used date */}
        <div
          class="flex items-center gap-2 text-[10px]"
          style={{ color: "var(--text-dim, #6a6560)" }}
        >
          <span>{usageCount} runs</span>
          <span>•</span>
          <span title={lastUsed}>{formatFullDateTime(lastUsed)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * EXTENDED MODE - Investigation/Debugging panel
 * Full layer breakdown, timing info, tools by server
 */
function ExtendedPanel({
  name,
  successRate,
  usageCount,
  lastUsed,
  tools,
  toolsByLayer,
  traces = [],
  children = [],
  color,
  isSelected,
  isNew,
  depth = 0,
  onClick,
  onChildClick,
  fqdn,
  pagerank,
  communityId,
  description,
}: CapabilityCardProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;
  const successColors = getSuccessColor(successRate);
  const trend = calculateTrend(traces);
  const health = computeHealthStatus(successRate, trend, lastUsed);

  const indentPx = depth * 24;

  // Get sorted layers
  const layers = toolsByLayer && toolsByLayer.size > 0
    ? Array.from(toolsByLayer.entries()).sort((a, b) => a[0] - b[0])
    : tools.length > 0
    ? [[0, tools] as [number, ToolInfo[]]]
    : [];

  // Group tools by server
  const toolsByServer = new Map<string, ToolInfo[]>();
  for (const tool of tools) {
    const existing = toolsByServer.get(tool.server) || [];
    existing.push(tool);
    toolsByServer.set(tool.server, existing);
  }

  // Average duration from traces
  const avgDuration = traces.length > 0
    ? traces.reduce((sum, t) => sum + (t.durationMs || 0), 0) /
      traces.filter((t) => t.durationMs).length
    : null;

  return (
    <div
      class="relative"
      style={{
        marginLeft: `${indentPx}px`,
        animation: isNew ? "slideInFade 0.4s ease-out" : undefined,
      }}
    >
      {/* Tree connector line */}
      {depth > 0 && (
        <div
          class="absolute top-0 bottom-0 w-px"
          style={{
            left: "-12px",
            background: `linear-gradient(to bottom, ${color}40, ${color}20)`,
          }}
        />
      )}

      {/* Main panel */}
      <div
        class={`
          rounded-xl border transition-all duration-200 cursor-pointer mb-2
          ${isSelected ? "ring-2" : ""}
        `}
        style={{
          background: `linear-gradient(135deg, ${color}08 0%, var(--bg-elevated, #12110f) 100%)`,
          borderColor: isSelected ? color : `${color}30`,
          boxShadow: isSelected ? `0 4px 24px ${color}20` : "0 2px 8px rgba(0,0,0,0.2)",
          ringColor: color,
        }}
        onClick={onClick}
      >
        <div class="p-4">
          {/* Header with expand toggle */}
          <div class="flex items-start gap-3 mb-3">
            {/* Expand toggle */}
            {hasChildren && (
              <button
                type="button"
                class="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-white/10"
                style={{
                  background: expanded ? `${color}20` : "transparent",
                  color: color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
              >
                <span class="text-sm">{expanded ? "▼" : "▶"}</span>
              </button>
            )}

            {/* Name + Health */}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-base leading-tight" style={{ color }}>
                  {name}
                </h3>
                <span
                  class="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                  style={{ background: health.bg, color: health.color }}
                >
                  {health.label}
                </span>
                <TrendIndicator trend={trend} size={16} />
              </div>
              {/* Description/Intent */}
              {description && (
                <p
                  class="text-xs mb-1 italic leading-snug"
                  style={{ color: "var(--text-muted, #8a8078)" }}
                >
                  "{description}"
                </p>
              )}
              <div
                class="text-xs flex items-center gap-2"
                style={{ color: "var(--text-dim, #6a6560)" }}
              >
                <span>{formatFullDateTime(lastUsed)}</span>
                {hasChildren && (
                  <span class="px-1.5 py-0.5 rounded" style={{ background: `${color}15` }}>
                    {children.length} sous-capabilities
                  </span>
                )}
              </div>
            </div>

            {/* Stats block */}
            <div class="flex items-center gap-4 shrink-0">
              <div class="text-center">
                <div class="text-lg font-bold tabular-nums" style={{ color }}>{usageCount}</div>
                <div
                  class="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--text-dim)" }}
                >
                  runs
                </div>
              </div>
              <div class="text-center">
                <div class="text-lg font-bold tabular-nums" style={{ color: successColors.text }}>
                  {Math.round(successRate * 100)}%
                </div>
                <div
                  class="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--text-dim)" }}
                >
                  success
                </div>
              </div>
              {avgDuration && avgDuration > 0 && (
                <div class="text-center">
                  <div
                    class="text-lg font-bold tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {avgDuration >= 1000
                      ? `${(avgDuration / 1000).toFixed(1)}s`
                      : `${Math.round(avgDuration)}ms`}
                  </div>
                  <div
                    class="text-[10px] uppercase tracking-wide"
                    style={{ color: "var(--text-dim)" }}
                  >
                    avg
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Execution History with expanded sparkline */}
          {traces.length > 0 && (
            <div class="mb-4">
              <div
                class="text-[10px] uppercase tracking-wide mb-1.5"
                style={{ color: "var(--text-dim)" }}
              >
                Execution History ({traces.length} traces)
              </div>
              <Sparkline traces={traces} maxBars={24} barWidth={8} barGap={2} height={24} />
            </div>
          )}

          {/* Layer Breakdown - Visual execution flow */}
          {layers.length > 0 && (
            <div class="mb-4 pt-3 border-t" style={{ borderColor: `${color}15` }}>
              <div
                class="text-[10px] uppercase tracking-wide mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                Execution Flow ({layers.length} layer{layers.length > 1 ? "s" : ""})
              </div>
              <div class="flex items-start gap-2">
                {layers.map(([layerIndex, layerTools], i) => (
                  <div key={layerIndex} class="flex items-center gap-2">
                    <div
                      class="rounded-lg p-2"
                      style={{ background: `${color}08`, border: `1px solid ${color}20` }}
                    >
                      <div class="text-[9px] uppercase mb-1.5" style={{ color: "var(--text-dim)" }}>
                        L{layerIndex}
                      </div>
                      <div class="flex flex-col gap-1">
                        {layerTools.map((tool) => (
                          <div
                            key={tool.id}
                            class="flex items-center gap-1.5 text-[11px]"
                            style={{ color: tool.color || "#FFB86F" }}
                          >
                            <span
                              class="w-2 h-2 rounded-full"
                              style={{ background: tool.color || "#FFB86F" }}
                            />
                            <span>{tool.name}</span>
                            <span class="text-[9px]" style={{ color: "var(--text-dim)" }}>
                              ({tool.server})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {(i < layers.length - 1 || hasChildren) && (
                      <span class="text-lg" style={{ color: `${color}50` }}>→</span>
                    )}
                  </div>
                ))}
                {/* Children as nested flows */}
                {children.slice(0, 2).map((child, ci) => {
                  const childLayers = child.toolsByLayer && child.toolsByLayer.size > 0
                    ? Array.from(child.toolsByLayer.entries()).sort((a, b) =>
                      a[0] - b[0]
                    )
                    : [[0, child.tools] as [number, ToolInfo[]]];
                  return (
                    <div key={child.id} class="flex items-center gap-2">
                      <div
                        class="rounded-lg p-2"
                        style={{
                          background: `${child.color}08`,
                          border: `1px dashed ${child.color}30`,
                        }}
                        title={child.name}
                      >
                        <div class="text-[9px] uppercase mb-1" style={{ color: child.color }}>
                          ↳ {child.name}
                        </div>
                        <div class="flex items-center gap-1">
                          {childLayers.map(([li, lt], idx) => (
                            <div key={li} class="flex items-center gap-1">
                              {lt.slice(0, 3).map((t) => (
                                <span
                                  key={t.id}
                                  class="w-2 h-2 rounded-full"
                                  style={{ background: t.color || "#FFB86F" }}
                                  title={`${t.name} (${t.server})`}
                                />
                              ))}
                              {idx < childLayers.length - 1 && (
                                <span class="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                  →
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      {ci < Math.min(children.length, 2) - 1 && (
                        <span class="text-lg" style={{ color: `${color}50` }}>→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tools by Server */}
          {toolsByServer.size > 0 && (
            <div class="pt-3 border-t" style={{ borderColor: `${color}15` }}>
              <div
                class="text-[10px] uppercase tracking-wide mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                Tools by Server ({tools.length} tools)
              </div>
              <div class="grid grid-cols-2 gap-2">
                {Array.from(toolsByServer.entries()).map(([server, serverTools]) => (
                  <div
                    key={server}
                    class="rounded-lg p-2"
                    style={{ background: `${serverTools[0].color}08` }}
                  >
                    <div
                      class="text-[10px] font-semibold mb-1 flex items-center gap-1"
                      style={{ color: serverTools[0].color }}
                    >
                      <span
                        class="w-2 h-2 rounded-full"
                        style={{ background: serverTools[0].color }}
                      />
                      {server}
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {serverTools.map((tool) => (
                        <span
                          key={tool.id}
                          class="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: `${tool.color}15`, color: tool.color }}
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graph Position - PageRank, Community, FQDN */}
          {(pagerank !== undefined || communityId !== undefined || fqdn) && (
            <div class="pt-3 border-t" style={{ borderColor: `${color}15` }}>
              <div
                class="text-[10px] uppercase tracking-wide mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                Graph Position
              </div>
              <div class="flex flex-wrap items-center gap-3">
                {/* PageRank gauge */}
                {pagerank !== undefined && (
                  <div class="flex items-center gap-2">
                    <div class="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span
                          key={i}
                          class="w-1.5 h-3 rounded-sm"
                          style={{
                            background: i < Math.round(pagerank * 10) ? color : `${color}20`,
                          }}
                        />
                      ))}
                    </div>
                    <span class="text-[11px] tabular-nums" style={{ color }}>
                      PR {pagerank.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Community badge */}
                {communityId !== undefined && (
                  <span
                    class="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: `${color}20`, color }}
                  >
                    C{communityId}
                  </span>
                )}
              </div>

              {/* FQDN */}
              {fqdn && (
                <div
                  class="mt-2 text-[10px] truncate font-mono"
                  style={{ color: "var(--text-dim)" }}
                  title={fqdn}
                >
                  {fqdn}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Children (recursive) */}
      {expanded && hasChildren && (
        <div class="relative">
          {children.map((child, idx) => (
            <ExtendedPanel
              key={child.id}
              id={child.id}
              name={child.name}
              successRate={child.successRate}
              usageCount={child.usageCount}
              tools={child.tools}
              toolsByLayer={child.toolsByLayer}
              traces={child.traces}
              children={[]}
              color={child.color}
              depth={depth + 1}
              isLastChild={idx === children.length - 1}
              onClick={() => onChildClick?.(child.id)}
              density="extended"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Main CapabilityCard component - delegates to mode-specific renderers
 */
export function CapabilityCard(props: CapabilityCardProps) {
  const { density = "normal" } = props;

  switch (density) {
    case "compact":
      return <CompactRow {...props} />;
    case "extended":
      return <ExtendedPanel {...props} />;
    default:
      return <NormalCard {...props} />;
  }
}
