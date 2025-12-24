/**
 * TaskCard Atom - Individual task execution display
 * Used for: Trace timeline task visualization (Story 11.4)
 */

interface TaskCardProps {
  toolName: string;
  server: string;
  durationMs: number;
  success: boolean;
  color: string;
}

export default function TaskCard({
  toolName,
  server: _server,
  durationMs,
  success,
  color,
}: TaskCardProps) {
  const displayName = toolName.length > 15 ? toolName.slice(0, 13) + ".." : toolName;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        borderRadius: "6px",
        background: `${color}15`,
        border: `1px solid ${color}40`,
      }}
    >
      <span style={{ color: success ? "var(--success, #22c55e)" : "var(--error, #ef4444)" }}>
        {success ? "✓" : "✗"}
      </span>
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
        }}
      />
      <span
        style={{
          color,
          fontWeight: 500,
          fontSize: "0.8125rem",
        }}
      >
        {displayName}
      </span>
      <span
        style={{
          color: "var(--text-dim, #8a8078)",
          fontSize: "0.75rem",
        }}
      >
        {Math.round(durationMs)}ms
      </span>
    </div>
  );
}
