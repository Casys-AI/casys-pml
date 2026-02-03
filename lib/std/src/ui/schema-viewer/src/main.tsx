/**
 * Schema Viewer UI for MCP Apps
 *
 * Displays database table schema with:
 * - Column names, types, constraints
 * - Primary key indicators
 * - Nullable/default values
 * - Copy DDL functionality
 *
 * @module lib/std/src/ui/schema-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface Column {
  name: string;
  type: string;
  maxLength?: number | null;
  nullable: boolean;
  default: string | null;
  isPrimaryKey?: boolean;
}

interface SchemaData {
  table: string;
  columns: Column[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Schema Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Main Component
// ============================================================================

function SchemaViewer() {
  const [data, setData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[schema-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[schema-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
        setSelectedColumn(null);
      } catch (e) {
        setError(`Failed to parse schema: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Handlers
  const handleSelectColumn = useCallback((columnName: string) => {
    setSelectedColumn(columnName === selectedColumn ? null : columnName);
    notifyModel("selectColumn", { column: columnName });
  }, [selectedColumn]);

  const handleCopyDDL = useCallback(() => {
    if (!data) return;
    const ddl = generateDDL(data);
    navigator.clipboard.writeText(ddl);
    notifyModel("copyDDL", { table: data.table });
  }, [data]);

  // Filter columns
  const filteredColumns = data?.columns.filter((col) =>
    col.name.toLowerCase().includes(filterText.toLowerCase()) ||
    col.type.toLowerCase().includes(filterText.toLowerCase())
  ) ?? [];

  // Render
  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading schema...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!data || data.columns.length === 0) {
    return <div class={styles.container}><div class={styles.empty}>No schema data</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.tableInfo}>
          <span class={styles.tableIcon}>📋</span>
          <span class={styles.tableName}>{data.table}</span>
          <span class={styles.columnCount}>{data.columns.length} columns</span>
        </div>
        <button class={styles.btn} onClick={handleCopyDDL}>Copy DDL</button>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter columns..."
        value={filterText}
        onInput={(e) => setFilterText((e.target as HTMLInputElement).value)}
        class={styles.filterInput}
      />

      {/* Schema Table */}
      <div class={styles.schemaContainer}>
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>Column</th>
              <th class={styles.th}>Type</th>
              <th class={styles.th}>Nullable</th>
              <th class={styles.th}>Default</th>
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col) => (
              <tr
                key={col.name}
                class={css(styles.tr, selectedColumn === col.name && styles.trSelected)}
                onClick={() => handleSelectColumn(col.name)}
              >
                <td class={styles.td}>
                  <div class={styles.columnName}>
                    {col.isPrimaryKey && <span class={styles.pkBadge}>PK</span>}
                    <span class={css({ fontWeight: col.isPrimaryKey ? "bold" : "normal" })}>
                      {col.name}
                    </span>
                  </div>
                </td>
                <td class={styles.td}>
                  <code class={styles.typeCode}>
                    {col.type}
                    {col.maxLength && `(${col.maxLength})`}
                  </code>
                </td>
                <td class={styles.td}>
                  <span class={col.nullable ? styles.nullableYes : styles.nullableNo}>
                    {col.nullable ? "YES" : "NO"}
                  </span>
                </td>
                <td class={styles.td}>
                  <code class={styles.defaultCode}>
                    {col.default ?? <span class={styles.nullText}>NULL</span>}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Column Details */}
      {selectedColumn && (
        <div class={styles.detailPanel}>
          <h4>Column Details: {selectedColumn}</h4>
          {(() => {
            const col = data.columns.find((c) => c.name === selectedColumn);
            if (!col) return null;
            return (
              <pre class={styles.detailCode}>
{`{
  "name": "${col.name}",
  "type": "${col.type}${col.maxLength ? `(${col.maxLength})` : ""}",
  "nullable": ${col.nullable},
  "default": ${col.default ? `"${col.default}"` : "null"},
  "isPrimaryKey": ${col.isPrimaryKey ?? false}
}`}
              </pre>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function generateDDL(data: SchemaData): string {
  const columns = data.columns.map((col) => {
    let line = `  "${col.name}" ${col.type.toUpperCase()}`;
    if (col.maxLength) line += `(${col.maxLength})`;
    if (!col.nullable) line += " NOT NULL";
    if (col.default) line += ` DEFAULT ${col.default}`;
    if (col.isPrimaryKey) line += " PRIMARY KEY";
    return line;
  });
  return `CREATE TABLE "${data.table}" (\n${columns.join(",\n")}\n);`;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    p: "4",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    minH: "200px",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
  }),
  tableInfo: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  tableIcon: css({
    fontSize: "lg",
  }),
  tableName: css({
    fontWeight: "bold",
    fontSize: "lg",
    color: "fg.default",
  }),
  columnCount: css({
    color: "fg.muted",
    fontSize: "sm",
  }),
  btn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  filterInput: css({
    w: "full",
    p: "2",
    mb: "3",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: { borderColor: "border.accent" },
  }),
  schemaContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  table: css({
    w: "full",
    borderCollapse: "collapse",
  }),
  th: css({
    p: "3",
    textAlign: "left",
    bg: "bg.subtle",
    fontWeight: "semibold",
    borderBottom: "1px solid",
    borderColor: "border.default",
    fontSize: "xs",
    textTransform: "uppercase",
    color: "fg.muted",
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
    p: "3",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  columnName: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  pkBadge: css({
    px: "1.5",
    py: "0.5",
    fontSize: "xs",
    fontWeight: "bold",
    bg: "yellow.100",
    color: "yellow.800",
    rounded: "sm",
    _dark: { bg: "yellow.900", color: "yellow.200" },
  }),
  typeCode: css({
    fontFamily: "mono",
    fontSize: "sm",
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  nullableYes: css({
    color: "green.600",
    _dark: { color: "green.400" },
  }),
  nullableNo: css({
    color: "red.600",
    fontWeight: "medium",
    _dark: { color: "red.400" },
  }),
  defaultCode: css({
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.muted",
  }),
  nullText: css({
    fontStyle: "italic",
    color: "fg.muted",
  }),
  detailPanel: css({
    mt: "4",
    p: "3",
    bg: "bg.subtle",
    rounded: "lg",
    border: "1px solid",
    borderColor: "border.default",
  }),
  detailCode: css({
    fontFamily: "mono",
    fontSize: "xs",
    p: "2",
    bg: "bg.default",
    rounded: "md",
    overflow: "auto",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({ p: "4", bg: "red.50", color: "red.700", rounded: "md", _dark: { bg: "red.950", color: "red.300" } }),
};

// ============================================================================
// Mount
// ============================================================================

render(<SchemaViewer />, document.getElementById("app")!);
