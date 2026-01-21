/**
 * DagHeader - Header section of DAG visualization
 *
 * Shows workflow name, success rate, and total execution time.
 *
 * @module web/components/landing/molecules/DagHeader
 */

import { Sparkline } from "../atoms/Sparkline.tsx";
import { StatusBadge } from "../atoms/StatusBadge.tsx";

interface DagHeaderProps {
  name: string;
  successRate: number;
  totalTime: number;
  executionHistory?: number[];
  status?: "success" | "running" | "pending" | "error";
}

export function DagHeader({
  name,
  successRate,
  totalTime,
  executionHistory = [38, 42, 35, 40, 42],
  status = "success"
}: DagHeaderProps) {
  return (
    <div class="dag-header">
      <div class="dag-header__left">
        <span class="dag-header__name">{name}</span>
        <StatusBadge status={status} compact />
      </div>
      <div class="dag-header__right">
        <div class="dag-header__metric">
          <span class="dag-header__metric-value dag-header__metric-value--success">
            {successRate}%
          </span>
          <Sparkline data={executionHistory} color="#4ade80" width={50} height={16} />
        </div>
        <div class="dag-header__metric">
          <span class="dag-header__metric-label">avg</span>
          <span class="dag-header__metric-value">{totalTime}ms</span>
        </div>
      </div>

      <style>
        {`
        .dag-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1rem;
          margin-bottom: 1.25rem;
          border-bottom: 1px solid rgba(255, 184, 111, 0.1);
        }

        .dag-header__left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .dag-header__name {
          font-family: 'Geist Mono', monospace;
          font-size: 1rem;
          font-weight: 600;
          color: #FFB86F;
        }

        .dag-header__right {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .dag-header__metric {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .dag-header__metric-label {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          color: #666;
          text-transform: uppercase;
        }

        .dag-header__metric-value {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          color: #a8a29e;
        }

        .dag-header__metric-value--success {
          color: #4ade80;
        }

        @media (max-width: 600px) {
          .dag-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .dag-header__right {
            width: 100%;
            justify-content: space-between;
          }
        }
        `}
      </style>
    </div>
  );
}
