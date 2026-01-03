/**
 * CatalogFilters - Filter molecule for registry catalog
 *
 * Cloud-only: used by the public registry catalog page.
 * Filters by record type (MCP Tool vs Capability) and search text.
 * Uses atoms: ToggleChip, Button
 *
 * @module cloud/ui/catalog/CatalogFilters
 */

import Button from "../../../web/components/ui/atoms/Button.tsx";
import ToggleChip from "../../../web/components/ui/atoms/ToggleChip.tsx";
import { type CatalogFilters, RECORD_TYPE_INFO } from "./types.ts";
import type { PmlRegistryRecordType } from "../../../capabilities/types/fqdn.ts";

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

  const toggleType = (type: PmlRegistryRecordType) => {
    const recordTypes = filters.recordTypes.includes(type)
      ? filters.recordTypes.filter((t) => t !== type)
      : [...filters.recordTypes, type];
    updateFilters({ recordTypes });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      recordTypes: [],
    });
  };

  const hasActiveFilters = filters.search || filters.recordTypes.length > 0;

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
            placeholder="Search registry..."
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

      {/* Record Type (MCP Tool vs Capability) */}
      <div class="mb-5">
        <label
          class="block text-xs font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-dim)" }}
        >
          Type
        </label>
        <div class="flex flex-wrap gap-2">
          {(Object.keys(RECORD_TYPE_INFO) as PmlRegistryRecordType[]).map((type) => {
            const info = RECORD_TYPE_INFO[type];
            return (
              <ToggleChip
                key={type}
                label={info.label}
                active={filters.recordTypes.includes(type)}
                color={info.color}
                onClick={() => toggleType(type)}
              />
            );
          })}
        </div>
      </div>

      {/* Results count + Clear */}
      <div
        class="flex items-center justify-between pt-4 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <span class="text-sm" style={{ color: "var(--text-dim)" }}>
          Showing{" "}
          <span style={{ color: "var(--accent)" }}>{filteredCount}</span> of{" "}
          {totalCount} entries
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
