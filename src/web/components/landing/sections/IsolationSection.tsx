/**
 * IsolationSection - "Autonomous, Not Reckless"
 *
 * Security section showcasing sandbox isolation and checkpoint approvals.
 * Layout: Illustration left, content right (inverse of IntelligenceSection).
 *
 * @module web/components/landing/sections/IsolationSection
 */

import { IsolationIllustration } from "../illustrations/index.ts";

export function IsolationSection() {
  return (
    <section class="iso" id="isolation" aria-labelledby="iso-title">
      <div class="iso__container">
        {/* Left: Illustration */}
        <div class="iso__viz">
          <IsolationIllustration />
        </div>

        {/* Right: Content */}
        <div class="iso__content">
          <p class="iso__eyebrow">Security</p>

          <h2 class="iso__title" id="iso-title">
            <span class="iso__title-line">Autonomous,</span>
            <span class="iso__title-accent">not reckless.</span>
          </h2>

          <p class="iso__desc">
            AI agents shouldn't have the keys to everything. Actions run in isolation
            — they can't access your data or tools without going through controlled
            checkpoints. Sensitive operations always ask before acting.
          </p>

          {/* Feature highlights */}
          <div class="iso__features" role="list">
            <div class="iso__feature" role="listitem">
              <div class="iso__feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div class="iso__feature-text">
                <span class="iso__feature-title">Sandboxed Execution</span>
                <span class="iso__feature-desc">Code runs in isolated workers with no direct access</span>
              </div>
            </div>

            <div class="iso__feature" role="listitem">
              <div class="iso__feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="iso__feature-text">
                <span class="iso__feature-title">Human-in-the-Loop</span>
                <span class="iso__feature-desc">Dangerous actions require explicit approval</span>
              </div>
            </div>

            <div class="iso__feature" role="listitem">
              <div class="iso__feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div class="iso__feature-text">
                <span class="iso__feature-title">Audit Trail</span>
                <span class="iso__feature-desc">Every action logged for transparency</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        {`
        .iso {
          position: relative;
          min-height: 80vh;
          display: flex;
          align-items: center;
          padding: 6rem 2rem 4rem;
          background: #08080a;
        }

        .iso__container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
        }

        /* === LEFT: VISUALIZATION === */
        .iso__viz {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          animation: isoFadeUp 0.6s ease 0.1s forwards;
        }

        /* === RIGHT: CONTENT === */
        .iso__content {
          max-width: 480px;
        }

        .iso__eyebrow {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #a78bfa;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 1rem;
          opacity: 0;
          animation: isoFadeUp 0.5s ease forwards;
        }

        .iso__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(2rem, 4vw, 2.75rem);
          font-weight: 400;
          line-height: 1.15;
          margin-bottom: 1rem;
          opacity: 0;
          animation: isoFadeUp 0.5s ease 0.1s forwards;
        }

        .iso__title-line {
          display: block;
          color: #f0ede8;
        }

        .iso__title-accent {
          display: block;
          color: #a78bfa;
          font-style: italic;
        }

        .iso__desc {
          font-size: 0.95rem;
          line-height: 1.6;
          color: #777;
          margin-bottom: 2rem;
          opacity: 0;
          animation: isoFadeUp 0.5s ease 0.2s forwards;
        }

        /* === FEATURES === */
        .iso__features {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          opacity: 0;
          animation: isoFadeUp 0.5s ease 0.3s forwards;
        }

        .iso__feature {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .iso__feature-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(167, 139, 250, 0.1);
          border-radius: 8px;
          border: 1px solid rgba(167, 139, 250, 0.2);
          color: #a78bfa;
        }

        .iso__feature-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .iso__feature-title {
          font-family: 'Geist', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          color: #f0ede8;
        }

        .iso__feature-desc {
          font-size: 0.78rem;
          line-height: 1.4;
          color: #666;
        }

        /* Animation */
        @keyframes isoFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .iso__container {
            grid-template-columns: 1fr;
            gap: 3rem;
          }
          .iso__viz {
            order: 2;
          }
          .iso__content {
            order: 1;
            text-align: center;
            max-width: 100%;
          }
          .iso__features {
            text-align: left;
            max-width: 380px;
            margin: 0 auto;
          }
        }

        @media (max-width: 600px) {
          .iso {
            padding: 5rem 1.25rem 2rem;
            min-height: auto;
          }
          .iso__eyebrow {
            font-size: 0.6rem;
            letter-spacing: 0.15em;
          }
          .iso__title {
            font-size: 1.75rem;
          }
          .iso__desc {
            font-size: 0.9rem;
          }
          .iso__feature-icon {
            width: 32px;
            height: 32px;
          }
          .iso__feature-title {
            font-size: 0.85rem;
          }
          .iso__feature-desc {
            font-size: 0.75rem;
          }
        }

        /* Respect reduced motion preferences (WCAG 2.3.3) */
        @media (prefers-reduced-motion: reduce) {
          .iso__eyebrow,
          .iso__title,
          .iso__desc,
          .iso__features,
          .iso__viz {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
        `}
      </style>
    </section>
  );
}
