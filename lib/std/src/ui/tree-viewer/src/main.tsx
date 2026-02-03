/**
 * Tree Viewer UI for MCP Apps
 *
 * Generic tree viewer for hierarchical data:
 * - Process trees (pstree)
 * - File systems
 * - XML/DOM trees
 * - Any hierarchical structure
 *
 * Features:
 * - Collapsible nodes
 * - ASCII-style guide lines
 * - Configurable icons by node type
 * - Search/filter
 * - Expand All / Collapse All
 * - Node selection with metadata display
 *
 * @module lib/std/src/ui/tree-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface TreeNode {
  id: string;
  label: string;
  type?: string;
  meta?: Record<string, unknown>;
  children?: TreeNode[];
}

interface ContentItem {
  type: string;
  text?: string;
}

interface TreeConfig {
  icons?: Record<string, string>;
  showMeta?: boolean;
  expandDepth?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ICONS: Record<string, string> = {
  folder: "\uD83D\uDCC1",      // folder emoji
  file: "\uD83D\uDCC4",        // document emoji
  process: "\u2699\uFE0F",     // gear emoji
  element: "\uD83C\uDFF7\uFE0F", // label/tag emoji
  root: "\uD83C\uDF33",        // tree emoji
  branch: "\uD83D\uDD17",      // link emoji
  leaf: "\u25CF",              // bullet point
  default: "\u25CF",           // bullet point
};

const GUIDE_CHARS = {
  vertical: "\u2502",   // |
  branch: "\u251C",     // |-
  last: "\u2514",       // L
  horizontal: "\u2500", // -
  space: " ",
};

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Tree Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Guide Lines Component
// ============================================================================

function GuideLines({ guides }: { guides: boolean[] }) {
  return (
    <span class={css({ fontFamily: "mono", color: "fg.subtle", whiteSpace: "pre", userSelect: "none" })}>
      {guides.map((hasLine, i) => (
        <span key={i}>
          {hasLine ? GUIDE_CHARS.vertical : GUIDE_CHARS.space}
          {GUIDE_CHARS.space}
        </span>
      ))}
    </span>
  );
}

// ============================================================================
// Tree Node Component
// ============================================================================

function TreeNodeItem({
  node,
  depth,
  guides,
  isLast,
  expanded,
  selected,
  icons,
  showMeta,
  searchTerm,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  guides: boolean[];
  isLast: boolean;
  expanded: Set<string>;
  selected: string | null;
  icons: Record<string, string>;
  showMeta: boolean;
  searchTerm: string;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const isSelected = selected === node.id;
  const hasChildren = node.children && node.children.length > 0;

  // Search matching
  const matchesSearch = searchTerm && (
    node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (node.meta && Object.values(node.meta).some(
      v => String(v).toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );

  // Get icon for node type
  const icon = icons[node.type || "default"] || icons.default || DEFAULT_ICONS.default;

  // Branch character
  const branchChar = isLast ? GUIDE_CHARS.last : GUIDE_CHARS.branch;

  // Format inline metadata
  const metaString = useMemo(() => {
    if (!showMeta || !node.meta) return null;
    const entries = Object.entries(node.meta).slice(0, 3);
    if (entries.length === 0) return null;
    return entries.map(([k, v]) => `${k}=${formatMetaValue(v)}`).join(" ");
  }, [node.meta, showMeta]);

  return (
    <div>
      <div
        class={css({
          display: "flex",
          alignItems: "center",
          py: "0.5",
          px: "1",
          rounded: "sm",
          cursor: "pointer",
          bg: isSelected ? "blue.100" : matchesSearch ? "yellow.100" : "transparent",
          _hover: { bg: isSelected ? "blue.100" : "bg.subtle" },
          _dark: {
            bg: isSelected ? "blue.900/40" : matchesSearch ? "yellow.900/30" : "transparent",
            _hover: { bg: isSelected ? "blue.900/40" : "bg.subtle" },
          },
        })}
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect(node);
        }}
      >
        {/* Guide lines */}
        <GuideLines guides={guides} />

        {/* Branch connector */}
        {depth > 0 && (
          <span class={css({ fontFamily: "mono", color: "fg.subtle", whiteSpace: "pre", userSelect: "none" })}>
            {branchChar}{GUIDE_CHARS.horizontal}{GUIDE_CHARS.horizontal}{GUIDE_CHARS.space}
          </span>
        )}

        {/* Expand/collapse indicator */}
        {hasChildren ? (
          <span
            class={css({
              w: "4",
              h: "4",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "fg.muted",
              flexShrink: 0,
            })}
          >
            {isExpanded ? "\u25BC" : "\u25B6"}
          </span>
        ) : (
          <span class={css({ w: "4", flexShrink: 0 })} />
        )}

        {/* Icon */}
        <span class={css({ mr: "1.5", fontSize: "sm", flexShrink: 0 })}>
          {icon}
        </span>

        {/* Label */}
        <span class={css({ fontWeight: "medium", color: "fg.default" })}>
          {node.label}
        </span>

        {/* Children count badge */}
        {hasChildren && (
          <span class={css({
            ml: "2",
            px: "1.5",
            py: "0.5",
            fontSize: "10px",
            fontWeight: "medium",
            bg: "bg.subtle",
            color: "fg.muted",
            rounded: "full",
          })}>
            {node.children!.length}
          </span>
        )}

        {/* Inline metadata */}
        {metaString && (
          <span class={css({
            ml: "3",
            fontSize: "xs",
            fontFamily: "mono",
            color: "fg.subtle",
            opacity: 0.8,
          })}>
            {metaString}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, index) => {
            const childIsLast = index === node.children!.length - 1;
            const childGuides = depth > 0 ? [...guides, !isLast] : [];

            return (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                guides={childGuides}
                isLast={childIsLast}
                expanded={expanded}
                selected={selected}
                icons={icons}
                showMeta={showMeta}
                searchTerm={searchTerm}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function TreeViewer() {
  const [data, setData] = useState<TreeNode | null>(null);
  const [config, setConfig] = useState<TreeConfig>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Merge icons with defaults
  const icons = useMemo(() => ({
    ...DEFAULT_ICONS,
    ...(config.icons || {}),
  }), [config.icons]);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[tree-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[tree-viewer] No MCP host (standalone mode)");
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

        // Support both { tree, config } and direct TreeNode
        if (parsed.tree) {
          setData(parsed.tree);
          setConfig(parsed.config || {});
        } else {
          setData(parsed);
          setConfig({});
        }

        // Initial expansion based on config
        const depth = parsed.config?.expandDepth ?? 1;
        if (parsed.tree || parsed) {
          const root = parsed.tree || parsed;
          const initialExpanded = collectNodesAtDepth(root, depth);
          setExpanded(new Set(initialExpanded));
        }
      } catch (e) {
        setError(`Failed to parse tree data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Handlers
  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: TreeNode) => {
    setSelected(node.id);
    setSelectedNode(node);
    notifyModel("select", {
      id: node.id,
      label: node.label,
      type: node.type,
      meta: node.meta,
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!data) return;
    const allIds = collectAllIds(data);
    setExpanded(new Set(allIds));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    if (!data) return;
    setExpanded(new Set([data.id]));
  }, [data]);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    if (term && data) {
      // Auto-expand nodes that match or contain matches
      const matchingPaths = findMatchingPaths(data, term);
      setExpanded((prev) => new Set([...prev, ...matchingPaths]));
    }
  }, [data]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Render
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading tree...</div>
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

  if (!data) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No tree data</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Toolbar */}
      <div class={styles.toolbar}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search nodes... (Ctrl+F)"
          value={searchTerm}
          onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
          class={styles.searchInput}
        />
        <button class={styles.btn} onClick={handleExpandAll}>
          Expand All
        </button>
        <button class={styles.btn} onClick={handleCollapseAll}>
          Collapse All
        </button>
      </div>

      {/* Selected node info */}
      {selectedNode && selectedNode.meta && Object.keys(selectedNode.meta).length > 0 && (
        <div class={styles.metaPanel}>
          <div class={css({ fontSize: "xs", fontWeight: "semibold", color: "fg.muted", mb: "1" })}>
            Node Details: {selectedNode.label}
          </div>
          <div class={css({ display: "flex", flexWrap: "wrap", gap: "3" })}>
            {Object.entries(selectedNode.meta).map(([key, value]) => (
              <div key={key} class={css({ fontSize: "xs" })}>
                <span class={css({ color: "fg.muted" })}>{key}:</span>{" "}
                <span class={css({ fontFamily: "mono", color: "fg.default" })}>
                  {formatMetaValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tree */}
      <div class={styles.treeContainer}>
        <TreeNodeItem
          node={data}
          depth={0}
          guides={[]}
          isLast={true}
          expanded={expanded}
          selected={selected}
          icons={icons}
          showMeta={config.showMeta !== false}
          searchTerm={searchTerm}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      </div>

      {/* Stats */}
      <div class={styles.stats}>
        <span class={css({ color: "fg.muted", fontSize: "xs" })}>
          {countNodes(data)} nodes
          {searchTerm && ` | ${countMatchingNodes(data, searchTerm)} matches`}
        </span>
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
  metaPanel: css({
    mb: "3",
    p: "3",
    bg: "bg.subtle",
    rounded: "md",
    border: "1px solid",
    borderColor: "border.default",
  }),
  treeContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    p: "3",
    bg: "bg.default",
    overflowX: "auto",
    fontSize: "sm",
  }),
  stats: css({
    mt: "2",
    display: "flex",
    justifyContent: "flex-end",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
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

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectAllIds(node: TreeNode): string[] {
  const ids = [node.id];
  if (node.children) {
    node.children.forEach((child) => ids.push(...collectAllIds(child)));
  }
  return ids;
}

function collectNodesAtDepth(node: TreeNode, maxDepth: number, currentDepth = 0): string[] {
  const ids: string[] = [];
  if (currentDepth <= maxDepth) {
    ids.push(node.id);
    if (node.children) {
      node.children.forEach((child) => {
        ids.push(...collectNodesAtDepth(child, maxDepth, currentDepth + 1));
      });
    }
  }
  return ids;
}

function findMatchingPaths(node: TreeNode, term: string, path: string[] = []): string[] {
  const currentPath = [...path, node.id];
  const matches: string[] = [];

  const nodeMatches =
    node.label.toLowerCase().includes(term.toLowerCase()) ||
    node.type?.toLowerCase().includes(term.toLowerCase()) ||
    (node.meta && Object.values(node.meta).some(
      v => String(v).toLowerCase().includes(term.toLowerCase())
    ));

  if (nodeMatches) {
    matches.push(...currentPath);
  }

  if (node.children) {
    node.children.forEach((child) => {
      const childMatches = findMatchingPaths(child, term, currentPath);
      matches.push(...childMatches);
    });
  }

  return matches;
}

function countNodes(node: TreeNode): number {
  let count = 1;
  if (node.children) {
    node.children.forEach((child) => {
      count += countNodes(child);
    });
  }
  return count;
}

function countMatchingNodes(node: TreeNode, term: string): number {
  let count = 0;

  const nodeMatches =
    node.label.toLowerCase().includes(term.toLowerCase()) ||
    node.type?.toLowerCase().includes(term.toLowerCase()) ||
    (node.meta && Object.values(node.meta).some(
      v => String(v).toLowerCase().includes(term.toLowerCase())
    ));

  if (nodeMatches) count++;

  if (node.children) {
    node.children.forEach((child) => {
      count += countMatchingNodes(child, term);
    });
  }

  return count;
}

// ============================================================================
// Mount
// ============================================================================

render(<TreeViewer />, document.getElementById("app")!);
