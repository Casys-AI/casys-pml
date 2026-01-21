/**
 * IntelligenceSection - Workflow Intelligence visualization
 *
 * Clean design matching Hero section:
 * - Left: Content (title, desc, pillars)
 * - Right: Knowledge graph visualization
 *
 * @module web/components/landing/sections/IntelligenceSection
 */

import { HyperGraphViz } from "../organisms/HyperGraphViz.tsx";
import { MaterialIcon } from "../atoms/MaterialIcon.tsx";

// Intelligence features
const features = [
  {
    icon: "hub" as const,
    title: "Community Patterns",
    desc: "Learn from thousands of workflow executions. The more people use it, the smarter it gets for everyone.",
  },
  {
    icon: "auto_awesome" as const,
    title: "Auto-Optimization",
    desc: "Your workflows improve automatically over time. No manual tuning required.",
  },
  {
    icon: "recommend" as const,
    title: "Smart Suggestions",
    desc: '"Users who ran this also used..." — discover tools you didn\'t know you needed.',
  },
];

export function IntelligenceSection() {
  return (
    <section class="intel" id="intelligence">
      <div class="intel__container">
        {/* Left: Graph Visualization */}
        <div class="intel__viz">
          <HyperGraphViz />
        </div>

        {/* Right: Features */}
        <div class="intel__content">
          <p class="intel__eyebrow">Collective Intelligence</p>

          <h2 class="intel__title">
            <span class="intel__title-line">Every execution</span>
            <span class="intel__title-accent">makes it smarter.</span>
          </h2>

          <p class="intel__desc">
            The more workflows run, the better the system gets. Network effects
            that compound — impossible to catch up once you start.
          </p>

          {/* Feature list */}
          <div class="intel__features">
            {features.map((feature) => (
              <div class="intel__feature" key={feature.title}>
                <div class="intel__feature-icon">
                  <MaterialIcon name={feature.icon} size={20} color="#FFB86F" />
                </div>
                <div class="intel__feature-text">
                  <h3 class="intel__feature-title">{feature.title}</h3>
                  <p class="intel__feature-desc">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>
        {`
        .intel {
          position: relative;
          min-height: 80vh;
          display: flex;
          align-items: center;
          padding: 6rem 2rem 4rem;
          background: #08080a;
        }

        .intel__container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
        }

        /* === LEFT: VISUALIZATION === */
        .intel__viz {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* === RIGHT: CONTENT === */
        .intel__content {
          max-width: 520px;
        }

        .intel__eyebrow {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 1rem;
          opacity: 0;
          animation: intelFadeUp 0.5s ease forwards;
        }

        .intel__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(2rem, 4vw, 2.75rem);
          font-weight: 400;
          line-height: 1.15;
          margin-bottom: 1rem;
          opacity: 0;
          animation: intelFadeUp 0.5s ease 0.1s forwards;
        }

        .intel__title-line {
          display: block;
          color: #f0ede8;
        }

        .intel__title-accent {
          display: block;
          color: #FFB86F;
          font-style: italic;
        }

        .intel__desc {
          font-size: 0.95rem;
          line-height: 1.6;
          color: #777;
          margin-bottom: 2rem;
          opacity: 0;
          animation: intelFadeUp 0.5s ease 0.2s forwards;
        }

        /* === FEATURES === */
        .intel__features {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          opacity: 0;
          animation: intelFadeUp 0.5s ease 0.3s forwards;
        }

        .intel__feature {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }

        .intel__feature-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 8px;
          border: 1px solid rgba(139, 92, 246, 0.15);
        }

        .intel__feature-text {
          flex: 1;
        }

        .intel__feature-title {
          font-family: 'Geist', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: #f0ede8;
          margin-bottom: 0.25rem;
        }

        .intel__feature-desc {
          font-size: 0.8rem;
          line-height: 1.5;
          color: #666;
        }

        /* Animation */
        @keyframes intelFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .intel__container {
            grid-template-columns: 1fr;
            gap: 3rem;
          }
          .intel__viz {
            order: 2;
          }
          .intel__content {
            order: 1;
            text-align: center;
            max-width: 100%;
          }
          .intel__features {
            text-align: left;
            max-width: 400px;
            margin: 0 auto;
          }
        }

        @media (max-width: 600px) {
          .intel {
            padding: 5rem 1.25rem 2rem;
            min-height: auto;
          }
          .intel__eyebrow {
            font-size: 0.6rem;
            letter-spacing: 0.15em;
          }
          .intel__title {
            font-size: 1.75rem;
          }
          .intel__desc {
            font-size: 0.9rem;
          }
          .intel__feature-icon {
            width: 32px;
            height: 32px;
          }
          .intel__feature-title {
            font-size: 0.85rem;
          }
          .intel__feature-desc {
            font-size: 0.75rem;
          }
        }
        `}
      </style>
    </section>
  );
}
