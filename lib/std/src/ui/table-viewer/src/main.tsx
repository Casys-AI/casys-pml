/**
 * Table Viewer UI for MCP Apps
 *
 * Interactive table using React + Park UI (Panda CSS).
 * Displays query results with sorting, filtering, pagination, and row selection.
 *
 * @module lib/std/src/ui/table-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css, cx } from "../../styled-system/css";
import { Box, Flex, Center } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Tooltip } from "../../components/ui/tooltip";
import * as Table from "../../components/ui/table";
import * as Alert from "../../components/ui/alert";
import {
  TableSkeleton,
  interactive,
  typography,
  containers,
} from "../../shared";
import "../../global.css";

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
// Styles
// ============================================================================

const headerCellStyle = css({
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease",
  _hover: { bg: "bg.muted" },
});

const headerCellActiveStyle = css({
  bg: "bg.muted",
});

const cellStyle = css({
  maxW: "300px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const rowSelectedStyle = css({
  bg: "blue.50",
  _hover: { bg: "blue.100" },
  _dark: { bg: "blue.950", _hover: { bg: "blue.900" } },
});

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
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[table-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[table-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
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
  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortColumn === colIdx) {
        const newDir = sortDirection === "asc" ? "desc" : "asc";
        setSortDirection(newDir);
        notifyModel("sort", { column: data?.columns[colIdx], direction: newDir });
      } else {
        setSortColumn(colIdx);
        setSortDirection("asc");
        notifyModel("sort", { column: data?.columns[colIdx], direction: "asc" });
      }
    },
    [sortColumn, sortDirection, data?.columns]
  );

  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    setCurrentPage(0);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleRowClick = useCallback(
    (rowIdx: number) => {
      const absoluteIdx = startIdx + rowIdx;
      if (selectedRow === absoluteIdx) {
        setSelectedRow(null);
      } else {
        setSelectedRow(absoluteIdx);
        if (data) {
          const row = data.rows[absoluteIdx];
          const rowObj: Record<string, unknown> = {};
          data.columns.forEach((col, i) => {
            rowObj[col] = row[i];
          });
          notifyModel("select", { rowIndex: absoluteIdx, row: rowObj });
        }
      }
    },
    [selectedRow, startIdx, data]
  );

  // Loading state with skeleton
  if (loading) {
    return <TableSkeleton rows={8} />;
  }

  // Error state with Alert
  if (error) {
    return (
      <Box className={containers.root} maxW="100%" overflow="hidden">
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Error</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      </Box>
    );
  }

  // Empty state
  if (!data || data.rows.length === 0) {
    return (
      <Box className={containers.root} maxW="100%" overflow="hidden">
        <Center p="10" color="fg.muted">
          No data to display
        </Center>
      </Box>
    );
  }

  return (
    <Box className={containers.root} maxW="100%" overflow="hidden">
      {/* Header */}
      <Flex gap="3" mb="3" align="center" flexWrap="wrap">
        <Input
          type="text"
          placeholder="Filter rows..."
          value={filterText}
          onChange={handleFilter}
          size="sm"
          className={cx(css({ flex: 1, minW: "200px" }), interactive.focusRing)}
        />
        <Box className={typography.muted} whiteSpace="nowrap">
          Showing {startIdx + 1}-{Math.min(startIdx + pageSize, sortedRows.length)} of{" "}
          {sortedRows.length}
          {filterText && ` (filtered from ${data.rows.length})`}
        </Box>
      </Flex>

      {/* Table */}
      <Box overflowX="auto" rounded="lg">
        <Table.Root size="sm" variant="outline">
          <Table.Head>
            <Table.Row>
              {data.columns.map((col, i) => (
                <Table.Header
                  key={i}
                  onClick={() => handleSort(i)}
                  className={cx(
                    headerCellStyle,
                    interactive.focusRing,
                    sortColumn === i && headerCellActiveStyle
                  )}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleSort(i)}
                >
                  {col}
                  <Box as="span" ml="1" opacity={0.5}>
                    {sortColumn === i ? (sortDirection === "asc" ? "▲" : "▼") : "⇅"}
                  </Box>
                </Table.Header>
              ))}
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {pageRows.map((row, rowIdx) => {
              const absoluteIdx = startIdx + rowIdx;
              const isSelected = selectedRow === absoluteIdx;
              return (
                <Table.Row
                  key={absoluteIdx}
                  onClick={() => handleRowClick(rowIdx)}
                  className={cx(interactive.rowHover, isSelected && rowSelectedStyle)}
                >
                  {row.map((cell, cellIdx) => {
                    const isNull = cell == null;
                    const isNumber = typeof cell === "number";
                    const displayValue = isNull ? "NULL" : formatValue(cell);
                    const shouldTruncate = displayValue.length > 40;

                    const cellContent = (
                      <Table.Cell
                        key={cellIdx}
                        className={cx(
                          cellStyle,
                          css({
                            color: isNull ? "fg.muted" : "inherit",
                            fontStyle: isNull ? "italic" : "normal",
                            fontFamily: isNumber ? "mono" : "inherit",
                            textAlign: isNumber ? "right" : "left",
                          })
                        )}
                      >
                        {displayValue}
                      </Table.Cell>
                    );

                    // Wrap truncated cells with Tooltip
                    if (shouldTruncate) {
                      return (
                        <Tooltip key={cellIdx} content={displayValue} portalled={false}>
                          {cellContent}
                        </Tooltip>
                      );
                    }

                    return cellContent;
                  })}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="space-between" align="center" mt="3" gap="3">
          <Box className={typography.muted}>
            Page {currentPage + 1} of {totalPages}
          </Box>
          <Flex gap="1">
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(0)}
              className={interactive.scaleOnHover}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={interactive.scaleOnHover}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={interactive.scaleOnHover}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(totalPages - 1)}
              className={interactive.scaleOnHover}
            >
              Last
            </Button>
          </Flex>
        </Flex>
      )}
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): QueryResult | null {
  // Handle MCP content format: {content: [{type: "text", text: "..."}]}
  if (parsed && typeof parsed === "object" && "content" in parsed) {
    const content = (parsed as { content: ContentItem[] }).content;
    const textItem = content?.find((c) => c.type === "text");
    if (textItem?.text) {
      try {
        const innerParsed = JSON.parse(textItem.text);
        return normalizeData(innerParsed); // Recurse with extracted data
      } catch {
        // Not JSON, treat as raw text
      }
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const columns = Object.keys(parsed[0]);
      const rows = parsed.map((item) => columns.map((col) => (item as Record<string, unknown>)[col]));
      return { columns, rows, totalCount: rows.length };
    }
    return { columns: ["value"], rows: parsed.map((v) => [v]), totalCount: parsed.length };
  }

  if (parsed && typeof parsed === "object") {
    // Format 1: Already has columns/rows structure (mock data, SQL results)
    if ("columns" in parsed && "rows" in parsed) {
      return parsed as QueryResult;
    }

    // Format 2: Object with an array of objects property (e.g., { containers: [...], count: 8 })
    // Find the first property that is an array of objects and use it as the main data
    const entries = Object.entries(parsed);
    const arrayEntry = entries.find(
      ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null
    );
    if (arrayEntry) {
      const [, arrayData] = arrayEntry;
      const arr = arrayData as Record<string, unknown>[];
      const columns = Object.keys(arr[0]);
      const rows = arr.map((item) => columns.map((col) => item[col]));
      return { columns, rows, totalCount: rows.length };
    }

    // Format 3: Simple key-value object (fallback)
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

createRoot(document.getElementById("app")!).render(<TableViewer />);
