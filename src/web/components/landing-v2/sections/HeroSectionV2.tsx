/**
 * HeroSectionV2 - "The Gateway for the Conversational Web"
 *
 * New messaging: Gateway positioning, no "learns" language.
 * Pillars: Observable, Deterministic, Self-Hosted
 *
 * Illustration: ChatAppEmergence - "Parlez. L'application apparaît."
 *
 * @module web/components/landing-v2/sections/HeroSectionV2
 */

import { hero } from "../../../content/landing-v2.ts";
import { MaterialIcon } from "../../landing/atoms/MaterialIcon.tsx";
import HeroChatAppIsland from "../../../islands/HeroChatAppIsland.tsx";

export function HeroSectionV2() {
  return (
    <section class="relative min-h-screen flex flex-col justify-center pt-24 pb-16 px-6 sm:pt-20 sm:pb-12 sm:px-4 bg-[#08080a] overflow-hidden">
      {/* Subtle radial gradient */}
      <div
        class="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,184,111,0.12) 0%, transparent 50%)",
        }}
      />

      <div class="relative z-10 max-w-[1300px] w-full mx-auto flex flex-col items-center gap-10 px-4">
        {/* Header: Centered with clear hierarchy */}
        <div class="text-center max-w-[680px]">
          {/* Eyebrow */}
          <p class="font-mono text-[0.65rem] font-medium text-pml-accent uppercase tracking-[0.2em] mb-3 opacity-0 animate-fade-up">
            {hero.eyebrow}
          </p>

          {/* Title */}
          <h1 class="font-serif text-[clamp(2.2rem,5vw,3.5rem)] font-normal leading-[1.1] mb-4 opacity-0 animate-fade-up-delay-1">
            <span class="text-stone-100">{hero.title.line1} </span>
            <span class="text-pml-accent italic">{hero.title.accent}</span>
          </h1>

          {/* Description */}
          <p class="text-base leading-relaxed text-stone-400 mb-5 opacity-0 animate-fade-up-delay-2">
            {hero.description}
          </p>

          {/* CTAs - centered, together */}
          <div class="flex flex-wrap items-center justify-center gap-3 mb-6 opacity-0 animate-fade-up-delay-3">
            <a
              href={hero.cta.primary.href}
              class="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-semibold font-sans no-underline rounded-lg bg-pml-accent text-[#08080a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(255,184,111,0.25)]"
            >
              {hero.cta.primary.label}
              <MaterialIcon name="arrow_downward" size={14} />
            </a>
            <a
              href={hero.cta.secondary.href}
              class="inline-flex items-center py-2.5 px-5 text-sm font-medium font-sans no-underline rounded-lg text-stone-400 border border-white/10 transition-all duration-200 hover:border-pml-accent/50 hover:text-stone-200"
            >
              {hero.cta.secondary.label}
            </a>
          </div>

          {/* Pillars - trust indicators, separate line */}
          <div class="flex items-center justify-center gap-6 opacity-0 animate-fade-up-delay-3">
            {hero.pillars.map((pillar) => (
              <div class="flex items-center gap-1.5" key={pillar.label}>
                <MaterialIcon name={pillar.icon} size={12} color="#FFB86F" />
                <span class="font-mono text-[0.6rem] text-stone-500 uppercase tracking-wide">
                  {pillar.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Illustration */}
        <div class="w-full flex justify-center opacity-0 animate-fade-up-delay-4">
          <HeroChatAppIsland />
        </div>
      </div>
    </section>
  );
}
