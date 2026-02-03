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

import { render } from "preact";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

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

function BlameAnnotation({
  line,
  showFull,
  prevHash,
  onHover,
  onClick,
}: BlameAnnotationProps) {
  const isNewCommit = prevHash !== line.commitHash;
  const shortHash = line.commitHash.slice(0, 7);

  return (
    <div
      class={styles.annotation}
      onMouseEnter={() => onHover(line)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(line)}
    >
      {isNewCommit || showFull ? (
        <>
          <span class={styles.annotationHash}>{shortHash}</span>
          <span class={styles.annotationAuthor} title={line.author}>
            {line.author.split(" ")[0].slice(0, 10)}
          </span>
          <span class={styles.annotationDate}>
            {formatRelativeTime(line.timestamp)}
          </span>
        </>
      ) : (
        <span class={styles.annotationEmpty} />
      )}
    </div>
  );
}

interface CommitPopupProps {
  line: BlameLine;
  position: { x: number; y: number };
}

function CommitPopup({ line, position }: CommitPopupProps) {
  return (
    <div
      class={styles.popup}
      style={{
        top: `${position.y + 10}px`,
        left: `${Math.min(position.x, window.innerWidth - 320)}px`,
      }}
    >
      <div class={styles.popupHeader}>
        <span class={styles.popupHash}>{line.commitHash.slice(0, 10)}</span>
        <span class={styles.popupDate}>{formatFullDate(line.timestamp)}</span>
      </div>
      <div class={styles.popupAuthor}>
        <strong>{line.author}</strong>
        {line.authorEmail && (
          <span class={styles.popupEmail}>&lt;{line.authorEmail}&gt;</span>
        )}
      </div>
      <div class={styles.popupSummary}>{line.summary}</div>
    </div>
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
        const textContent = result.content?.find(
          (c) => c.type === "text"
        ) as ContentItem | undefined;
        if (!textContent?.text) {
          setBlameData(null);
          return;
        }

        const data: BlameData = JSON.parse(textContent.text);
        setBlameData(data);
      } catch (e) {
        setError(
          `Failed to parse blame data: ${e instanceof Error ? e.message : "Unknown"}`
        );
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
      <div class={styles.container}>
        <div class={styles.loading}>Loading blame data...</div>
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

  if (!blameData?.lines || blameData.lines.length === 0) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No blame data to display</div>
      </div>
    );
  }

  return (
    <div class={styles.container} ref={containerRef}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.fileInfo}>
          <span class={styles.filename}>{blameData.file}</span>
          <span class={styles.stats}>
            {blameData.totalLines} lines | {stats.commits} commits |{" "}
            {stats.authors.size} authors
          </span>
        </div>
      </div>

      {/* Blame content */}
      <div class={styles.blameContainer}>
        <div class={styles.blameContent}>
          {blameData.lines.map((line, idx) => {
            const prevHash = idx > 0 ? blameData.lines[idx - 1].commitHash : null;
            const isSelected = selectedLine === line.lineNumber;

            return (
              <div
                key={line.lineNumber}
                class={css(styles.line, isSelected && styles.lineSelected)}
                style={{
                  "--commit-color": hashToColor(line.commitHash),
                  "--commit-color-dark": hashToColorDark(line.commitHash),
                } as React.CSSProperties}
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
                <span class={styles.lineNumber}>{line.lineNumber}</span>

                {/* Code content */}
                <span
                  class={styles.lineContent}
                  onClick={() => handleLineClick(line)}
                >
                  {line.content || " "}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Commit popup on hover */}
      {hoveredLine && (
        <CommitPopup line={hoveredLine} position={popupPosition} />
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    fontFamily: "system-ui, sans-serif",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    minHeight: "100vh",
    position: "relative",
  }),
  header: css({
    position: "sticky",
    top: 0,
    zIndex: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    p: "3",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.default",
  }),
  fileInfo: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
  }),
  filename: css({
    fontWeight: "semibold",
    fontFamily: "mono",
    color: "fg.default",
  }),
  stats: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  blameContainer: css({
    overflow: "auto",
  }),
  blameContent: css({
    minWidth: "fit-content",
  }),
  line: css({
    display: "flex",
    minHeight: "22px",
    bg: "var(--commit-color)",
    _dark: { bg: "var(--commit-color-dark)" },
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    _hover: {
      filter: "brightness(0.97)",
      _dark: { filter: "brightness(1.1)" },
    },
  }),
  lineSelected: css({
    outline: "2px solid",
    outlineColor: "blue.500",
    outlineOffset: "-2px",
  }),
  annotation: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "220px",
    minWidth: "220px",
    px: "2",
    py: "0.5",
    fontFamily: "sans-serif",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle/50",
    borderRight: "1px solid",
    borderColor: "border.default",
    cursor: "pointer",
    _hover: {
      bg: "bg.muted",
    },
  }),
  annotationHash: css({
    fontFamily: "mono",
    fontSize: "10px",
    color: "blue.600",
    _dark: { color: "blue.400" },
    minWidth: "60px",
  }),
  annotationAuthor: css({
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: "70px",
    maxWidth: "90px",
  }),
  annotationDate: css({
    color: "fg.subtle",
    fontSize: "10px",
    minWidth: "50px",
    textAlign: "right",
  }),
  annotationEmpty: css({
    height: "100%",
  }),
  lineNumber: css({
    width: "50px",
    minWidth: "50px",
    px: "2",
    py: "0.5",
    textAlign: "right",
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle/30",
    borderRight: "1px solid",
    borderColor: "border.subtle",
    userSelect: "none",
  }),
  lineContent: css({
    flex: 1,
    px: "3",
    py: "0.5",
    fontFamily: "mono",
    fontSize: "13px",
    whiteSpace: "pre",
    cursor: "text",
    userSelect: "text",
  }),
  popup: css({
    position: "fixed",
    zIndex: 100,
    width: "300px",
    p: "3",
    bg: "bg.default",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    shadow: "lg",
    pointerEvents: "none",
  }),
  popupHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "2",
    pb: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  popupHash: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  popupDate: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  popupAuthor: css({
    fontSize: "sm",
    mb: "2",
  }),
  popupEmail: css({
    ml: "1",
    fontSize: "xs",
    color: "fg.muted",
  }),
  popupSummary: css({
    fontSize: "sm",
    color: "fg.default",
    lineHeight: "1.4",
    wordBreak: "break-word",
  }),
  loading: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  empty: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  error: css({
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    m: "4",
    _dark: { bg: "red.950", color: "red.300" },
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<BlameViewer />, document.getElementById("app")!);
