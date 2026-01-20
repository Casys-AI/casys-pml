/**
 * QuickStartSection - Terminal-inspired quick start guide
 *
 * Minimal, elegant 3-step guide with code snippets.
 * Design: Refined terminal aesthetic with amber accents.
 *
 * @module web/components/landing/sections/QuickStartSection
 */

import { quickStart } from "../../../content/landing.ts";

export function QuickStartSection() {
  const { steps } = quickStart;

  return (
    <section id="quickstart" class="quickstart">
      {/* Label */}
      <div class="quickstart__label">{quickStart.label}</div>

      {/* Title */}
      <h2 class="quickstart__title">{quickStart.title}</h2>
      <p class="quickstart__subtitle">{quickStart.subtitle}</p>

      {/* Steps */}
      <div class="quickstart__steps">
        {steps.map((step, index) => (
          <div class="quickstart__step" key={step.id}>
            {/* Step number */}
            <div class="quickstart__step-marker">
              <span class="quickstart__step-number">{index + 1}</span>
              {index < steps.length - 1 && <div class="quickstart__step-line" />}
            </div>

            {/* Step content */}
            <div class="quickstart__step-content">
              <h3 class="quickstart__step-title">{step.title}</h3>
              <p class="quickstart__step-desc">{step.description}</p>

              {/* Code block */}
              <div class="quickstart__code">
                <div class="quickstart__code-header">
                  <span class="quickstart__code-dot" />
                  <span class="quickstart__code-dot" />
                  <span class="quickstart__code-dot" />
                  <span class="quickstart__code-file">{step.filename}</span>
                </div>
                <pre class="quickstart__code-body">
                  <code dangerouslySetInnerHTML={{ __html: step.codeHtml }} />
                </pre>
              </div>

              {/* Result indicator for last step */}
              {step.result && (
                <div class="quickstart__result">
                  <span class="quickstart__result-icon">✓</span>
                  <span class="quickstart__result-text">{step.result}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div class="quickstart__cta">
        <a href={quickStart.cta.href} class="quickstart__btn">
          {quickStart.cta.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <style>
        {`
        .quickstart {
          padding: 5rem 2rem;
          background: #08080a;
          position: relative;
        }

        .quickstart__label {
          text-align: center;
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #555;
          margin-bottom: 1.5rem;
        }

        .quickstart__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          font-weight: 400;
          color: #f0ede8;
          text-align: center;
          margin: 0 0 0.5rem;
        }

        .quickstart__subtitle {
          font-family: 'Geist', sans-serif;
          font-size: 1rem;
          color: #666;
          text-align: center;
          margin: 0 0 3rem;
        }

        /* Steps container */
        .quickstart__steps {
          max-width: 640px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* Individual step */
        .quickstart__step {
          display: grid;
          grid-template-columns: 40px 1fr;
          gap: 1.5rem;
          opacity: 0;
          animation: fadeInStep 0.5s ease forwards;
        }

        .quickstart__step:nth-child(1) { animation-delay: 0.1s; }
        .quickstart__step:nth-child(2) { animation-delay: 0.2s; }
        .quickstart__step:nth-child(3) { animation-delay: 0.3s; }

        @keyframes fadeInStep {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Step marker (number + line) */
        .quickstart__step-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .quickstart__step-number {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          font-weight: 600;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.1);
          border: 1px solid rgba(255, 184, 111, 0.25);
          border-radius: 8px;
          flex-shrink: 0;
        }

        .quickstart__step-line {
          width: 1px;
          flex: 1;
          min-height: 40px;
          background: linear-gradient(to bottom, rgba(255, 184, 111, 0.3), rgba(255, 184, 111, 0.05));
          margin: 0.5rem 0;
        }

        /* Step content */
        .quickstart__step-content {
          padding-bottom: 2rem;
        }

        .quickstart__step-title {
          font-family: 'Geist', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          color: #f0ede8;
          margin: 0.25rem 0 0.5rem;
        }

        .quickstart__step-desc {
          font-family: 'Geist', sans-serif;
          font-size: 0.875rem;
          color: #777;
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Code block */
        .quickstart__code {
          background: #0c0c0f;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          overflow: hidden;
        }

        .quickstart__code-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.6rem 0.875rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .quickstart__code-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
        }

        .quickstart__code-dot:nth-child(1) { background: rgba(255, 95, 86, 0.5); }
        .quickstart__code-dot:nth-child(2) { background: rgba(255, 189, 46, 0.5); }
        .quickstart__code-dot:nth-child(3) { background: rgba(39, 201, 63, 0.5); }

        .quickstart__code-file {
          margin-left: auto;
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          color: #555;
        }

        .quickstart__code-body {
          margin: 0;
          padding: 1rem;
          overflow-x: auto;
        }

        .quickstart__code-body code {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          line-height: 1.6;
          color: #a8a29e;
        }

        /* Syntax highlighting */
        .quickstart__code .cmd { color: #FFB86F; }
        .quickstart__code .flag { color: #82aaff; }
        .quickstart__code .str { color: #c3e88d; }
        .quickstart__code .comment { color: #555; font-style: italic; }
        .quickstart__code .output { color: #4ade80; }
        .quickstart__code .dim { color: #555; }

        /* Result indicator */
        .quickstart__result {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding: 0.4rem 0.75rem;
          background: rgba(74, 222, 128, 0.08);
          border: 1px solid rgba(74, 222, 128, 0.2);
          border-radius: 6px;
        }

        .quickstart__result-icon {
          color: #4ade80;
          font-size: 0.85rem;
        }

        .quickstart__result-text {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          color: #4ade80;
        }

        /* CTA */
        .quickstart__cta {
          text-align: center;
          margin-top: 2rem;
          opacity: 0;
          animation: fadeInStep 0.5s ease 0.4s forwards;
        }

        .quickstart__btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          font-weight: 500;
          color: #FFB86F;
          text-decoration: none;
          background: transparent;
          border: 1px solid rgba(255, 184, 111, 0.25);
          border-radius: 8px;
          transition: all 0.2s;
        }

        .quickstart__btn:hover {
          background: rgba(255, 184, 111, 0.08);
          border-color: rgba(255, 184, 111, 0.5);
          transform: translateX(4px);
        }

        /* Responsive */
        @media (max-width: 640px) {
          .quickstart {
            padding: 4rem 1rem;
          }

          .quickstart__steps {
            max-width: 100%;
          }

          .quickstart__step {
            grid-template-columns: 28px 1fr;
            gap: 0.75rem;
          }

          .quickstart__step-number {
            width: 26px;
            height: 26px;
            font-size: 0.7rem;
          }

          .quickstart__step-content {
            min-width: 0;
            overflow: hidden;
          }

          .quickstart__step-desc {
            font-size: 0.8rem;
            word-wrap: break-word;
          }

          .quickstart__code {
            max-width: 100%;
          }

          .quickstart__code-body {
            padding: 0.75rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .quickstart__code-body code {
            font-size: 0.65rem;
            white-space: pre;
            display: block;
          }
        }
        `}
      </style>
    </section>
  );
}
