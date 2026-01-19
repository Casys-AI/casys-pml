/**
 * CapabilityCarousel - CSS Scroll-Snap Carousel with Preact
 *
 * Fresh 2.x island component with proper hydration.
 *
 * @module web/islands/CapabilityCarousel
 */

import { useRef } from "preact/hooks";

interface Capability {
  namespace: string;
  action: string;
  description: string;
  codeHtml: string;
  tools: string[];
}

interface Props {
  capabilities: Capability[];
}

export default function CapabilityCarousel({ capabilities }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "prev" | "next") => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = direction === "prev" ? -360 : 360;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  return (
    <div class="carousel-wrapper">
      {/* Navigation */}
      <button
        type="button"
        class="carousel-nav carousel-nav--prev"
        aria-label="Previous"
        onClick={() => handleScroll("prev")}
      >
        ‹
      </button>
      <button
        type="button"
        class="carousel-nav carousel-nav--next"
        aria-label="Next"
        onClick={() => handleScroll("next")}
      >
        ›
      </button>

      {/* Scroll container */}
      <div ref={scrollRef} class="carousel-scroll">
        {capabilities.map((cap) => (
          <article class="carousel-card" key={`${cap.namespace}:${cap.action}`}>
            {/* Header */}
            <header class="carousel-card__header">
              <span class="carousel-card__ns">{cap.namespace}</span>
              <span class="carousel-card__sep">:</span>
              <span class="carousel-card__action">{cap.action}</span>
            </header>

            {/* Description */}
            <p class="carousel-card__desc">{cap.description}</p>

            {/* Code */}
            <div class="carousel-card__code">
              <div class="carousel-card__code-bar">
                <span /><span /><span />
              </div>
              <pre><code dangerouslySetInnerHTML={{ __html: cap.codeHtml }} /></pre>
            </div>

            {/* Tools */}
            <footer class="carousel-card__tools">
              {cap.tools.map((tool, i) => (
                <span key={tool}>
                  {i > 0 && <span class="carousel-card__arrow">→</span>}
                  <span class="carousel-card__tool">{tool}</span>
                </span>
              ))}
            </footer>
          </article>
        ))}
      </div>

      <style>
        {`
        .carousel-wrapper {
          position: relative;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        /* Scroll container */
        .carousel-scroll {
          display: flex;
          gap: 1.5rem;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding: 1rem 0.5rem 1.5rem;
          -webkit-overflow-scrolling: touch;
        }

        /* Hide scrollbar but keep functionality */
        .carousel-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .carousel-scroll::-webkit-scrollbar {
          display: none;
        }

        /* Cards */
        .carousel-card {
          flex: 0 0 340px;
          scroll-snap-align: start;
          background: linear-gradient(160deg, #151519 0%, #0c0c0f 100%);
          border: 1px solid rgba(255, 184, 111, 0.1);
          border-radius: 14px;
          padding: 1.5rem;
          transition: border-color 0.25s, transform 0.25s;
        }

        .carousel-card:hover {
          border-color: rgba(255, 184, 111, 0.25);
          transform: translateY(-3px);
        }

        /* Header */
        .carousel-card__header {
          font-family: 'Geist Mono', monospace;
          font-size: 1.1rem;
          margin-bottom: 0.6rem;
        }

        .carousel-card__ns {
          color: #FFB86F;
        }

        .carousel-card__sep {
          color: #444;
          margin: 0 0.1em;
        }

        .carousel-card__action {
          color: #f0ede8;
        }

        /* Description */
        .carousel-card__desc {
          font-size: 0.85rem;
          color: #777;
          margin: 0 0 1.25rem;
          line-height: 1.45;
        }

        /* Code block */
        .carousel-card__code {
          background: #08080a;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 1.25rem;
        }

        .carousel-card__code-bar {
          display: flex;
          gap: 5px;
          padding: 0.6rem 0.8rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .carousel-card__code-bar span {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
        }

        .carousel-card__code-bar span:nth-child(1) { background: rgba(255, 95, 86, 0.65); }
        .carousel-card__code-bar span:nth-child(2) { background: rgba(255, 189, 46, 0.65); }
        .carousel-card__code-bar span:nth-child(3) { background: rgba(39, 201, 63, 0.65); }

        .carousel-card__code pre {
          margin: 0;
          padding: 1rem;
          overflow-x: auto;
        }

        .carousel-card__code code {
          font-family: 'Geist Mono', monospace;
          font-size: 0.72rem;
          line-height: 1.65;
          color: #a8a29e;
        }

        /* Syntax */
        .carousel-card__code .kw { color: #c792ea; }
        .carousel-card__code .fn { color: #82aaff; }
        .carousel-card__code .str { color: #c3e88d; }
        .carousel-card__code .key { color: #ffcb6b; }
        .carousel-card__code .num { color: #f78c6c; }

        /* Tools */
        .carousel-card__tools {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: center;
        }

        .carousel-card__tool {
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          color: #FFB86F;
          background: rgba(255, 184, 111, 0.08);
          padding: 0.25rem 0.5rem;
          border-radius: 5px;
          border: 1px solid rgba(255, 184, 111, 0.12);
        }

        .carousel-card__arrow {
          color: #FFB86F;
          opacity: 0.6;
          margin: 0 0.3rem;
          font-size: 0.75rem;
        }

        /* Navigation buttons */
        .carousel-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
          width: 42px;
          height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 50%;
          background: rgba(12, 12, 15, 0.95);
          color: #888;
          font-size: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(8px);
        }

        .carousel-nav:hover {
          border-color: rgba(255, 184, 111, 0.4);
          color: #FFB86F;
          transform: translateY(-50%) scale(1.05);
        }

        .carousel-nav--prev {
          left: -0.5rem;
        }

        .carousel-nav--next {
          right: -0.5rem;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .carousel-card {
            flex: 0 0 300px;
          }

          .carousel-nav {
            width: 36px;
            height: 36px;
            font-size: 1.25rem;
          }

          .carousel-nav--prev { left: 0; }
          .carousel-nav--next { right: 0; }
        }

        @media (max-width: 480px) {
          .carousel-card {
            flex: 0 0 280px;
          }
        }
        `}
      </style>
    </div>
  );
}
