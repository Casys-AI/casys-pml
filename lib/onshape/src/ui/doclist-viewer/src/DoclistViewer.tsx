/**
 * DoclistViewer -- Generic sortable table viewer for Onshape document lists
 *
 * Data shape:
 * {
 *   count: number;
 *   data: Record<string, unknown>[];
 *   doctype?: string;
 * }
 *
 * @module lib/onshape/src/ui/doclist-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { ContentSkeleton, OnshapeBadge, exportCsv, titleCase } from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface DoclistData {
  count: number;
  data: Record<string, unknown>[];
  doctype?: string;
}

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Doclist", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 20;

const EXCLUDED_KEYS = new Set([
  "_id",
  "href",
  "owner",
  "createdBy",
  "modifiedBy",
  "createdAt",
  "modifiedAt",
]);

// ============================================================================
// Column detection
// ============================================================================

function detectColumns(rows: Record<string, unknown>[]): string[] {
  const sample = rows.slice(0, 5);
  const keySet = new Set<string>();
  for (const row of sample) {
    for (const key of Object.keys(row)) {
      if (!EXCLUDED_KEYS.has(key)) keySet.add(key);
    }
  }

  const keys = Array.from(keySet);

  // Priority keys first, then alphabetical
  const priority: Record<string, number> = { name: 0, id: 1, status: 2 };
  keys.sort((a, b) => {
    const pa = priority[a] ?? 999;
    const pb = priority[b] ?? 999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  return keys;
}

// ============================================================================
// Status Badge
// ============================================================================

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="text-[10px] font-mono bg-bg-muted px-1.5 py-0.5 rounded text-fg-muted whitespace-nowrap">
      {value}
    </span>
  );
}

// ============================================================================
// Sort Arrow
// ============================================================================

function SortArrow({ dir }: { dir: "asc" | "desc" | null }) {
  if (!dir) return null;
  return (
    <span className="ml-1 text-accent text-[10px]">
      {dir === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

// ============================================================================
// Cell Renderer
// ============================================================================

function CellValue({ column, value }: { column: string; value: unknown }) {
  if (value == null) return <span className="text-fg-dim">--</span>;

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  if (column === "status") {
    return <StatusBadge value={str} />;
  }

  return <span className="truncate max-w-[300px] block" title={str}>{str}</span>;
}

// ============================================================================
// Main Component
// ============================================================================

export function DoclistViewer() {
  const [data, setData] = useState<DoclistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // ---------- MCP connection ----------

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const parsed = JSON.parse(text) as DoclistData;
        setData(parsed);
        setPage(0);
        setSelectedIdx(null);
        setSortKey(null);
        setFilter("");
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // ---------- Derived data ----------

  const columns = useMemo(() => {
    if (!data?.data?.length) return [];
    return detectColumns(data.data);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.data) return [];
    if (!filter.trim()) return data.data;

    const q = filter.toLowerCase();
    return data.data.filter((row) =>
      columns.some((col) => {
        const v = row[col];
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      })
    );
  }, [data, filter, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ---------- Handlers ----------

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
    setPage(0);
  }, []);

  const handleRowClick = useCallback((globalIdx: number, row: Record<string, unknown>) => {
    setSelectedIdx(globalIdx);
    notifyModel("select-row", row);
  }, []);

  const handleExport = useCallback(() => {
    if (!data?.data?.length) return;
    const filename = data.doctype ? `onshape-${data.doctype}` : "onshape-documents";
    exportCsv(columns, data.data, filename);
  }, [data, columns]);

  // ---------- Render states ----------

  if (loading) return <ContentSkeleton />;

  if (error) {
    return (
      <div className="p-4 text-error text-sm">{error}</div>
    );
  }

  if (!data || !data.data?.length) {
    return (
      <div className="p-6 text-center text-fg-muted text-sm">No data</div>
    );
  }

  // ---------- Main render ----------

  const title = data.doctype ? titleCase(data.doctype) : "Documents";

  return (
    <div className="p-4 font-sans text-sm bg-bg-canvas min-h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
        <OnshapeBadge />
        <span className="text-fg-default font-semibold">{title}</span>
        <span className="px-2 py-0.5 text-[10px] font-mono bg-accent-dim text-accent rounded">
          {data.count} items
        </span>
        <div className="flex-1" />
        <button
          onClick={handleExport}
          className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle transition-colors"
          title="Export CSV"
        >
          Export CSV
        </button>
      </div>

      {/* Filter (shown if > 5 rows) */}
      {data.data.length > 5 && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onInput={(e) => {
              setFilter((e.target as HTMLInputElement).value);
              setPage(0);
              setSelectedIdx(null);
            }}
            className="w-full px-3 py-1.5 text-sm bg-bg-subtle border border-border-default rounded text-fg-default placeholder:text-fg-dim focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border-default rounded-lg">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-subtle">
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-4 py-2 text-[11px] font-semibold text-fg-muted uppercase tracking-wide cursor-pointer select-none hover:text-fg-default transition-colors whitespace-nowrap"
                >
                  {titleCase(col)}
                  <SortArrow dir={sortKey === col ? sortDir : null} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const globalIdx = page * PAGE_SIZE + i;
              return (
                <tr
                  key={globalIdx}
                  onClick={() => handleRowClick(globalIdx, row)}
                  className={cx(
                    "cursor-pointer transition-colors duration-100 border-b border-border-subtle last:border-b-0",
                    selectedIdx === globalIdx
                      ? "bg-accent-dim"
                      : "hover:bg-bg-muted"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-1.5 text-sm text-fg-default">
                      <CellValue column={col} value={row[col]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-xs text-fg-muted font-mono px-2">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs border border-border-default rounded bg-bg-muted text-fg-muted hover:bg-bg-subtle disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      )}

      {/* Footer: filtered count if filtering */}
      {filter.trim() && (
        <div className="mt-2 text-right text-xs text-fg-dim">
          Showing {sorted.length} of {data.data.length} rows
        </div>
      )}
    </div>
  );
}
