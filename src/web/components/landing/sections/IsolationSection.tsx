/**
 * IsolationSection - "Autonomous, Not Reckless"
 *
 * Security section showcasing sandbox isolation and checkpoint approvals.
 * Layout: Illustration left, content right (inverse of IntelligenceSection).
 *
 * @module web/components/landing/sections/IsolationSection
 */

import { IsolationIllustration } from "../illustrations/index.ts";

export function IsolationSection() {
  return (
    <section class="relative py-20 px-8 sm:py-16 sm:px-5 bg-[#08080a]" id="isolation" aria-labelledby="iso-title">
      <div class="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div class="w-full flex items-center justify-center lg:order-2">
          <IsolationIllustration />
        </div>

        <div class="max-w-[480px] lg:max-w-full lg:order-1 text-center lg:text-left">
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-violet-400 uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
            Security
          </p>

          <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal leading-[1.15] mb-4" id="iso-title">
            <span class="block text-stone-100">Autonomous,</span>
            <span class="block text-violet-400 italic">not reckless.</span>
          </h2>

          <p class="text-[0.95rem] sm:text-sm leading-relaxed text-stone-400 mb-8">
            AI agents shouldn't have the keys to everything. Actions run in isolation
            — they can't access your data or tools without going through controlled
            checkpoints. Sensitive operations always ask before acting.
          </p>

          <div class="flex flex-col gap-4 text-left max-w-[380px] lg:max-w-full mx-auto lg:mx-0" role="list">
            <div class="flex gap-3 items-start" role="listitem">
              <div class="shrink-0 w-7 h-7 flex items-center justify-center bg-violet-400/10 rounded-md text-violet-400" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div class="flex-1 pt-0.5">
                <span class="font-sans text-[0.85rem] font-semibold text-stone-200">Sandboxed Execution</span>
                <p class="text-[0.8rem] leading-relaxed text-stone-400 mt-0.5">Code runs in isolated workers with no direct access</p>
              </div>
            </div>

            <div class="flex gap-3 items-start" role="listitem">
              <div class="shrink-0 w-7 h-7 flex items-center justify-center bg-violet-400/10 rounded-md text-violet-400" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="flex-1 pt-0.5">
                <span class="font-sans text-[0.85rem] font-semibold text-stone-200">Human-in-the-Loop</span>
                <p class="text-[0.8rem] leading-relaxed text-stone-400 mt-0.5">Dangerous actions require explicit approval</p>
              </div>
            </div>

            <div class="flex gap-3 items-start" role="listitem">
              <div class="shrink-0 w-7 h-7 flex items-center justify-center bg-violet-400/10 rounded-md text-violet-400" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <div class="flex-1 pt-0.5">
                <span class="font-sans text-[0.85rem] font-semibold text-stone-200">Audit Trail</span>
                <p class="text-[0.8rem] leading-relaxed text-stone-400 mt-0.5">Every action logged for transparency</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
