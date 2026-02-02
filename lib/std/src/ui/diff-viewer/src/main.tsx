/**
 * Diff Viewer UI for MCP Apps
 *
 * Side-by-side or unified diff display with:
 * - Syntax highlighting for additions/deletions
 * - Line numbers
 * - Collapsible unchanged sections
 * - Navigation between changes
 *
 * @module lib/std/src/ui/diff-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffData {
  filename?: string;
  oldFile?: string;
  newFile?: string;
  hunks?: DiffHunk[];
  unified?: string;
  additions?: number;
  deletions?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

type ViewMode = "unified" | "split";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Diff Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Components
// ============================================================================

function UnifiedView({ hunks }: { hunks: DiffHunk[] }) {
  return (
    <div class={styles.diffContent}>
      {hunks.map((hunk, hi) => (
        <div key={hi} class={styles.hunk}>
          <div class={styles.hunkHeader}>{hunk.header}</div>
          {hunk.lines.map((line, li) => (
            <div
              key={li}
              class={css(
                styles.line,
                line.type === "add" && styles.lineAdd,
                line.type === "remove" && styles.lineRemove,
                line.type === "header" && styles.lineHeader
              )}
              onClick={() => notifyModel("click", { hunk: hi, line: li, type: line.type })}
            >
              <span class={styles.lineNumber}>
                {line.type === "remove" ? line.oldLine || "" : ""}
              </span>
              <span class={styles.lineNumber}>
                {line.type === "add" ? line.newLine || "" : ""}
              </span>
              <span class={styles.lineNumber}>
                {line.type === "context" ? line.oldLine || "" : ""}
              </span>
              <span class={styles.linePrefix}>
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              <span class={styles.lineContent}>{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SplitView({ hunks }: { hunks: DiffHunk[] }) {
  return (
    <div class={styles.splitContainer}>
      {/* Old file (left) */}
      <div class={styles.splitPane}>
        <div class={styles.splitHeader}>Old</div>
        {hunks.map((hunk, hi) => (
          <div key={hi} class={styles.hunk}>
            {hunk.lines
              .filter((l) => l.type !== "add")
              .map((line, li) => (
                <div
                  key={li}
                  class={css(
                    styles.line,
                    line.type === "remove" && styles.lineRemove
                  )}
                >
                  <span class={styles.lineNumber}>{line.oldLine || ""}</span>
                  <span class={styles.lineContent}>{line.content}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* New file (right) */}
      <div class={styles.splitPane}>
        <div class={styles.splitHeader}>New</div>
        {hunks.map((hunk, hi) => (
          <div key={hi} class={styles.hunk}>
            {hunk.lines
              .filter((l) => l.type !== "remove")
              .map((line, li) => (
                <div
                  key={li}
                  class={css(
                    styles.line,
                    line.type === "add" && styles.lineAdd
                  )}
                >
                  <span class={styles.lineNumber}>{line.newLine || ""}</span>
                  <span class={styles.lineContent}>{line.content}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DiffViewer() {
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [currentHunk, setCurrentHunk] = useState(0);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[diff-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[diff-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setDiffData(null);
          return;
        }

        // Try to parse as JSON first, otherwise treat as unified diff string
        let data: DiffData;
        try {
          data = JSON.parse(textContent.text);
        } catch {
          data = { unified: textContent.text };
        }

        // Parse unified diff string if present
        if (data.unified && !data.hunks) {
          data.hunks = parseUnifiedDiff(data.unified);
        }

        setDiffData(data);
        setCurrentHunk(0);
      } catch (e) {
        setError(`Failed to parse diff: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Stats
  const stats = useMemo(() => {
    if (!diffData?.hunks) return { additions: 0, deletions: 0 };
    let additions = diffData.additions || 0;
    let deletions = diffData.deletions || 0;

    if (!additions && !deletions) {
      for (const hunk of diffData.hunks) {
        for (const line of hunk.lines) {
          if (line.type === "add") additions++;
          if (line.type === "remove") deletions++;
        }
      }
    }

    return { additions, deletions };
  }, [diffData]);

  // Navigation
  const navigateHunk = useCallback((direction: "prev" | "next") => {
    if (!diffData?.hunks) return;
    const newHunk = direction === "next"
      ? Math.min(currentHunk + 1, diffData.hunks.length - 1)
      : Math.max(currentHunk - 1, 0);
    setCurrentHunk(newHunk);
    notifyModel("navigate", { hunk: newHunk, direction });
  }, [diffData, currentHunk]);

  // Render
  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading diff...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!diffData?.hunks || diffData.hunks.length === 0) {
    return <div class={styles.container}><div class={styles.empty}>No diff to display</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.fileInfo}>
          {diffData.filename && <span class={styles.filename}>{diffData.filename}</span>}
          <span class={styles.stats}>
            <span class={styles.statsAdd}>+{stats.additions}</span>
            <span class={styles.statsRemove}>-{stats.deletions}</span>
          </span>
        </div>

        <div class={styles.controls}>
          {/* View mode toggle */}
          <div class={styles.viewToggle}>
            <button
              class={css(styles.toggleBtn, viewMode === "unified" && styles.toggleBtnActive)}
              onClick={() => setViewMode("unified")}
            >
              Unified
            </button>
            <button
              class={css(styles.toggleBtn, viewMode === "split" && styles.toggleBtnActive)}
              onClick={() => setViewMode("split")}
            >
              Split
            </button>
          </div>

          {/* Hunk navigation */}
          {diffData.hunks.length > 1 && (
            <div class={styles.nav}>
              <button
                class={styles.navBtn}
                disabled={currentHunk === 0}
                onClick={() => navigateHunk("prev")}
              >
                ◀ Prev
              </button>
              <span class={styles.navInfo}>
                {currentHunk + 1} / {diffData.hunks.length}
              </span>
              <button
                class={styles.navBtn}
                disabled={currentHunk >= diffData.hunks.length - 1}
                onClick={() => navigateHunk("next")}
              >
                Next ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div class={styles.diffContainer}>
        {viewMode === "unified" ? (
          <UnifiedView hunks={diffData.hunks} />
        ) : (
          <SplitView hunks={diffData.hunks} />
        )}
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
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
    flexWrap: "wrap",
    gap: "2",
  }),
  fileInfo: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
  }),
  filename: css({
    fontWeight: "semibold",
    color: "fg.default",
  }),
  stats: css({
    display: "flex",
    gap: "2",
    fontSize: "xs",
  }),
  statsAdd: css({
    color: "green.600",
    _dark: { color: "green.400" },
  }),
  statsRemove: css({
    color: "red.600",
    _dark: { color: "red.400" },
  }),
  controls: css({
    display: "flex",
    gap: "3",
    alignItems: "center",
  }),
  viewToggle: css({
    display: "flex",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    overflow: "hidden",
  }),
  toggleBtn: css({
    px: "3",
    py: "1",
    bg: "bg.subtle",
    color: "fg.default",
    fontSize: "xs",
    border: "none",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  toggleBtnActive: css({
    bg: "blue.600",
    color: "white",
    _hover: { bg: "blue.700" },
  }),
  nav: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  navBtn: css({
    px: "2",
    py: "1",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
    _disabled: { opacity: 0.5, cursor: "not-allowed" },
  }),
  navInfo: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  diffContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  diffContent: css({
    overflowX: "auto",
  }),
  splitContainer: css({
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
  }),
  splitPane: css({
    overflowX: "auto",
    borderRight: "1px solid",
    borderColor: "border.default",
    _last: { borderRight: "none" },
  }),
  splitHeader: css({
    p: "2",
    bg: "bg.subtle",
    fontWeight: "medium",
    fontSize: "xs",
    color: "fg.muted",
    borderBottom: "1px solid",
    borderColor: "border.default",
  }),
  hunk: css({
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    _last: { borderBottom: "none" },
  }),
  hunkHeader: css({
    p: "2",
    bg: "blue.50",
    color: "blue.700",
    fontSize: "xs",
    _dark: { bg: "blue.950", color: "blue.300" },
  }),
  line: css({
    display: "flex",
    minH: "24px",
    _hover: { bg: "bg.subtle" },
  }),
  lineAdd: css({
    bg: "green.50",
    _hover: { bg: "green.100" },
    _dark: { bg: "green.950/50", _hover: { bg: "green.900/50" } },
  }),
  lineRemove: css({
    bg: "red.50",
    _hover: { bg: "red.100" },
    _dark: { bg: "red.950/50", _hover: { bg: "red.900/50" } },
  }),
  lineHeader: css({
    bg: "bg.subtle",
    color: "fg.muted",
  }),
  lineNumber: css({
    w: "10",
    px: "2",
    py: "0.5",
    textAlign: "right",
    color: "fg.muted",
    bg: "bg.subtle",
    borderRight: "1px solid",
    borderColor: "border.subtle",
    userSelect: "none",
    fontSize: "xs",
  }),
  linePrefix: css({
    w: "5",
    px: "1",
    py: "0.5",
    textAlign: "center",
    fontWeight: "bold",
    userSelect: "none",
  }),
  lineContent: css({
    flex: 1,
    px: "2",
    py: "0.5",
    whiteSpace: "pre",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({ p: "4", bg: "red.50", color: "red.700", rounded: "md", _dark: { bg: "red.950", color: "red.300" } }),
};

// ============================================================================
// Helpers
// ============================================================================

function parseUnifiedDiff(unified: string): DiffHunk[] {
  const lines = unified.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -1,3 +1,4 @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentHunk = {
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1), newLine: newLine++ });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "remove", content: line.slice(1), oldLine: oldLine++ });
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({ type: "context", content: line.slice(1) || "", oldLine: oldLine++, newLine: newLine++ });
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

// ============================================================================
// Mount
// ============================================================================

render(<DiffViewer />, document.getElementById("app")!);
