/**
 * CTASectionV2 - "Ready to take control?"
 *
 * Final call to action with V2 messaging.
 * Observable workflows. Deterministic execution. Your infrastructure.
 *
 * @module web/components/landing-v2/sections/CTASectionV2
 */

import { cta } from "../../../content/landing-v2.ts";

export function CTASectionV2() {
  return (
    <section class="relative py-16 px-8 sm:py-12 sm:px-5 bg-[#08080a] border-t border-white/[0.04]">
      <div class="max-w-[800px] mx-auto">
        <div class="text-center max-w-[420px] mx-auto">
          <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.25rem)] font-normal text-stone-100 mb-3">
            {cta.title}
          </h2>
          <p class="text-[0.95rem] text-stone-500 mb-8 leading-relaxed">
            {cta.description}
          </p>

          <div class="flex justify-center gap-3 flex-wrap">
            <a
              href={cta.actions.primary.href}
              class="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-semibold font-sans no-underline rounded-md bg-pml-accent text-[#08080a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(255,184,111,0.2)]"
            >
              {cta.actions.primary.label}
            </a>
            <a
              href={cta.actions.secondary.href}
              class="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-medium font-sans no-underline rounded-md text-stone-400 border border-pml-accent/20 transition-all duration-200 hover:border-pml-accent hover:text-stone-100"
            >
              {cta.actions.secondary.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
