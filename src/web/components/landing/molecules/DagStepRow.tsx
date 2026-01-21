/**
 * DagStepRow - A row of DAG steps with arrows
 *
 * Displays multiple steps connected by arrows.
 *
 * @module web/components/landing/molecules/DagStepRow
 */

import { DagStep } from "../atoms/DagStep.tsx";
import { DagArrow } from "../atoms/DagArrow.tsx";

interface Step {
  name: string;
  time: number;
  success: boolean;
  color: string;
}

interface DagStepRowProps {
  steps: Step[];
  alignment?: "start" | "center" | "end";
}

export function DagStepRow({ steps, alignment = "center" }: DagStepRowProps) {
  const alignmentClass = `dag-step-row--${alignment}`;

  return (
    <div class={`dag-step-row ${alignmentClass}`}>
      {steps.map((step, index) => (
        <>
          <DagStep
            key={step.name}
            name={step.name}
            time={step.time}
            success={step.success}
            color={step.color}
            isLast={index === steps.length - 1 && alignment === "end"}
          />
          {index < steps.length - 1 && <DagArrow direction="right" />}
        </>
      ))}

      <style>
        {`
        .dag-step-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .dag-step-row--start {
          justify-content: flex-start;
        }

        .dag-step-row--center {
          justify-content: center;
        }

        .dag-step-row--end {
          justify-content: flex-end;
          padding-right: 2rem;
        }

        @media (max-width: 600px) {
          .dag-step-row {
            flex-wrap: wrap;
            justify-content: center !important;
            padding-right: 0 !important;
          }

          .dag-step-row .dag-arrow--right {
            display: none;
          }
        }
        `}
      </style>
    </div>
  );
}
