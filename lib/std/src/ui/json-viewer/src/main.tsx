/**
 * JSON Viewer UI for MCP Apps
 *
 * Interactive JSON tree viewer with:
 * - Collapsible nodes
 * - Syntax highlighting
 * - Path copying
 * - Search/filter
 *
 * @module lib/std/src/ui/json-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface JsonNode {
  key: string;
  value: unknown;
  path: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  children?: JsonNode[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "JSON Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// JSON Tree Component
// ============================================================================

function JsonTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchTerm,
}: {
  node: JsonNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, value: unknown) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const matchesSearch = searchTerm &&
    (node.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
     String(node.value).toLowerCase().includes(searchTerm.toLowerCase()));

  const typeColor: Record<string, string> = {
    string: "green.600",
    number: "blue.600",
    boolean: "purple.600",
    null: "gray.500",
    object: "fg.default",
    array: "fg.default",
  };

  return (
    <div class={css({ pl: depth > 0 ? "4" : "0" })}>
      <div
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "1",
          py: "0.5",
          px: "1",
          rounded: "sm",
          cursor: "pointer",
          bg: matchesSearch ? "yellow.100" : "transparent",
          _hover: { bg: "bg.subtle" },
          _dark: matchesSearch ? { bg: "yellow.900/30" } : {},
        })}
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          else onSelect(node.path, node.value);
        }}
      >
        {/* Expand/collapse icon */}
        {hasChildren ? (
          <span class={css({ w: "4", color: "fg.muted", fontSize: "xs" })}>
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : (
          <span class={css({ w: "4" })} />
        )}

        {/* Key */}
        <span class={css({ color: "fg.default", fontWeight: "medium" })}>
          {node.key}
        </span>

        <span class={css({ color: "fg.muted" })}>:</span>

        {/* Value preview */}
        {hasChildren ? (
          <span class={css({ color: "fg.muted", fontSize: "xs" })}>
            {node.type === "array"
              ? `[${node.children!.length}]`
              : `{${node.children!.length}}`}
          </span>
        ) : (
          <span class={css({ color: typeColor[node.type], fontFamily: "mono", fontSize: "sm" })}>
            {formatValue(node.value, node.type)}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <JsonTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function JsonViewer() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[json-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[json-viewer] No MCP host (standalone mode)");
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
        setData(JSON.parse(textContent.text));
        setExpanded(new Set(["$"]));
      } catch (e) {
        setError(`Failed to parse JSON: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Build tree
  const tree = useMemo(() => {
    if (data === null || data === undefined) return null;
    return buildTree("$", data, "$");
  }, [data]);

  // Handlers
  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((path: string, value: unknown) => {
    setSelectedPath(path);
    notifyModel("select", { path, value });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!tree) return;
    const paths = collectPaths(tree);
    setExpanded(new Set(paths));
  }, [tree]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set(["$"]));
  }, []);

  const handleCopyPath = useCallback(() => {
    if (selectedPath) {
      navigator.clipboard.writeText(selectedPath);
      notifyModel("copy", { path: selectedPath });
    }
  }, [selectedPath]);

  // Render
  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading JSON...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!tree) {
    return <div class={styles.container}><div class={styles.empty}>No JSON data</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* Toolbar */}
      <div class={styles.toolbar}>
        <input
          type="text"
          placeholder="Search keys or values..."
          value={searchTerm}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          class={styles.searchInput}
        />
        <button class={styles.btn} onClick={handleExpandAll}>Expand All</button>
        <button class={styles.btn} onClick={handleCollapseAll}>Collapse</button>
        {selectedPath && (
          <button class={styles.btn} onClick={handleCopyPath}>Copy Path</button>
        )}
      </div>

      {/* Selected path */}
      {selectedPath && (
        <div class={styles.pathBar}>
          <span class={css({ color: "fg.muted", fontSize: "xs" })}>Path:</span>
          <code class={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600" })}>
            {selectedPath}
          </code>
        </div>
      )}

      {/* Tree */}
      <div class={styles.treeContainer}>
        <JsonTreeNode
          node={tree}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={handleSelect}
          searchTerm={searchTerm}
        />
      </div>
    </div>
  );
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
  toolbar: css({
    display: "flex",
    gap: "2",
    mb: "3",
    flexWrap: "wrap",
    alignItems: "center",
  }),
  searchInput: css({
    flex: 1,
    minW: "150px",
    p: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    outline: "none",
    _focus: { borderColor: "border.accent" },
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
  pathBar: css({
    display: "flex",
    gap: "2",
    alignItems: "center",
    mb: "2",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
  }),
  treeContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    p: "3",
    bg: "bg.default",
    overflowX: "auto",
    fontFamily: "mono",
    fontSize: "sm",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({ p: "4", bg: "red.50", color: "red.700", rounded: "md", _dark: { bg: "red.950", color: "red.300" } }),
};

// ============================================================================
// Helpers
// ============================================================================

function buildTree(key: string, value: unknown, path: string): JsonNode {
  const type = getType(value);
  const node: JsonNode = { key, value, path, type };

  if (type === "object" && value !== null) {
    node.children = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      buildTree(k, v, `${path}.${k}`)
    );
  } else if (type === "array") {
    node.children = (value as unknown[]).map((v, i) =>
      buildTree(String(i), v, `${path}[${i}]`)
    );
  }

  return node;
}

function getType(value: unknown): JsonNode["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonNode["type"];
}

function formatValue(value: unknown, type: string): string {
  if (type === "string") return `"${String(value).slice(0, 50)}${String(value).length > 50 ? "..." : ""}"`;
  if (type === "null") return "null";
  return String(value);
}

function collectPaths(node: JsonNode): string[] {
  const paths = [node.path];
  if (node.children) {
    node.children.forEach((child) => paths.push(...collectPaths(child)));
  }
  return paths;
}

// ============================================================================
// Mount
// ============================================================================

render(<JsonViewer />, document.getElementById("app")!);
