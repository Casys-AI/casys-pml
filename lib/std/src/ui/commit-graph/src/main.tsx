/**
 * Commit Graph UI for MCP Apps
 *
 * Interactive Git commit graph visualization with:
 * - SVG-based branch lines and merge visualization
 * - Color-coded branches
 * - Clickable commits with hover details
 * - Ref badges (branches, tags)
 * - Zoom and pan support
 *
 * @module lib/std/src/ui/commit-graph
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  refs: string[];
  graphChars: string;
  parents: string[];
  author: string;
  timestamp: number;
}

interface GraphData {
  commits: Commit[];
  branches: string[];
  totalCommits: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface GraphNode {
  commit: Commit;
  x: number;
  y: number;
  rail: number;
  parentConnections: Array<{
    parentHash: string;
    parentRail: number;
    parentY: number;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const NODE_RADIUS = 6;
const ROW_HEIGHT = 36;
const RAIL_WIDTH = 24;
const GRAPH_PADDING = 20;
const RAIL_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Commit Graph", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Graph Layout Algorithm
// ============================================================================

/**
 * Calculate graph layout from commits
 * Assigns each commit to a "rail" (x position) based on branch topology
 */
function calculateGraphLayout(commits: Commit[]): GraphNode[] {
  if (commits.length === 0) return [];

  const nodes: GraphNode[] = [];
  const commitIndexMap = new Map<string, number>();
  const commitRailMap = new Map<string, number>();
  const activeRails = new Set<number>();

  // First pass: index all commits
  commits.forEach((commit, idx) => {
    commitIndexMap.set(commit.hash, idx);
  });

  // Second pass: assign rails
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // Check if any parent assigned a rail to this commit
    let assignedRail = commitRailMap.get(commit.hash);

    if (assignedRail === undefined) {
      // Find the first available rail
      assignedRail = 0;
      while (activeRails.has(assignedRail)) {
        assignedRail++;
      }
    }

    activeRails.add(assignedRail);
    commitRailMap.set(commit.hash, assignedRail);

    // Process parents
    const parentConnections: GraphNode["parentConnections"] = [];

    for (let p = 0; p < commit.parents.length; p++) {
      const parentHash = commit.parents[p];
      const parentIdx = commitIndexMap.get(parentHash);

      if (parentIdx !== undefined) {
        // Parent exists in our commit list
        let parentRail = commitRailMap.get(parentHash);

        if (parentRail === undefined) {
          if (p === 0) {
            // First parent continues on same rail
            parentRail = assignedRail;
          } else {
            // Other parents get new rails
            parentRail = 0;
            while (activeRails.has(parentRail) || commitRailMap.has(parentHash)) {
              parentRail++;
            }
          }
          commitRailMap.set(parentHash, parentRail);
        }

        parentConnections.push({
          parentHash,
          parentRail,
          parentY: parentIdx * ROW_HEIGHT + GRAPH_PADDING,
        });
      }
    }

    // If this commit has no parents pointing to it from below, free the rail
    const hasChildOnRail = commits.slice(i + 1).some((c) => {
      const cRail = commitRailMap.get(c.hash);
      return cRail === assignedRail && c.parents.includes(commit.hash);
    });

    if (!hasChildOnRail && commit.parents.length === 0) {
      activeRails.delete(assignedRail);
    }

    nodes.push({
      commit,
      x: assignedRail * RAIL_WIDTH + GRAPH_PADDING,
      y: i * ROW_HEIGHT + GRAPH_PADDING,
      rail: assignedRail,
      parentConnections,
    });
  }

  return nodes;
}

/**
 * Format relative time from timestamp
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/**
 * Format full date from timestamp
 */
function formatFullDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// ============================================================================
// Components
// ============================================================================

interface RefBadgeProps {
  refName: string;
}

function RefBadge({ refName }: RefBadgeProps) {
  const isTag = refName.startsWith("tag:");
  const isRemote = refName.includes("/");
  const isHead = refName === "HEAD";
  const displayName = isTag ? refName.replace("tag:", "") : refName;

  let variant: "solid" | "subtle" | "outline" = "subtle";
  let colorPalette = "green";

  if (isTag) {
    colorPalette = "amber";
  } else if (isHead) {
    colorPalette = "purple";
  } else if (isRemote) {
    colorPalette = "gray";
    variant = "outline";
  }

  return (
    <Badge size="sm" variant={variant} colorPalette={colorPalette}>
      {displayName}
    </Badge>
  );
}

