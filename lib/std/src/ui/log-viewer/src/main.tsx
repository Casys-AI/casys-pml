/**
 * Log Viewer UI - Advanced filterable log display
 *
 * Features:
 * - Level filtering with counters (debug, info, warn, error)
 * - Real-time text search with highlighting
 * - Timestamp display
 * - Auto-scroll toggle
 * - Export/copy filtered logs
 * - Keyboard shortcuts
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

interface LevelCounts {
  debug: number;
  info: number;
  warn: number;
  error: number;
}

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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Components
// ============================================================================

/** Highlights search matches in text */
function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${escapeRegExp(search)})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} class={styles.searchMatch}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function LogLine({
  entry,
  index,
  searchTerm,
  originalIndex,
}: {
  entry: LogEntry;
  index: number;
  searchTerm: string;
  originalIndex: number;
}) {
  const levelColors: Record<LogLevel, string> = {
    debug: "gray",
    info: "blue",
    warn: "yellow",
    error: "red",
  };

  const level = entry.level || "info";
  const color = levelColors[level];
  const hasMatch = searchTerm && entry.message.toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <div
      class={css(
        styles.logLine,
        hasMatch && styles.logLineHighlight,
        level === "error" && styles.logLineError,
        level === "warn" && styles.logLineWarn
      )}
      onClick={() => notifyModel("selectLine", { index: originalIndex, entry })}
    >
      <span class={styles.lineNumber}>{originalIndex + 1}</span>
      {entry.timestamp && <span class={styles.timestamp}>{entry.timestamp}</span>}
      <span class={css(styles.level, styles[`level_${color}`] || styles.level_blue)}>
        {level.toUpperCase().padEnd(5)}
      </span>
      <span class={styles.message}>
        <HighlightedText text={entry.message} search={searchTerm} />
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function LogViewer() {
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(
    new Set(["debug", "info", "warn", "error"])
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

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
      } catch {
        // Treat as raw text
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          setData({ logs: textContent.text.split("\n").filter(Boolean) });
        }
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === "Escape" && searchTerm) {
        setSearchTerm("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  // Parse logs
  const parsedLogs = useMemo(() => {
    if (!data?.logs) return [];
    return data.logs.map(parseLogLine);
  }, [data]);

  // Count logs by level
  const levelCounts = useMemo((): LevelCounts => {
    const counts: LevelCounts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const log of parsedLogs) {
      const level = log.level || "info";
      counts[level]++;
    }
    return counts;
  }, [parsedLogs]);

  // Filter logs with original indices
  const filteredLogs = useMemo(() => {
    const result: Array<{ entry: LogEntry; originalIndex: number }> = [];
    const searchLower = searchTerm.toLowerCase();

    for (let i = 0; i < parsedLogs.length; i++) {
      const log = parsedLogs[i];
      // Level filter
      if (!levelFilter.has(log.level || "info")) continue;
      // Text filter
      if (searchTerm && !log.message.toLowerCase().includes(searchLower)) continue;
      result.push({ entry: log, originalIndex: i });
    }
    return result;
  }, [parsedLogs, searchTerm, levelFilter]);

  // Count matches in filtered logs
  const matchCount = useMemo(() => {
    if (!searchTerm) return 0;
    return filteredLogs.length;
  }, [filteredLogs, searchTerm]);

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

  const handleSearchChange = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchTerm(value);
    notifyModel("filterText", { text: value });
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    searchInputRef.current?.focus();
  }, []);

  const handleExport = useCallback(async () => {
    const exportText = filteredLogs
      .map(({ entry }) => {
        const parts: string[] = [];
        if (entry.timestamp) parts.push(`[${entry.timestamp}]`);
        parts.push(`[${(entry.level || "info").toUpperCase()}]`);
        parts.push(entry.message);
        return parts.join(" ");
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("copied");
      notifyModel("exportLogs", { count: filteredLogs.length });
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = exportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [filteredLogs]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      notifyModel("toggleAutoScroll", { enabled: next });
      if (next && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      return next;
    });
  }, []);

  const showAllLevels = useCallback(() => {
    setLevelFilter(new Set(["debug", "info", "warn", "error"]));
    notifyModel("filterLevel", { levels: ["debug", "info", "warn", "error"] });
  }, []);

  const showOnlyLevel = useCallback((level: LogLevel) => {
    setLevelFilter(new Set([level]));
    notifyModel("filterLevel", { levels: [level] });
  }, []);

  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading logs...</div>
      </div>
    );
  }

  if (!data?.logs?.length) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No logs</div>
      </div>
    );
  }

  const levels: LogLevel[] = ["error", "warn", "info", "debug"];

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <div class={styles.headerLeft}>
          {data.title && <h3 class={styles.title}>{data.title}</h3>}
        </div>

        <div class={styles.controls}>
          {/* Search input with clear button */}
          <div class={styles.searchContainer}>
            <span class={styles.searchIcon}>&#128269;</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Ctrl+F)"
              value={searchTerm}
              onInput={handleSearchChange}
              class={styles.searchInput}
            />
            {searchTerm && (
              <button class={styles.clearBtn} onClick={clearSearch} title="Clear search (Esc)">
                x
              </button>
            )}
          </div>

          {/* Auto-scroll toggle */}
          <button
            class={css(styles.iconBtn, autoScroll && styles.iconBtnActive)}
            onClick={toggleAutoScroll}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          >
            <span class={styles.iconBtnSymbol}>{autoScroll ? "\u2193" : "\u2016"}</span>
          </button>

          {/* Export button */}
          <button
            class={css(styles.iconBtn, copyStatus === "copied" && styles.iconBtnSuccess)}
            onClick={handleExport}
            title="Copy filtered logs to clipboard"
          >
            <span class={styles.iconBtnSymbol}>{copyStatus === "copied" ? "\u2713" : "\u2398"}</span>
          </button>
        </div>
      </div>

      {/* Level filters with counts */}
      <div class={styles.levelFilterBar}>
        <button class={styles.showAllBtn} onClick={showAllLevels} title="Show all levels">
          All
        </button>
        {levels.map((level) => (
          <button
            key={level}
            class={css(
              styles.levelBtn,
              levelFilter.has(level) && styles.levelBtnActive,
              styles[`levelBtn_${level}`]
            )}
            onClick={() => toggleLevel(level)}
            onDoubleClick={() => showOnlyLevel(level)}
            title={`Toggle ${level} (double-click to show only)`}
          >
            <span class={styles.levelLabel}>{level.toUpperCase()}</span>
            <span class={styles.levelCount}>{levelCounts[level]}</span>
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div class={styles.stats}>
        <span>
          {filteredLogs.length} / {parsedLogs.length} lines
        </span>
        {searchTerm && (
          <span class={styles.matchInfo}>
            {matchCount} match{matchCount !== 1 ? "es" : ""} for "{searchTerm}"
          </span>
        )}
      </div>

      {/* Log content */}
      <div class={styles.logContainer} ref={containerRef}>
        {filteredLogs.length === 0 ? (
          <div class={styles.noResults}>
            No logs match the current filters
            {searchTerm && (
              <button class={styles.clearFiltersBtn} onClick={clearSearch}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          filteredLogs.map(({ entry, originalIndex }, i) => (
            <LogLine
              key={originalIndex}
              entry={entry}
              index={i}
              originalIndex={originalIndex}
              searchTerm={searchTerm}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, string> = {
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
  headerLeft: css({
    display: "flex",
    alignItems: "center",
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

  // Search
  searchContainer: css({
    display: "flex",
    alignItems: "center",
    bg: "bg.canvas",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    px: "2",
    gap: "1",
    _focusWithin: { borderColor: "blue.500", ring: "2px", ringColor: "blue.200" },
  }),
  searchIcon: css({
    color: "fg.muted",
    fontSize: "sm",
    flexShrink: 0,
  }),
  searchInput: css({
    border: "none",
    bg: "transparent",
    py: "1",
    fontSize: "xs",
    w: "140px",
    _focus: { outline: "none" },
    _placeholder: { color: "fg.muted" },
  }),
  clearBtn: css({
    bg: "transparent",
    border: "none",
    color: "fg.muted",
    cursor: "pointer",
    fontSize: "sm",
    lineHeight: 1,
    p: "0.5",
    rounded: "sm",
    _hover: { bg: "bg.subtle", color: "fg.default" },
  }),

  // Icon buttons
  iconBtn: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    w: "7",
    h: "7",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.canvas",
    cursor: "pointer",
    color: "fg.muted",
    _hover: { bg: "bg.subtle", color: "fg.default" },
  }),
  iconBtnActive: css({
    bg: "blue.100",
    borderColor: "blue.400",
    color: "blue.700",
    _dark: { bg: "blue.900", borderColor: "blue.600", color: "blue.300" },
  }),
  iconBtnSuccess: css({
    bg: "green.100",
    borderColor: "green.400",
    color: "green.700",
    _dark: { bg: "green.900", borderColor: "green.600", color: "green.300" },
  }),
  iconBtnSymbol: css({
    fontSize: "sm",
  }),

  // Level filter bar
  levelFilterBar: css({
    display: "flex",
    gap: "1",
    px: "2",
    py: "1.5",
    bg: "bg.canvas",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    flexWrap: "wrap",
  }),
  showAllBtn: css({
    px: "2",
    py: "0.5",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    cursor: "pointer",
    color: "fg.muted",
    _hover: { bg: "bg.muted" },
  }),
  levelBtn: css({
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    px: "2",
    py: "0.5",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.canvas",
    cursor: "pointer",
    opacity: 0.5,
    transition: "all 0.15s",
    _hover: { opacity: 0.8 },
  }),
  levelBtnActive: css({
    opacity: 1,
    fontWeight: "medium",
  }),
  levelBtn_error: css({
    color: "red.600",
    _dark: { color: "red.400" },
    _hover: { bg: "red.50", _dark: { bg: "red.950/50" } },
  }),
  levelBtn_warn: css({
    color: "yellow.600",
    _dark: { color: "yellow.400" },
    _hover: { bg: "yellow.50", _dark: { bg: "yellow.950/50" } },
  }),
  levelBtn_info: css({
    color: "blue.600",
    _dark: { color: "blue.400" },
    _hover: { bg: "blue.50", _dark: { bg: "blue.950/50" } },
  }),
  levelBtn_debug: css({
    color: "gray.600",
    _dark: { color: "gray.400" },
    _hover: { bg: "gray.50", _dark: { bg: "gray.950/50" } },
  }),
  levelLabel: css({
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  }),
  levelCount: css({
    bg: "bg.subtle",
    px: "1",
    py: "0",
    rounded: "sm",
    fontSize: "2xs",
    minW: "4",
    textAlign: "center",
  }),

  // Stats bar
  stats: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    px: "2",
    py: "1",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  matchInfo: css({
    color: "yellow.700",
    fontWeight: "medium",
    _dark: { color: "yellow.400" },
  }),

  // Log container
  logContainer: css({
    flex: 1,
    overflowY: "auto",
    overflowX: "auto",
  }),
  noResults: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2",
    p: "4",
    color: "fg.muted",
    textAlign: "center",
  }),
  clearFiltersBtn: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    bg: "blue.100",
    color: "blue.700",
    border: "none",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "blue.200" },
    _dark: { bg: "blue.900", color: "blue.300", _hover: { bg: "blue.800" } },
  }),

  // Log line
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
    _dark: { bg: "yellow.950/50" },
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

  // Search match highlight
  searchMatch: css({
    bg: "yellow.300",
    color: "yellow.900",
    px: "0.5",
    rounded: "sm",
    fontWeight: "medium",
    _dark: { bg: "yellow.700", color: "yellow.100" },
  }),

  loading: css({ p: "4", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "4", textAlign: "center", color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<LogViewer />, document.getElementById("app")!);
