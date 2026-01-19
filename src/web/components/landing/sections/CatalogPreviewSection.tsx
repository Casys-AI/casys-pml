/**
 * CatalogPreviewSection - Full-width capability carousel
 *
 * @module web/components/landing/sections/CatalogPreviewSection
 */

import { catalogPreview } from "../../../content/landing.ts";
import CapabilityCarousel from "../../../islands/CapabilityCarousel.tsx";

export function CatalogPreviewSection() {
  const { capabilities, namespaces } = catalogPreview;

  return (
    <section id="catalog" class="catalog-section">
      {/* Label */}
      <div class="catalog-section__label">
        {catalogPreview.label}
      </div>

      {/* Full-width Carousel */}
      <CapabilityCarousel capabilities={capabilities} />

      {/* Namespace chips + CTA */}
      <div class="catalog-section__footer">
        <div class="catalog-section__chips">
          {namespaces.map((ns) => (
            <a href={`/catalog/ns/${ns.ns}`} class="catalog-section__chip" key={ns.ns}>
              <span>{ns.icon}</span>
              <span>{ns.ns}</span>
            </a>
          ))}
        </div>
        <a href={catalogPreview.cta.href} class="catalog-section__cta">
          {catalogPreview.cta.label} →
        </a>
      </div>

      <style>
        {`
        .catalog-section {
          padding: 1rem 0 3rem;
          background: #08080a;
          overflow: hidden;
        }

        .catalog-section__label {
          text-align: center;
          font-family: 'Geist Mono', monospace;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #555;
          margin-bottom: 1.5rem;
        }

        .catalog-section__footer {
          max-width: 900px;
          margin: 2rem auto 0;
          padding: 0 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .catalog-section__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }

        .catalog-section__chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem 0.7rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 100px;
          text-decoration: none;
          font-family: 'Geist Mono', monospace;
          font-size: 0.7rem;
          color: #888;
          transition: all 0.2s;
        }

        .catalog-section__chip:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.12);
          color: #bbb;
        }

        .catalog-section__cta {
          font-family: 'Geist Mono', monospace;
          font-size: 0.8rem;
          color: #FFB86F;
          text-decoration: none;
          padding: 0.6rem 1.2rem;
          border: 1px solid rgba(255,184,111,0.25);
          border-radius: 6px;
          transition: all 0.2s;
        }

        .catalog-section__cta:hover {
          background: rgba(255,184,111,0.08);
          border-color: rgba(255,184,111,0.4);
        }
        `}
      </style>
    </section>
  );
}