interface CommitPopupProps {
  node: GraphNode;
  position: { x: number; y: number };
}

function CommitPopup({ node, position }: CommitPopupProps) {
  const { commit } = node;

  return (
    <Box
      position="fixed"
      zIndex={100}
      w="320px"
      p="3"
      bg="bg.default"
      border="1px solid"
      borderColor="border.default"
      rounded="lg"
      shadow="lg"
      pointerEvents="none"
      style={{
        top: `${position.y + 15}px`,
        left: `${Math.min(position.x, window.innerWidth - 350)}px`,
      }}
    >
      <Flex justify="space-between" align="center" mb="2" pb="2" borderBottom="1px solid" borderColor="border.subtle">
        <span className={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600", _dark: { color: "blue.400" } })}>
          {commit.hash.slice(0, 10)}
        </span>
        <span className={css({ fontSize: "xs", color: "fg.muted" })}>{formatFullDate(commit.timestamp)}</span>
      </Flex>
      <Box fontSize="sm" mb="2">
        <strong>{commit.author}</strong>
      </Box>
      <Box fontSize="sm" color="fg.default" lineHeight="1.4" wordBreak="break-word" mb="2">
        {commit.message}
      </Box>
      {commit.refs.length > 0 && (
        <Flex flexWrap="wrap" gap="1" mb="2">
          {commit.refs.map((ref) => (
            <RefBadge key={ref} refName={ref} />
          ))}
        </Flex>
      )}
      {commit.parents.length > 0 && (
        <Box fontSize="xs" color="fg.muted" fontFamily="mono">
          Parents: {commit.parents.map((p) => p.slice(0, 7)).join(", ")}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CommitGraph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[commit-graph] Connected to MCP host");
      })
      .catch(() => {
        console.log("[commit-graph] No MCP host (standalone mode)");
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

        const parsed: GraphData = JSON.parse(textContent.text);
        setData(parsed);
        setSelectedHash(null);
        setZoom(1);
      } catch (e) {
        setError(`Failed to parse graph data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Track mouse position for popup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPopupPosition({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Calculate graph layout
  const graphNodes = useMemo(() => {
    if (!data?.commits) return [];
    return calculateGraphLayout(data.commits);
  }, [data]);

  // Calculate SVG dimensions
  const svgDimensions = useMemo(() => {
    if (graphNodes.length === 0) return { width: 800, height: 400 };

    const maxRail = Math.max(...graphNodes.map((n) => n.rail));
    const graphWidth = (maxRail + 1) * RAIL_WIDTH + GRAPH_PADDING * 2;
    const graphHeight = graphNodes.length * ROW_HEIGHT + GRAPH_PADDING * 2;

    return {
      width: Math.max(graphWidth, 200),
      height: graphHeight,
    };
  }, [graphNodes]);

  // Handlers
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const newSelected = selectedHash === node.commit.hash ? null : node.commit.hash;
      setSelectedHash(newSelected);
      if (newSelected) {
        notifyModel("select", {
          hash: node.commit.hash,
          message: node.commit.message,
          author: node.commit.author,
          refs: node.commit.refs,
        });
      }
    },
    [selectedHash]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.2, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.2, 0.5));
  }, []);

  // Render states
  if (loading) {
    return (
      <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative">
        <Box p="10" textAlign="center" color="fg.muted">Loading commit graph...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative">
        <Box p="4" bg="red.50" color="red.700" rounded="md" m="4" _dark={{ bg: "red.950", color: "red.300" }}>{error}</Box>
      </Box>
    );
  }

  if (!data || data.commits.length === 0) {
    return (
      <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative">
        <Box p="10" textAlign="center" color="fg.muted">No commits to display</Box>
      </Box>
    );
  }

  return (
    <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative" ref={containerRef}>
      {/* Header */}
      <Flex
        position="sticky"
        top="0"
        zIndex={10}
        justify="space-between"
        align="center"
        p="3"
        bg="bg.subtle"
        borderBottom="1px solid"
        borderColor="border.default"
      >
        <Flex align="center" gap="3">
          <span className={css({ fontWeight: "semibold", fontSize: "lg" })}>Commit Graph</span>
          <span className={css({ fontSize: "sm", color: "fg.muted" })}>
            {data.totalCommits} commits | {data.branches.length} branches
          </span>
        </Flex>
        <Flex align="center" gap="2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>-</Button>
          <span className={css({ minW: "50px", textAlign: "center", fontSize: "sm", color: "fg.muted" })}>
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>+</Button>
        </Flex>
      </Flex>

      {/* Graph content */}
      <Box overflow="auto" position="relative">
        <Flex position="relative" minW="fit-content" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          {/* SVG for graph lines */}
          <svg
            width={svgDimensions.width}
            height={svgDimensions.height}
            style={{ position: "absolute", top: 0, left: 0, flexShrink: 0 }}
          >
            {/* Connection lines */}
            {graphNodes.map((node) =>
              node.parentConnections.map((conn, idx) => {
                const color = RAIL_COLORS[node.rail % RAIL_COLORS.length];
                const parentNode = graphNodes.find((n) => n.commit.hash === conn.parentHash);
                if (!parentNode) return null;

                const startX = node.x;
                const startY = node.y;
                const endX = parentNode.x;
                const endY = parentNode.y;

                // Create curved path for merge lines
                if (startX !== endX) {
                  const midY = (startY + endY) / 2;
                  const path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
                  return (
                    <path
                      key={`${node.commit.hash}-${conn.parentHash}-${idx}`}
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  );
                }

                // Straight line for same rail
                return (
                  <line
                    key={`${node.commit.hash}-${conn.parentHash}-${idx}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                );
              })
            )}

            {/* Commit nodes */}
            {graphNodes.map((node) => {
              const color = RAIL_COLORS[node.rail % RAIL_COLORS.length];
              const isSelected = selectedHash === node.commit.hash;
              const isHovered = hoveredNode?.commit.hash === node.commit.hash;
              const isMerge = node.commit.parents.length > 1;

              return (
                <g
                  key={node.commit.hash}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                >
                  {/* Commit circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? NODE_RADIUS + 2 : NODE_RADIUS}
                    fill={isMerge ? "white" : color}
                    stroke={color}
                    strokeWidth={isMerge ? 3 : 2}
                  />

                  {/* Selection ring */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 5} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />
                  )}

                  {/* Hover highlight */}
                  {isHovered && !isSelected && (
                    <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 3} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Commit rows with info */}
          <Stack gap="0" minW="400px" style={{ marginLeft: `${svgDimensions.width + 10}px` }}>
            {graphNodes.map((node) => {
              const isSelected = selectedHash === node.commit.hash;
              const isHovered = hoveredNode?.commit.hash === node.commit.hash;

              return (
                <Flex
                  key={node.commit.hash}
                  align="center"
                  gap="2"
                  px="2"
                  cursor="pointer"
                  borderBottom="1px solid"
                  borderColor="border.subtle"
                  transition="background 0.1s"
                  _hover={{ bg: "bg.muted" }}
                  bg={isSelected ? "blue.50" : "transparent"}
                  _dark={isSelected ? { bg: "blue.950" } : {}}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                >
                  {/* Refs */}
                  {node.commit.refs.length > 0 && (
                    <Flex gap="1" flexShrink={0}>
                      {node.commit.refs.map((ref) => (
                        <RefBadge key={ref} refName={ref} />
                      ))}
                    </Flex>
                  )}

                  {/* Hash */}
                  <span className={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600", _dark: { color: "blue.400" }, minW: "60px", flexShrink: 0 })}>
                    {node.commit.shortHash}
                  </span>

                  {/* Message */}
                  <span className={css({ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "fg.default" })}>
                    {node.commit.message}
                  </span>

                  {/* Author and time */}
                  <Flex align="center" gap="2" flexShrink={0} fontSize="xs" color="fg.muted">
                    <span className={css({ maxW: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                      {node.commit.author}
                    </span>
                    <span className={css({ minW: "60px", textAlign: "right" })}>
                      {formatRelativeTime(node.commit.timestamp)}
                    </span>
                  </Flex>
                </Flex>
              );
            })}
          </Stack>
        </Flex>
      </Box>

      {/* Hover popup */}
      {hoveredNode && <CommitPopup node={hoveredNode} position={popupPosition} />}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<CommitGraph />);
