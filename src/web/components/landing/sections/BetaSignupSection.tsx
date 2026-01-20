/**
 * BetaSignupSection - Beta access request form
 *
 * Simple, elegant form for users to request beta access.
 * Uses Formspree for form handling.
 *
 * @module web/components/landing/sections/BetaSignupSection
 */

export function BetaSignupSection() {
  return (
    <section id="beta" class="beta">
      {/* Label */}
      <div class="beta__label">Early Access</div>

      {/* Title */}
      <h2 class="beta__title">Join the Beta</h2>
      <p class="beta__subtitle">
        Be among the first to give your agents procedural memory.
        <br />
        We'll reach out with access details.
      </p>

      {/* Form */}
      <form
        class="beta__form"
        action="https://formspree.io/f/movnynen"
        method="POST"
      >
        <div class="beta__fields">
          <div class="beta__field">
            <label class="beta__field-label" for="beta-name">Name</label>
            <input
              type="text"
              id="beta-name"
              name="name"
              class="beta__input"
              placeholder="Your name"
              required
            />
          </div>

          <div class="beta__field">
            <label class="beta__field-label" for="beta-email">Email</label>
            <input
              type="email"
              id="beta-email"
              name="email"
              class="beta__input"
              placeholder="you@company.com"
              required
            />
          </div>

          <div class="beta__field beta__field--wide">
            <label class="beta__field-label" for="beta-use-case">
              How will you use PML? <span class="beta__optional">(optional)</span>
            </label>
            <textarea
              id="beta-use-case"
              name="use_case"
              class="beta__textarea"
              placeholder="Tell us about your agents and what you'd like them to learn..."
              rows={3}
            />
          </div>
        </div>

        <button type="submit" class="beta__submit">
          Request Access
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>

      <style>
        {`
        .beta {
          padding: 5rem 2rem;
          background: linear-gradient(180deg, #08080a 0%, #0a0a0d 50%, #08080a 100%);
          position: relative;
        }

        .beta::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 184, 111, 0.2), transparent);
        }

        .beta__label {
          text-align: center;
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #FFB86F;
          margin-bottom: 1.5rem;
        }

        .beta__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          font-weight: 400;
          color: #f0ede8;
          text-align: center;
          margin: 0 0 0.75rem;
        }

        .beta__subtitle {
          font-family: 'Geist', sans-serif;
          font-size: 1rem;
          color: #666;
          text-align: center;
          margin: 0 0 2.5rem;
          line-height: 1.6;
        }

        /* Form */
        .beta__form {
          max-width: 480px;
          margin: 0 auto;
        }

        .beta__fields {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .beta__field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .beta__field--wide {
          grid-column: 1 / -1;
        }

        .beta__field-label {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .beta__optional {
          font-weight: 400;
          color: #555;
          text-transform: none;
          letter-spacing: 0;
        }

        .beta__input,
        .beta__textarea {
          font-family: 'Geist', sans-serif;
          font-size: 0.95rem;
          color: #f0ede8;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 184, 111, 0.15);
          border-radius: 8px;
          padding: 0.875rem 1rem;
          transition: all 0.2s;
        }

        .beta__input::placeholder,
        .beta__textarea::placeholder {
          color: #444;
        }

        .beta__input:focus,
        .beta__textarea:focus {
          outline: none;
          border-color: rgba(255, 184, 111, 0.5);
          background: rgba(255, 184, 111, 0.05);
          box-shadow: 0 0 0 3px rgba(255, 184, 111, 0.1);
        }

        .beta__textarea {
          resize: vertical;
          min-height: 80px;
        }

        .beta__submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 1rem 1.5rem;
          font-family: 'Geist', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          color: #08080a;
          background: #FFB86F;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .beta__submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 184, 111, 0.3);
        }

        .beta__submit:active {
          transform: translateY(0);
        }

        /* Responsive */
        @media (max-width: 640px) {
          .beta {
            padding: 4rem 1.25rem;
          }

          .beta__subtitle br {
            display: none;
          }

          .beta__form {
            max-width: 100%;
          }

          .beta__input,
          .beta__textarea {
            font-size: 16px; /* Prevent iOS zoom */
          }
        }
        `}
      </style>
    </section>
  );
}
