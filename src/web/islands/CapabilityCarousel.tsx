/**
 * CapabilityCarousel - CSS Scroll-Snap Carousel with Preact
 *
 * Fresh 2.x island component with proper hydration.
 *
 * @module web/islands/CapabilityCarousel
 */

import { useRef, useState, useEffect } from "preact/hooks";

interface Capability {
  namespace: string;
  action: string;
  description: string;
  codeHtml: string;
  tools: string[];
}

interface Props {
  capabilities: Capability[];
}

export default function CapabilityCarousel({ capabilities }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    if (isPaused || isDragging) return;

    const interval = setInterval(() => {
      const container = scrollRef.current;
      if (!container) return;

      const maxScroll = container.scrollWidth - container.clientWidth;
      const isAtEnd = container.scrollLeft >= maxScroll - 10;

      if (isAtEnd) {
        container.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        container.scrollBy({ left: 360, behavior: "smooth" });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, isDragging]);

  const handleScroll = (direction: "prev" | "next") => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = direction === "prev" ? -360 : 360;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  const handleMouseDown = (e: MouseEvent) => {
    const container = scrollRef.current;
    if (!container) return;
    setIsDragging(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const container = scrollRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      class="relative w-full max-w-[1200px] mx-auto px-12 md:px-12 max-[480px]:px-0"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <button
        type="button"
        class="absolute top-1/2 -translate-y-1/2 z-10 w-[46px] h-[46px] border border-pml-accent/30 rounded-full bg-stone-950/[0.98] text-pml-accent text-[1.6rem] cursor-pointer transition-all duration-200 flex items-center justify-center backdrop-blur-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:border-pml-accent/60 hover:bg-pml-accent/15 hover:scale-[1.08] hover:shadow-[0_4px_24px_rgba(255,184,111,0.2)] left-3 md:left-3 max-[768px]:w-9 max-[768px]:h-9 max-[768px]:text-xl max-[768px]:left-1 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:text-[1.1rem] max-[480px]:top-auto max-[480px]:bottom-0 max-[480px]:translate-y-0 max-[480px]:left-[calc(50%-40px)]"
        aria-label="Previous"
        onClick={() => handleScroll("prev")}
      >
        ‹
      </button>
      <button
        type="button"
        class="absolute top-1/2 -translate-y-1/2 z-10 w-[46px] h-[46px] border border-pml-accent/30 rounded-full bg-stone-950/[0.98] text-pml-accent text-[1.6rem] cursor-pointer transition-all duration-200 flex items-center justify-center backdrop-blur-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:border-pml-accent/60 hover:bg-pml-accent/15 hover:scale-[1.08] hover:shadow-[0_4px_24px_rgba(255,184,111,0.2)] right-3 md:right-3 max-[768px]:w-9 max-[768px]:h-9 max-[768px]:text-xl max-[768px]:right-1 max-[480px]:w-8 max-[480px]:h-8 max-[480px]:text-[1.1rem] max-[480px]:top-auto max-[480px]:bottom-0 max-[480px]:translate-y-0 max-[480px]:right-[calc(50%-40px)]"
        aria-label="Next"
        onClick={() => handleScroll("next")}
      >
        ›
      </button>

      <div
        ref={scrollRef}
        class={`flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth p-4 pb-6 cursor-grab select-none scroll-pl-4 scrollbar-none max-[480px]:gap-4 max-[480px]:p-3 max-[480px]:pb-5 ${isDragging ? "cursor-grabbing !snap-none !scroll-auto" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {capabilities.map((cap) => (
          <article
            class="flex-[0_0_340px] snap-start bg-gradient-to-br from-stone-900 to-stone-950 border border-amber-500/10 rounded-[14px] p-6 transition-all duration-300 last:mr-4 hover:border-amber-500/25 hover:-translate-y-[3px] max-[768px]:flex-[0_0_300px] max-[480px]:flex-[0_0_calc(100vw-2rem)] max-[480px]:p-5 max-[480px]:last:mr-4"
            key={`${cap.namespace}:${cap.action}`}
          >
            <header class="font-mono text-[1.1rem] mb-2.5 max-[480px]:text-base">
              <span class="text-pml-accent">{cap.namespace}</span>
              <span class="text-stone-700 mx-[0.1em]">:</span>
              <span class="text-stone-100">{cap.action}</span>
            </header>

            <p class="text-[0.85rem] text-stone-500 m-0 mb-5 leading-[1.45]">{cap.description}</p>

            <div class="bg-stone-950 border border-white/5 rounded-[10px] overflow-hidden mb-5">
              <div class="flex gap-[5px] py-2.5 px-3 bg-white/[0.02] border-b border-white/[0.03]">
                <span class="w-[9px] h-[9px] rounded-full bg-red-400/65" />
                <span class="w-[9px] h-[9px] rounded-full bg-yellow-400/65" />
                <span class="w-[9px] h-[9px] rounded-full bg-green-500/65" />
              </div>
              <pre class="m-0 p-4 overflow-x-auto">
                <code class="font-mono text-[0.78rem] leading-[1.6] text-stone-400 max-[480px]:text-[0.7rem]" dangerouslySetInnerHTML={{ __html: cap.codeHtml }} />
              </pre>
            </div>

            <footer class="flex flex-wrap gap-1.5 items-center">
              {cap.tools.map((tool, i) => (
                <span key={tool}>
                  {i > 0 && <span class="text-pml-accent opacity-60 mx-1.5 text-xs">→</span>}
                  <span class="font-mono text-[0.7rem] text-pml-accent bg-amber-500/10 py-1 px-2 rounded-[5px] border border-amber-500/15">{tool}</span>
                </span>
              ))}
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
