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

// Complex workflow trace data for carousel
// Shows: tools, LLM calls, loops, agents across multiple providers
// With costs, error states, and proper tree structure
const workflowTrace: TraceRowData[] = [
  // Phase 1: Git & Analysis - with parallel fetch
  { name: "git.diff", type: "tool", args: "HEAD~1", result: "+142 -38", time: 24 },
  { name: "parallel", type: "parallel", args: "fork ×2", result: "890ms", time: 890 },
  { name: "analyze.code", type: "llm", model: "claude-3.5", result: "5 issues", time: 890, cost: 0.0034, depth: 1, lane: 1, inParallel: true },
  { name: "lint.check", type: "tool", result: "2 warnings", time: 156, depth: 1, lane: 2, inParallel: true, isLast: true },

  // Phase 2: Testing (with children)
  { name: "test.suite", type: "agent", model: "claude-3.5", time: 6800, cost: 0.0089 },
  { name: "unit.run", type: "loop", args: "×24", result: "24/24 ✓", time: 2340, depth: 1 },
  { name: "integration", type: "tool", result: "7/8 ✓", time: 4200, depth: 1, success: false },
  { name: "retry", type: "tool", result: "8/8 ✓", time: 1200, depth: 1 },
  { name: "coverage", type: "tool", result: "94.2%", time: 89, depth: 1, isLast: true },

  // Phase 3: Security - parallel layer execution
  { name: "security.scan", type: "agent", model: "gpt-4o", time: 1660, cost: 0.0156 },
  { name: "parallel", type: "parallel", args: "fork ×3", result: "1.2s", time: 1200, depth: 1 },
  { name: "deps.audit", type: "tool", result: "all safe", time: 340, depth: 2, lane: 1, inParallel: true },
  { name: "secrets.check", type: "tool", result: "0 found", time: 120, depth: 2, lane: 2, inParallel: true },
  { name: "vuln.scan", type: "tool", result: "0 CVEs", time: 1200, depth: 2, lane: 3, inParallel: true, isLast: true },

  // Phase 4: Build & Deploy (with nested)
  { name: "build", type: "tool", args: "--tag v2.1.0", time: 18400 },
  { name: "approve.prod", type: "checkpoint", args: "→ prod", result: "approved", time: 45000 },
  { name: "deploy.k8s", type: "agent", model: "ollama", time: 12500, cost: 0.0 },
  { name: "registry.push", type: "tool", result: "sha:a3f2", time: 8900, depth: 1 },
  { name: "rollout", type: "tool", result: "3/3 ready", time: 450, depth: 1 },
  { name: "health.check", type: "loop", args: "×3", result: "healthy", time: 890, depth: 1, isLast: true },

  // Phase 5: Notify
  { name: "notify.slack", type: "tool", args: "#deploy", result: "sent", time: 120 },
  { name: "metrics.push", type: "tool", result: "recorded", time: 45 },
];

// Pillars with Material icons
const pillars = [
  { icon: "shuffle" as const, label: "Model-Agnostic" },
  { icon: "visibility" as const, label: "Full Traceability" },
  { icon: "psychology" as const, label: "Learns Patterns" },
];

export function HeroSection() {
  return (
    <section class="hero">
      <div class="hero__container">
        {/* Left: Message */}
        <div class="hero__message">
          <p class="hero__eyebrow">{hero.eyebrow}</p>

          <h1 class="hero__title">
            <span class="hero__title-line1">One gateway. Any model.</span>
            <span class="hero__title-accent">Full observability.</span>
          </h1>

          <p class="hero__desc">
            Build AI workflows once, run them with Claude, GPT, Gemini, or your local Ollama.
            Every tool call traced. Debug in seconds, not hours.
          </p>

          <div class="hero__cta">
            <a href={hero.cta.primary.href} class="hero__btn-primary">
              {hero.cta.primary.label}
              <MaterialIcon name="arrow_downward" size={16} />
            </a>
            <a href={hero.cta.secondary.href} class="hero__btn-secondary">
              {hero.cta.secondary.label}
            </a>
          </div>

          {/* 3 Pillars with Material Icons */}
          <div class="hero__pillars">
            {pillars.map((pillar) => (
              <div class="hero__pillar" key={pillar.label}>
                <MaterialIcon name={pillar.icon} size={18} color="#FFB86F" />
                <span class="hero__pillar-text">{pillar.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Trace Carousel */}
        <TraceCarousel rows={workflowTrace} height={320} speed={25} />
      </div>

      <style>
        {`
        .hero {
          position: relative;
          min-height: 90vh;
          display: flex;
          align-items: center;
          padding: 6rem 2rem 4rem;
          background: #08080a;
        }

        .hero__container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
        }

        /* === LEFT: MESSAGE === */
        .hero__message {
          max-width: 520px;
        }

        .hero__eyebrow {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 1.25rem;
          opacity: 0;
          animation: fadeUp 0.5s ease forwards;
        }

        .hero__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(2.25rem, 4.5vw, 3.25rem);
          font-weight: 400;
          line-height: 1.15;
          margin-bottom: 1.5rem;
          opacity: 0;
          animation: fadeUp 0.5s ease 0.1s forwards;
        }

        .hero__title-line1 {
          display: block;
          color: #f0ede8;
        }

        .hero__title-accent {
          display: block;
          color: #FFB86F;
          font-style: italic;
        }

        .hero__desc {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #888;
          margin-bottom: 2rem;
          opacity: 0;
          animation: fadeUp 0.5s ease 0.2s forwards;
        }

        .hero__cta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 2.5rem;
          opacity: 0;
          animation: fadeUp 0.5s ease 0.3s forwards;
        }

        .hero__btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: 'Geist', sans-serif;
          text-decoration: none;
          border-radius: 8px;
          background: #FFB86F;
          color: #08080a;
          transition: all 0.2s;
        }

        .hero__btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(255, 184, 111, 0.25);
        }

        .hero__btn-secondary {
          display: inline-flex;
          align-items: center;
          padding: 0.875rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 500;
          font-family: 'Geist', sans-serif;
          text-decoration: none;
          border-radius: 8px;
          color: #a8a29e;
          border: 1px solid rgba(255, 184, 111, 0.2);
          transition: all 0.2s;
        }

        .hero__btn-secondary:hover {
          border-color: #FFB86F;
          color: #f0ede8;
        }

        /* === PILLARS === */
        .hero__pillars {
          display: flex;
          gap: 1.5rem;
          opacity: 0;
          animation: fadeUp 0.5s ease 0.4s forwards;
        }

        .hero__pillar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .hero__pillar-text {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #6b6560;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Animation */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero__container {
            grid-template-columns: 1fr;
            gap: 3rem;
          }
          .hero__message {
            text-align: center;
            max-width: 100%;
          }
          .hero__cta {
            justify-content: center;
          }
          .hero__pillars {
            justify-content: center;
          }
        }

        @media (max-width: 600px) {
          .hero {
            padding: 5rem 1.25rem 2rem;
            min-height: auto;
          }
          .hero__eyebrow {
            font-size: 0.6rem;
            letter-spacing: 0.15em;
          }
          .hero__title {
            font-size: 1.75rem;
          }
          .hero__desc {
            font-size: 0.95rem;
          }
          .hero__pillars {
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
          }
          .hero__cta {
            flex-direction: column;
            gap: 0.75rem;
          }
          .hero__btn-primary,
          .hero__btn-secondary {
            width: 100%;
            justify-content: center;
          }
        }
        `}
      </style>
    </section>
  );
}
