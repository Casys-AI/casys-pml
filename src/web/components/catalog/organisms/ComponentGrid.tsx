/**
 * ComponentGrid - Grid of UI components by category
 *
 * Displays all 40 UI components organized by category with:
 * - Collapsible category sections
 * - Live preview thumbnails
 * - Search/filter support
 *
 * @module web/components/catalog/organisms/ComponentGrid
 */

import { useMemo, useState } from "preact/hooks";
import { CategoryLabel } from "../atoms/index.ts";
import { ComponentCard } from "../molecules/index.ts";
import {
  UI_COMPONENT_CATEGORIES,
  buildComponentMeta,
  type UIComponentMeta,
} from "../../../data/ui-component-categories.ts";

interface ComponentGridProps {
  /** Search filter query */
  searchQuery?: string;
  /** Callback when component is selected */
  onComponentSelect?: (id: string) => void;
  /** Initially collapsed categories */
  initialCollapsed?: string[];
}

export default function ComponentGrid({
  searchQuery = "",
  onComponentSelect,
  initialCollapsed = [],
}: ComponentGridProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(initialCollapsed)
  );

  // Get all components
  const allComponents = useMemo(() => buildComponentMeta(), []);

  // Filter by search query
  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return allComponents;

    const q = searchQuery.toLowerCase();
    return allComponents.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.includes(q))
    );
  }, [allComponents, searchQuery]);

  // Group by category
  const componentsByCategory = useMemo(() => {
    const grouped = new Map<string, UIComponentMeta[]>();

    for (const [categoryKey] of Object.entries(UI_COMPONENT_CATEGORIES)) {
      const categoryComponents = filteredComponents.filter(
        (c) => c.category === categoryKey
      );
      if (categoryComponents.length > 0) {
        grouped.set(categoryKey, categoryComponents);
      }
    }

    return grouped;
  }, [filteredComponents]);

  // Toggle category collapse
  const toggleCategory = (categoryKey: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  // Track component index for staggered animations
  let globalIndex = 0;

  if (filteredComponents.length === 0) {
    return (
      <div class="component-grid-empty">
        <span class="component-grid-empty__icon">🔍</span>
        <p class="component-grid-empty__text">
          No components match "{searchQuery}"
        </p>
        <style>
          {`
            .component-grid-empty {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 4rem 2rem;
              color: #6b6560;
            }

            .component-grid-empty__icon {
              font-size: 2.5rem;
              opacity: 0.5;
              margin-bottom: 1rem;
            }

            .component-grid-empty__text {
              font-size: 0.9375rem;
              margin: 0;
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div class="component-grid">
      {Array.from(componentsByCategory.entries()).map(
        ([categoryKey, components]) => {
          const category = UI_COMPONENT_CATEGORIES[categoryKey];
          const isCollapsed = collapsedCategories.has(categoryKey);

          return (
            <section key={categoryKey} class="component-grid__section">
              {/* Category header */}
              <CategoryLabel
                icon={category.icon}
                label={category.label}
                count={components.length}
                accentColor={category.accentColor}
                collapsed={isCollapsed}
                onClick={() => toggleCategory(categoryKey)}
              />

              {/* Component cards grid */}
              {!isCollapsed && (
                <div class="component-grid__cards">
                  {components.map((component) => {
                    const cardIndex = globalIndex++;
                    return (
                      <ComponentCard
                        key={component.id}
                        component={component}
                        index={cardIndex}
                        onSelect={onComponentSelect}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        }
      )}

      <style>
        {`
          .component-grid {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .component-grid__section {
            /* Each category section */
          }

          .component-grid__cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 16px;
            padding: 0 0 1.5rem 0;
          }

          @media (max-width: 640px) {
            .component-grid__cards {
              grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
              gap: 12px;
            }
          }
        `}
      </style>
    </div>
  );
}
