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

const alignmentClasses = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end pr-8"
};

export function DagStepRow({ steps, alignment = "center" }: DagStepRowProps) {
  return (
    <div class={`flex items-center gap-2 max-sm:flex-wrap max-sm:justify-center max-sm:pr-0 ${alignmentClasses[alignment]}`}>
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
          {index < steps.length - 1 && (
            <span class="max-sm:hidden">
              <DagArrow direction="right" />
            </span>
          )}
        </>
      ))}
    </div>
  );
}
