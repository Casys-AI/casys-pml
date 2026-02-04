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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack, HStack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { IconButton } from "../../components/ui/icon-button";
import { Badge } from "../../components/ui/badge";
import { Spinner } from "../../components/ui/spinner";
import "../../global.css";

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
          <Box
            as="mark"
            key={i}
            bg={{ base: "yellow.300", _dark: "yellow.700" }}
            color={{ base: "yellow.900", _dark: "yellow.100" }}
            px="0.5"
            rounded="sm"
            fontWeight="medium"
          >
            {part}
          </Box>
        ) : (
          part
        )
      )}
    </>
  );
}

const levelColors: Record<LogLevel, { color: string; darkColor: string; bg: string; darkBg: string }> = {
  debug: { color: "gray.600", darkColor: "gray.400", bg: "gray.50", darkBg: "gray.950/50" },
  info: { color: "blue.600", darkColor: "blue.400", bg: "blue.50", darkBg: "blue.950/50" },
  warn: { color: "yellow.600", darkColor: "yellow.400", bg: "yellow.50/50", darkBg: "yellow.950/30" },
  error: { color: "red.600", darkColor: "red.400", bg: "red.50/50", darkBg: "red.950/30" },
};

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
  const level = entry.level || "info";
  const levelStyle = levelColors[level];
  const hasMatch = searchTerm && entry.message.toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <Flex
      alignItems="flex-start"
      py="0.5"
      px="2"
      borderBottom="1px solid"
      borderColor="border.subtle"
      _hover={{ bg: "bg.subtle" }}
      cursor="pointer"
      bg={
        hasMatch
          ? { base: "yellow.50", _dark: "yellow.950/50" }
          : level === "error"
            ? { base: levelStyle.bg, _dark: levelStyle.darkBg }
            : level === "warn"
              ? { base: levelStyle.bg, _dark: levelStyle.darkBg }
              : undefined
      }
      onClick={() => notifyModel("selectLine", { index: originalIndex, entry })}
    >
      <Box
        w="8"
        color="fg.muted"
        textAlign="right"
        pr="2"
        userSelect="none"
        flexShrink={0}
      >
        {originalIndex + 1}
      </Box>
      {entry.timestamp && (
        <Box color="fg.muted" mr="2" flexShrink={0}>
          {entry.timestamp}
        </Box>
      )}
      <Box
        mr="2"
        fontWeight="medium"
        flexShrink={0}
        w="12"
        color={{ base: levelStyle.color, _dark: levelStyle.darkColor }}
      >
        {level.toUpperCase().padEnd(5)}
      </Box>
      <Box whiteSpace="pre-wrap" css={{ wordBreak: "break-all" }}>
        <HighlightedText text={entry.message} search={searchTerm} />
      </Box>
    </Flex>
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

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
      <Flex
        fontFamily="mono"
        fontSize="xs"
        color="fg.default"
        bg="bg.canvas"
        flexDirection="column"
        maxH="400px"
        border="1px solid"
        borderColor="border.default"
        rounded="lg"
        overflow="hidden"
        p="4"
        justify="center"
        align="center"
      >
        <Spinner size="md" />
        <Box mt="2" color="fg.muted">Loading logs...</Box>
      </Flex>
    );
  }

  if (!data?.logs?.length) {
    return (
      <Flex
        fontFamily="mono"
        fontSize="xs"
        color="fg.default"
        bg="bg.canvas"
        flexDirection="column"
        maxH="400px"
        border="1px solid"
        borderColor="border.default"
        rounded="lg"
        overflow="hidden"
        p="4"
        justify="center"
        align="center"
      >
        <Box color="fg.muted">No logs</Box>
      </Flex>
    );
  }

  const levels: LogLevel[] = ["error", "warn", "info", "debug"];

  return (
    <VStack
      fontFamily="mono"
      fontSize="xs"
      color="fg.default"
      bg="bg.canvas"
      maxH="400px"
      border="1px solid"
      borderColor="border.default"
      rounded="lg"
      overflow="hidden"
      gap="0"
    >
      {/* Header */}
      <Flex
        justify="space-between"
        align="center"
        p="2"
        bg="bg.subtle"
        borderBottom="1px solid"
        borderColor="border.default"
        w="full"
        flexWrap="wrap"
        gap="2"
      >
        <Flex align="center" gap="2">
          {data.title && (
            <Box as="h3" fontSize="sm" fontWeight="semibold" fontFamily="sans" m="0">
              {data.title}
            </Box>
          )}
        </Flex>

        <HStack gap="2">
          {/* Search input with clear button */}
          <Flex
            align="center"
            bg="bg.canvas"
            border="1px solid"
            borderColor="border.default"
            rounded="md"
            px="2"
            gap="1"
            _focusWithin={{ borderColor: "blue.500", ring: "2px", ringColor: "blue.200" }}
          >
            <Box color="fg.muted" fontSize="sm" flexShrink={0}>&#128269;</Box>
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Ctrl+F)"
              value={searchTerm}
              onChange={handleSearchChange}
              size="sm"
              className={css({
                border: "none",
                bg: "transparent",
                py: "1",
                fontSize: "xs",
                w: "140px",
                _focus: { outline: "none", boxShadow: "none" },
                _placeholder: { color: "fg.muted" },
              })}
            />
            {searchTerm && (
              <IconButton
                variant="ghost"
                size="xs"
                onClick={clearSearch}
                title="Clear search (Esc)"
              >
                x
              </IconButton>
            )}
          </Flex>

          {/* Auto-scroll toggle */}
          <IconButton
            variant={autoScroll ? "solid" : "outline"}
            size="sm"
            onClick={toggleAutoScroll}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          >
            {autoScroll ? "\u2193" : "\u2016"}
          </IconButton>

          {/* Export button */}
          <IconButton
            variant={copyStatus === "copied" ? "solid" : "outline"}
            size="sm"
            onClick={handleExport}
            title="Copy filtered logs to clipboard"
            className={
              copyStatus === "copied"
                ? css({
                    bg: { base: "green.100", _dark: "green.900" },
                    borderColor: { base: "green.400", _dark: "green.600" },
                    color: { base: "green.700", _dark: "green.300" },
                  })
                : undefined
            }
          >
            {copyStatus === "copied" ? "\u2713" : "\u2398"}
          </IconButton>
        </HStack>
      </Flex>

      {/* Level filters with counts */}
      <Flex gap="1" px="2" py="1.5" bg="bg.canvas" borderBottom="1px solid" borderColor="border.subtle" flexWrap="wrap" w="full">
        <Button variant="ghost" size="xs" onClick={showAllLevels} title="Show all levels">
          All
        </Button>
        {levels.map((level) => {
          const levelStyle = levelColors[level];
          return (
            <Button
              key={level}
              variant={levelFilter.has(level) ? "outline" : "ghost"}
              size="xs"
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "1.5",
                opacity: levelFilter.has(level) ? 1 : 0.5,
                fontWeight: levelFilter.has(level) ? "medium" : "normal",
                transition: "all 0.15s",
                _hover: { opacity: 0.8 },
                color: { base: levelStyle.color, _dark: levelStyle.darkColor },
              })}
              onClick={() => toggleLevel(level)}
              onDoubleClick={() => showOnlyLevel(level)}
              title={`Toggle ${level} (double-click to show only)`}
            >
              <Box textTransform="uppercase" letterSpacing="0.02em">
                {level.toUpperCase()}
              </Box>
              <Badge variant="outline" size="sm">
                {levelCounts[level]}
              </Badge>
            </Button>
          );
        })}
      </Flex>

      {/* Stats bar */}
      <Flex
        justify="space-between"
        align="center"
        px="2"
        py="1"
        fontSize="xs"
        color="fg.muted"
        bg="bg.subtle"
        borderBottom="1px solid"
        borderColor="border.subtle"
        w="full"
      >
        <span>
          {filteredLogs.length} / {parsedLogs.length} lines
        </span>
        {searchTerm && (
          <Box color={{ base: "yellow.700", _dark: "yellow.400" }} fontWeight="medium">
            {matchCount} match{matchCount !== 1 ? "es" : ""} for "{searchTerm}"
          </Box>
        )}
      </Flex>

      {/* Log content */}
      <Box flex="1" overflowY="auto" overflowX="auto" w="full" ref={containerRef}>
        {filteredLogs.length === 0 ? (
          <VStack gap="2" p="4" color="fg.muted" textAlign="center">
            <span>No logs match the current filters</span>
            {searchTerm && (
              <Button variant="subtle" size="sm" onClick={clearSearch}>
                Clear search
              </Button>
            )}
          </VStack>
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
      </Box>
    </VStack>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<LogViewer />);
