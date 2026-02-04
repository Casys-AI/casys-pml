/**
 * HeroSection - Refonte alignée brainstorming
 *
 * Nouveau message: "One gateway. Any model. Full observability."
 * Visual: Carousel vertical montrant un workflow complexe avec scroll infini
 *
 * @module web/components/landing/sections/HeroSection
 */

import { hero } from "../../../content/landing.ts";
import { MaterialIcon } from "../atoms/MaterialIcon.tsx";
import { TraceCarousel } from "../organisms/TraceCarousel.tsx";
import type { TraceRowData } from "../atoms/TraceRow.tsx";

const workflowTrace: TraceRowData[] = [
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

  { name: "build", type: "tool", args: "--tag v2.1.0", time: 18400 },
  { name: "approve.prod", type: "checkpoint", args: "→ prod", result: "approved", time: 45000 },
  { name: "deploy.k8s", type: "agent", model: "ollama", time: 12500, cost: 0.0 },
  { name: "registry.push", type: "tool", result: "sha:a3f2", time: 8900, depth: 1 },
  { name: "rollout", type: "tool", result: "3/3 ready", time: 450, depth: 1 },
  { name: "health.check", type: "loop", args: "×3", result: "healthy", time: 890, depth: 1, isLast: true },

  { name: "notify.slack", type: "tool", args: "#deploy", result: "sent", time: 120 },
  { name: "metrics.push", type: "tool", result: "recorded", time: 45 },
];

const pillars = [
  { icon: "shuffle" as const, label: "Model-Agnostic" },
  { icon: "visibility" as const, label: "Full Traceability" },
  { icon: "psychology" as const, label: "Learns Patterns" },
];

export function HeroSection() {
  return (
    <section class="relative min-h-[90vh] flex items-center py-24 px-8 sm:py-20 sm:px-5 bg-[#08080a]">
      <div class="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div class="max-w-[520px] lg:max-w-full text-center lg:text-left">
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-amber-400 uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-5 opacity-0 animate-fade-up">
            {hero.eyebrow}
          </p>

          <h1 class="font-serif text-[clamp(1.75rem,4.5vw,3.25rem)] font-normal leading-[1.15] mb-6 opacity-0 animate-fade-up-delay-1">
            <span class="block text-stone-100">One gateway. Any model.</span>
            <span class="block text-amber-400 italic">Full observability.</span>
          </h1>

          <p class="text-lg sm:text-[0.95rem] leading-relaxed text-stone-500 mb-8 opacity-0 animate-fade-up-delay-2">
            Build AI workflows once, run them with Claude, GPT, Gemini, or your local Ollama.
            Every tool call traced. Debug in seconds, not hours.
          </p>

          <div class="flex gap-4 flex-wrap justify-center lg:justify-start mb-10 opacity-0 animate-fade-up-delay-3 sm:flex-col sm:gap-3">
            <a
              href={hero.cta.primary.href}
              class="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold font-sans no-underline rounded-lg bg-amber-400 text-[#08080a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(255,184,111,0.25)] sm:w-full sm:justify-center"
            >
              {hero.cta.primary.label}
              <MaterialIcon name="arrow_downward" size={16} />
            </a>
            <a
              href={hero.cta.secondary.href}
              class="inline-flex items-center py-3.5 px-6 text-sm font-medium font-sans no-underline rounded-lg text-stone-400 border border-amber-400/20 transition-all duration-200 hover:border-amber-400 hover:text-stone-100 sm:w-full sm:justify-center"
            >
              {hero.cta.secondary.label}
            </a>
          </div>

          <div class="flex gap-6 justify-center lg:justify-start opacity-0 animate-fade-up-delay-4 sm:flex-col sm:items-center sm:gap-3">
            {pillars.map((pillar) => (
              <div class="flex items-center gap-2" key={pillar.label}>
                <MaterialIcon name={pillar.icon} size={18} color="#FFB86F" />
                <span class="font-mono text-[0.7rem] font-medium text-stone-500 uppercase tracking-[0.05em]">
                  {pillar.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <TraceCarousel rows={workflowTrace} height={320} speed={25} />
      </div>
    </section>
  );
}
