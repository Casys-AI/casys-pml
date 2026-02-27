/**
 * ComponentCard - UI Component preview card
 *
 * Displays a UI component with live preview thumbnail,
 * name, description, and category badge.
 *
 * Design: "Terminal Meets Gallery" aesthetic
 * - Sophisticated-technical like a gallery for developers
 * - Components treated as exhibited artworks
 *
 * @module web/components/catalog/molecules/ComponentCard
 */

import type { UIComponentMeta } from "../../../data/ui-component-categories.ts";
import { UI_COMPONENT_CATEGORIES } from "../../../data/ui-component-categories.ts";
import { PreviewFrame, ComponentBadge } from "../atoms/index.ts";
import { colors, fonts, borders, rgba } from "../../../styles/catalog-theme.ts";

interface ComponentCardProps {
  /** Component metadata */
  component: UIComponentMeta;
  /** Index for staggered animation */
  index?: number;
  /** Click handler */
  onSelect?: (id: string) => void;
}

export default function ComponentCard({
  component,
  index = 0,
  onSelect,
}: ComponentCardProps) {
  const category = UI_COMPONENT_CATEGORIES[component.category];
  const accentColor = category?.accentColor ?? colors.accentUi;
  const animationDelay = Math.min(index * 30, 300);

  return (
    <>
      <a
        href={`#${component.id}`}
        class={`cc-card cc-card--${component.category}`}
        onClick={(e) => {
          if (onSelect) {
            e.preventDefault();
            onSelect(component.id);
          }
        }}
        style={{ animationDelay: `${animationDelay}ms` }}
        data-accent={accentColor}
      >
        {/* Preview thumbnail */}
        <div class="cc-preview">
          <PreviewFrame
            resourceUri={component.resourceUri}
            compact={true}
            height={140}
          />

          {/* Category badge overlay */}
          <div class="cc-badge-wrap">
            <ComponentBadge type="ui" size="sm" />
          </div>

          {/* Gradient overlay */}
          <div class="cc-gradient" />
        </div>

        {/* Info section */}
        <div class="cc-info">
          <h3 class="cc-name">{component.name}</h3>
          <p class="cc-desc">{component.description}</p>

          {/* Category indicator */}
          <div class="cc-category">
            <span class="cc-category-icon">{category?.icon}</span>
            <span class="cc-category-label" style={{ color: accentColor }}>
              {category?.label}
            </span>
          </div>
        </div>
      </a>

      <style>
        {`
          @keyframes ccAppear {
            from {
              opacity: 0;
              transform: translateY(12px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .cc-card {
            display: block;
            text-decoration: none;
            background: ${colors.bgDark};
            border: 1px solid ${colors.borderSubtle};
            border-radius: ${borders.radius["3xl"]};
            overflow: hidden;
            cursor: pointer;
            animation: ccAppear 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .cc-card:hover {
            border-color: ${rgba(colors.accentUi, 0.3)};
            transform: translateY(-4px);
            box-shadow:
              0 20px 40px -15px rgba(0, 0, 0, 0.5),
              0 0 0 1px ${rgba(colors.accentUi, 0.15)},
              0 0 30px -10px ${rgba(colors.accentUi, 0.1)};
          }

          .cc-preview {
            height: 140px;
            background: ${colors.bgDarker};
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            position: relative;
            overflow: hidden;
          }

          .cc-preview::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(
              135deg,
              transparent 0%,
              ${rgba(colors.accentUi, 0.03)} 50%,
              transparent 100%
            );
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 1;
            pointer-events: none;
          }

          .cc-card:hover .cc-preview::before {
            opacity: 1;
          }

          .cc-badge-wrap {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 2;
          }

          .cc-gradient {
            position: absolute;
            inset: 0;
            background: linear-gradient(
              180deg,
              transparent 50%,
              ${rgba(colors.bgDark, 0.8)} 100%
            );
            pointer-events: none;
          }

          .cc-info {
            padding: 14px 16px;
          }

          .cc-name {
            margin: 0 0 6px 0;
            font-family: ${fonts.mono};
            font-size: 0.875rem;
            font-weight: 500;
            color: ${colors.textPrimary};
            letter-spacing: -0.01em;
            transition: color 0.2s;
          }

          .cc-card:hover .cc-name {
            color: ${colors.accentUi};
          }

          .cc-desc {
            margin: 0;
            font-size: 0.75rem;
            color: ${colors.textMuted};
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .cc-category {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .cc-category-icon {
            font-size: 0.75rem;
          }

          .cc-category-label {
            font-size: 0.6875rem;
            font-family: ${fonts.mono};
            opacity: 0.8;
          }
        `}
      </style>
    </>
  );
}
