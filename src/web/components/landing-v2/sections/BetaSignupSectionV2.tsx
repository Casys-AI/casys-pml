/**
 * BetaSignupSectionV2 - "Join the beta"
 *
 * V2 messaging: "Build on the conversational web" + "Start Building" CTA.
 * Uses Formspree for form handling.
 *
 * @module web/components/landing-v2/sections/BetaSignupSectionV2
 */

import { betaSignup } from "../../../content/landing-v2.ts";

export function BetaSignupSectionV2() {
  return (
    <section
      id="beta"
      class="relative py-20 px-8 sm:py-14 sm:px-5 bg-[#08080a] border-t border-white/[0.04]"
    >
      <p class="text-center font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
        Early Access
      </p>

      <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal text-stone-100 text-center mb-2">
        {betaSignup.title}
      </h2>
      <p class="font-sans text-[0.95rem] text-stone-500 text-center mb-8 leading-relaxed">
        {betaSignup.description}
      </p>

      <form
        class="max-w-full sm:max-w-[360px] mx-auto"
        action="https://formspree.io/f/movnynen"
        method="POST"
      >
        <div class="flex flex-col gap-4 mb-5">
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[0.65rem] font-medium text-stone-500 uppercase tracking-wide" for="beta-v2-name">
              Name
            </label>
            <input
              type="text"
              id="beta-v2-name"
              name="name"
              class="font-sans text-[0.9rem] text-stone-100 bg-white/[0.03] border border-white/[0.08] rounded-md py-2.5 px-3.5 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-pml-accent/40 focus:bg-pml-accent/[0.03]"
              placeholder="Your name"
              required
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[0.65rem] font-medium text-stone-500 uppercase tracking-wide" for="beta-v2-email">
              Email
            </label>
            <input
              type="email"
              id="beta-v2-email"
              name="email"
              class="font-sans text-[0.9rem] text-stone-100 bg-white/[0.03] border border-white/[0.08] rounded-md py-2.5 px-3.5 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-pml-accent/40 focus:bg-pml-accent/[0.03]"
              placeholder={betaSignup.form.placeholder}
              required
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[0.65rem] font-medium text-stone-500 uppercase tracking-wide" for="beta-v2-use-case">
              How will you use PML? <span class="font-normal text-stone-600 normal-case">(optional)</span>
            </label>
            <textarea
              id="beta-v2-use-case"
              name="use_case"
              class="font-sans text-[0.9rem] text-stone-100 bg-white/[0.03] border border-white/[0.08] rounded-md py-2.5 px-3.5 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-pml-accent/40 focus:bg-pml-accent/[0.03] resize-y min-h-[70px]"
              placeholder="Tell us about your workflows..."
              rows={2}
            />
          </div>
        </div>

        <button
          type="submit"
          class="inline-flex items-center justify-center gap-2 w-full py-2.5 px-5 font-sans text-sm font-semibold text-[#08080a] bg-pml-accent rounded-md cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(255,184,111,0.25)]"
        >
          {betaSignup.form.button}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        <p class="text-center text-[0.75rem] text-stone-600 mt-3">
          {betaSignup.note}
        </p>
      </form>
    </section>
  );
}
