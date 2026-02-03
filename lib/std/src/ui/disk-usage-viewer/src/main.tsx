/**
 * Disk Usage Viewer UI for MCP Apps
 *
 * Treemap/sunburst visualization of disk usage:
 * - Squarified treemap layout
 * - Drill-down navigation
 * - Size-proportional rectangles
 * - Color coding by file type
 *
 * @module lib/std/src/ui/disk-usage-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface DiskNode {
  name: string;
  size: number; // bytes
  type: "file" | "directory";
  children?: DiskNode[];
}

interface DiskUsageData {
  root: DiskNode;
  totalSize: number;
  path: string;
}

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  node: DiskNode;
  depth: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Disk Usage Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes to human-readable string
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Get file extension from name
 */
function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * Get color based on file type/extension
 */
function getColor(node: DiskNode, depth: number): string {
  if (node.type === "directory") {
    // Gray shades for directories based on depth
    const shades = ["#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb"];
    return shades[depth % shades.length];
  }

  const ext = getExtension(node.name);
  const colorMap: Record<string, string> = {
    // JavaScript/TypeScript - yellow/amber
    js: "#f59e0b",
    jsx: "#f59e0b",
    ts: "#eab308",
    tsx: "#eab308",
    mjs: "#f59e0b",
    cjs: "#f59e0b",

    // JSON - green
    json: "#10b981",
    jsonc: "#10b981",

    // Markdown/docs - blue
    md: "#3b82f6",
    mdx: "#3b82f6",
    txt: "#60a5fa",
    rst: "#60a5fa",

    // Images - violet/purple
    png: "#8b5cf6",
    jpg: "#8b5cf6",
    jpeg: "#8b5cf6",
    gif: "#a78bfa",
    svg: "#a78bfa",
    webp: "#8b5cf6",
    ico: "#a78bfa",

    // Styles - pink/magenta
    css: "#ec4899",
    scss: "#ec4899",
    sass: "#ec4899",
    less: "#f472b6",

    // HTML - orange
    html: "#f97316",
    htm: "#f97316",

    // Config - cyan
    yaml: "#06b6d4",
    yml: "#06b6d4",
    toml: "#22d3ee",
    ini: "#22d3ee",
    env: "#06b6d4",

    // Data - teal
    csv: "#14b8a6",
    xml: "#2dd4bf",
    sql: "#14b8a6",

    // Archives - red
    zip: "#ef4444",
    tar: "#ef4444",
    gz: "#dc2626",
    rar: "#ef4444",

    // Binaries - slate
    exe: "#475569",
    dll: "#475569",
    so: "#475569",
    bin: "#64748b",
    wasm: "#64748b",

    // Lock files - gray
    lock: "#9ca3af",
  };

  return colorMap[ext] || "#94a3b8"; // Default slate gray
}

// ============================================================================
// Squarified Treemap Algorithm
// ============================================================================

/**
 * Calculate aspect ratio for a row of items in given bounds
 */
function worstRatio(row: DiskNode[], width: number, totalSize: number): number {
  if (row.length === 0) return Infinity;

  const rowSize = row.reduce((sum, n) => sum + n.size, 0);
  const rowArea = (rowSize / totalSize) * (width * width);
  const rowWidth = rowArea / width;

  let worst = 0;
  for (const node of row) {
    const nodeArea = (node.size / totalSize) * (width * width);
    const nodeHeight = nodeArea / rowWidth;
    const ratio = Math.max(rowWidth / nodeHeight, nodeHeight / rowWidth);
    worst = Math.max(worst, ratio);
  }

  return worst;
}

/**
 * Squarified treemap layout algorithm
 * Reference: Bruls, Huizing, van Wijk - "Squarified Treemaps"
 */
