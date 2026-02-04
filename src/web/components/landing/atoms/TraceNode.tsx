/**
 * TraceNode - Minimal trace line
 *
 * Ultra-clean design: just vertical lines, no cards.
 * Shows tool/capability/loop/agent with args/results inline.
 *
 * @module web/components/landing/atoms/TraceNode
 */

export type TraceNodeType = "tool" | "capability" | "loop" | "agent" | "llm";

export interface TraceNodeData {
  name: string;
  type: TraceNodeType;
  time: number;
  success: boolean;
  iterations?: number;
  model?: string;
  args?: string;
  result?: string;
  children?: TraceNodeData[];
}

interface TraceNodeProps {
  node: TraceNodeData;
  depth?: number;
  isLast?: boolean;
}

const typeConfig: Record<TraceNodeType, { color: string; bgColor: string; icon: string }> = {
  tool: { color: "text-green-400", bgColor: "bg-green-400", icon: ">" },
  capability: { color: "text-amber-400", bgColor: "bg-amber-400", icon: "◆" },
  loop: { color: "text-blue-400", bgColor: "bg-blue-400", icon: "↻" },
  agent: { color: "text-violet-400", bgColor: "bg-violet-400", icon: "◎" },
  llm: { color: "text-pink-400", bgColor: "bg-pink-400", icon: "●" },
};

export function TraceNode({ node, depth = 0, isLast = false }: TraceNodeProps) {
  const config = typeConfig[node.type];
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div class="font-mono text-[0.72rem] leading-none">
      {/* Single line */}
      <div class="flex items-center gap-1.5 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.02]">
        {/* Indent */}
        {depth > 0 && <span class="shrink-0" style={{ width: `${depth * 12}px` }} />}

        {/* Vertical line connector */}
        <span class={`w-0.5 h-3 ${config.bgColor} opacity-50 rounded-sm shrink-0`} />

        {/* Icon */}
        <span class={`${config.color} text-[0.65rem] w-2.5 shrink-0`}>{config.icon}</span>

        {/* Name */}
        <span class={`${config.color} font-medium shrink-0`}>
          {node.type === "loop" && <span class="text-blue-400 mr-0.5 text-[0.65rem]">x{node.iterations}</span>}
          {node.name}
        </span>

        {/* Model badge */}
        {node.model && (
          <span class="text-neutral-600 text-[0.6rem] px-1 py-px border border-neutral-700 rounded-sm shrink-0">
            {node.model}
          </span>
        )}

        {/* Args */}
        {node.args && <span class="text-neutral-500 text-[0.65rem] shrink-0">{node.args}</span>}

        {/* Result */}
        {node.result && (
          <span class="text-green-400 text-[0.65rem] opacity-80 ml-auto text-right whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
            → {node.result}
          </span>
        )}

        {/* Time */}
        <span class="text-neutral-600 text-[0.6rem] shrink-0 min-w-[40px] text-right">
          {node.time >= 1000 ? `${(node.time/1000).toFixed(1)}s` : `${node.time}ms`}
        </span>

        {/* Status */}
        <span class={`text-[0.6rem] shrink-0 opacity-60 ${node.success ? "text-green-400" : "text-red-400"}`}>
          {node.success ? "✓" : "✗"}
        </span>
      </div>

      {/* Children */}
      {hasChildren && (
        <div class="relative">
          {node.children!.map((child, i) => (
            <TraceNode
              key={`${child.name}-${i}`}
              node={child}
              depth={depth + 1}
              isLast={i === node.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
