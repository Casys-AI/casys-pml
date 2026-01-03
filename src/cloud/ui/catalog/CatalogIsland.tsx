/**
 * CatalogIsland - Interactive MCP catalog organism
 *
 * Cloud-only: client-side island for the public MCP catalog page.
 * Uses molecules: CatalogFilters, MCPCatalogCard
 * Uses atoms: Button
 *
 * @module cloud/ui/catalog/CatalogIsland
 */

import { useMemo, useState } from "preact/hooks";
import Button from "../../../web/components/ui/atoms/Button.tsx";
import CatalogFilters from "./CatalogFilters.tsx";
import MCPCatalogCard from "./MCPCatalogCard.tsx";
import type { CatalogFilters as CatalogFiltersType, MCPCatalogEntry } from "./types.ts";

interface CatalogIslandProps {
  entries: MCPCatalogEntry[];
}

export default function CatalogIsland({ entries }: CatalogIslandProps) {
  const [filters, setFilters] = useState<CatalogFiltersType>({
    search: "",
    types: [],
    showBuiltinOnly: false,
  });

  const [selectedEntry, setSelectedEntry] = useState<MCPCatalogEntry | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          entry.name.toLowerCase().includes(searchLower) ||
          entry.description.toLowerCase().includes(searchLower) ||
          entry.fqdn.toLowerCase().includes(searchLower) ||
          entry.tags?.some((tag) => tag.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filters.types.length > 0 && !filters.types.includes(entry.type)) {
        return false;
      }

      // Builtin filter
      if (filters.showBuiltinOnly && !entry.isBuiltin) {
        return false;
      }

      return true;
    });
  }, [entries, filters]);

  return (
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Sidebar: Filters */}
      <aside class="lg:col-span-1">
        <div class="lg:sticky lg:top-24">
          <CatalogFilters
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={entries.length}
            filteredCount={filteredEntries.length}
          />
        </div>
      </aside>

      {/* Main: Grid of cards */}
      <main class="lg:col-span-3">
        {filteredEntries.length === 0 ? (
          <div
            class="text-center py-16 rounded-xl"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <svg
              class="w-12 h-12 mx-auto mb-4"
              style={{ color: "var(--text-dim)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth="1.5" />
              <path strokeWidth="1.5" d="m21 21-4.35-4.35" />
            </svg>
            <h3 class="text-lg font-medium mb-2" style={{ color: "var(--text)" }}>
              No MCPs found
            </h3>
            <p style={{ color: "var(--text-muted)" }}>
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredEntries.map((entry) => (
              <MCPCatalogCard
                key={entry.fqdn}
                entry={entry}
                onClick={() => setSelectedEntry(entry)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedEntry && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.7)" }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            class="max-w-lg w-full rounded-xl p-6"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                {selectedEntry.icon && (
                  <span class="text-2xl">{selectedEntry.icon}</span>
                )}
                <div>
                  <h2 class="text-xl font-semibold mb-1" style={{ color: "var(--text)" }}>
                    {selectedEntry.name}
                  </h2>
                  <span class="font-mono text-sm" style={{ color: "var(--text-dim)" }}>
                    {selectedEntry.fqdn}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                class="p-2 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p class="text-sm mb-4 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {selectedEntry.description}
            </p>

            <div class="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="block mb-1" style={{ color: "var(--text-dim)" }}>Type</span>
                  <span style={{ color: "var(--text)" }}>{selectedEntry.type}</span>
                </div>
                {selectedEntry.toolCount !== undefined && (
                  <div>
                    <span class="block mb-1" style={{ color: "var(--text-dim)" }}>Tools</span>
                    <span style={{ color: "var(--text)" }}>{selectedEntry.toolCount}</span>
                  </div>
                )}
              </div>

              {selectedEntry.docsUrl && (
                <div class="mt-4">
                  <Button variant="primary" onClick={() => window.open(selectedEntry.docsUrl, "_blank")}>
                    View Documentation
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
