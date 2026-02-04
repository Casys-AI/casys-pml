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
    <section id="catalog" class="py-4 pb-12 bg-[#08080a] overflow-hidden">
      <div class="text-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-stone-600 mb-6">
        {catalogPreview.label}
      </div>

      <CapabilityCarousel capabilities={capabilities} />

      <div class="max-w-[900px] mx-auto mt-8 px-6 flex flex-col items-center gap-6">
        <div class="flex flex-wrap gap-2 justify-center">
          {namespaces.map((ns) => (
            <a
              href={`/catalog/ns/${ns.ns}`}
              class="inline-flex items-center gap-1.5 py-1.5 px-3 bg-white/[0.02] border border-white/[0.06] rounded-full no-underline font-mono text-[0.7rem] text-stone-500 transition-all duration-200 hover:bg-white/5 hover:border-white/[0.12] hover:text-stone-400"
              key={ns.ns}
            >
              <span>{ns.icon}</span>
              <span>{ns.ns}</span>
            </a>
          ))}
        </div>
        <a
          href={catalogPreview.cta.href}
          class="font-mono text-[0.8rem] text-pml-accent no-underline py-2.5 px-5 border border-pml-accent/25 rounded-md transition-all duration-200 hover:bg-pml-accent/[0.08] hover:border-pml-accent/40"
        >
          {catalogPreview.cta.label} →
        </a>
      </div>
    </section>
  );
}
