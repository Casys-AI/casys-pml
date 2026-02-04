/**
 * TraceSelector Molecule - Dropdown for selecting execution traces
 * Used for: Capability trace selection (Story 11.4)
 */

import type { JSX } from "preact";

export interface ExecutionTraceOption {
  id: string;
  executedAt: string | Date;
  success: boolean;
  durationMs: number;
}

export interface TraceSelectorProps {
  traces: ExecutionTraceOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export default function TraceSelector({
  traces,
  selectedIndex,
  onSelect,
}: TraceSelectorProps): JSX.Element {
  function handleChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    onSelect(parseInt(value, 10));
  }

  return (
    <div class="flex justify-between items-center mb-3">
      <span class="text-xs font-semibold uppercase tracking-wider text-amber-400">
        Execution Traces ({traces.length})
      </span>

      <select
        value={selectedIndex}
        onChange={handleChange}
        class="px-2 py-1 rounded border border-amber-500/20 bg-stone-900 text-stone-100 text-sm cursor-pointer"
      >
        {traces.map((trace, idx) => {
          const date = toDate(trace.executedAt);
          const timeAgo = formatRelativeTime(date.getTime());
          const statusIcon = trace.success ? "\u2705" : "\u274C";
          return (
            <option key={trace.id} value={idx}>
              {statusIcon} {timeAgo} - {trace.durationMs}ms
            </option>
          );
        })}
      </select>
    </div>
  );
}
