/**
 * YAML Viewer UI for MCP Apps
 *
 * Interactive YAML viewer with:
 * - Syntax highlighting (keys, strings, numbers, booleans, null)
 * - Collapsible sections for objects/arrays
 * - Search/filter functionality
 * - Copy to clipboard
 * - Expand All / Collapse All
 *
 * @module lib/std/src/ui/yaml-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface YamlNode {
  key: string;
  value: unknown;
  path: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  children?: YamlNode[];
  isArrayItem?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "YAML Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Simple YAML Parser
// ============================================================================

/**
 * Parse YAML string to JavaScript object.
 * Handles basic YAML structures: objects, arrays, strings, numbers, booleans, null.
 */
function parseYaml(yamlStr: string): unknown {
  const lines = yamlStr.split("\n");
  const result: unknown[] = [];
  const stack: { indent: number; obj: unknown; key?: string }[] = [{ indent: -1, obj: result }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Count indentation (spaces)
    const indent = line.search(/\S/);

    // Pop stack until we find the right level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Array item (starts with -)
    if (trimmed.startsWith("- ")) {
      const content = trimmed.slice(2).trim();
      const parentArray = ensureArray(parent, stack);

      if (content.includes(": ")) {
        // Inline object in array: - key: value
        const colonIdx = content.indexOf(": ");
        const key = content.slice(0, colonIdx).trim();
        const value = parseValue(content.slice(colonIdx + 2).trim());
        const obj: Record<string, unknown> = { [key]: value };
        parentArray.push(obj);
        stack.push({ indent, obj, key });
      } else if (content === "" || content === "|" || content === ">") {
        // Empty array item or multiline
        const obj: Record<string, unknown> = {};
        parentArray.push(obj);
        stack.push({ indent, obj });
      } else {
        // Simple value in array
        parentArray.push(parseValue(content));
      }
    } else if (trimmed === "-") {
      // Array item with nested content
      const parentArray = ensureArray(parent, stack);
      const obj: Record<string, unknown> = {};
      parentArray.push(obj);
      stack.push({ indent, obj });
    } else if (trimmed.includes(": ")) {
      // Key-value pair
      const colonIdx = trimmed.indexOf(": ");
      const key = trimmed.slice(0, colonIdx).trim();
      const valueStr = trimmed.slice(colonIdx + 2).trim();

      const parentObj = ensureObject(parent, stack);

      if (valueStr === "" || valueStr === "|" || valueStr === ">") {
        // Empty value means nested object/array or multiline
        parentObj[key] = {};
        stack.push({ indent, obj: parentObj[key], key });
      } else {
        parentObj[key] = parseValue(valueStr);
      }
    } else if (trimmed.includes(":") && !trimmed.includes(": ")) {
      // Key with no value (nested object)
      const key = trimmed.replace(":", "").trim();
      const parentObj = ensureObject(parent, stack);
      parentObj[key] = {};
      stack.push({ indent, obj: parentObj[key], key });
    }
  }

  // Return the root object
  if (result.length === 1 && typeof result[0] === "object" && result[0] !== null) {
    return result[0];
  }
  return result.length > 0 ? result : {};
}

function ensureArray(parent: { obj: unknown }, _stack: unknown[]): unknown[] {
  if (Array.isArray(parent.obj)) {
    return parent.obj;
  }
  // Convert to array if needed
  const arr: unknown[] = [];
  if (typeof parent.obj === "object" && parent.obj !== null) {
    const obj = parent.obj as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 0) {
      // Find the last key added and make it an array
      const lastKey = keys[keys.length - 1];
      if (!Array.isArray(obj[lastKey])) {
        obj[lastKey] = [];
      }
      return obj[lastKey] as unknown[];
    }
  }
  return arr;
}

function ensureObject(parent: { obj: unknown }, _stack: unknown[]): Record<string, unknown> {
  if (Array.isArray(parent.obj)) {
    const obj: Record<string, unknown> = {};
    parent.obj.push(obj);
    return obj;
  }
  return parent.obj as Record<string, unknown>;
}

function parseValue(str: string): unknown {
  // Remove quotes if present
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  // Boolean
  if (str === "true" || str === "True" || str === "TRUE") return true;
  if (str === "false" || str === "False" || str === "FALSE") return false;

  // Null
  if (str === "null" || str === "Null" || str === "NULL" || str === "~") return null;

  // Number
  const num = Number(str);
  if (!isNaN(num) && str !== "") return num;

  // String
  return str;
}

