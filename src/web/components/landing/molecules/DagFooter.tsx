/**
 * DagFooter - Footer section of DAG visualization
 *
 * Shows traced tools count, total time, and compatible models.
 *
 * @module web/components/landing/molecules/DagFooter
 */

import { MaterialIcon } from "../atoms/MaterialIcon.tsx";

interface DagFooterProps {
  toolsCount: number;
  totalTime: number;
  models?: string[];
}

export function DagFooter({
  toolsCount,
  totalTime,
  models = ["Claude", "GPT", "Ollama"]
}: DagFooterProps) {
  return (
    <div class="dag-footer">
      <span class="dag-footer__traced">
        <MaterialIcon name="check_circle" size={14} color="#4ade80" />
        {toolsCount} tools traced
      </span>
      <span class="dag-footer__separator">·</span>
      <span class="dag-footer__time">
        <MaterialIcon name="schedule" size={14} color="#a8a29e" />
        {totalTime}ms total
      </span>
      <span class="dag-footer__separator">·</span>
      <span class="dag-footer__models">
        <MaterialIcon name="shuffle" size={14} color="#FFB86F" />
        {models.join(" / ")}
      </span>

      <style>
        {`
        .dag-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 184, 111, 0.1);
        }

        .dag-footer__traced,
        .dag-footer__time,
        .dag-footer__models {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
        }

        .dag-footer__traced {
          color: #4ade80;
        }

        .dag-footer__time {
          color: #a8a29e;
        }

        .dag-footer__models {
          color: #6b6560;
        }

        .dag-footer__separator {
          color: #444;
        }

        @media (max-width: 600px) {
          .dag-footer {
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .dag-footer__separator {
            display: none;
          }

          .dag-footer__traced,
          .dag-footer__time,
          .dag-footer__models {
            padding: 0.25rem 0.5rem;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 4px;
          }
        }
        `}
      </style>
    </div>
  );
}
