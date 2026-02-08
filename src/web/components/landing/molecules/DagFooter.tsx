/**
 * DagFooter - Footer section of DAG visualization
 *
 * Shows traced tools count, total time, and compatible models.
 *
 * @module web/components/landing/molecules/DagFooter
 */

import { MaterialIcon } from "../atoms/MaterialIcon.tsx";

interface DagFooterProps {
  toolsCount: number;
  totalTime: number;
  models?: string[];
}

export function DagFooter({
  toolsCount,
  totalTime,
  models = ["Claude", "GPT", "Ollama"]
}: DagFooterProps) {
  return (
    <div class="flex items-center justify-center gap-3 pt-4 border-t border-amber-500/10 max-sm:flex-wrap max-sm:gap-2">
      <span class="flex items-center gap-1.5 font-mono text-[0.7rem] text-green-400 max-sm:p-1 max-sm:px-2 max-sm:bg-white/[0.02] max-sm:rounded">
        <MaterialIcon name="check_circle" size={14} color="#4ade80" />
        {toolsCount} tools traced
      </span>
      <span class="text-stone-700 max-sm:hidden">·</span>
      <span class="flex items-center gap-1.5 font-mono text-[0.7rem] text-stone-400 max-sm:p-1 max-sm:px-2 max-sm:bg-white/[0.02] max-sm:rounded">
        <MaterialIcon name="schedule" size={14} color="#a8a29e" />
        {totalTime}ms total
      </span>
      <span class="text-stone-700 max-sm:hidden">·</span>
      <span class="flex items-center gap-1.5 font-mono text-[0.7rem] text-stone-500 max-sm:p-1 max-sm:px-2 max-sm:bg-white/[0.02] max-sm:rounded">
        <MaterialIcon name="shuffle" size={14} color="#FFB86F" />
        {models.join(" / ")}
      </span>
    </div>
  );
}
