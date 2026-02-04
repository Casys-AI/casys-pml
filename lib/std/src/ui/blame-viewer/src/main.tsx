/**
 * Blame Viewer UI for MCP Apps
 *
 * Displays git blame annotations with:
 * - Per-line commit information (author, date, hash)
 * - Color-coding by commit (same commit = same color)
 * - Hover popup with full commit details
 * - Monospace code display with line numbers
 *
 * @module lib/std/src/ui/blame-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex } from "../../styled-system/jsx";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  content: string;
  summary: string;
}

interface BlameData {
  file: string;
  lines: BlameLine[];
  totalLines: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Blame Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Color Generation
// ============================================================================

/**
 * Generate a pastel color from a commit hash
 * Same hash always produces the same color
 */
function hashToColor(hash: string): string {
  // Use first 6 characters of hash to generate hue
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  // Keep saturation and lightness low for pastel effect
  return `hsl(${hue}, 35%, 92%)`;
}

/**
 * Generate a darker version of the color for dark mode
 */
function hashToColorDark(hash: string): string {
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsl(${hue}, 30%, 20%)`;
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

interface BlameAnnotationProps {
  line: BlameLine;
  showFull: boolean;
  prevHash: string | null;
  onHover: (line: BlameLine | null) => void;
  onClick: (line: BlameLine) => void;
}

function BlameAnnotation({ line, showFull, prevHash, onHover, onClick }: BlameAnnotationProps) {
  const isNewCommit = prevHash !== line.commitHash;
  const shortHash = line.commitHash.slice(0, 7);

  return (
    <Flex
      align="center"
      gap="2"
      w="220px"
      minW="220px"
      px="2"
      py="0.5"
      fontFamily="sans-serif"
      fontSize="xs"
      color="fg.muted"
      bg="bg.subtle/50"
      borderRight="1px solid"
      borderColor="border.default"
      cursor="pointer"
      _hover={{ bg: "bg.muted" }}
      onMouseEnter={() => onHover(line)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(line)}
    >
      {isNewCommit || showFull ? (
        <>
          <span className={css({ fontFamily: "mono", fontSize: "10px", color: "blue.600", _dark: { color: "blue.400" }, minW: "60px" })}>
            {shortHash}
          </span>
          <span
            className={css({ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minW: "70px", maxW: "90px" })}
            title={line.author}
          >
            {line.author.split(" ")[0].slice(0, 10)}
          </span>
          <span className={css({ color: "fg.subtle", fontSize: "10px", minW: "50px", textAlign: "right" })}>
            {formatRelativeTime(line.timestamp)}
          </span>
        </>
      ) : (
        <span className={css({ h: "100%" })} />
      )}
    </Flex>
  );
}

interface CommitPopupProps {
  line: BlameLine;
  position: { x: number; y: number };
}

function CommitPopup({ line, position }: CommitPopupProps) {
  return (
    <Box
      position="fixed"
      zIndex={100}
      w="300px"
      p="3"
      bg="bg.default"
      border="1px solid"
      borderColor="border.default"
      rounded="lg"
      shadow="lg"
      pointerEvents="none"
      style={{
        top: `${position.y + 10}px`,
        left: `${Math.min(position.x, window.innerWidth - 320)}px`,
      }}
    >
      <Flex justify="space-between" align="center" mb="2" pb="2" borderBottom="1px solid" borderColor="border.subtle">
        <span className={css({ fontFamily: "mono", fontSize: "xs", color: "blue.600", _dark: { color: "blue.400" } })}>
          {line.commitHash.slice(0, 10)}
        </span>
        <span className={css({ fontSize: "xs", color: "fg.muted" })}>{formatFullDate(line.timestamp)}</span>
      </Flex>
      <Box fontSize="sm" mb="2">
        <strong>{line.author}</strong>
        {line.authorEmail && (
          <span className={css({ ml: "1", fontSize: "xs", color: "fg.muted" })}>&lt;{line.authorEmail}&gt;</span>
        )}
      </Box>
      <Box fontSize="sm" color="fg.default" lineHeight="1.4" wordBreak="break-word">
        {line.summary}
      </Box>
    </Box>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function BlameViewer() {
  const [blameData, setBlameData] = useState<BlameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<BlameLine | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[blame-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[blame-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setBlameData(null);
          return;
        }

        const data: BlameData = JSON.parse(textContent.text);
        setBlameData(data);
      } catch (e) {
        setError(`Failed to parse blame data: ${e instanceof Error ? e.message : "Unknown"}`);
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

  // Get unique commits for stats
  const stats = useMemo(() => {
    if (!blameData?.lines) return { commits: 0, authors: new Set<string>() };
    const commits = new Set(blameData.lines.map((l) => l.commitHash));
    const authors = new Set(blameData.lines.map((l) => l.author));
    return { commits: commits.size, authors };
  }, [blameData]);

  // Handle line click
  const handleLineClick = (line: BlameLine) => {
    setSelectedLine(line.lineNumber);
    notifyModel("select", {
      lineNumber: line.lineNumber,
      commitHash: line.commitHash,
      author: line.author,
      summary: line.summary,
    });
  };

  // Handle commit click (annotation click)
  const handleCommitClick = (line: BlameLine) => {
    notifyModel("viewCommit", {
      commitHash: line.commitHash,
      author: line.author,
      summary: line.summary,
    });
  };

  // Render states
  if (loading) {
    return (
      <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative">
        <Box p="10" textAlign="center" color="fg.muted">Loading blame data...</Box>
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

  if (!blameData?.lines || blameData.lines.length === 0) {
    return (
      <Box fontFamily="system-ui, sans-serif" fontSize="sm" color="fg.default" bg="bg.canvas" minH="100vh" position="relative">
        <Box p="10" textAlign="center" color="fg.muted">No blame data to display</Box>
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
          <span className={css({ fontWeight: "semibold", fontFamily: "mono", color: "fg.default" })}>{blameData.file}</span>
          <span className={css({ fontSize: "xs", color: "fg.muted" })}>
            {blameData.totalLines} lines | {stats.commits} commits | {stats.authors.size} authors
          </span>
        </Flex>
      </Flex>

      {/* Blame content */}
      <Box overflow="auto">
        <Box minW="fit-content">
          {blameData.lines.map((line, idx) => {
            const prevHash = idx > 0 ? blameData.lines[idx - 1].commitHash : null;
            const isSelected = selectedLine === line.lineNumber;

            return (
              <Flex
                key={line.lineNumber}
                minH="22px"
                borderBottom="1px solid"
                borderColor="border.subtle"
                _hover={{ filter: "brightness(0.97)", _dark: { filter: "brightness(1.1)" } }}
                className={css(isSelected && { outline: "2px solid", outlineColor: "blue.500", outlineOffset: "-2px" })}
                style={{
                  background: `var(--commit-color)`,
                  // @ts-expect-error CSS custom properties
                  "--commit-color": hashToColor(line.commitHash),
                }}
                _dark={{
                  // @ts-expect-error CSS custom properties
                  "--commit-color": hashToColorDark(line.commitHash),
                }}
              >
                {/* Annotation column */}
                <BlameAnnotation
                  line={line}
                  showFull={false}
                  prevHash={prevHash}
                  onHover={setHoveredLine}
                  onClick={handleCommitClick}
                />

                {/* Line number */}
                <Box
                  w="50px"
                  minW="50px"
                  px="2"
                  py="0.5"
                  textAlign="right"
                  fontFamily="mono"
                  fontSize="xs"
                  color="fg.muted"
                  bg="bg.subtle/30"
                  borderRight="1px solid"
                  borderColor="border.subtle"
                  userSelect="none"
                >
                  {line.lineNumber}
                </Box>

                {/* Code content */}
                <Box
                  flex="1"
                  px="3"
                  py="0.5"
                  fontFamily="mono"
                  fontSize="13px"
                  whiteSpace="pre"
                  cursor="text"
                  userSelect="text"
                  onClick={() => handleLineClick(line)}
                >
                  {line.content || " "}
                </Box>
              </Flex>
            );
          })}
        </Box>
      </Box>

      {/* Commit popup on hover */}
      {hoveredLine && <CommitPopup line={hoveredLine} position={popupPosition} />}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<BlameViewer />);
