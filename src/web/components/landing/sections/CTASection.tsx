/**
 * CTASection - Final call to action
 *
 * @module web/components/landing/sections/CTASection
 */

import { cta } from "../../../content/landing.ts";

export function CTASection() {
  return (
    <section class="cta-section">
      <div class="container">
        <div class="cta__content">
          <h2 class="cta__title">{cta.title}</h2>
          <p class="cta__desc">{cta.description}</p>

          <div class="cta__actions">
            <a
              href={cta.actions.primary.href}
              class="btn btn--primary"
              target="_blank"
              rel="noopener"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {cta.actions.primary.label}
            </a>
            <a href={cta.actions.secondary.href} class="btn btn--accent">
              {cta.actions.secondary.label}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <style>
        {`
        .cta-section {
          position: relative;
          z-index: 10;
          padding: 5rem 2rem;
          background: #08080a;
          border-top: 1px solid rgba(255, 184, 111, 0.08);
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .cta__content {
          text-align: center;
          max-width: 600px;
          margin: 0 auto;
        }

        .cta__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 2.5rem;
          font-weight: 400;
          color: #f0ede8;
          margin-bottom: 1rem;
        }

        .cta__desc {
          font-size: 1.125rem;
          color: #a8a29e;
          margin-bottom: 2rem;
          line-height: 1.7;
        }

        .cta__actions {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: 'Geist', -apple-system, system-ui, sans-serif;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.2s;
          cursor: pointer;
          border: none;
        }

        .btn--primary {
          background: #FFB86F;
          color: #08080a;
        }

        .btn--primary:hover {
          filter: brightness(1.1);
          transform: translateY(-2px);
        }

        .btn--accent {
          background: transparent;
          color: #FFB86F;
          border: 1px solid #FFB86F;
        }

        .btn--accent:hover {
          background: #FFB86F;
          color: #08080a;
        }

        @media (max-width: 768px) {
          .cta__actions {
            flex-direction: column;
          }

          .cta__title {
            font-size: 2rem;
          }
        }
        `}
      </style>
    </section>
  );
}
