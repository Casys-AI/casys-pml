/**
 * QuickStartSection - Terminal-inspired quick start guide
 *
 * Minimal, elegant 3-step guide with code snippets.
 * Design: Refined terminal aesthetic with amber accents.
 *
 * @module web/components/landing/sections/QuickStartSection
 */

import { quickStart } from "../../../content/landing.ts";

export function QuickStartSection() {
  const { steps } = quickStart;

  return (
    <section id="quickstart" class="relative py-20 px-8 sm:py-16 sm:px-4 bg-[#08080a]">
      <div class="text-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-stone-600 mb-6">
        {quickStart.label}
      </div>

      <h2 class="font-serif text-[clamp(1.75rem,3vw,2.25rem)] font-normal text-stone-100 text-center m-0 mb-2">
        {quickStart.title}
      </h2>
      <p class="font-sans text-base text-stone-600 text-center m-0 mb-12">
        {quickStart.subtitle}
      </p>

      <div class="max-w-[640px] sm:max-w-full mx-auto flex flex-col">
        {steps.map((step, index) => (
          <div
            class={`grid grid-cols-[40px_1fr] sm:grid-cols-[28px_1fr] gap-6 sm:gap-3 opacity-0 ${
              index === 0 ? "animate-fade-in-step-1" : index === 1 ? "animate-fade-in-step-2" : "animate-fade-in-step-3"
            }`}
            key={step.id}
          >
            <div class="flex flex-col items-center">
              <span class="w-8 h-8 sm:w-[26px] sm:h-[26px] flex items-center justify-center font-mono text-[0.8rem] sm:text-[0.7rem] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/25 rounded-lg shrink-0">
                {index + 1}
              </span>
              {index < steps.length - 1 && (
                <div class="w-px flex-1 min-h-[40px] bg-gradient-to-b from-amber-400/30 to-amber-400/5 my-2" />
              )}
            </div>

            <div class="pb-8">
              <h3 class="font-sans text-base font-semibold text-stone-100 mt-1 mb-2">
                {step.title}
              </h3>
              <p class="font-sans text-[0.875rem] sm:text-[0.8rem] text-stone-600 m-0 mb-4 leading-normal break-words">
                {step.description}
              </p>

              <div class="bg-[#0c0c0f] border border-white/[0.06] rounded-[10px] overflow-hidden sm:max-w-full">
                <div class="flex items-center gap-1.5 py-2.5 px-3.5 bg-white/[0.02] border-b border-white/[0.04]">
                  <span class="w-2 h-2 rounded-full bg-red-500/50" />
                  <span class="w-2 h-2 rounded-full bg-yellow-500/50" />
                  <span class="w-2 h-2 rounded-full bg-green-500/50" />
                  <span class="ml-auto font-mono text-[0.65rem] text-stone-600">
                    {step.filename}
                  </span>
                </div>
                <pre class="m-0 p-4 sm:p-3 overflow-x-auto sm:touch-pan-x">
                  <code
                    class="font-mono text-[0.8rem] sm:text-[0.65rem] leading-relaxed text-stone-400 sm:whitespace-pre sm:block [&_.cmd]:text-amber-400 [&_.flag]:text-blue-400 [&_.str]:text-green-400 [&_.comment]:text-stone-600 [&_.comment]:italic [&_.output]:text-green-400 [&_.dim]:text-stone-600"
                    dangerouslySetInnerHTML={{ __html: step.codeHtml }}
                  />
                </pre>
              </div>

              {step.result && (
                <div class="inline-flex items-center gap-2 mt-3 py-1.5 px-3 bg-green-400/[0.08] border border-green-400/20 rounded-md">
                  <span class="text-green-400 text-[0.85rem]">✓</span>
                  <span class="font-mono text-[0.75rem] text-green-400">{step.result}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div class="text-center mt-8 opacity-0 animate-fade-in-step-4">
        <a
          href={quickStart.cta.href}
          class="inline-flex items-center gap-2 py-3 px-5 font-mono text-[0.8rem] font-medium text-amber-400 no-underline bg-transparent border border-amber-400/25 rounded-lg transition-all duration-200 hover:bg-amber-400/[0.08] hover:border-amber-400/50 hover:translate-x-1"
        >
          {quickStart.cta.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </section>
  );
}
