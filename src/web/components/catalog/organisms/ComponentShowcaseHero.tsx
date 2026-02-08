/**
 * ComponentShowcaseHero - Hero section with rotating previews
 *
 * Prominent showcase of UI components featuring:
 * - Bold "40+ Interactive UI Components" headline
 * - 2x3 grid of live component previews
 * - One component highlighted at a time (4s rotation)
 * - Subtle glow effect on active preview
 *
 * Design: "Terminal Meets Gallery"
 * - Components treated as exhibited artworks
 * - Sophisticated-technical aesthetic
 *
 * @module web/components/catalog/organisms/ComponentShowcaseHero
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { PreviewFrame } from "../atoms/index.ts";
import {
  FEATURED_COMPONENTS,
  UI_COMPONENT_COUNT,
  getComponentById,
} from "../../../data/ui-component-categories.ts";
import { colors, fonts, rgba } from "../../../styles/catalog-theme.ts";

interface ComponentShowcaseHeroProps {
  /** Callback when a component is selected */
  onComponentSelect?: (id: string) => void;
}

export default function ComponentShowcaseHero({
  onComponentSelect,
}: ComponentShowcaseHeroProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup resume timeout on unmount (fixes F3 memory leak)
  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
    };
  }, []);

  // Auto-rotate every 4 seconds
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % FEATURED_COMPONENTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handlePreviewClick = useCallback((index: number, id: string) => {
    setActiveIndex(index);
    setIsPaused(true);
    onComponentSelect?.(id);

    // Clear any existing resume timeout
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }

    // Resume auto-rotation after 10 seconds
    resumeTimeoutRef.current = setTimeout(() => setIsPaused(false), 10000);
  }, [onComponentSelect]);

  return (
    <section class="showcase-hero">
      {/* Background effects */}
      <div class="showcase-hero__bg">
        <div class="showcase-hero__gradient" />
        <div class="showcase-hero__grid-pattern" />
      </div>

      {/* Content */}
      <div class="showcase-hero__content">
        {/* Title section */}
        <div class="showcase-hero__text">
          <h1 class="showcase-hero__title">
            <span class="showcase-hero__count">{UI_COMPONENT_COUNT}+</span>
            <span class="showcase-hero__title-text">
              Interactive UI Components
            </span>
          </h1>
          <p class="showcase-hero__subtitle">
            Rich visualizations that bring your MCP tool outputs to life.
            <br />
            <span class="showcase-hero__subtitle-accent">
              Tables, charts, diffs, maps, and more — all live and interactive.
            </span>
          </p>
        </div>

        {/* Preview grid */}
        <div
          class="showcase-hero__grid"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {FEATURED_COMPONENTS.map((id, i) => {
            const component = getComponentById(id);
            const isActive = i === activeIndex;

            return (
              <button
                key={id}
                type="button"
                class={`showcase-hero__preview ${isActive ? "active" : ""}`}
                onClick={() => handlePreviewClick(i, id)}
                title={component?.name ?? id}
              >
                <PreviewFrame
                  resourceUri={`ui://mcp-std/${id}`}
                  compact={true}
                  height={130}
                  eager={i < 3}
                />

                {/* Component name overlay */}
                <div class="showcase-hero__preview-label">
                  <span class="showcase-hero__preview-name">
                    {component?.name ?? id}
                  </span>
                </div>

                {/* Active indicator */}
                {isActive && <div class="showcase-hero__preview-glow" />}
              </button>
            );
          })}
        </div>

        {/* Navigation dots */}
        <div class="showcase-hero__dots">
          {FEATURED_COMPONENTS.map((_, i) => (
            <button
              key={i}
              type="button"
              class={`showcase-hero__dot ${i === activeIndex ? "active" : ""}`}
              onClick={() => {
                setActiveIndex(i);
                setIsPaused(true);
              }}
              aria-label={`Show component ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <style>
        {`
          .showcase-hero {
            position: relative;
            padding: 3rem 0 2.5rem;
            overflow: hidden;
          }

          /* Background */
          .showcase-hero__bg {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }

          .showcase-hero__gradient {
            position: absolute;
            inset: 0;
            background: radial-gradient(
              ellipse 80% 60% at 50% 0%,
              ${rgba(colors.accentUi, 0.08)} 0%,
              transparent 60%
            );
          }

          .showcase-hero__grid-pattern {
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(${rgba(colors.accentUi, 0.03)} 1px, transparent 1px),
              linear-gradient(90deg, ${rgba(colors.accentUi, 0.03)} 1px, transparent 1px);
            background-size: 60px 60px;
            mask-image: radial-gradient(ellipse 70% 50% at 50% 30%, black 0%, transparent 70%);
          }

          /* Content */
          .showcase-hero__content {
            position: relative;
            max-width: 900px;
            margin: 0 auto;
            padding: 0 1rem;
          }

          /* Text */
          .showcase-hero__text {
            text-align: center;
            margin-bottom: 2rem;
          }

          .showcase-hero__title {
            font-family: ${fonts.display};
            font-size: clamp(1.75rem, 5vw, 2.5rem);
            font-weight: 400;
            color: ${colors.textPrimary};
            margin: 0 0 0.75rem 0;
            line-height: 1.15;
            letter-spacing: -0.02em;
          }

          .showcase-hero__count {
            display: inline-block;
            font-family: ${fonts.mono};
            font-size: 0.9em;
            font-weight: 600;
            color: ${colors.accentUi};
            margin-right: 0.25em;
            text-shadow: 0 0 30px ${rgba(colors.accentUi, 0.4)};
          }

          .showcase-hero__title-text {
            display: inline;
          }

          .showcase-hero__subtitle {
            font-size: 0.9375rem;
            color: ${colors.textMuted};
            margin: 0;
            line-height: 1.6;
          }

          .showcase-hero__subtitle-accent {
            color: ${colors.textSecondary};
          }

          /* Grid */
          .showcase-hero__grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            perspective: 1200px;
          }

          @media (max-width: 640px) {
            .showcase-hero__grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          /* Preview cards */
          .showcase-hero__preview {
            position: relative;
            border: 1px solid ${colors.borderSubtle};
            border-radius: 10px;
            overflow: hidden;
            background: ${colors.bgDark};
            cursor: pointer;
            padding: 0;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            transform: scale(0.96);
            opacity: 0.65;
          }

          .showcase-hero__preview:hover {
            opacity: 0.85;
            transform: scale(0.98);
          }

          .showcase-hero__preview.active {
            transform: scale(1);
            opacity: 1;
            border-color: ${rgba(colors.accentUi, 0.4)};
            box-shadow:
              0 0 50px -15px ${rgba(colors.accentUi, 0.3)},
              0 0 0 1px ${rgba(colors.accentUi, 0.15)};
          }

          /* Preview label */
          .showcase-hero__preview-label {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 8px 10px;
            background: linear-gradient(
              0deg,
              ${rgba(colors.bgDarker, 0.95)} 0%,
              ${rgba(colors.bgDarker, 0.7)} 60%,
              transparent 100%
            );
          }

          .showcase-hero__preview-name {
            font-family: ${fonts.mono};
            font-size: 0.6875rem;
            font-weight: 500;
            color: ${colors.textSecondary};
            transition: color 0.2s;
          }

          .showcase-hero__preview.active .showcase-hero__preview-name {
            color: ${colors.accentUi};
          }

          /* Glow effect */
          .showcase-hero__preview-glow {
            position: absolute;
            inset: -2px;
            border-radius: 12px;
            background: linear-gradient(
              135deg,
              ${rgba(colors.accentUi, 0.15)} 0%,
              transparent 50%,
              ${rgba(colors.accentUi, 0.1)} 100%
            );
            pointer-events: none;
            animation: glowPulse 2s ease-in-out infinite;
          }

          @keyframes glowPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }

          /* Navigation dots */
          .showcase-hero__dots {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-top: 1.25rem;
          }

          .showcase-hero__dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            border: none;
            padding: 0;
            background: ${colors.borderMuted};
            cursor: pointer;
            transition: all 0.25s;
          }

          .showcase-hero__dot:hover {
            background: ${colors.borderHover};
          }

          .showcase-hero__dot.active {
            background: ${colors.accentUi};
            width: 24px;
            border-radius: 4px;
          }
        `}
      </style>
    </section>
  );
}
