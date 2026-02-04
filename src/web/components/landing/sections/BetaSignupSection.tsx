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
    <section
      id="beta"
      class="relative py-20 px-8 sm:py-16 sm:px-5 bg-gradient-to-b from-[#08080a] via-[#0a0a0d] to-[#08080a] before:content-[''] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-[60%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-400/20 before:to-transparent"
    >
      <div class="text-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-amber-400 mb-6">
        Early Access
      </div>

      <h2 class="font-serif text-[clamp(1.75rem,3vw,2.25rem)] font-normal text-stone-100 text-center m-0 mb-3">
        Join the Beta
      </h2>
      <p class="font-sans text-base text-stone-600 text-center m-0 mb-10 leading-relaxed">
        Be among the first to give your agents procedural memory.
        <br class="hidden sm:inline" />
        We'll reach out with access details.
      </p>

      <form
        class="max-w-[480px] sm:max-w-full mx-auto"
        action="https://formspree.io/f/movnynen"
        method="POST"
      >
        <div class="flex flex-col gap-5 mb-6">
          <div class="flex flex-col gap-2">
            <label class="font-mono text-[0.75rem] font-medium text-stone-500 uppercase tracking-[0.05em]" for="beta-name">
              Name
            </label>
            <input
              type="text"
              id="beta-name"
              name="name"
              class="font-sans text-[0.95rem] sm:text-base text-stone-100 bg-white/[0.03] border border-amber-400/15 rounded-lg py-3.5 px-4 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-amber-400/50 focus:bg-amber-400/5 focus:ring-[3px] focus:ring-amber-400/10"
              placeholder="Your name"
              required
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="font-mono text-[0.75rem] font-medium text-stone-500 uppercase tracking-[0.05em]" for="beta-email">
              Email
            </label>
            <input
              type="email"
              id="beta-email"
              name="email"
              class="font-sans text-[0.95rem] sm:text-base text-stone-100 bg-white/[0.03] border border-amber-400/15 rounded-lg py-3.5 px-4 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-amber-400/50 focus:bg-amber-400/5 focus:ring-[3px] focus:ring-amber-400/10"
              placeholder="you@company.com"
              required
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="font-mono text-[0.75rem] font-medium text-stone-500 uppercase tracking-[0.05em]" for="beta-use-case">
              How will you use PML? <span class="font-normal text-stone-600 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id="beta-use-case"
              name="use_case"
              class="font-sans text-[0.95rem] sm:text-base text-stone-100 bg-white/[0.03] border border-amber-400/15 rounded-lg py-3.5 px-4 transition-all duration-200 placeholder:text-stone-700 focus:outline-none focus:border-amber-400/50 focus:bg-amber-400/5 focus:ring-[3px] focus:ring-amber-400/10 resize-y min-h-[80px]"
              placeholder="Tell us about your agents and what you'd like them to learn..."
              rows={3}
            />
          </div>
        </div>

        <button
          type="submit"
          class="inline-flex items-center justify-center gap-2 w-full py-4 px-6 font-sans text-[0.95rem] font-semibold text-[#08080a] bg-amber-400 border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,184,111,0.3)] active:translate-y-0"
        >
          Request Access
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </section>
  );
}
