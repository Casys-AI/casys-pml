/**
 * CatalogFilters - Filter molecule for MCP catalog
 *
 * Cloud-only: used by the public MCP catalog page.
 * Uses atoms: ToggleChip, Checkbox, Button
 *
 * @module cloud/ui/catalog/CatalogFilters
 */

import Button from "../../../web/components/ui/atoms/Button.tsx";
import Checkbox from "../../../web/components/ui/atoms/Checkbox.tsx";
import ToggleChip from "../../../web/components/ui/atoms/ToggleChip.tsx";
import { type CatalogFilters, type MCPServerType, TYPE_INFO } from "./types.ts";

interface CatalogFiltersProps {
  filters: CatalogFilters;
  onFiltersChange: (filters: CatalogFilters) => void;
  totalCount: number;
  filteredCount: number;
}

export default function CatalogFiltersComponent({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: CatalogFiltersProps) {
  const updateFilters = (partial: Partial<CatalogFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const toggleType = (type: MCPServerType) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    updateFilters({ types });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      types: [],
      showBuiltinOnly: false,
    });
  };

  const hasActiveFilters =
    filters.search || filters.types.length > 0 || filters.showBuiltinOnly;

  return (
    <div
      class="rounded-xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Search */}
      <div class="mb-5">
        <label
          class="block text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-dim)" }}
        >
          Search
        </label>
        <div class="relative">
          <input
            type="text"
            value={filters.search}
            onInput={(e) => updateFilters({ search: (e.target as HTMLInputElement).value })}
            placeholder="Search MCPs..."
            class="w-full px-4 py-2.5 pl-10 rounded-lg text-sm transition-all outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--text-dim)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path strokeWidth="2" d="m21 21-4.35-4.35" />
          </svg>
        </div>
      </div>

      {/* Server Type */}
      <div class="mb-5">
        <label
          class="block text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-dim)" }}
        >
          Server Type
        </label>
        <div class="flex flex-wrap gap-2">
          {(Object.keys(TYPE_INFO) as MCPServerType[]).map((type) => {
            const info = TYPE_INFO[type];
            return (
              <ToggleChip
                key={type}
                label={info.label}
                active={filters.types.includes(type)}
                color={info.color}
                onClick={() => toggleType(type)}
              />
            );
          })}
        </div>
      </div>

      {/* Quick filters */}
      <div class="mb-4">
        <Checkbox
          checked={filters.showBuiltinOnly}
          onChange={(checked) => updateFilters({ showBuiltinOnly: checked })}
          label="PML Built-in only"
          color="#4ade80"
        />
      </div>

      {/* Results count + Clear */}
      <div
        class="flex items-center justify-between pt-4 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <span class="text-sm" style={{ color: "var(--text-dim)" }}>
          Showing{" "}
          <span style={{ color: "var(--accent)" }}>{filteredCount}</span> of{" "}
          {totalCount} MCPs
        </span>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
