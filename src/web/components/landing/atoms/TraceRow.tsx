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
const config: Record<TraceType, { color: string; bgHover: string; barColor: string; icon: string }> = {
  tool:       { color: "text-amber-400", bgHover: "hover:bg-amber-500/[0.08]", barColor: "bg-amber-400", icon: ">" },
  llm:        { color: "text-pink-500", bgHover: "hover:bg-pink-500/[0.08]", barColor: "bg-pink-500", icon: "●" },
  loop:       { color: "text-blue-500", bgHover: "hover:bg-blue-500/[0.08]", barColor: "bg-blue-500", icon: "↻" },
  agent:      { color: "text-purple-500", bgHover: "hover:bg-purple-500/[0.08]", barColor: "bg-purple-500", icon: "◎" },
  checkpoint: { color: "text-amber-500", bgHover: "hover:bg-amber-500/[0.12]", barColor: "bg-amber-500", icon: "⏸" },
  parallel:   { color: "text-cyan-500", bgHover: "hover:bg-cyan-500/[0.08]", barColor: "bg-cyan-500", icon: "⫴" },
};

// Model colors
const modelColors: Record<string, string> = {
  "claude-3.5": "text-amber-400",
  "gpt-4o": "text-emerald-500",
  "ollama": "text-indigo-500",
};

// Lane colors for parallel execution
const laneColors = ["bg-cyan-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500"];
const laneBorderColors = ["border-cyan-500/30", "border-violet-500/30", "border-amber-500/30", "border-emerald-500/30"];

export function TraceRow({ data }: TraceRowProps) {
  const typeConf = config[data.type];
  const depth = data.depth || 0;
  const modelColor = data.model ? (modelColors[data.model] || "text-neutral-500") : "text-neutral-500";
  const isSuccess = data.success !== false; // Default to true
  const isParallelHeader = data.type === "parallel";
  const laneColorClass = data.lane ? laneColors[(data.lane - 1) % laneColors.length] : "";
  const laneBorderClass = data.lane ? laneBorderColors[(data.lane - 1) % laneBorderColors.length] : "border-cyan-500/30";

  // Dynamic classes based on state
  const colorClass = isSuccess ? typeConf.color : "text-red-500";
  const barColorClass = isSuccess ? typeConf.barColor : "bg-red-500";
  const hoverClass = isSuccess ? typeConf.bgHover : "hover:bg-red-500/[0.08]";

  return (
    <div
      class={`flex items-center gap-1.5 py-1.5 px-1 font-mono text-[0.7rem] whitespace-nowrap rounded transition-colors duration-150 ${hoverClass} ${isParallelHeader ? "bg-cyan-500/[0.04] border border-cyan-500/15 rounded my-1" : ""} ${data.inParallel ? `border-l-2 ${laneBorderClass} ml-2 pl-1.5` : ""}`}
    >
      {/* Tree structure */}
      <div class="flex shrink-0">
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} class="w-4 flex items-center justify-center">
            {i === depth - 1 && (
              <span class={`text-[0.65rem] leading-none ${data.inParallel ? "text-cyan-500" : "text-neutral-600"}`}>
                {data.inParallel ? (data.isLast ? "╰" : "├") : (data.isLast ? "└" : "├")}
              </span>
            )}
            {i < depth - 1 && data.inParallel && (
              <span class="text-neutral-700 text-[0.65rem]">│</span>
            )}
          </span>
        ))}
      </div>

      {/* Lane indicator for parallel items */}
      {data.lane && (
        <span class={`w-3.5 h-3.5 flex items-center justify-center text-[0.5rem] font-bold text-neutral-900 ${laneColorClass} rounded-sm shrink-0 mr-0.5`}>
          {data.lane}
        </span>
      )}

      {/* Vertical colored bar */}
      <span class={`shrink-0 rounded-sm ${isParallelHeader ? "w-full max-w-[60px] h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-amber-500 mr-1.5" : `w-[3px] h-3.5 ${barColorClass}`}`} />

      {/* Icon */}
      <span class={`${colorClass} text-[0.6rem] w-2.5 shrink-0`}>{typeConf.icon}</span>

      {/* Name */}
      <span class={`${colorClass} font-semibold shrink-0`}>{data.name}</span>

      {/* Model badge */}
      {data.model && (
        <span class={`${modelColor} text-[0.55rem] font-medium py-0.5 px-1.5 bg-white/[0.04] border border-white/[0.08] rounded shrink-0 ml-1 hidden sm:inline-block`}>
          {data.model}
        </span>
      )}

      {/* Args */}
      {data.args && (
        <span class="text-gray-500 text-[0.6rem] shrink-0 ml-1.5 hidden sm:inline-block">{data.args}</span>
      )}

      {/* Spacer */}
      <span class="flex-1 min-w-2" />

      {/* Result */}
      {data.result && (
        <span class={`text-[0.6rem] font-medium ${isSuccess ? "text-lime-400" : "text-red-400"}`}>
          {data.result}
        </span>
      )}

      {/* Cost */}
      {data.cost !== undefined && (
        <span class="text-amber-400 text-[0.52rem] font-medium shrink-0">
          ${data.cost < 0.01 ? data.cost.toFixed(4) : data.cost.toFixed(3)}
        </span>
      )}

      {/* Time */}
      <span class="text-neutral-600 text-[0.55rem] min-w-[36px] text-right shrink-0">
        {data.time >= 1000 ? `${(data.time/1000).toFixed(1)}s` : `${data.time}ms`}
      </span>

      {/* Status */}
      <span class={`text-[0.55rem] shrink-0 w-3 text-center ${isSuccess ? "text-amber-400 opacity-70" : "text-red-500"}`}>
        {isSuccess ? "✓" : "✗"}
      </span>
    </div>
  );
}