// ============================================================================
// Value Styles
// ============================================================================

const valueStyles: Record<YamlNode["type"], string> = {
  string: css({ color: "green.600", fontFamily: "mono", _dark: { color: "green.400" } }),
  number: css({ color: "orange.600", fontFamily: "mono", _dark: { color: "orange.400" } }),
  boolean: css({ color: "purple.600", fontFamily: "mono", _dark: { color: "purple.400" } }),
  null: css({ color: "gray.500", fontStyle: "italic", fontFamily: "mono" }),
  object: css({ color: "fg.default", fontFamily: "mono" }),
  array: css({ color: "fg.default", fontFamily: "mono" }),
};

// ============================================================================
// YAML Tree Node Component
// ============================================================================

function YamlTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchTerm,
}: {
  node: YamlNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, value: unknown) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const matchesSearch =
    searchTerm &&
    (node.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(node.value).toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Box position="relative">
      {/* Indent guide line */}
      {depth > 0 && (
        <Box
          position="absolute"
          left={`${(depth - 1) * 20 + 8}px`}
          top="0"
          bottom="0"
          width="1px"
          bg="border.default"
          opacity="0.3"
        />
      )}

      <Flex
        align="flex-start"
        gap="1"
        py="1"
        pl={`${depth * 20}px`}
        pr="2"
        rounded="sm"
        cursor={hasChildren ? "pointer" : "default"}
        bg={matchesSearch ? "yellow.100" : "transparent"}
        _hover={{ bg: "bg.subtle" }}
        _dark={matchesSearch ? { bg: "yellow.900/30" } : {}}
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          else onSelect(node.path, node.value);
        }}
      >
        {/* Array item marker */}
        {node.isArrayItem && (
          <span className={css({ color: "fg.muted", fontFamily: "mono", mr: "1" })}>-</span>
        )}

        {/* Expand/collapse icon for objects/arrays */}
        {hasChildren ? (
          <span className={css({ w: "4", color: "fg.muted", fontSize: "xs", flexShrink: "0", userSelect: "none" })}>
            {isExpanded ? "v" : ">"}
          </span>
        ) : (
          <span className={css({ w: "4", flexShrink: "0" })} />
        )}

        {/* Key */}
        {!node.isArrayItem && node.key !== "$" && (
          <>
            <span className={css({ color: "blue.600", fontWeight: "medium", fontFamily: "mono", _dark: { color: "blue.400" } })}>
              {node.key}
            </span>
            <span className={css({ color: "fg.muted" })}>:</span>
          </>
        )}

        {/* Value */}
        {hasChildren ? (
          <span className={css({ color: "fg.muted", fontSize: "xs", ml: "1" })}>
            {node.type === "array" ? `(${node.children!.length} items)` : `(${node.children!.length} keys)`}
          </span>
        ) : (
          <span className={valueStyles[node.type]}>{formatValue(node.value, node.type)}</span>
        )}
      </Flex>

      {/* Children */}
      {hasChildren && isExpanded && (
        <Box>
          {node.children!.map((child) => (
            <YamlTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function YamlViewer() {
  const [data, setData] = useState<unknown>(null);
  const [rawYaml, setRawYaml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[yaml-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[yaml-viewer] No MCP host (standalone mode)");
        // Load demo data in standalone mode
        const demoYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: example-config
  namespace: default
  labels:
    app: demo
    version: "1.0"
data:
  database_url: postgresql://localhost:5432/mydb
  redis_host: redis.default.svc.cluster.local
  log_level: info
  features:
    - name: feature-a
      enabled: true
    - name: feature-b
      enabled: false
  settings:
    max_connections: 100
    timeout: 30
    retry: true
    cache:
      ttl: 3600
      max_size: 1000
`;
        setRawYaml(demoYaml);
        try {
          setData(parseYaml(demoYaml));
          setExpanded(new Set(["$"]));
        } catch (e) {
          setError(`Failed to parse YAML: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
        setLoading(false);
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          setRawYaml("");
          return;
        }

        const text = textContent.text;
        setRawYaml(text);

        // Try to parse as JSON first (if already parsed)
        try {
          const parsed = JSON.parse(text);
          setData(parsed);
        } catch {
          // Not JSON, try YAML
          setData(parseYaml(text));
        }
        setExpanded(new Set(["$"]));
      } catch (e) {
        setError(`Failed to parse YAML: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Build tree
  const tree = useMemo(() => {
    if (data === null || data === undefined) return null;
    return buildTree("$", data, "$", false);
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

  const handleCopyToClipboard = useCallback(() => {
    const textToCopy = rawYaml || (data ? toYamlString(data, 0) : "");
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(null), 2000);
      notifyModel("copy", { content: "yaml" });
    });
  }, [rawYaml, data]);

  // Render
  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">Loading YAML...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="4" bg="red.50" color="red.700" rounded="md" _dark={{ bg: "red.950", color: "red.300" }}>{error}</Box>
      </Box>
    );
  }

  if (!tree) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">No YAML data</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Toolbar */}
      <Flex gap="2" mb="3" flexWrap="wrap" align="center">
        <Input
          type="text"
          placeholder="Search keys or values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          size="sm"
          className={css({ flex: 1, minW: "150px" })}
        />
        <Button variant="outline" size="sm" onClick={handleExpandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={handleCollapseAll}>
          Collapse
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
          {copyStatus || "Copy"}
        </Button>
      </Flex>

      {/* Selected path */}
      {selectedPath && (
        <Flex gap="2" align="center" mb="2" p="2" bg="bg.subtle" rounded="md">
          <span className={css({ color: "fg.muted", fontSize: "xs" })}>Path:</span>
          <code className={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600" })}>
            {selectedPath}
          </code>
        </Flex>
      )}

      {/* Tree */}
      <Box border="1px solid" borderColor="border.default" rounded="lg" p="3" bg="bg.default" overflowX="auto" fontFamily="mono" fontSize="sm">
        {tree.children ? (
          tree.children.map((child) => (
            <YamlTreeNode
              key={child.path}
              node={child}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              onSelect={handleSelect}
              searchTerm={searchTerm}
            />
          ))
        ) : (
          <YamlTreeNode
            node={tree}
            depth={0}
            expanded={expanded}
            onToggle={handleToggle}
            onSelect={handleSelect}
            searchTerm={searchTerm}
          />
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function buildTree(key: string, value: unknown, path: string, isArrayItem: boolean): YamlNode {
  const type = getType(value);
  const node: YamlNode = { key, value, path, type, isArrayItem };

  if (type === "object" && value !== null) {
    node.children = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      buildTree(k, v, `${path}.${k}`, false)
    );
  } else if (type === "array") {
    node.children = (value as unknown[]).map((v, i) => buildTree(String(i), v, `${path}[${i}]`, true));
  }

  return node;
}

function getType(value: unknown): YamlNode["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  return "string";
}

function formatValue(value: unknown, type: YamlNode["type"]): string {
  if (type === "null") return "null";
  if (type === "string") {
    const str = String(value);
    if (str.length > 60) return `"${str.slice(0, 60)}..."`;
    // Check if needs quoting
    if (str.includes(":") || str.includes("#") || str === "") {
      return `"${str}"`;
    }
    return str;
  }
  if (type === "boolean") return value ? "true" : "false";
  return String(value);
}

function collectPaths(node: YamlNode): string[] {
  const paths = [node.path];
  if (node.children) {
    node.children.forEach((child) => paths.push(...collectPaths(child)));
  }
  return paths;
}

/**
 * Convert data back to YAML-like string for copying
 */
function toYamlString(data: unknown, indent: number): string {
  const spaces = "  ".repeat(indent);

  if (data === null) return "null";
  if (typeof data === "boolean") return data ? "true" : "false";
  if (typeof data === "number") return String(data);
  if (typeof data === "string") {
    if (data.includes(":") || data.includes("#") || data === "") {
      return `"${data}"`;
    }
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return data
      .map((item) => {
        const itemStr = toYamlString(item, indent + 1);
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const lines = itemStr.split("\n");
          return `${spaces}- ${lines[0]}\n${lines.slice(1).map((l) => `${spaces}  ${l}`).join("\n")}`;
        }
        return `${spaces}- ${itemStr}`;
      })
      .join("\n");
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return `${spaces}${key}:\n${toYamlString(value, indent + 1)}`;
        }
        return `${spaces}${key}: ${toYamlString(value, indent)}`;
      })
      .join("\n");
  }

  return String(data);
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<YamlViewer />);
