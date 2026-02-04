/**
 * CTASection - Final call to action
 *
 * @module web/components/landing/sections/CTASection
 */

import { cta } from "../../../content/landing.ts";

export function CTASection() {
  return (
    <section class="relative z-10 py-20 px-8 bg-[#08080a] border-t border-amber-400/[0.08]">
      <div class="max-w-[1200px] mx-auto">
        <div class="text-center max-w-[600px] mx-auto">
          <h2 class="font-serif text-4xl md:text-[2rem] font-normal text-stone-100 mb-4">
            {cta.title}
          </h2>
          <p class="text-lg text-stone-400 mb-8 leading-relaxed">
            {cta.description}
          </p>

          <div class="flex justify-center gap-4 flex-wrap md:flex-col">
            <a
              href={cta.actions.primary.href}
              class="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold font-sans no-underline rounded-lg bg-amber-400 text-[#08080a] border-none cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5"
              target="_blank"
              rel="noopener"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {cta.actions.primary.label}
            </a>
            <a
              href={cta.actions.secondary.href}
              class="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold font-sans no-underline rounded-lg bg-transparent text-amber-400 border border-amber-400 cursor-pointer transition-all duration-200 hover:bg-amber-400 hover:text-[#08080a]"
            >
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
    </section>
  );
}
