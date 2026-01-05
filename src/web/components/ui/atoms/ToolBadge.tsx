/**
 * ToolBadge Atom - Display MCP tool reference
 * Shows server:tool_name with icon and hover state
 */

interface ToolBadgeProps {
  /** Full tool name (e.g., "filesystem:get_file_info") */
  tool: string;
  /** Optional click handler */
  onClick?: () => void;
  class?: string;
}

/** Get icon for server type */
function getServerIcon(server: string): string {
  const icons: Record<string, string> = {
    filesystem: "📁",
    std: "🔧",
    git: "📦",
    docker: "🐳",
    database: "🗄️",
    network: "🌐",
    process: "⚙️",
    http: "🌍",
    json: "{ }",
    crypto: "🔒",
    datetime: "📅",
    math: "🔢",
    text: "📝",
    faker: "🎭",
    pglite: "🐘",
    psql: "🐘",
  };
  return icons[server.toLowerCase()] || "🔧";
}

export default function ToolBadge({ tool, onClick, class: className }: ToolBadgeProps) {
  const [server, ...actionParts] = tool.split(":");
  const action = actionParts.join(":") || tool;
  const icon = getServerIcon(server);
  const isClickable = !!onClick;

  return (
    <div
      class={`tool-badge ${isClickable ? "clickable" : ""} ${className || ""}`}
      onClick={onClick}
    >
      <span class="tool-badge-icon">{icon}</span>
      <span class="tool-badge-server">{server}</span>
      <span class="tool-badge-sep">:</span>
      <span class="tool-badge-action">{action}</span>

      <style>
        {`
        .tool-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.375rem 0.625rem;
          background: rgba(255, 184, 111, 0.08);
          border: 1px solid rgba(255, 184, 111, 0.15);
          border-radius: 6px;
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          transition: all 0.2s;
        }

        .tool-badge.clickable {
          cursor: pointer;
        }

        .tool-badge.clickable:hover {
          background: rgba(255, 184, 111, 0.15);
          border-color: rgba(255, 184, 111, 0.3);
          transform: translateY(-1px);
        }

        .tool-badge-icon {
          font-size: 0.875rem;
        }

        .tool-badge-server {
          color: #FFB86F;
          font-weight: 600;
        }

        .tool-badge-sep {
          color: #6b6560;
        }

        .tool-badge-action {
          color: #a8a29e;
        }
        `}
      </style>
    </div>
  );
}
