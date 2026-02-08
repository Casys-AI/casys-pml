/**
 * DagHeader - Header section of DAG visualization
 *
 * Shows workflow name, success rate, and total execution time.
 *
 * @module web/components/landing/molecules/DagHeader
 */

import { Sparkline } from "../atoms/Sparkline.tsx";
import { StatusBadge } from "../atoms/StatusBadge.tsx";

interface DagHeaderProps {
  name: string;
  successRate: number;
  totalTime: number;
  executionHistory?: number[];
  status?: "success" | "running" | "pending" | "error";
}

export function DagHeader({
  name,
  successRate,
  totalTime,
  executionHistory = [38, 42, 35, 40, 42],
  status = "success"
}: DagHeaderProps) {
  return (
    <div class="flex justify-between items-center pb-4 mb-5 border-b border-amber-500/10 max-sm:flex-col max-sm:items-start max-sm:gap-3">
      <div class="flex items-center gap-3">
        <span class="font-mono text-base font-semibold text-pml-accent">{name}</span>
        <StatusBadge status={status} compact />
      </div>
      <div class="flex items-center gap-5 max-sm:w-full max-sm:justify-between">
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-green-400">
            {successRate}%
          </span>
          <Sparkline data={executionHistory} color="#4ade80" width={50} height={16} />
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[0.65rem] text-stone-500 uppercase">avg</span>
          <span class="font-mono text-sm text-stone-400">{totalTime}ms</span>
        </div>
      </div>
    </div>
  );
}