function squarify(
  nodes: DiskNode[],
  bounds: { x: number; y: number; width: number; height: number },
  totalSize: number,
  depth: number,
  results: TreemapRect[]
): void {
  if (nodes.length === 0 || totalSize === 0) return;

  // Filter out zero-size nodes and sort by size descending
  const sortedNodes = nodes.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);

  if (sortedNodes.length === 0) return;

  const { x, y, width, height } = bounds;
  const shortSide = Math.min(width, height);
  const isHorizontal = width >= height;

  let row: DiskNode[] = [];
  let rowSize = 0;
  let remaining = [...sortedNodes];

  while (remaining.length > 0) {
    const current = remaining[0];
    const newRow = [...row, current];
    const newRowSize = rowSize + current.size;

    // Check if adding this item improves the aspect ratio
    const currentRatio = worstRatio(row, shortSide, totalSize);
    const newRatio = worstRatio(newRow, shortSide, totalSize);

    if (row.length === 0 || newRatio <= currentRatio) {
      // Add to current row
      row = newRow;
      rowSize = newRowSize;
      remaining = remaining.slice(1);
    } else {
      // Lay out current row and start new one
      layoutRow(row, bounds, totalSize, isHorizontal, depth, results);

      // Calculate remaining bounds
      const rowFraction = rowSize / totalSize;
      const rowDimension = (isHorizontal ? width : height) * rowFraction;

      const newBounds = isHorizontal
        ? { x: x + rowDimension, y, width: width - rowDimension, height }
        : { x, y: y + rowDimension, width, height: height - rowDimension };

      // Update total size for remaining nodes
      const remainingSize = remaining.reduce((sum, n) => sum + n.size, 0);

      // Recurse with remaining nodes
      squarify(remaining, newBounds, remainingSize, depth, results);
      return;
    }
  }

  // Lay out final row
  if (row.length > 0) {
    layoutRow(row, bounds, totalSize, isHorizontal, depth, results);
  }
}

/**
 * Layout a single row of nodes
 */
function layoutRow(
  row: DiskNode[],
  bounds: { x: number; y: number; width: number; height: number },
  totalSize: number,
  isHorizontal: boolean,
  depth: number,
  results: TreemapRect[]
): void {
  const { x, y, width, height } = bounds;
  const rowSize = row.reduce((sum, n) => sum + n.size, 0);
  const rowFraction = rowSize / totalSize;

  // Row takes up a strip along the short side
  const rowDimension = isHorizontal ? width * rowFraction : height * rowFraction;

  let offset = 0;

  for (const node of row) {
    const nodeFraction = node.size / rowSize;
    const nodeDimension = (isHorizontal ? height : width) * nodeFraction;

    const rect: TreemapRect = isHorizontal
      ? {
          x,
          y: y + offset,
          width: rowDimension,
          height: nodeDimension,
          node,
          depth,
        }
      : {
          x: x + offset,
          y,
          width: nodeDimension,
          height: rowDimension,
          node,
          depth,
        };

    results.push(rect);
    offset += nodeDimension;
  }
}

/**
 * Build treemap rectangles for a node and its children
 */
function buildTreemap(
  node: DiskNode,
  bounds: { x: number; y: number; width: number; height: number },
  depth: number = 0,
  maxDepth: number = 1
): TreemapRect[] {
  const results: TreemapRect[] = [];

  if (!node.children || node.children.length === 0 || depth >= maxDepth) {
    // Leaf node or max depth reached
    results.push({ ...bounds, node, depth });
    return results;
  }

  // Layout children
  const childrenWithSize = node.children.filter((c) => c.size > 0);
  const totalSize = childrenWithSize.reduce((sum, c) => sum + c.size, 0);

  if (totalSize === 0) {
    results.push({ ...bounds, node, depth });
    return results;
  }

  squarify(childrenWithSize, bounds, totalSize, depth, results);

  return results;
}

// ============================================================================
// Components
// ============================================================================

interface TreemapRectProps {
  rect: TreemapRect;
  onNavigate: (node: DiskNode) => void;
  hoveredPath: string | null;
  setHoveredPath: (path: string | null) => void;
  currentPath: string[];
}

