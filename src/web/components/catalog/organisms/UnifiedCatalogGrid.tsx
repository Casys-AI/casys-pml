/**
 * UnifiedCatalogGrid - Unified view of all catalog items
 *
 * Displays Tools (L0), Capabilities (L1-L6), and UI Components
 * in a single filterable grid with level indicators.
 *
 * @module web/components/catalog/organisms/UnifiedCatalogGrid
 */

import { useMemo, useState } from "preact/hooks";
import UnifiedItemCard, { type UnifiedItem, type ItemType } from "../molecules/UnifiedItemCard.tsx";
import LevelBadge from "../atoms/LevelBadge.tsx";

interface UnifiedCatalogGridProps {
  items: UnifiedItem[];
  /** Default filter for item types */
  defaultTypes?: ItemType[];
  /** Show level filter chips */
  showLevelFilter?: boolean;
  /** Compact mode for denser display */
  compact?: boolean;
}

type LevelFilter = "all" | 0 | 1 | 2 | 3 | 4 | 5 | 6 | "ui";

export default function UnifiedCatalogGrid({
  items,
  defaultTypes: _defaultTypes,
  showLevelFilter = true,
  compact = false,
}: UnifiedCatalogGridProps) {
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  // Get unique levels from items
  const availableLevels = useMemo(() => {
    const levels = new Set<LevelFilter>();
    items.forEach((item) => {
      if (item.type === "tool") levels.add(0);
      else if (item.type === "ui") levels.add("ui");
      else levels.add((item.level ?? 1) as LevelFilter);
    });
    return Array.from(levels).sort((a, b) => {
      if (a === "ui") return 1;
      if (b === "ui") return -1;
      return (a as number) - (b as number);
    });
  }, [items]);

  // Count by type
  const typeCounts = useMemo(() => {
    const counts = { tool: 0, capability: 0, ui: 0 };
    items.forEach((item) => counts[item.type]++);
    return counts;
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Type filter
      if (typeFilter !== "all" && item.type !== typeFilter) return false;

      // Level filter
      if (levelFilter !== "all") {
        if (levelFilter === "ui" && item.type !== "ui") return false;
        if (levelFilter === 0 && item.type !== "tool") return false;
        if (typeof levelFilter === "number" && levelFilter > 0) {
          if (item.type !== "capability" || (item.level ?? 1) !== levelFilter) return false;
        }
      }

      return true;
    });
  }, [items, typeFilter, levelFilter]);

  return (
    <div class="unified-catalog-grid">
      {/* Filter bar */}
      <div class="unified-catalog-grid__filters">
        {/* Type filter chips */}
        <div class="filter-group">
          <span class="filter-label">Type</span>
          <div class="filter-chips">
            <button
              type="button"
              class={`filter-chip ${typeFilter === "all" ? "active" : ""}`}
              onClick={() => setTypeFilter("all")}
            >
              Tous
              <span class="chip-count">{items.length}</span>
            </button>
            <button
              type="button"
              class={`filter-chip filter-chip--tool ${typeFilter === "tool" ? "active" : ""}`}
              onClick={() => setTypeFilter("tool")}
            >
              Tools
              <span class="chip-count">{typeCounts.tool}</span>
            </button>
            <button
              type="button"
              class={`filter-chip filter-chip--capability ${typeFilter === "capability" ? "active" : ""}`}
              onClick={() => setTypeFilter("capability")}
            >
              Capabilities
              <span class="chip-count">{typeCounts.capability}</span>
            </button>
            <button
              type="button"
              class={`filter-chip filter-chip--ui ${typeFilter === "ui" ? "active" : ""}`}
              onClick={() => setTypeFilter("ui")}
            >
              UI
              <span class="chip-count">{typeCounts.ui}</span>
            </button>
          </div>
        </div>

        {/* Level filter chips */}
        {showLevelFilter && availableLevels.length > 1 && (
          <div class="filter-group">
            <span class="filter-label">Niveau</span>
            <div class="filter-chips">
              <button
                type="button"
                class={`filter-chip filter-chip--level ${levelFilter === "all" ? "active" : ""}`}
                onClick={() => setLevelFilter("all")}
              >
                Tous
              </button>
              {availableLevels.map((level) => (
                <button
                  key={String(level)}
                  type="button"
                  class={`filter-chip filter-chip--level ${levelFilter === level ? "active" : ""}`}
                  onClick={() => setLevelFilter(level)}
                >
                  <LevelBadge level={level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | "ui"} size="sm" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results count */}
      <div class="unified-catalog-grid__count">
        <span class="count-number">{filteredItems.length}</span>
        <span class="count-label">
          {filteredItems.length === 1 ? "élément" : "éléments"}
        </span>
      </div>

      {/* Grid */}
      <div
        class={`unified-catalog-grid__items ${compact ? "unified-catalog-grid__items--compact" : ""}`}
      >
        {filteredItems.map((item, index) => (
          <UnifiedItemCard key={item.id} item={item} index={index} compact={compact} />
        ))}
      </div>

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <div class="unified-catalog-grid__empty">
          <span class="empty-icon">🔍</span>
          <p>Aucun élément trouvé</p>
          <button
            type="button"
            class="empty-reset"
            onClick={() => {
              setTypeFilter("all");
              setLevelFilter("all");
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      <style>
        {`
          .unified-catalog-grid {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }

          .unified-catalog-grid__filters {
            display: flex;
            flex-wrap: wrap;
            gap: 1.5rem;
            padding: 1rem 1.25rem;
            background: #0a0a0c;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 10px;
          }

          .filter-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .filter-label {
            font-size: 0.6875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #4a4540;
          }

          .filter-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .filter-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.375rem 0.75rem;
            font-size: 0.75rem;
            font-family: 'Geist Mono', monospace;
            color: #6b6560;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .filter-chip:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.12);
          }

          .filter-chip.active {
            color: #f0ede8;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .filter-chip--tool.active {
            color: #FFB86F;
            border-color: rgba(255, 184, 111, 0.3);
            background: rgba(255, 184, 111, 0.1);
          }

          .filter-chip--capability.active {
            color: #4ade80;
            border-color: rgba(74, 222, 128, 0.3);
            background: rgba(74, 222, 128, 0.1);
          }

          .filter-chip--ui.active {
            color: #4ECDC4;
            border-color: rgba(78, 205, 196, 0.3);
            background: rgba(78, 205, 196, 0.1);
          }

          .filter-chip--level {
            padding: 0.25rem 0.5rem;
          }

          .chip-count {
            font-size: 0.625rem;
            padding: 0.125rem 0.375rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
          }

          .unified-catalog-grid__count {
            display: flex;
            align-items: baseline;
            gap: 0.375rem;
            padding-left: 0.25rem;
          }

          .count-number {
            font-size: 1.25rem;
            font-weight: 600;
            font-family: 'Geist Mono', monospace;
            color: #f0ede8;
          }

          .count-label {
            font-size: 0.8125rem;
            color: #6b6560;
          }

          .unified-catalog-grid__items {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 1rem;
          }

          .unified-catalog-grid__items--compact {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 0.75rem;
          }

          .unified-catalog-grid__empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            padding: 3rem 2rem;
            text-align: center;
            background: #0a0a0c;
            border: 1px dashed rgba(255, 255, 255, 0.08);
            border-radius: 10px;
          }

          .empty-icon {
            font-size: 2rem;
            opacity: 0.5;
          }

          .unified-catalog-grid__empty p {
            margin: 0;
            font-size: 0.875rem;
            color: #6b6560;
          }

          .empty-reset {
            font-size: 0.75rem;
            color: #4ECDC4;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.25rem 0.5rem;
            transition: opacity 0.15s;
          }

          .empty-reset:hover {
            opacity: 0.8;
          }
        `}
      </style>
    </div>
  );
}
