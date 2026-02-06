/**
 * ProblemSection - "Today, your AI tools are black boxes"
 *
 * Creates tension by highlighting pain points with current AI tools.
 * Uses red/orange tones for icons to signify problems.
 *
 * @module web/components/landing-v2/sections/ProblemSection
 */

import { problem } from "../../../content/landing-v2.ts";
import { MaterialIcon } from "../../landing/atoms/MaterialIcon.tsx";

export function ProblemSection() {
  return (
    <section
      class="relative py-20 px-8 sm:py-16 sm:px-5 bg-[#0a0a0c]"
      id="problem"
      aria-labelledby="problem-title"
    >
      {/* Subtle dark gradient overlay */}
      <div
        class="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(239,68,68,0.04) 0%, transparent 60%)",
        }}
      />

      <div class="relative z-10 max-w-[900px] mx-auto text-center">
        {/* Label */}
        <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-red-400/80 uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
          {problem.label}
        </p>

        {/* Title */}
        <h2
          class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal leading-[1.2] mb-4 text-stone-100"
          id="problem-title"
        >
          {problem.title}
        </h2>

        {/* Subtitle */}
        <p class="text-[1rem] sm:text-[0.95rem] leading-relaxed text-stone-500 mb-12 max-w-[600px] mx-auto">
          {problem.subtitle}
        </p>

        {/* Pain Points Grid */}
        <div
          class="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8"
          role="list"
        >
          {problem.points.map((point) => (
            <div
              key={point.icon}
              class="flex flex-col items-center gap-4 p-6 bg-white/[0.02] border border-white/[0.06] rounded-xl transition-all duration-300 hover:border-red-400/20 hover:bg-red-400/[0.02]"
              role="listitem"
            >
              <div class="w-12 h-12 flex items-center justify-center bg-red-400/10 rounded-xl">
                <MaterialIcon name={point.icon} size={24} color="#f87171" />
              </div>
              <p class="font-sans text-[0.9rem] text-stone-400 leading-relaxed text-center">
                {point.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
