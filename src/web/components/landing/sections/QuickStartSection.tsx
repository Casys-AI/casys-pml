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
    <section id="quickstart" class="relative py-16 px-8 sm:py-12 sm:px-4 bg-[#08080a]">
      <p class="text-center font-mono text-[0.7rem] uppercase tracking-[0.2em] text-pml-accent mb-4">
        {quickStart.label}
      </p>

      <h2 class="font-serif text-[clamp(1.5rem,3vw,2.25rem)] font-normal text-stone-100 text-center mb-2">
        {quickStart.title}
      </h2>
      <p class="font-sans text-[0.95rem] text-stone-500 text-center mb-10">
        {quickStart.subtitle}
      </p>

      <div class="max-w-full sm:max-w-[440px] mx-auto flex flex-col">
        {steps.map((step, index) => (
          <div
            class="grid grid-cols-[28px_1fr] sm:grid-cols-[24px_1fr] gap-4 sm:gap-3"
            key={step.id}
          >
            <div class="flex flex-col items-center">
              <span class="w-6 h-6 flex items-center justify-center font-mono text-[0.7rem] font-semibold text-pml-accent bg-pml-accent/10 rounded shrink-0">
                {index + 1}
              </span>
              {index < steps.length - 1 && (
                <div class="w-px flex-1 min-h-[24px] bg-gradient-to-b from-pml-accent/20 to-transparent my-1.5" />
              )}
            </div>

            <div class="pb-5">
              <h3 class="font-sans text-[0.85rem] font-semibold text-stone-200 mb-1">
                {step.title}
              </h3>
              <p class="font-sans text-[0.75rem] text-stone-500 mb-2.5 leading-relaxed">
                {step.description}
              </p>

              <div class="bg-[#0c0c0f] border border-white/[0.06] rounded-lg overflow-hidden">
                <div class="flex items-center gap-1.5 py-2 px-3 bg-white/[0.02] border-b border-white/[0.04]">
                  <span class="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                  <span class="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                  <span class="ml-auto font-mono text-[0.6rem] text-stone-600">
                    {step.filename}
                  </span>
                </div>
                <pre class="m-0 p-3 sm:p-2.5 overflow-x-auto">
                  <code
                    class="font-mono text-[0.7rem] sm:text-[0.6rem] leading-relaxed text-stone-400 [&_.cmd]:text-pml-accent [&_.flag]:text-blue-400 [&_.str]:text-green-400 [&_.comment]:text-stone-600 [&_.comment]:italic [&_.output]:text-green-400 [&_.dim]:text-stone-600"
                    dangerouslySetInnerHTML={{ __html: step.codeHtml }}
                  />
                </pre>
              </div>

              {step.result && (
                <div class="inline-flex items-center gap-1.5 mt-2.5 py-1 px-2.5 bg-green-400/[0.08] border border-green-400/20 rounded">
                  <span class="text-green-400 text-[0.75rem]">✓</span>
                  <span class="font-mono text-[0.65rem] text-green-400">{step.result}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div class="text-center mt-6">
        <a
          href={quickStart.cta.href}
          class="inline-flex items-center gap-2 py-2 px-4 font-mono text-[0.75rem] text-pml-accent no-underline border border-pml-accent/20 rounded-md transition-all duration-200 hover:bg-pml-accent/[0.06] hover:border-pml-accent/40"
        >
          {quickStart.cta.label} →
        </a>
      </div>
    </section>
  );
}
