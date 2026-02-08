/**
 * IntelligenceSection - Workflow Intelligence visualization
 *
 * Clean design matching Hero section:
 * - Left: Content (title, desc, pillars)
 * - Right: Knowledge graph visualization
 *
 * @module web/components/landing/sections/IntelligenceSection
 */

import { HyperGraphViz } from "../organisms/HyperGraphViz.tsx";
import { MaterialIcon } from "../atoms/MaterialIcon.tsx";

const features = [
  {
    icon: "hub" as const,
    title: "Community Patterns",
    desc: "Learn from thousands of workflow executions. The more people use it, the smarter it gets for everyone.",
  },
  {
    icon: "auto_awesome" as const,
    title: "Auto-Optimization",
    desc: "Your workflows improve automatically over time. No manual tuning required.",
  },
  {
    icon: "recommend" as const,
    title: "Smart Suggestions",
    desc: '"Users who ran this also used..." — discover tools you didn\'t know you needed.',
  },
];

export function IntelligenceSection() {
  return (
    <section class="relative py-20 px-8 sm:py-16 sm:px-5 bg-[#08080a]" id="intelligence">
      <div class="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div class="w-full flex items-center justify-center lg:order-2">
          <HyperGraphViz />
        </div>

        <div class="max-w-[480px] lg:max-w-full lg:order-1 text-center lg:text-left">
          <p class="font-mono text-[0.7rem] sm:text-[0.6rem] font-medium text-pml-accent uppercase tracking-[0.2em] sm:tracking-[0.15em] mb-4">
            Collective Intelligence
          </p>

          <h2 class="font-serif text-[clamp(1.5rem,3.5vw,2.5rem)] font-normal leading-[1.15] mb-4">
            <span class="block text-stone-100">Every execution</span>
            <span class="block text-pml-accent italic">makes it smarter.</span>
          </h2>

          <p class="text-[0.95rem] sm:text-sm leading-relaxed text-stone-500 mb-8">
            The more workflows run, the better the system gets. Network effects
            that compound — impossible to catch up once you start.
          </p>

          <div class="flex flex-col gap-4 text-left max-w-[400px] lg:max-w-full mx-auto lg:mx-0">
            {features.map((feature) => (
              <div class="flex gap-3 items-start" key={feature.title}>
                <div class="shrink-0 w-7 h-7 flex items-center justify-center bg-pml-accent/10 rounded-md">
                  <MaterialIcon name={feature.icon} size={14} color="#FFB86F" />
                </div>
                <div class="flex-1 pt-0.5">
                  <h3 class="font-sans text-[0.85rem] font-semibold text-stone-200 mb-0.5">
                    {feature.title}
                  </h3>
                  <p class="text-[0.8rem] leading-relaxed text-stone-500">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
