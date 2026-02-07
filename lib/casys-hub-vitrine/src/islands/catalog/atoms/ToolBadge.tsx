/**
 * ToolBadge Atom - Display MCP tool reference
 * Shows server:tool_name with icon and hover state
 */

import { parseToolId } from "../utils/tool-id-utils.ts";

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
  const { namespace: server, action } = parseToolId(tool);
  const icon = getServerIcon(server);
  const isClickable = !!onClick;

  const baseClasses =
    "inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/[0.08] border border-amber-500/15 rounded-md font-mono text-xs transition-all duration-200";
  const clickableClasses = isClickable
    ? "cursor-pointer hover:bg-amber-500/15 hover:border-amber-500/30 hover:-translate-y-px"
    : "";

  return (
    <div
      class={`${baseClasses} ${clickableClasses} ${className || ""}`.trim()}
      onClick={onClick}
    >
      <span class="text-sm">{icon}</span>
      <span class="text-amber-500 font-semibold">{server}</span>
      <span class="text-stone-500">:</span>
      <span class="text-stone-400">{action}</span>
    </div>
  );
}
