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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Table from "../../components/ui/table";
import "../../global.css";

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
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">Loading schema...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="4" bg={{ base: "red.50", _dark: "red.950" }} color={{ base: "red.700", _dark: "red.300" }} rounded="md">
          {error}
        </Box>
      </Box>
    );
  }

  if (!data || data.columns.length === 0) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">No schema data</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Header */}
      <Flex justify="space-between" align="center" mb="3">
        <Flex align="center" gap="2">
          <Box fontSize="lg" fontWeight="bold" color="fg.muted">T</Box>
          <Box fontWeight="bold" fontSize="lg" color="fg.default">{data.table}</Box>
          <Box color="fg.muted" fontSize="sm">{data.columns.length} columns</Box>
        </Flex>
        <Button variant="outline" size="sm" onClick={handleCopyDDL}>Copy DDL</Button>
      </Flex>

      {/* Filter */}
      <Input
        type="text"
        placeholder="Filter columns..."
        value={filterText}
        onChange={(e) => setFilterText((e.target as HTMLInputElement).value)}
        className={css({ w: "full", mb: "3" })}
      />

      {/* Schema Table */}
      <Box rounded="lg" overflow="hidden">
        <Table.Root variant="outline">
          <Table.Head>
            <Table.Row>
              <Table.Header>Column</Table.Header>
              <Table.Header>Type</Table.Header>
              <Table.Header>Nullable</Table.Header>
              <Table.Header>Default</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {filteredColumns.map((col) => (
              <Table.Row
                key={col.name}
                onClick={() => handleSelectColumn(col.name)}
                className={css({
                  cursor: "pointer",
                  _hover: { bg: "bg.subtle" },
                  bg: selectedColumn === col.name ? { base: "blue.50", _dark: "blue.950" } : undefined,
                })}
              >
                <Table.Cell>
                  <Flex align="center" gap="2">
                    {col.isPrimaryKey && (
                      <Box
                        px="1.5"
                        py="0.5"
                        fontSize="xs"
                        fontWeight="bold"
                        bg={{ base: "yellow.100", _dark: "yellow.900" }}
                        color={{ base: "yellow.800", _dark: "yellow.200" }}
                        rounded="sm"
                      >
                        PK
                      </Box>
                    )}
                    <Box fontWeight={col.isPrimaryKey ? "bold" : "normal"}>
                      {col.name}
                    </Box>
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <Box as="code" fontFamily="mono" fontSize="sm" color={{ base: "blue.600", _dark: "blue.400" }}>
                    {col.type}
                    {col.maxLength && `(${col.maxLength})`}
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Box color={col.nullable ? { base: "green.600", _dark: "green.400" } : { base: "red.600", _dark: "red.400" }} fontWeight={col.nullable ? "normal" : "medium"}>
                    {col.nullable ? "YES" : "NO"}
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Box as="code" fontFamily="mono" fontSize="sm" color="fg.muted">
                    {col.default ?? <Box as="span" fontStyle="italic">NULL</Box>}
                  </Box>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Selected Column Details */}
      {selectedColumn && (
        <Box mt="4" p="3" bg="bg.subtle" rounded="lg" border="1px solid" borderColor="border.default">
          <Box as="h4" mb="2">Column Details: {selectedColumn}</Box>
          {(() => {
            const col = data.columns.find((c) => c.name === selectedColumn);
            if (!col) return null;
            return (
              <Box as="pre" fontFamily="mono" fontSize="xs" p="2" bg="bg.default" rounded="md" overflow="auto">
{`{
  "name": "${col.name}",
  "type": "${col.type}${col.maxLength ? `(${col.maxLength})` : ""}",
  "nullable": ${col.nullable},
  "default": ${col.default ? `"${col.default}"` : "null"},
  "isPrimaryKey": ${col.isPrimaryKey ?? false}
}`}
              </Box>
            );
          })()}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<SchemaViewer />);
