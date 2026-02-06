/**
 * SolutionSection - "See what runs. Validate before it executes. Keep control."
 *
 * Split layout: solution points (left) + live trace visualization (right).
 * The TraceCarousel proves "Observable" by showing real workflow execution.
 *
 * @module web/components/landing-v2/sections/SolutionSection
 */

import { solution } from "../../../content/landing-v2.ts";
import { MaterialIcon } from "../../landing/atoms/MaterialIcon.tsx";
import { TraceCarousel } from "../../landing/organisms/TraceCarousel.tsx";
import type { TraceRowData } from "../../landing/atoms/TraceRow.tsx";

// Compact trace data showing a real observable workflow
const observabilityTrace: TraceRowData[] = [
  { name: "git.diff", type: "tool", args: "HEAD~1", result: "+142 -38", time: 24 },
  { name: "parallel", type: "parallel", args: "fork ×2", result: "890ms", time: 890 },
  { name: "analyze.code", type: "llm", model: "claude-3.5", result: "5 issues", time: 890, cost: 0.0034, depth: 1, lane: 1, inParallel: true },
  { name: "lint.check", type: "tool", result: "2 warnings", time: 156, depth: 1, lane: 2, inParallel: true, isLast: true },
  { name: "test.suite", type: "agent", model: "claude-3.5", time: 6800, cost: 0.0089 },
  { name: "unit.run", type: "loop", args: "×24", result: "24/24 ✓", time: 2340, depth: 1 },
  { name: "integration", type: "tool", result: "7/8 ✓", time: 4200, depth: 1, success: false },
  { name: "retry", type: "tool", result: "8/8 ✓", time: 1200, depth: 1 },
  { name: "coverage", type: "tool", result: "94.2%", time: 89, depth: 1, isLast: true },
  { name: "security.scan", type: "agent", model: "gpt-4o", time: 1660, cost: 0.0156 },
  { name: "parallel", type: "parallel", args: "fork ×3", result: "1.2s", time: 1200, depth: 1 },
  { name: "deps.audit", type: "tool", result: "all safe", time: 340, depth: 2, lane: 1, inParallel: true },
  { name: "secrets.check", type: "tool", result: "0 found", time: 120, depth: 2, lane: 2, inParallel: true },
  { name: "vuln.scan", type: "tool", result: "0 CVEs", time: 1200, depth: 2, lane: 3, inParallel: true, isLast: true },
  { name: "approve.prod", type: "checkpoint", args: "→ prod", result: "approved", time: 45000 },
  { name: "deploy.k8s", type: "agent", model: "ollama", time: 12500, cost: 0.0 },
  { name: "registry.push", type: "tool", result: "sha:a3f2", time: 8900, depth: 1 },
  { name: "rollout", type: "tool", result: "3/3 ready", time: 450, depth: 1 },
  { name: "health.check", type: "loop", args: "×3", result: "healthy", time: 890, depth: 1, isLast: true },
  { name: "notify.slack", type: "tool", args: "#deploy", result: "sent", time: 120 },
  { name: "metrics.push", type: "tool", result: "recorded", time: 45 },
];

export function SolutionSection() {
  return (
    <section
      class="relative py-20 px-8 sm:py-16 sm:px-5 bg-[#08080a]"
      id="solution"
      aria-labelledby="solution-title"
    >
      {/* Subtle accent gradient */}
      <div
        class="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,184,111,0.05) 0%, transparent 50%)",
        }}
      />

      <div class="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <div class="text-center mb-14">
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
            {solution.label}
          </p>

          <h2
            class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal leading-[1.2] text-stone-100 max-w-[700px] mx-auto"
            id="solution-title"
          >
            {solution.title}
          </h2>
        </div>

        {/* Split: Points + Trace */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Solution Points */}
          <div class="flex flex-col gap-5" role="list">
            {solution.points.map((point) => (
              <div
                key={point.icon}
                class="flex gap-4 p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl transition-all duration-300 hover:border-pml-accent/30 hover:bg-pml-accent/[0.02]"
                role="listitem"
              >
                <div class="shrink-0 w-11 h-11 flex items-center justify-center bg-pml-accent/10 rounded-xl">
                  <MaterialIcon name={point.icon} size={22} color="#FFB86F" />
                </div>
                <div class="flex-1">
                  <h3 class="font-sans text-[0.95rem] font-semibold text-stone-100 mb-1">
                    {point.title}
                  </h3>
                  <p class="font-sans text-[0.8rem] text-stone-500 leading-relaxed">
                    {point.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Live Trace Visualization */}
          <div class="flex items-center justify-center lg:sticky lg:top-24">
            <TraceCarousel rows={observabilityTrace} height={360} speed={30} />
          </div>
        </div>
      </div>
    </section>
  );
}
