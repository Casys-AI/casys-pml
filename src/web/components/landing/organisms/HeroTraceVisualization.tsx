/**
 * HeroTraceVisualization - Minimal floating trace
 *
 * No container, no borders - just clean vertical trace lines.
 * Optional vertical scroll animation.
 *
 * @module web/components/landing/organisms/HeroTraceVisualization
 */

import { TraceNode, type TraceNodeData } from "../atoms/TraceNode.tsx";

interface TraceVisualizationProps {
  name: string;
  totalTime: number;
  successRate: number;
  cost?: number;
  nodes: TraceNodeData[];
  executionHistory?: number[];
}

function formatTime(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function HeroTraceVisualization({
  name,
  totalTime,
  successRate,
  cost = 0.02,
  nodes,
}: TraceVisualizationProps) {
  // Count nodes
  const countNodes = (items: TraceNodeData[]): number => {
    return items.reduce((acc, node) => {
      return acc + 1 + (node.children ? countNodes(node.children) : 0);
    }, 0);
  };
  const totalCalls = countNodes(nodes);

  return (
    <div class="trace">
      {/* Header line */}
      <div class="trace__header">
        <span class="trace__dot" />
        <span class="trace__name">{name}</span>
        <span class="trace__metrics">
          <span class="trace__success">{successRate}%</span>
          <span class="trace__time">{formatTime(totalTime)}</span>
          <span class="trace__cost">${cost.toFixed(3)}</span>
        </span>
      </div>

      {/* Trace lines */}
      <div class="trace__lines">
        {nodes.map((node, i) => (
          <TraceNode
            key={`${node.name}-${i}`}
            node={node}
            depth={0}
            isLast={i === nodes.length - 1}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div class="trace__footer">
        <span class="trace__stat">{totalCalls} rpc calls</span>
        <span class="trace__stat">args + results captured</span>
      </div>

      <style>
        {`
        .trace {
          opacity: 0;
          animation: fadeUp 0.6s ease 0.3s forwards;
          max-width: 460px;
          width: 100%;
        }

        .trace__header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .trace__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 8px rgba(74, 222, 128, 0.4);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .trace__name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          font-weight: 500;
          color: #f0ede8;
        }

        .trace__metrics {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
        }

        .trace__success {
          color: #4ade80;
        }

        .trace__time {
          color: #555;
        }

        .trace__cost {
          color: #FFB86F;
        }

        .trace__lines {
          /* No container styling - just the lines */
        }

        .trace__footer {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .trace__stat {
          font-family: 'Geist Mono', monospace;
          font-size: 0.6rem;
          color: #444;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .trace {
            max-width: 100%;
          }

          .trace__header {
            flex-wrap: wrap;
          }

          .trace__metrics {
            width: 100%;
            margin-left: 14px;
            margin-top: 4px;
          }
        }
        `}
      </style>
    </div>
  );
}
