/**
 * ArchitectureSection - Visual representation of PML Gateway architecture
 *
 * Shows the flow: Clients -> PML Gateway -> MCP Servers
 * Highlights the 3 pillars: Model-Agnostic, Observability, Intelligence
 *
 * @module web/components/landing/sections/ArchitectureSection
 */

export function ArchitectureSection() {
  return (
    <section class="arch">
      <div class="arch__container">
        <div class="arch__header">
          <span class="arch__eyebrow">Architecture</span>
          <h2 class="arch__title">How it works</h2>
          <p class="arch__subtitle">
            A unified gateway that connects any LLM to any MCP server, with full observability and continuous learning.
          </p>
        </div>

        <div class="arch__diagram">
          {/* Clients */}
          <div class="arch__column arch__column--clients">
            <div class="arch__column-label">Clients</div>
            <div class="arch__box arch__box--clients">
              <div class="arch__client">Claude</div>
              <div class="arch__client">GPT</div>
              <div class="arch__client">Gemini</div>
              <div class="arch__client">Ollama</div>
              <div class="arch__client arch__client--any">(Any LLM)</div>
            </div>
            <div class="arch__pillar arch__pillar--1">
              <span class="arch__pillar-num">1</span>
              <span class="arch__pillar-label">Model-Agnostic</span>
            </div>
          </div>

          {/* Arrow Left */}
          <div class="arch__arrow">
            <svg viewBox="0 0 60 24" class="arch__arrow-svg">
              <defs>
                <linearGradient id="arrowGradH" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <path d="M0 12 L50 12 M44 6 L50 12 L44 18" stroke="url(#arrowGradH)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          {/* Gateway */}
          <div class="arch__column arch__column--gateway">
            <div class="arch__column-label">PML Gateway</div>
            <div class="arch__box arch__box--gateway">
              <div class="arch__gateway-row">
                <div class="arch__gateway-item">Registry</div>
                <span class="arch__gateway-arrow">→</span>
                <div class="arch__gateway-item">DAG</div>
                <span class="arch__gateway-arrow">→</span>
                <div class="arch__gateway-item">Sandbox</div>
              </div>
              <div class="arch__gateway-bottom">
                <div class="arch__gateway-item arch__gateway-item--world">
                  Symbolic World Model
                </div>
                <span class="arch__gateway-learn">← learn</span>
                <div class="arch__gateway-item arch__gateway-item--obs">
                  Observability
                </div>
              </div>
            </div>
            <div class="arch__pillars-row">
              <div class="arch__pillar arch__pillar--2">
                <span class="arch__pillar-num">2</span>
                <span class="arch__pillar-label">Observability</span>
              </div>
              <div class="arch__pillar arch__pillar--3">
                <span class="arch__pillar-num">3</span>
                <span class="arch__pillar-label">Intelligence</span>
              </div>
            </div>
          </div>

          {/* Arrow Right */}
          <div class="arch__arrow">
            <svg viewBox="0 0 60 24" class="arch__arrow-svg">
              <path d="M0 12 L50 12 M44 6 L50 12 L44 18" stroke="url(#arrowGradH)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          {/* MCP Servers */}
          <div class="arch__column arch__column--servers">
            <div class="arch__column-label">MCP Servers</div>
            <div class="arch__box arch__box--servers">
              <div class="arch__server">filesystem</div>
              <div class="arch__server">postgres</div>
              <div class="arch__server">github</div>
              <div class="arch__server">memory</div>
              <div class="arch__server arch__server--any">(Any Tools)</div>
            </div>
          </div>
        </div>

        {/* Mobile: Simplified vertical view */}
        <div class="arch__diagram-mobile">
          <div class="arch__mobile-block">
            <div class="arch__mobile-label">Any LLM Client</div>
            <div class="arch__mobile-items">Claude · GPT · Gemini · Ollama</div>
          </div>
          <div class="arch__mobile-arrow">↓</div>
          <div class="arch__mobile-block arch__mobile-block--gateway">
            <div class="arch__mobile-label">PML Gateway</div>
            <div class="arch__mobile-features">
              <span>Registry</span>
              <span>DAG Executor</span>
              <span>Sandbox</span>
            </div>
            <div class="arch__mobile-intelligence">
              <span class="arch__mobile-world">Symbolic World Model</span>
              <span class="arch__mobile-obs">Observability</span>
            </div>
          </div>
          <div class="arch__mobile-arrow">↓</div>
          <div class="arch__mobile-block">
            <div class="arch__mobile-label">MCP Servers</div>
            <div class="arch__mobile-items">filesystem · postgres · github · (Any Tools)</div>
          </div>
        </div>
      </div>

      <style>
        {`
        .arch {
          position: relative;
          padding: 5rem 2rem;
          background: #08080a;
        }

        .arch__container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .arch__header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .arch__eyebrow {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.2em;
        }

        .arch__title {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          font-weight: 400;
          color: #f0ede8;
          margin: 0.75rem 0;
        }

        .arch__subtitle {
          font-size: 1rem;
          color: #888;
          max-width: 500px;
          margin: 0 auto;
          line-height: 1.6;
        }

        /* Desktop Diagram */
        .arch__diagram {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .arch__column--clients,
        .arch__column--servers {
          align-self: flex-start;
        }

        .arch__column--gateway {
          align-self: center;
        }

        .arch__diagram-mobile {
          display: none;
        }

        .arch__column {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .arch__column-label {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .arch__box {
          padding: 1.25rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 184, 111, 0.15);
        }

        /* Clients */
        .arch__box--clients {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 120px;
        }

        .arch__client {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          color: #a8a29e;
          padding: 0.4rem 0.75rem;
          background: rgba(255, 184, 111, 0.05);
          border-radius: 6px;
          text-align: center;
        }

        .arch__client--any {
          color: #666;
          font-size: 0.7rem;
          background: transparent;
        }

        /* Gateway */
        .arch__box--gateway {
          min-width: 340px;
          background: rgba(255, 184, 111, 0.03);
          border-color: rgba(255, 184, 111, 0.25);
        }

        .arch__gateway-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .arch__gateway-item {
          font-family: 'Geist Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
          color: #f0ede8;
          padding: 0.5rem 0.75rem;
          background: #0d0d10;
          border: 1px solid rgba(255, 184, 111, 0.2);
          border-radius: 6px;
        }

        .arch__gateway-arrow {
          color: #FFB86F;
          opacity: 0.5;
          font-size: 0.8rem;
        }

        .arch__gateway-bottom {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding-top: 1rem;
          border-top: 1px dashed rgba(255, 184, 111, 0.15);
        }

        .arch__gateway-item--world {
          color: #4ade80;
          border-color: rgba(74, 222, 128, 0.3);
          font-size: 0.7rem;
        }

        .arch__gateway-item--obs {
          color: #60a5fa;
          border-color: rgba(96, 165, 250, 0.3);
          font-size: 0.7rem;
        }

        .arch__gateway-learn {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          color: #4ade80;
          opacity: 0.7;
        }

        /* Servers */
        .arch__box--servers {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 120px;
        }

        .arch__server {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          color: #a8a29e;
          padding: 0.4rem 0.75rem;
          background: rgba(255, 184, 111, 0.05);
          border-radius: 6px;
          text-align: center;
        }

        .arch__server--any {
          color: #666;
          font-size: 0.7rem;
          background: transparent;
        }

        /* Arrows */
        .arch__arrow {
          padding: 0 0.25rem;
        }

        .arch__arrow-svg {
          width: 50px;
          height: 24px;
        }

        /* Pillars */
        .arch__pillar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          background: rgba(255, 184, 111, 0.05);
          border: 1px solid rgba(255, 184, 111, 0.15);
        }

        .arch__pillar-num {
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          font-weight: 700;
          color: #08080a;
          background: #FFB86F;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .arch__pillar-label {
          font-family: 'Geist', sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          color: #FFB86F;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .arch__pillar--2 .arch__pillar-num {
          background: #60a5fa;
        }
        .arch__pillar--2 .arch__pillar-label {
          color: #60a5fa;
        }
        .arch__pillar--2 {
          border-color: rgba(96, 165, 250, 0.2);
          background: rgba(96, 165, 250, 0.05);
        }

        .arch__pillar--3 .arch__pillar-num {
          background: #4ade80;
        }
        .arch__pillar--3 .arch__pillar-label {
          color: #4ade80;
        }
        .arch__pillar--3 {
          border-color: rgba(74, 222, 128, 0.2);
          background: rgba(74, 222, 128, 0.05);
        }

        .arch__pillars-row {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.75rem;
        }

        /* Mobile */
        @media (max-width: 900px) {
          .arch__diagram {
            display: none;
          }

          .arch__diagram-mobile {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
          }

          .arch__mobile-block {
            width: 100%;
            max-width: 320px;
            padding: 1.25rem;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 184, 111, 0.15);
            text-align: center;
          }

          .arch__mobile-block--gateway {
            background: rgba(255, 184, 111, 0.03);
            border-color: rgba(255, 184, 111, 0.25);
          }

          .arch__mobile-label {
            font-family: 'Geist Mono', monospace;
            font-size: 0.7rem;
            font-weight: 600;
            color: #FFB86F;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.75rem;
          }

          .arch__mobile-items {
            font-family: 'Geist Mono', monospace;
            font-size: 0.8rem;
            color: #a8a29e;
          }

          .arch__mobile-features {
            display: flex;
            justify-content: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
          }

          .arch__mobile-features span {
            font-family: 'Geist Mono', monospace;
            font-size: 0.7rem;
            color: #f0ede8;
            padding: 0.4rem 0.6rem;
            background: #0d0d10;
            border: 1px solid rgba(255, 184, 111, 0.2);
            border-radius: 6px;
          }

          .arch__mobile-intelligence {
            display: flex;
            justify-content: center;
            gap: 0.75rem;
            padding-top: 0.75rem;
            border-top: 1px dashed rgba(255, 184, 111, 0.15);
          }

          .arch__mobile-world {
            font-family: 'Geist Mono', monospace;
            font-size: 0.65rem;
            color: #4ade80;
            padding: 0.3rem 0.5rem;
            background: rgba(74, 222, 128, 0.1);
            border: 1px solid rgba(74, 222, 128, 0.2);
            border-radius: 4px;
          }

          .arch__mobile-obs {
            font-family: 'Geist Mono', monospace;
            font-size: 0.65rem;
            color: #60a5fa;
            padding: 0.3rem 0.5rem;
            background: rgba(96, 165, 250, 0.1);
            border: 1px solid rgba(96, 165, 250, 0.2);
            border-radius: 4px;
          }

          .arch__mobile-arrow {
            font-size: 1.25rem;
            color: #FFB86F;
            opacity: 0.5;
          }
        }

        @media (max-width: 480px) {
          .arch {
            padding: 3rem 1.25rem;
          }

          .arch__mobile-block {
            padding: 1rem;
          }

          .arch__mobile-features span {
            font-size: 0.65rem;
            padding: 0.3rem 0.5rem;
          }
        }
        `}
      </style>
    </section>
  );
}
