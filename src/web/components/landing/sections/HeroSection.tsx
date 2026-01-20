/**
 * HeroSection - Procedural Memory for AI Agents
 *
 * New messaging: "Your agent repeats itself. What if it learned instead?"
 * Visual: Day 1 vs Day 30 contrast showing learned capabilities.
 *
 * @module web/components/landing/sections/HeroSection
 */

import { hero } from "../../../content/landing.ts";

export function HeroSection() {
  return (
    <section class="hero">
      <div class="hero__container">
        {/* Left: Message */}
        <div class="hero__message">
          <p class="hero__eyebrow">{hero.eyebrow}</p>

          <h1 class="hero__title">
            <span class="hero__title-line1">{hero.title.line1}</span>
            <span class="hero__title-accent">{hero.title.accent}</span>
          </h1>

          <p class="hero__desc">
            {hero.description}
          </p>

          <div class="hero__cta">
            <a href={hero.cta.primary.href} class="hero__btn-primary">
              {hero.cta.primary.label}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </a>
            <a href={hero.cta.secondary.href} class="hero__btn-secondary">
              {hero.cta.secondary.label}
            </a>
          </div>
        </div>

        {/* Right: Day 1 vs Day 30 Visual */}
        <div class="hero__diagram">
          {/* Day 1: The Question */}
          <div class="hero__day hero__day--before">
            <div class="hero__day-label">
              <span class="hero__day-badge hero__day-badge--before">Day 1</span>
            </div>
            <div class="hero__day-content hero__day-content--before">
              <div class="hero__question-mark">?</div>
              <div class="hero__question-bubble">
                <span class="hero__quote">"</span>
                <span class="hero__question-text">How do I query your database?</span>
                <span class="hero__quote">"</span>
              </div>
              <div class="hero__thinking">
                <span class="hero__dot"></span>
                <span class="hero__dot"></span>
                <span class="hero__dot"></span>
              </div>
            </div>
          </div>

          {/* Arrow / Transition */}
          <div class="hero__transition">
            <svg class="hero__arrow-down" viewBox="0 0 24 80" fill="none">
              <defs>
                <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <path d="M12 0 L12 60 M6 54 L12 60 L18 54" stroke="url(#arrowGrad)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span class="hero__transition-label">learns once</span>
          </div>

          {/* Day 30: The Reflex */}
          <div class="hero__day hero__day--after">
            <div class="hero__day-label">
              <span class="hero__day-badge hero__day-badge--after">Day 30</span>
            </div>
            <div class="hero__day-content hero__day-content--after">
              <div class="hero__capability">
                <span class="hero__capability-name">db:query</span>
                <span class="hero__capability-check">✓</span>
              </div>
              <div class="hero__result">Done</div>
              <div class="hero__stats">
                <span class="hero__stat">236 calls</span>
                <span class="hero__stat-separator">·</span>
                <span class="hero__stat">Zero re-explanations</span>
              </div>
            </div>
          </div>
        </div>
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

        /* === RIGHT: DIAGRAM === */
        .hero__diagram {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          opacity: 0;
          animation: fadeUp 0.6s ease 0.3s forwards;
        }

        /* Day blocks */
        .hero__day {
          width: 100%;
          max-width: 340px;
        }

        .hero__day-label {
          display: flex;
          justify-content: center;
          margin-bottom: 0.75rem;
        }

        .hero__day-badge {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 0.3rem 0.75rem;
          border-radius: 4px;
        }

        .hero__day-badge--before {
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.1);
          border: 1px solid rgba(255, 184, 111, 0.2);
        }

        .hero__day-badge--after {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.1);
          border: 1px solid rgba(74, 222, 128, 0.2);
        }

        .hero__day-content {
          padding: 1.5rem;
          border-radius: 12px;
          text-align: center;
        }

        .hero__day-content--before {
          background: rgba(255, 184, 111, 0.03);
          border: 1px solid rgba(255, 184, 111, 0.15);
        }

        .hero__day-content--after {
          background: rgba(74, 222, 128, 0.03);
          border: 1px solid rgba(74, 222, 128, 0.2);
        }

        /* Day 1 content */
        .hero__question-mark {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 2.5rem;
          color: #FFB86F;
          opacity: 0.4;
          margin-bottom: 0.5rem;
        }

        .hero__question-bubble {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.5rem 1rem;
          background: #0d0d10;
          border-radius: 8px;
          margin-bottom: 0.75rem;
        }

        .hero__quote {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 1.25rem;
          color: #FFB86F;
          opacity: 0.5;
          line-height: 1;
        }

        .hero__question-text {
          font-family: 'Geist', sans-serif;
          font-size: 0.85rem;
          color: #a8a29e;
          font-style: italic;
        }

        .hero__thinking {
          display: flex;
          justify-content: center;
          gap: 0.3rem;
        }

        .hero__dot {
          width: 6px;
          height: 6px;
          background: #FFB86F;
          border-radius: 50%;
          opacity: 0.4;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .hero__dot:nth-child(2) { animation-delay: 0.2s; }
        .hero__dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 0.6; transform: scale(1); }
        }

        /* Transition arrow */
        .hero__transition {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.75rem 0;
        }

        .hero__arrow-down {
          width: 24px;
          height: 50px;
        }

        .hero__transition-label {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #4ade80;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-top: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: rgba(74, 222, 128, 0.08);
          border: 1px solid rgba(74, 222, 128, 0.2);
          border-radius: 4px;
        }

        /* Day 30 content */
        .hero__capability {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 1rem;
          background: #0d0d10;
          border: 1px solid rgba(74, 222, 128, 0.3);
          border-radius: 8px;
          margin-bottom: 0.5rem;
        }

        .hero__capability-name {
          font-family: 'Geist Mono', monospace;
          font-size: 1rem;
          font-weight: 600;
          color: #4ade80;
        }

        .hero__capability-check {
          font-size: 1rem;
          color: #4ade80;
        }

        .hero__result {
          font-family: 'Geist', sans-serif;
          font-size: 0.9rem;
          font-weight: 500;
          color: #f0ede8;
          margin-bottom: 0.75rem;
        }

        .hero__stats {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
        }

        .hero__stat {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          color: #666;
        }

        .hero__stat-separator {
          color: #444;
        }

        /* Animation */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive */
        @media (max-width: 900px) {
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
        }

        @media (max-width: 480px) {
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
          .hero__question-text {
            font-size: 0.75rem;
          }
          .hero__capability-name {
            font-size: 0.85rem;
          }
          .hero__day {
            max-width: 100%;
          }
          .hero__day-content {
            padding: 1.25rem 1rem;
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
