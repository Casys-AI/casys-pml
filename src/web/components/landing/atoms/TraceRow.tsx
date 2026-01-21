/**
 * TraceRow - Single trace line with tree connectors
 *
 * Beautiful colors with proper contrast and hierarchy.
 * Ultra-light for smooth carousel scrolling.
 *
 * @module web/components/landing/atoms/TraceRow
 */

export type TraceType = "tool" | "llm" | "loop" | "agent" | "checkpoint" | "parallel";

export interface TraceRowData {
  name: string;
  type: TraceType;
  model?: string;
  args?: string;
  result?: string;
  time: number;
  cost?: number; // Cost in dollars (e.g., 0.003)
  success?: boolean; // Default true, false for errors
  depth?: number;
  isLast?: boolean;
  hasChildren?: boolean;
  lane?: number; // Parallel lane number (1, 2, 3...)
  inParallel?: boolean; // Inside a parallel block
}

interface TraceRowProps {
  data: TraceRowData;
}

// Refined color palette - brand gold for tools
const config: Record<TraceType, { color: string; bg: string; icon: string }> = {
  tool:       { color: "#FFB86F", bg: "rgba(255, 184, 111, 0.08)", icon: "›" },  // Brand gold
  llm:        { color: "#ec4899", bg: "rgba(236, 72, 153, 0.08)", icon: "●" },   // Pink
  loop:       { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", icon: "↻" },   // Blue
  agent:      { color: "#a855f7", bg: "rgba(168, 85, 247, 0.08)", icon: "◎" },   // Purple
  checkpoint: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", icon: "⏸" },   // Amber - HIL
  parallel:   { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.08)", icon: "⫴" },    // Cyan - parallel layers
};

// Model colors
const modelColors: Record<string, string> = {
  "claude-3.5": "#FFB86F",
  "gpt-4o": "#10b981",
  "ollama": "#6366f1",
};

// Lane colors for parallel execution
const laneColors = ["#06b6d4", "#8b5cf6", "#f59e0b", "#10b981"];

export function TraceRow({ data }: TraceRowProps) {
  const { color, bg, icon } = config[data.type];
  const depth = data.depth || 0;
  const modelColor = data.model ? (modelColors[data.model] || "#666") : "#666";
  const isSuccess = data.success !== false; // Default to true
  const rowColor = isSuccess ? color : "#ef4444"; // Red for errors
  const rowBg = isSuccess ? bg : "rgba(239, 68, 68, 0.08)";
  const isParallelHeader = data.type === "parallel";
  const laneColor = data.lane ? laneColors[(data.lane - 1) % laneColors.length] : undefined;

  return (
    <div
      class={`tr ${isParallelHeader ? "tr--parallel" : ""} ${data.inParallel ? "tr--in-parallel" : ""}`}
      style={{ "--c": rowColor, "--bg": rowBg, "--mc": modelColor, "--lane": laneColor || "transparent" } as any}
    >
      {/* Tree structure */}
      <div class="tr__tree">
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} class="tr__spacer">
            {i === depth - 1 && (
              <span class={`tr__connector ${data.inParallel ? "tr__connector--parallel" : ""}`}>
                {data.inParallel ? (data.isLast ? "╰" : "├") : (data.isLast ? "└" : "├")}
              </span>
            )}
            {i < depth - 1 && data.inParallel && (
              <span class="tr__vline">│</span>
            )}
          </span>
        ))}
      </div>

      {/* Lane indicator for parallel items */}
      {data.lane && (
        <span class="tr__lane" style={{ "--lane": laneColor } as any}>
          {data.lane}
        </span>
      )}

      {/* Vertical colored bar */}
      <span class={`tr__bar ${isParallelHeader ? "tr__bar--parallel" : ""}`} />

      {/* Icon */}
      <span class="tr__icon">{icon}</span>

      {/* Name */}
      <span class="tr__name">{data.name}</span>

      {/* Model badge */}
      {data.model && <span class="tr__model">{data.model}</span>}

      {/* Args */}
      {data.args && <span class="tr__args">{data.args}</span>}

      {/* Spacer */}
      <span class="tr__flex" />

      {/* Result */}
      {data.result && (
        <span class={`tr__result ${!isSuccess ? "tr__result--err" : ""}`}>
          {data.result}
        </span>
      )}

      {/* Cost */}
      {data.cost !== undefined && (
        <span class="tr__cost">${data.cost < 0.01 ? data.cost.toFixed(4) : data.cost.toFixed(3)}</span>
      )}

      {/* Time */}
      <span class="tr__time">
        {data.time >= 1000 ? `${(data.time/1000).toFixed(1)}s` : `${data.time}ms`}
      </span>

      {/* Status */}
      <span class={`tr__status ${!isSuccess ? "tr__status--err" : ""}`}>
        {isSuccess ? "✓" : "✗"}
      </span>

      <style>
        {`
        .tr {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 4px;
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          white-space: nowrap;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .tr:hover {
          background: var(--bg);
        }

        .tr__tree {
          display: flex;
          flex-shrink: 0;
        }

        .tr__spacer {
          width: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tr__connector {
          color: #4a4a4a;
          font-size: 0.65rem;
          line-height: 1;
        }

        .tr__connector--parallel {
          color: var(--lane, #06b6d4);
        }

        .tr__vline {
          color: #3a3a3a;
          font-size: 0.65rem;
        }

        .tr__lane {
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.5rem;
          font-weight: 700;
          color: #08080a;
          background: var(--lane);
          border-radius: 3px;
          flex-shrink: 0;
          margin-right: 2px;
        }

        .tr__bar {
          width: 3px;
          height: 14px;
          background: var(--c);
          border-radius: 2px;
          flex-shrink: 0;
        }

        .tr__bar--parallel {
          width: 100%;
          max-width: 60px;
          height: 2px;
          background: linear-gradient(90deg, #06b6d4 0%, #8b5cf6 50%, #f59e0b 100%);
          border-radius: 1px;
          margin-right: 6px;
        }

        .tr--parallel {
          background: rgba(6, 182, 212, 0.04);
          border: 1px solid rgba(6, 182, 212, 0.15);
          border-radius: 4px;
          margin: 4px 0;
        }

        .tr--in-parallel {
          border-left: 2px solid var(--lane, rgba(6, 182, 212, 0.3));
          margin-left: 8px;
          padding-left: 6px;
        }

        .tr__icon {
          color: var(--c);
          font-size: 0.6rem;
          width: 10px;
          flex-shrink: 0;
        }

        .tr__name {
          color: var(--c);
          font-weight: 600;
          flex-shrink: 0;
        }

        .tr__model {
          color: var(--mc);
          font-size: 0.55rem;
          font-weight: 500;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          flex-shrink: 0;
          margin-left: 4px;
        }

        .tr__args {
          color: #6b7280;
          font-size: 0.6rem;
          flex-shrink: 0;
          margin-left: 6px;
        }

        .tr__flex {
          flex: 1;
          min-width: 8px;
        }

        .tr__result {
          color: #a3e635;
          font-size: 0.6rem;
          font-weight: 500;
        }

        .tr__result--err {
          color: #f87171;
        }

        .tr__cost {
          color: #FFB86F;
          font-size: 0.52rem;
          font-weight: 500;
          flex-shrink: 0;
        }

        .tr__time {
          color: #525252;
          font-size: 0.55rem;
          min-width: 36px;
          text-align: right;
          flex-shrink: 0;
        }

        .tr__status {
          color: #FFB86F;
          font-size: 0.55rem;
          opacity: 0.7;
          flex-shrink: 0;
          width: 12px;
          text-align: center;
        }

        .tr__status--err {
          color: #ef4444;
          opacity: 1;
        }

        @media (max-width: 600px) {
          .tr {
            font-size: 0.65rem;
          }

          .tr__args,
          .tr__model {
            display: none;
          }
        }
        `}
      </style>
    </div>
  );
}
