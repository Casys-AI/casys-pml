/**
 * TaskCard Atom - Individual task execution display
 * Used for: Trace timeline task visualization (Story 11.4)
 */

import type { JSX } from "preact";

export interface TaskCardProps {
  toolName: string;
  server: string;
  durationMs: number;
  success: boolean;
  color: string;
}

const MAX_DISPLAY_LENGTH = 15;
const TRUNCATE_LENGTH = 13;

function truncateName(name: string): string {
  if (name.length <= MAX_DISPLAY_LENGTH) {
    return name;
  }
  return name.slice(0, TRUNCATE_LENGTH) + "..";
}

export default function TaskCard({
  toolName,
  server: _server,
  durationMs,
  success,
  color,
}: TaskCardProps): JSX.Element {
  const displayName = truncateName(toolName);
  const statusColor = success ? "var(--success, #22c55e)" : "var(--error, #ef4444)";
  const statusSymbol = success ? "\u2713" : "\u2717";

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
      <span style={{ color: statusColor }}>{statusSymbol}</span>
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
        }}
      />
      <span style={{ color, fontWeight: 500, fontSize: "0.8125rem" }}>
        {displayName}
      </span>
      <span style={{ color: "var(--text-dim, #8a8078)", fontSize: "0.75rem" }}>
        {Math.round(durationMs)}ms
      </span>
    </div>
  );
}
