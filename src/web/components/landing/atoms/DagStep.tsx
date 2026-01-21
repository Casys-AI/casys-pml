/**
 * DagStep - A single step in the DAG visualization
 *
 * Shows tool name, execution time, and status with color coding.
 *
 * @module web/components/landing/atoms/DagStep
 */

interface DagStepProps {
  name: string;
  time: number;
  success: boolean;
  color: string;
  isLast?: boolean;
}

export function DagStep({ name, time, success, color, isLast }: DagStepProps) {
  return (
    <div
      class={`dag-step ${isLast ? "dag-step--final" : ""}`}
      style={{ "--step-color": color } as any}
    >
      <span class="dag-step__name">{name}</span>
      <span class="dag-step__time">
        {success ? "✓" : "✗"} {time}ms
      </span>

      <style>
        {`
        .dag-step {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.75rem 1rem;
          background: #0d0d10;
          border: 1px solid var(--step-color, #FFB86F);
          border-radius: 8px;
          min-width: 110px;
          transition: all 0.2s ease;
        }

        .dag-step:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px color-mix(in srgb, var(--step-color) 30%, transparent);
        }

        .dag-step--final {
          background: linear-gradient(135deg, color-mix(in srgb, var(--step-color) 10%, transparent) 0%, #0d0d10 100%);
        }

        .dag-step__name {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--step-color, #FFB86F);
        }

        .dag-step__time {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          color: #4ade80;
        }
        `}
      </style>
    </div>
  );
}
