/**
 * Table Viewer UI for MCP Apps
 *
 * Interactive table using Preact + Park UI (Panda CSS).
 * Displays query results with sorting, filtering, pagination, and row selection.
 *
 * @module lib/std/src/ui/table-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  totalCount?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

type SortDirection = "asc" | "desc";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Table Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Table Component
// ============================================================================

function TableViewer() {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<number>(-1);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const pageSize = 50;

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[table-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[table-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
        setCurrentPage(0);
        setSelectedRow(null);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => {
      setLoading(true);
    };
  }, []);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!filterText) return data.rows;

    const search = filterText.toLowerCase();
    return data.rows.filter((row) =>
      row.some((cell) => String(cell ?? "").toLowerCase().includes(search))
    );
  }, [data?.rows, filterText]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (sortColumn < 0) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const va = a[sortColumn];
      const vb = b[sortColumn];

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const pageRows = sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const startIdx = currentPage * pageSize;

  // Handlers
  const handleSort = useCallback((colIdx: number) => {
    if (sortColumn === colIdx) {
      const newDir = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(newDir);
      notifyModel("sort", { column: data?.columns[colIdx], direction: newDir });
    } else {
      setSortColumn(colIdx);
      setSortDirection("asc");
      notifyModel("sort", { column: data?.columns[colIdx], direction: "asc" });
    }
  }, [sortColumn, sortDirection, data?.columns]);

  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    setCurrentPage(0);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleRowClick = useCallback((rowIdx: number) => {
    const absoluteIdx = startIdx + rowIdx;
    if (selectedRow === absoluteIdx) {
      setSelectedRow(null);
    } else {
      setSelectedRow(absoluteIdx);
      if (data) {
        const row = data.rows[absoluteIdx];
        const rowObj: Record<string, unknown> = {};
        data.columns.forEach((col, i) => { rowObj[col] = row[i]; });
        notifyModel("select", { rowIndex: absoluteIdx, row: rowObj });
      }
    }
  }, [selectedRow, startIdx, data]);

  // Render states
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No data to display</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <input
          type="text"
          placeholder="Filter rows..."
          value={filterText}
          onInput={handleFilter}
          class={styles.filterInput}
        />
        <span class={styles.stats}>
          Showing {startIdx + 1}-{Math.min(startIdx + pageSize, sortedRows.length)} of {sortedRows.length}
          {filterText && ` (filtered from ${data.rows.length})`}
        </span>
      </div>

      {/* Table */}
      <div class={styles.tableContainer}>
        <table class={styles.table}>
          <thead>
            <tr>
              {data.columns.map((col, i) => (
                <th
                  key={i}
                  class={css(styles.th, sortColumn === i && styles.thSorted)}
                  onClick={() => handleSort(i)}
                >
                  {col}
                  <span class={styles.sortIndicator}>
                    {sortColumn === i ? (sortDirection === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => {
              const absoluteIdx = startIdx + rowIdx;
              return (
                <tr
                  key={absoluteIdx}
                  class={css(styles.tr, selectedRow === absoluteIdx && styles.trSelected)}
                  onClick={() => handleRowClick(rowIdx)}
                >
                  {row.map((cell, cellIdx) => {
                    const isNull = cell == null;
                    const isNumber = typeof cell === "number";
                    return (
                      <td
                        key={cellIdx}
                        class={css(
                          styles.td,
                          isNull && styles.tdNull,
                          isNumber && styles.tdNumber
                        )}
                        title={String(cell ?? "")}
                      >
                        {isNull ? "NULL" : formatValue(cell)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div class={styles.pagination}>
          <span class={styles.pageInfo}>Page {currentPage + 1} of {totalPages}</span>
          <div class={styles.pageControls}>
            <button
              class={styles.pageBtn}
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(0)}
            >⏮</button>
            <button
              class={styles.pageBtn}
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >◀</button>
            <button
              class={styles.pageBtn}
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >▶</button>
            <button
              class={styles.pageBtn}
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(totalPages - 1)}
            >⏭</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles (Panda CSS)
// ============================================================================

const styles = {
  container: css({
    p: "4",
    maxW: "100%",
    overflow: "hidden",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  header: css({
    display: "flex",
    gap: "3",
    mb: "3",
    alignItems: "center",
    flexWrap: "wrap",
  }),
  filterInput: css({
    flex: 1,
    minW: "200px",
    p: "2",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: {
      borderColor: "border.accent",
      shadow: "0 0 0 3px token(colors.blue.500/20)",
    },
  }),
  stats: css({
    color: "fg.muted",
    fontSize: "xs",
    whiteSpace: "nowrap",
  }),
  tableContainer: css({
    overflowX: "auto",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
  }),
  table: css({
    w: "full",
    borderCollapse: "collapse",
    fontSize: "sm",
  }),
  th: css({
    p: "3",
    textAlign: "left",
    bg: "bg.subtle",
    fontWeight: "semibold",
    borderBottom: "1px solid",
    borderColor: "border.default",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    _hover: { bg: "bg.muted" },
  }),
  thSorted: css({
    bg: "bg.muted",
  }),
  sortIndicator: css({
    ml: "1",
    opacity: 0.5,
  }),
  tr: css({
    cursor: "pointer",
    _hover: { bg: "bg.subtle" },
  }),
  trSelected: css({
    bg: "blue.50",
    _hover: { bg: "blue.100" },
    _dark: { bg: "blue.950", _hover: { bg: "blue.900" } },
  }),
  td: css({
    p: "2.5",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    maxW: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  tdNull: css({
    color: "fg.muted",
    fontStyle: "italic",
  }),
  tdNumber: css({
    fontFamily: "mono",
    textAlign: "right",
  }),
  pagination: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mt: "3",
    gap: "3",
  }),
  pageInfo: css({
    color: "fg.muted",
    fontSize: "xs",
  }),
  pageControls: css({
    display: "flex",
    gap: "1",
  }),
  pageBtn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "bg.subtle",
    color: "fg.default",
    cursor: "pointer",
    fontSize: "sm",
    _hover: { bg: "bg.muted" },
    _disabled: { opacity: 0.5, cursor: "not-allowed" },
  }),
  loading: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: "10",
    color: "fg.muted",
  }),
  empty: css({
    textAlign: "center",
    p: "10",
    color: "fg.muted",
  }),
  error: css({
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    _dark: { bg: "red.950", color: "red.300" },
  }),
};

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): QueryResult | null {
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const columns = Object.keys(parsed[0]);
      const rows = parsed.map((item) => columns.map((col) => (item as Record<string, unknown>)[col]));
      return { columns, rows, totalCount: rows.length };
    }
    return { columns: ["value"], rows: parsed.map((v) => [v]), totalCount: parsed.length };
  }

  if (parsed && typeof parsed === "object") {
    if ("columns" in parsed && "rows" in parsed) {
      return parsed as QueryResult;
    }
    const entries = Object.entries(parsed);
    return {
      columns: ["key", "value"],
      rows: entries.map(([k, v]) => [k, formatValue(v)]),
      totalCount: entries.length,
    };
  }

  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ============================================================================
// Mount
// ============================================================================

render(<TableViewer />, document.getElementById("app")!);
