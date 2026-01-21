/**
 * HeroDagVisualization - Complete DAG visualization for Hero section
 *
 * Assembles header, step rows with arrows, and footer into a complete
 * observability visualization showing traced tool executions.
 *
 * @module web/components/landing/organisms/HeroDagVisualization
 */

import { DagHeader } from "../molecules/DagHeader.tsx";
import { DagFooter } from "../molecules/DagFooter.tsx";
import { DagStep } from "../atoms/DagStep.tsx";
import { DagArrow } from "../atoms/DagArrow.tsx";

interface DagStepData {
  name: string;
  time: number;
  success: boolean;
  color: string;
}

interface DagVisualizationProps {
  name: string;
  successRate: number;
  totalTime: number;
  steps: DagStepData[];
  executionHistory?: number[];
}

export function HeroDagVisualization({
  name,
  successRate,
  totalTime,
  steps,
  executionHistory = [38, 42, 35, 40, 42, 38, 41]
}: DagVisualizationProps) {
  // Split steps: first 3 in main row, rest as final
  const mainRow = steps.slice(0, 3);
  const finalStep = steps[3];

  return (
    <div class="hero-dag">
      <DagHeader
        name={name}
        successRate={successRate}
        totalTime={totalTime}
        executionHistory={executionHistory}
        status="success"
      />

      <div class="hero-dag__flow">
        {/* Main row: git.status -> tests.run -> docker.build */}
        <div class="hero-dag__main-row">
          {mainRow.map((step, index) => (
            <>
              <DagStep
                key={step.name}
                name={step.name}
                time={step.time}
                success={step.success}
                color={step.color}
              />
              {index < mainRow.length - 1 && <DagArrow direction="right" />}
            </>
          ))}
        </div>

        {/* Connector + Final step aligned under docker.build */}
        {finalStep && (
          <div class="hero-dag__final-section">
            <div class="hero-dag__connector">
              <DagArrow direction="down" />
            </div>
            <DagStep
              name={finalStep.name}
              time={finalStep.time}
              success={finalStep.success}
              color={finalStep.color}
              isLast
            />
          </div>
        )}
      </div>

      <DagFooter
        toolsCount={steps.length}
        totalTime={totalTime}
        models={["Claude", "GPT", "Ollama"]}
      />

      <style>
        {`
        .hero-dag {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 184, 111, 0.15);
          border-radius: 16px;
          padding: 1.5rem;
          opacity: 0;
          animation: fadeUp 0.6s ease 0.3s forwards;
        }

        .hero-dag__flow {
          display: flex;
          flex-direction: column;
          margin-bottom: 1.5rem;
        }

        .hero-dag__main-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .hero-dag__final-section {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .hero-dag__connector {
          /* Same width as dag-step to center the arrow */
          width: 110px;
          display: flex;
          justify-content: center;
          padding: 0.25rem 0;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .hero-dag {
            padding: 1rem;
          }

          .hero-dag__main-row {
            flex-wrap: wrap;
            gap: 0.75rem;
          }

          .hero-dag__main-row .dag-arrow--right {
            display: none;
          }

          .hero-dag__final-section {
            align-items: center;
            margin-top: 0.5rem;
          }

          .hero-dag__connector {
            margin-right: 0;
          }
        }
        `}
      </style>
    </div>
  );
}
