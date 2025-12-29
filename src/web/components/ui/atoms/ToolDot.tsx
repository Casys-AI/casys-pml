/**
 * ToolDot - Atomic component representing a tool in the timeline
 *
 * A colored circle indicating a tool, with hover tooltip showing details.
 * Color is based on the MCP server the tool belongs to.
 *
 * @module web/components/ui/atoms/ToolDot
 */

interface ToolDotProps {
  /** Tool name (shown on hover) */
  name: string;
  /** MCP server name */
  server: string;
  /** Color for the dot (typically server-based) */
  color: string;
  /** Whether this tool is shared across multiple capabilities */
  isShared?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function ToolDot({
  name,
  server,
  color,
  isShared = false,
  onClick,
  size = "md",
}: ToolDotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name} (${server})${isShared ? " - shared" : ""}`}
      class={`
        ${SIZE_CLASSES[size]}
        rounded-full
        border border-white/20
        transition-all duration-150
        hover:scale-125 hover:border-white/50
        focus:outline-none focus:ring-2 focus:ring-offset-1
        ${isShared ? "ring-1 ring-white/30" : ""}
        cursor-pointer
      `}
      style={{
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}
