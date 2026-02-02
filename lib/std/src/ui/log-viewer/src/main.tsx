/**
 * Log Viewer UI - Filterable log display
 *
 * Displays log entries with:
 * - Level filtering (debug, info, warn, error)
 * - Text search
 * - Timestamp display
 * - Auto-scroll to bottom
 * - Line highlighting
 *
 * @module lib/std/src/ui/log-viewer
 */

import { render } from "preact";
import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface LogEntry {
  timestamp?: string;
  level?: "debug" | "info" | "warn" | "error";
  message: string;
  source?: string;
}

interface LogData {
  logs: LogEntry[] | string[];
  title?: string;
  maxLines?: number;
}

type LogLevel = "debug" | "info" | "warn" | "error";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Log Viewer", version: "1.0.0" });
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

function parseLogLine(line: string | LogEntry): LogEntry {
  if (typeof line !== "string") return line;

  // Try to parse common log formats
  // Format: [TIMESTAMP] [LEVEL] MESSAGE
  const bracketMatch = line.match(/^\[([^\]]+)\]\s*\[(\w+)\]\s*(.+)$/);
  if (bracketMatch) {
    return {
      timestamp: bracketMatch[1],
      level: bracketMatch[2].toLowerCase() as LogLevel,
      message: bracketMatch[3],
    };
  }

  // Format: TIMESTAMP LEVEL MESSAGE
  const spaceMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+(\w+)\s+(.+)$/);
  if (spaceMatch) {
    return {
      timestamp: spaceMatch[1],
      level: spaceMatch[2].toLowerCase() as LogLevel,
      message: spaceMatch[3],
    };
  }

  // Detect level from keywords
  const lowerLine = line.toLowerCase();
  let level: LogLevel = "info";
  if (lowerLine.includes("error") || lowerLine.includes("err")) level = "error";
  else if (lowerLine.includes("warn")) level = "warn";
  else if (lowerLine.includes("debug")) level = "debug";

  return { message: line, level };
}

// ============================================================================
// Components
// ============================================================================