function TreemapRectangle({ rect, onNavigate, hoveredPath, setHoveredPath, currentPath }: TreemapRectProps) {
  const { x, y, width, height, node, depth } = rect;
  const minSize = 3;
  const padding = 1;

  // Skip if too small
  if (width < minSize || height < minSize) return null;

  const fullPath = [...currentPath, node.name].join("/");
  const isHovered = hoveredPath === fullPath;
  const color = getColor(node, depth);
  const canNavigate = node.type === "directory" && node.children && node.children.length > 0;

  // Calculate label visibility
  const showLabel = width > 40 && height > 20;
  const showSize = width > 60 && height > 35;

  // Truncate label to fit
  const maxChars = Math.floor((width - 8) / 7);
  const displayName = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + "..." : node.name;

  return (
    <g
      class={css({ cursor: canNavigate ? "pointer" : "default" })}
      onMouseEnter={() => setHoveredPath(fullPath)}
      onMouseLeave={() => setHoveredPath(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (canNavigate) {
          notifyModel("navigate", { path: fullPath, name: node.name, size: node.size });
          onNavigate(node);
        }
      }}
    >
      <rect
        x={x + padding}
        y={y + padding}
        width={Math.max(0, width - padding * 2)}
        height={Math.max(0, height - padding * 2)}
        fill={color}
        stroke={isHovered ? "#fff" : "#1f2937"}
        strokeWidth={isHovered ? 2 : 0.5}
        opacity={isHovered ? 1 : 0.85}
        rx={2}
      >
        <title>{`${fullPath}\n${formatSize(node.size)} (${node.type})`}</title>
      </rect>

      {showLabel && (
        <text
          x={x + padding + 4}
          y={y + padding + 14}
          fontSize={11}
          fontWeight={500}
          fill="#fff"
          class={css({ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.5)" })}
        >
          {node.type === "directory" ? "📁 " : ""}
          {displayName}
        </text>
      )}

      {showSize && (
        <text
          x={x + padding + 4}
          y={y + padding + 28}
          fontSize={10}
          fill="#fff"
          fillOpacity={0.8}
          class={css({ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.5)" })}
        >
          {formatSize(node.size)}
        </text>
      )}
    </g>
  );
}

interface BreadcrumbProps {
  pathStack: DiskNode[];
  rootPath: string;
  onNavigateToIndex: (index: number) => void;
}

function Breadcrumb({ pathStack, rootPath, onNavigateToIndex }: BreadcrumbProps) {
  return (
    <div class={styles.breadcrumb}>
      <button
        class={styles.breadcrumbItem}
        onClick={() => onNavigateToIndex(0)}
        disabled={pathStack.length === 1}
      >
        {rootPath || "root"}
      </button>
      {pathStack.slice(1).map((node, i) => (
        <span key={i} class={styles.breadcrumbSeparator}>
          <span class={css({ mx: "1", color: "fg.subtle" })}>/</span>
          <button
            class={styles.breadcrumbItem}
            onClick={() => onNavigateToIndex(i + 1)}
            disabled={i === pathStack.length - 2}
          >
            {node.name}
          </button>
        </span>
      ))}
    </div>
  );
}

interface TooltipProps {
  path: string | null;
  node: DiskNode | null;
  totalSize: number;
}

function Tooltip({ path, node, totalSize }: TooltipProps) {
  if (!path || !node) return null;

  const percentage = ((node.size / totalSize) * 100).toFixed(1);

  return (
    <div class={styles.tooltip}>
      <div class={styles.tooltipPath}>{path}</div>
      <div class={styles.tooltipSize}>
        {formatSize(node.size)} ({percentage}%)
      </div>
      <div class={styles.tooltipType}>
        {node.type === "directory" ? "Directory" : `File (${getExtension(node.name) || "no ext"})`}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DiskUsageViewer() {
  const [data, setData] = useState<DiskUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathStack, setPathStack] = useState<DiskNode[]>([]);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[disk-usage-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[disk-usage-viewer] No MCP host (standalone mode)");
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
        const parsed = JSON.parse(textContent.text) as DiskUsageData;
        setData(parsed);
        setPathStack([parsed.root]);
      } catch (e) {
        setError(`Failed to parse disk usage data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Current node being viewed
  const currentNode = pathStack[pathStack.length - 1] || null;

  // Build path string for breadcrumb
  const currentPathParts = useMemo(() => pathStack.map((n) => n.name), [pathStack]);

  // Build treemap
  const treemapRects = useMemo(() => {
    if (!currentNode) return [];
    return buildTreemap(currentNode, { x: 0, y: 0, width: 700, height: 450 }, 0, 1);
  }, [currentNode]);

  // Find hovered node for tooltip
  const hoveredNode = useMemo(() => {
    if (!hoveredPath) return null;
    for (const rect of treemapRects) {
      const fullPath = [...currentPathParts, rect.node.name].join("/");
      if (fullPath === hoveredPath) return rect.node;
    }
    return null;
  }, [hoveredPath, treemapRects, currentPathParts]);

  // Navigation handlers
  const handleNavigate = useCallback((node: DiskNode) => {
    setPathStack((prev) => [...prev, node]);
  }, []);

  const handleNavigateToIndex = useCallback((index: number) => {
    setPathStack((prev) => prev.slice(0, index + 1));
  }, []);

  const handleBack = useCallback(() => {
    if (pathStack.length > 1) {
      setPathStack((prev) => prev.slice(0, -1));
    }
  }, [pathStack.length]);

  // Dimensions
  const width = 700;
  const height = 450;

  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading disk usage data...</div>
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

  if (!data || !currentNode) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No disk usage data</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.titleRow}>
          <h2 class={styles.title}>Disk Usage</h2>
          <span class={styles.totalSize}>{formatSize(data.totalSize)} total</span>
        </div>

        <div class={styles.controls}>
          <button class={styles.backBtn} onClick={handleBack} disabled={pathStack.length <= 1}>
            Back
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb pathStack={pathStack} rootPath={data.path} onNavigateToIndex={handleNavigateToIndex} />

      {/* Current directory info */}
      <div class={styles.currentInfo}>
        <span class={styles.currentName}>
          {currentNode.type === "directory" ? "📁" : "📄"} {currentNode.name}
        </span>
        <span class={styles.currentSize}>{formatSize(currentNode.size)}</span>
        {currentNode.children && (
          <span class={styles.currentItems}>{currentNode.children.length} items</span>
        )}
      </div>

      {/* Treemap */}
      <div class={styles.treemapContainer}>
        <svg
          width={width}
          height={height}
          class={css({ bg: "bg.subtle", rounded: "lg", border: "1px solid", borderColor: "border.default" })}
        >
          {treemapRects.map((rect, i) => (
            <TreemapRectangle
              key={`${rect.node.name}-${i}`}
              rect={rect}
              onNavigate={handleNavigate}
              hoveredPath={hoveredPath}
              setHoveredPath={setHoveredPath}
              currentPath={currentPathParts}
            />
          ))}
        </svg>

        {/* Tooltip */}
        <Tooltip path={hoveredPath} node={hoveredNode} totalSize={currentNode.size} />
      </div>

      {/* Legend */}
      <div class={styles.legend}>
        <div class={styles.legendTitle}>Legend:</div>
        <div class={styles.legendItems}>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#6b7280" })} />
            <span>Directories</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#eab308" })} />
            <span>JS/TS</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#10b981" })} />
            <span>JSON</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#3b82f6" })} />
            <span>Markdown</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#8b5cf6" })} />
            <span>Images</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#ec4899" })} />
            <span>Styles</span>
          </div>
          <div class={styles.legendItem}>
            <span class={css({ w: "3", h: "3", rounded: "sm", bg: "#94a3b8" })} />
            <span>Other</span>
          </div>
        </div>
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
    minHeight: "100vh",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
    flexWrap: "wrap",
    gap: "2",
  }),
  titleRow: css({
    display: "flex",
    alignItems: "baseline",
    gap: "3",
  }),
  title: css({
    fontSize: "xl",
    fontWeight: "semibold",
    m: "0",
  }),
  totalSize: css({
    fontSize: "sm",
    color: "fg.muted",
  }),
  controls: css({
    display: "flex",
    gap: "2",
  }),
  backBtn: css({
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "sm",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
    _disabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  }),
  breadcrumb: css({
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    mb: "3",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    fontSize: "sm",
  }),
  breadcrumbItem: css({
    bg: "transparent",
    border: "none",
    color: "blue.500",
    cursor: "pointer",
    p: "0",
    _hover: { textDecoration: "underline" },
    _disabled: {
      color: "fg.default",
      cursor: "default",
      fontWeight: "medium",
      _hover: { textDecoration: "none" },
    },
  }),
  breadcrumbSeparator: css({
    display: "inline-flex",
    alignItems: "center",
  }),
  currentInfo: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
    mb: "3",
    p: "2",
    bg: "bg.muted",
    rounded: "md",
  }),
  currentName: css({
    fontWeight: "medium",
  }),
  currentSize: css({
    color: "fg.muted",
    fontSize: "sm",
  }),
  currentItems: css({
    color: "fg.subtle",
    fontSize: "xs",
  }),
  treemapContainer: css({
    position: "relative",
    display: "flex",
    justifyContent: "center",
    mb: "4",
  }),
  tooltip: css({
    position: "absolute",
    top: "2",
    right: "2",
    p: "3",
    bg: "bg.default",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    shadow: "md",
    minWidth: "200px",
    zIndex: 10,
  }),
  tooltipPath: css({
    fontWeight: "medium",
    mb: "1",
    wordBreak: "break-all",
    fontSize: "xs",
    color: "fg.default",
  }),
  tooltipSize: css({
    fontSize: "sm",
    color: "fg.muted",
    mb: "0.5",
  }),
  tooltipType: css({
    fontSize: "xs",
    color: "fg.subtle",
  }),
  legend: css({
    p: "3",
    bg: "bg.subtle",
    rounded: "md",
  }),
  legendTitle: css({
    fontSize: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    mb: "2",
  }),
  legendItems: css({
    display: "flex",
    gap: "4",
    flexWrap: "wrap",
  }),
  legendItem: css({
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    fontSize: "xs",
    color: "fg.muted",
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
// Mount
// ============================================================================

render(<DiskUsageViewer />, document.getElementById("app")!);
