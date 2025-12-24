/**
 * TraceSelector Molecule - Dropdown for selecting execution traces
 * Used for: Capability trace selection (Story 11.4)
 */

interface ExecutionTraceOption {
  id: string;
  executedAt: string | Date;
  success: boolean;
  durationMs: number;
}

interface TraceSelectorProps {
  traces: ExecutionTraceOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Format relative time (e.g., "2h ago", "just now")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function TraceSelector({
  traces,
  selectedIndex,
  onSelect,
}: TraceSelectorProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--accent, #FFB86F)",
        }}
      >
        Execution Traces ({traces.length})
      </span>

      <select
        value={selectedIndex}
        onChange={(e) => onSelect(parseInt((e.target as HTMLSelectElement).value, 10))}
        style={{
          padding: "4px 8px",
          borderRadius: "4px",
          border: "1px solid var(--border, rgba(255, 184, 111, 0.2))",
          background: "var(--bg-surface, #1a1816)",
          color: "var(--text, #f5f0ea)",
          fontSize: "0.8125rem",
          cursor: "pointer",
        }}
      >
        {traces.map((trace, idx) => {
          const date = trace.executedAt instanceof Date
            ? trace.executedAt
            : new Date(trace.executedAt);
          const timeAgo = formatRelativeTime(date.getTime());
          const statusIcon = trace.success ? "✅" : "❌";
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
