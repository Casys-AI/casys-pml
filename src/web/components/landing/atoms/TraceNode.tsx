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

const typeConfig: Record<TraceNodeType, { color: string; icon: string }> = {
  tool: { color: "#4ade80", icon: "›" },
  capability: { color: "#FFB86F", icon: "◆" },
  loop: { color: "#60a5fa", icon: "↻" },
  agent: { color: "#a78bfa", icon: "◎" },
  llm: { color: "#f472b6", icon: "●" },
};

export function TraceNode({ node, depth = 0, isLast = false }: TraceNodeProps) {
  const config = typeConfig[node.type];
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div class="tn" style={{ "--c": config.color } as any}>
      {/* Single line */}
      <div class="tn__row">
        {/* Indent */}
        {depth > 0 && <span class="tn__indent" style={{ width: `${depth * 12}px` }} />}

        {/* Vertical line connector */}
        <span class="tn__line" />

        {/* Icon */}
        <span class="tn__icon">{config.icon}</span>

        {/* Name */}
        <span class="tn__name">
          {node.type === "loop" && <span class="tn__iter">×{node.iterations}</span>}
          {node.name}
        </span>

        {/* Model badge */}
        {node.model && <span class="tn__model">{node.model}</span>}

        {/* Args */}
        {node.args && <span class="tn__args">{node.args}</span>}

        {/* Result */}
        {node.result && <span class="tn__result">→ {node.result}</span>}

        {/* Time */}
        <span class="tn__time">{node.time >= 1000 ? `${(node.time/1000).toFixed(1)}s` : `${node.time}ms`}</span>

        {/* Status */}
        <span class={`tn__status ${node.success ? "" : "tn__status--err"}`}>
          {node.success ? "✓" : "✗"}
        </span>
      </div>

      {/* Children */}
      {hasChildren && (
        <div class="tn__children">
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

      <style>
        {`
        .tn {
          font-family: 'Geist Mono', monospace;
          font-size: 0.72rem;
          line-height: 1;
        }

        .tn__row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .tn__row:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .tn__indent {
          flex-shrink: 0;
        }

        .tn__line {
          width: 2px;
          height: 12px;
          background: var(--c);
          opacity: 0.5;
          border-radius: 1px;
          flex-shrink: 0;
        }

        .tn__icon {
          color: var(--c);
          font-size: 0.65rem;
          width: 10px;
          flex-shrink: 0;
        }

        .tn__name {
          color: var(--c);
          font-weight: 500;
          flex-shrink: 0;
        }

        .tn__iter {
          color: #60a5fa;
          margin-right: 3px;
          font-size: 0.65rem;
        }

        .tn__model {
          color: #444;
          font-size: 0.6rem;
          padding: 1px 4px;
          border: 1px solid #333;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .tn__args {
          color: #555;
          font-size: 0.65rem;
          flex-shrink: 0;
        }

        .tn__result {
          color: #4ade80;
          font-size: 0.65rem;
          opacity: 0.8;
          margin-left: auto;
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }

        .tn__time {
          color: #444;
          font-size: 0.6rem;
          flex-shrink: 0;
          min-width: 40px;
          text-align: right;
        }

        .tn__status {
          color: #4ade80;
          font-size: 0.6rem;
          flex-shrink: 0;
          opacity: 0.6;
        }

        .tn__status--err {
          color: #f87171;
        }

        .tn__children {
          position: relative;
        }

        @media (max-width: 600px) {
          .tn__args,
          .tn__result {
            display: none;
          }

          .tn__model {
            display: none;
          }
        }
        `}
      </style>
    </div>
  );
}
