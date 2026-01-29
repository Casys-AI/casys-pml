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

/**
 * Format relative time (e.g., "2h ago", "just now")
 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Normalizes date to a Date object
 */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

const LABEL_STYLE = {
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  color: "var(--accent, #FFB86F)",
};

const SELECT_STYLE = {
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid var(--border, rgba(255, 184, 111, 0.2))",
  background: "var(--bg-surface, #1a1816)",
  color: "var(--text, #f5f0ea)",
  fontSize: "0.8125rem",
  cursor: "pointer",
};

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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}
    >
      <span style={LABEL_STYLE}>
        Execution Traces ({traces.length})
      </span>

      <select value={selectedIndex} onChange={handleChange} style={SELECT_STYLE}>
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
