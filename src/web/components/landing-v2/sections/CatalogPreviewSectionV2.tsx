/**
 * CatalogPreviewSectionV2 - "Browse. Use. Or build your own."
 *
 * Full-width capability carousel with namespace grid.
 * HyperGraphViz shows the interconnected ecosystem of capabilities.
 *
 * @module web/components/landing-v2/sections/CatalogPreviewSectionV2
 */

import { catalogPreview } from "../../../content/landing-v2.ts";
import CapabilityCarousel from "../../../islands/CapabilityCarousel.tsx";
import { HyperGraphViz } from "../../landing/organisms/HyperGraphViz.tsx";

export function CatalogPreviewSectionV2() {
  const { capabilities, namespaces } = catalogPreview;

  return (
    <section id="catalog" class="py-20 sm:py-14 bg-[#08080a] overflow-hidden">
      {/* Header + Graph */}
      <div class="max-w-[1200px] mx-auto px-8 sm:px-5 mb-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Content */}
          <div class="text-center lg:text-left">
            <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
              {catalogPreview.label}
            </p>

            <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal leading-[1.2] text-stone-100 mb-3">
              {catalogPreview.title}
            </h2>

            <p class="text-[0.95rem] text-stone-500 max-w-[460px] mx-auto lg:mx-0 leading-relaxed mb-6">
              {catalogPreview.description}
            </p>

            {/* Namespace pills */}
            <div class="flex flex-wrap gap-2 justify-center lg:justify-start">
              {namespaces.map((ns) => (
                <a
                  href={`/catalog/ns/${ns.ns}`}
                  class="inline-flex items-center gap-1.5 py-1 px-2.5 bg-white/[0.02] border border-white/[0.06] rounded-full no-underline font-mono text-[0.65rem] text-stone-500 transition-all duration-200 hover:bg-pml-accent/5 hover:border-pml-accent/20 hover:text-stone-400"
                  key={ns.ns}
                >
                  <span>{ns.icon}</span>
                  <span>{ns.ns}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Right: HyperGraph Visualization */}
          <div class="flex items-center justify-center max-w-[480px] mx-auto lg:mx-0">
            <HyperGraphViz />
          </div>
        </div>
      </div>

      {/* Full-width carousel */}
      <CapabilityCarousel capabilities={capabilities} />

      {/* CTA */}
      <div class="text-center mt-10">
        <a
          href={catalogPreview.cta.href}
          class="font-mono text-[0.75rem] text-pml-accent no-underline py-2 px-4 border border-pml-accent/20 rounded-md transition-all duration-200 hover:bg-pml-accent/[0.06] hover:border-pml-accent/40"
        >
          {catalogPreview.cta.label} →
        </a>
      </div>
    </section>
  );
}
