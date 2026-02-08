/**
 * HeroSection - Polished landing hero
 *
 * Message: "One gateway. Any model. Full observability."
 * Visual: Vertical trace carousel showing live workflow execution
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
    <section class="relative min-h-[92vh] flex items-center pt-28 pb-20 px-8 sm:pt-24 sm:pb-16 sm:px-5 bg-[#08080a] overflow-hidden">
      {/* Subtle radial gradient */}
      <div
        class="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,184,111,0.06) 0%, transparent 50%)",
        }}
      />

      <div class="relative z-10 max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
        {/* Left: Content */}
        <div class="max-w-[540px] lg:max-w-full text-center lg:text-left">
          {/* Eyebrow */}
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-5 opacity-0 animate-fade-up">
            {hero.eyebrow}
          </p>

          {/* Title */}
          <h1 class="font-serif text-[clamp(1.75rem,4vw,2.75rem)] font-normal leading-[1.15] mb-6 opacity-0 animate-fade-up-delay-1">
            <span class="block text-stone-100">One gateway. Any model.</span>
            <span class="block text-pml-accent italic">Full observability.</span>
          </h1>

          {/* Description */}
          <p class="text-lg sm:text-[0.95rem] leading-relaxed text-stone-500 mb-8 opacity-0 animate-fade-up-delay-2">
            Build AI workflows once, run them with Claude, GPT, Gemini, or your local Ollama.
            Every tool call traced. Debug in seconds, not hours.
          </p>

          {/* CTAs */}
          <div class="flex gap-3 flex-wrap justify-center lg:justify-start mb-8 opacity-0 animate-fade-up-delay-3">
            <a
              href={hero.cta.primary.href}
              class="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-semibold font-sans no-underline rounded-md bg-pml-accent text-[#08080a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(255,184,111,0.2)]"
            >
              {hero.cta.primary.label}
              <MaterialIcon name="arrow_downward" size={14} />
            </a>
            <a
              href={hero.cta.secondary.href}
              class="inline-flex items-center py-2.5 px-5 text-sm font-medium font-sans no-underline rounded-md text-stone-400 border border-pml-accent/20 transition-all duration-200 hover:border-pml-accent hover:text-stone-100"
            >
              {hero.cta.secondary.label}
            </a>
          </div>

          {/* Pillars */}
          <div class="flex items-center gap-5 justify-center lg:justify-start opacity-0 animate-fade-up-delay-4 flex-wrap">
            {pillars.map((pillar, i) => (
              <div class="flex items-center gap-1.5" key={pillar.label}>
                <MaterialIcon name={pillar.icon} size={14} color="#FFB86F" />
                <span class="font-mono text-[0.65rem] text-stone-500 uppercase tracking-wide">
                  {pillar.label}
                </span>
                {i < pillars.length - 1 && <span class="text-stone-700 ml-3">·</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Trace Carousel */}
        <div class="lg:pl-4">
          <TraceCarousel rows={workflowTrace} height={340} speed={28} />
        </div>
      </div>
    </section>
  );
}