function LogLine({ entry, index, highlight }: { entry: LogEntry; index: number; highlight: boolean }) {
  const levelColors: Record<LogLevel, string> = {
    debug: "gray",
    info: "blue",
    warn: "yellow",
    error: "red",
  };

  const level = entry.level || "info";
  const color = levelColors[level];

  return (
    <div
      class={css(
        styles.logLine,
        highlight && styles.logLineHighlight,
        level === "error" && styles.logLineError,
        level === "warn" && styles.logLineWarn
      )}
      onClick={() => notifyModel("selectLine", { index, entry })}
    >
      <span class={styles.lineNumber}>{index + 1}</span>
      {entry.timestamp && (
        <span class={styles.timestamp}>{entry.timestamp}</span>
      )}
      <span class={css(styles.level, styles[`level_${color}`] || styles.level_blue)}>
        {level.toUpperCase().padEnd(5)}
      </span>
      <span class={styles.message}>{entry.message}</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function LogViewer() {
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set(["debug", "info", "warn", "error"]));
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Handle string (raw logs), array, or object
          if (typeof parsed === "string") {
            setData({ logs: parsed.split("\n").filter(Boolean) });
          } else if (Array.isArray(parsed)) {
            setData({ logs: parsed });
          } else {
            setData(parsed);
          }
        }
      } catch (e) {
        // Treat as raw text
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          setData({ logs: textContent.text.split("\n").filter(Boolean) });
        }
      }
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  const parsedLogs = useMemo(() => {
    if (!data?.logs) return [];
    return data.logs.map(parseLogLine);
  }, [data]);

  const filteredLogs = useMemo(() => {
    return parsedLogs.filter((log) => {
      // Level filter
      if (!levelFilter.has(log.level || "info")) return false;
      // Text filter
      if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [parsedLogs, filter, levelFilter]);

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      notifyModel("filterLevel", { levels: Array.from(next) });
      return next;
    });
  }, []);

  const handleFilterChange = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilter(value);
    notifyModel("filterText", { text: value });
  }, []);

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading logs...</div></div>;
  }

  if (!data?.logs?.length) {
    return <div class={styles.container}><div class={styles.empty}>No logs</div></div>;
  }

  const levels: LogLevel[] = ["error", "warn", "info", "debug"];

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        {data.title && <h3 class={styles.title}>{data.title}</h3>}

        <div class={styles.controls}>
          {/* Level filters */}
          <div class={styles.levelFilters}>
            {levels.map((level) => (
              <button
                key={level}
                class={css(
                  styles.levelBtn,
                  levelFilter.has(level) && styles.levelBtnActive,
                  styles[`levelBtn_${level}`]
                )}
                onClick={() => toggleLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Text filter */}
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onInput={handleFilterChange}
            class={styles.filterInput}
          />

          {/* Auto-scroll toggle */}
          <button
            class={css(styles.autoScrollBtn, autoScroll && styles.autoScrollActive)}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Stats */}
      <div class={styles.stats}>
        {filteredLogs.length} / {parsedLogs.length} lines
        {filter && ` matching "${filter}"`}
      </div>

      {/* Log content */}
      <div class={styles.logContainer} ref={containerRef}>
        {filteredLogs.map((entry, i) => (
          <LogLine
            key={i}
            entry={entry}
            index={i}
            highlight={filter ? entry.message.toLowerCase().includes(filter.toLowerCase()) : false}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.default",
    bg: "bg.canvas",
    display: "flex",
    flexDirection: "column",
    maxH: "400px",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    p: "2",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.default",
    flexWrap: "wrap",
    gap: "2",
  }),
  title: css({
    fontSize: "sm",
    fontWeight: "semibold",
    fontFamily: "sans",
    m: 0,
  }),
  controls: css({
    display: "flex",
    gap: "2",
    alignItems: "center",
  }),
  levelFilters: css({
    display: "flex",
    gap: "1",
  }),
  levelBtn: css({
    px: "2",
    py: "0.5",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "bg.canvas",
    cursor: "pointer",
    opacity: 0.5,
    textTransform: "uppercase",
    _hover: { opacity: 0.8 },
  }),
  levelBtnActive: css({
    opacity: 1,
    fontWeight: "medium",
  }),
  levelBtn_error: css({ color: "red.600", _dark: { color: "red.400" } }),
  levelBtn_warn: css({ color: "yellow.600", _dark: { color: "yellow.400" } }),
  levelBtn_info: css({ color: "blue.600", _dark: { color: "blue.400" } }),
  levelBtn_debug: css({ color: "gray.600", _dark: { color: "gray.400" } }),
  filterInput: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "bg.canvas",
    w: "120px",
    _focus: { outline: "none", borderColor: "blue.500" },
  }),
  autoScrollBtn: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "bg.canvas",
    cursor: "pointer",
    opacity: 0.5,
    _hover: { opacity: 0.8 },
  }),
  autoScrollActive: css({
    opacity: 1,
    bg: "blue.100",
    borderColor: "blue.300",
    _dark: { bg: "blue.900", borderColor: "blue.700" },
  }),
  stats: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  logContainer: css({
    flex: 1,
    overflowY: "auto",
    overflowX: "auto",
  }),
  logLine: css({
    display: "flex",
    alignItems: "flex-start",
    py: "0.5",
    px: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    _hover: { bg: "bg.subtle" },
    cursor: "pointer",
  }),
  logLineHighlight: css({
    bg: "yellow.50",
    _dark: { bg: "yellow.950" },
  }),
  logLineError: css({
    bg: "red.50/50",
    _dark: { bg: "red.950/30" },
  }),
  logLineWarn: css({
    bg: "yellow.50/50",
    _dark: { bg: "yellow.950/30" },
  }),
  lineNumber: css({
    w: "8",
    color: "fg.muted",
    textAlign: "right",
    pr: "2",
    userSelect: "none",
    flexShrink: 0,
  }),
  timestamp: css({
    color: "fg.muted",
    mr: "2",
    flexShrink: 0,
  }),
  level: css({
    mr: "2",
    fontWeight: "medium",
    flexShrink: 0,
    w: "12",
  }),
  level_red: css({ color: "red.600", _dark: { color: "red.400" } }),
  level_yellow: css({ color: "yellow.600", _dark: { color: "yellow.400" } }),
  level_blue: css({ color: "blue.600", _dark: { color: "blue.400" } }),
  level_gray: css({ color: "gray.500" }),
  message: css({
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  }),
  loading: css({ p: "4", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "4", textAlign: "center", color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<LogViewer />, document.getElementById("app")!);
