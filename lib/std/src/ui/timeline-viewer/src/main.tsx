/**
 * Timeline Viewer UI - Temporal event display
 *
 * Displays events on a vertical timeline with:
 * - Colored nodes by type (info, warning, error, success)
 * - Date grouping (Today, Yesterday, Older)
 * - Type filtering
 * - Text search in titles/descriptions
 * - Auto-scroll to most recent
 * - Expand/collapse for long descriptions
 *
 * @module lib/std/src/ui/timeline-viewer
 */

import { render } from "preact";
import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface TimelineEvent {
  timestamp: string | number; // ISO date or unix timestamp
  type: string; // "info", "warning", "error", "success"
  title: string;
  description?: string;
  source?: string; // e.g., pod name, service name
  metadata?: Record<string, unknown>;
}

interface TimelineData {
  events: TimelineEvent[];
  title?: string;
}

type EventType = "info" | "warning" | "error" | "success";

interface GroupedEvents {
  label: string;
  date: Date;
  events: TimelineEvent[];
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Timeline Viewer", version: "1.0.0" });
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

function parseTimestamp(timestamp: string | number): Date {
  if (typeof timestamp === "number") {
    // Unix timestamp (seconds or milliseconds)
    return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  }
  return new Date(timestamp);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (eventDate.getTime() === today.getTime()) {
    return "Today";
  } else if (eventDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    return formatDate(date);
  }
}

function groupEventsByDate(events: TimelineEvent[]): GroupedEvents[] {
  const groups = new Map<string, GroupedEvents>();

  // Sort events by timestamp descending (most recent first)
  const sorted = [...events].sort((a, b) => {
    const dateA = parseTimestamp(a.timestamp);
    const dateB = parseTimestamp(b.timestamp);
    return dateB.getTime() - dateA.getTime();
  });

  for (const event of sorted) {
    const date = parseTimestamp(event.timestamp);
    const label = getDateGroup(date);
    const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        label,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        events: [],
      });
    }
    groups.get(dateKey)!.events.push(event);
  }

  // Sort groups by date descending
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function normalizeEventType(type: string): EventType {
  const normalized = type.toLowerCase();
  if (normalized === "warn" || normalized === "warning") return "warning";
  if (normalized === "err" || normalized === "error") return "error";
  if (normalized === "ok" || normalized === "success") return "success";
  return "info";
}

// ============================================================================
// Components
// ============================================================================

function EventNode({ event, expanded, onToggle, highlight }: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
  highlight: boolean;
}) {
  const date = parseTimestamp(event.timestamp);
  const type = normalizeEventType(event.type);
  const hasDescription = !!event.description;
  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;

  const typeColors: Record<EventType, { dot: string; bg: string; text: string }> = {
    info: {
      dot: styles.dotInfo,
      bg: styles.bgInfo,
      text: styles.textInfo,
    },
    warning: {
      dot: styles.dotWarning,
      bg: styles.bgWarning,
      text: styles.textWarning,
    },
    error: {
      dot: styles.dotError,
      bg: styles.bgError,
      text: styles.textError,
    },
    success: {
      dot: styles.dotSuccess,
      bg: styles.bgSuccess,
      text: styles.textSuccess,
    },
  };

  const colors = typeColors[type];

  return (
    <div
      class={css(styles.eventNode, highlight && styles.eventHighlight)}
      onClick={() => {
        if (hasDescription || hasMetadata) {
          onToggle();
        }
        notifyModel("selectEvent", { event });
      }}
    >
      {/* Timeline connector */}
      <div class={styles.timelineConnector}>
        <div class={styles.timelineLine} />
        <div class={css(styles.timelineDot, colors.dot)} />
      </div>

      {/* Time */}
      <div class={styles.eventTime}>{formatTime(date)}</div>

      {/* Content */}
      <div class={styles.eventContent}>
        {/* Type badge */}
        <span class={css(styles.typeBadge, colors.bg, colors.text)}>
          {type}
        </span>

        {/* Title */}
        <span class={styles.eventTitle}>{event.title}</span>

        {/* Source */}
        {event.source && (
          <span class={styles.eventSource}>{event.source}</span>
        )}

        {/* Expand indicator */}
        {(hasDescription || hasMetadata) && (
          <span class={css(styles.expandIcon, expanded && styles.expandIconRotated)}>
            {"\u25B6"}
          </span>
        )}

        {/* Description (collapsible) */}
        {expanded && hasDescription && (
          <div class={styles.eventDescription}>{event.description}</div>
        )}

        {/* Metadata (collapsible) */}
        {expanded && hasMetadata && (
          <div class={styles.eventMetadata}>
            {Object.entries(event.metadata!).map(([key, value]) => (
              <div key={key} class={styles.metadataRow}>
                <span class={styles.metadataKey}>{key}:</span>
                <span class={styles.metadataValue}>
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DateGroup({ group, expandedIds, toggleExpand, searchFilter }: {
  group: GroupedEvents;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchFilter: string;
}) {
  return (
    <div class={styles.dateGroup}>
      <div class={styles.dateHeader}>
        <div class={styles.dateLine} />
        <span class={styles.dateLabel}>{group.label}</span>
        <div class={styles.dateLine} />
      </div>
      <div class={styles.eventsList}>
        {group.events.map((event, idx) => {
          const eventId = `${group.date.toISOString()}-${idx}`;
          const isHighlighted = searchFilter && (
            event.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
            (event.description?.toLowerCase().includes(searchFilter.toLowerCase()))
          );
          return (
            <EventNode
              key={eventId}
              event={event}
              expanded={expandedIds.has(eventId)}
              onToggle={() => toggleExpand(eventId)}
              highlight={!!isHighlighted}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function TimelineViewer() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(
    new Set(["info", "warning", "error", "success"])
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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
          // Handle array of events or object with events property
          if (Array.isArray(parsed)) {
            setData({ events: parsed });
          } else if (parsed.events && Array.isArray(parsed.events)) {
            setData(parsed);
          } else {
            // Try to wrap single event in array
            setData({ events: [parsed] });
          }
        }
      } catch {
        // Failed to parse
        setData({ events: [] });
      }
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0; // Scroll to top (most recent)
    }
  }, [data, autoScroll]);

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((event) => {
      // Type filter
      const type = normalizeEventType(event.type);
      if (!typeFilter.has(type)) return false;

      // Search filter
      if (searchFilter) {
        const search = searchFilter.toLowerCase();
        const matchTitle = event.title.toLowerCase().includes(search);
        const matchDesc = event.description?.toLowerCase().includes(search);
        const matchSource = event.source?.toLowerCase().includes(search);
        if (!matchTitle && !matchDesc && !matchSource) return false;
      }

      return true;
    });
  }, [data, typeFilter, searchFilter]);

  const groupedEvents = useMemo(() => {
    return groupEventsByDate(filteredEvents);
  }, [filteredEvents]);

  const toggleType = useCallback((type: EventType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      notifyModel("filterType", { types: Array.from(next) });
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    groupedEvents.forEach((group) => {
      group.events.forEach((_, idx) => {
        allIds.add(`${group.date.toISOString()}-${idx}`);
      });
    });
    setExpandedIds(allIds);
  }, [groupedEvents]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleSearchChange = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchFilter(value);
    notifyModel("search", { text: value });
  }, []);

  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading timeline...</div>
      </div>
    );
  }

  if (!data?.events?.length) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No events</div>
      </div>
    );
  }

  const eventTypes: EventType[] = ["error", "warning", "info", "success"];

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        {data.title && <h3 class={styles.title}>{data.title}</h3>}

        <div class={styles.controls}>
          {/* Type filters */}
          <div class={styles.typeFilters}>
            {eventTypes.map((type) => (
              <button
                key={type}
                class={css(
                  styles.typeBtn,
                  typeFilter.has(type) && styles.typeBtnActive,
                  styles[`typeBtn_${type}`]
                )}
                onClick={() => toggleType(type)}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search filter */}
          <input
            type="text"
            placeholder="Search..."
            value={searchFilter}
            onInput={handleSearchChange}
            class={styles.searchInput}
          />

          {/* Expand/Collapse buttons */}
          <button
            class={styles.actionBtn}
            onClick={expandAll}
            title="Expand all"
          >
            +
          </button>
          <button
            class={styles.actionBtn}
            onClick={collapseAll}
            title="Collapse all"
          >
            -
          </button>

          {/* Auto-scroll toggle */}
          <button
            class={css(styles.actionBtn, autoScroll && styles.actionBtnActive)}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to recent"
          >
            {"\u2191"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div class={styles.stats}>
        {filteredEvents.length} / {data.events.length} events
        {searchFilter && ` matching "${searchFilter}"`}
      </div>

      {/* Timeline content */}
      <div class={styles.timelineContainer} ref={containerRef}>
        {groupedEvents.map((group) => (
          <DateGroup
            key={group.date.toISOString()}
            group={group}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            searchFilter={searchFilter}
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
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    display: "flex",
    flexDirection: "column",
    maxH: "500px",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    p: "3",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.default",
    flexWrap: "wrap",
    gap: "2",
  }),
  title: css({
    fontSize: "md",
    fontWeight: "semibold",
    m: 0,
  }),
  controls: css({
    display: "flex",
    gap: "2",
    alignItems: "center",
    flexWrap: "wrap",
  }),
  typeFilters: css({
    display: "flex",
    gap: "1",
  }),
  typeBtn: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.canvas",
    cursor: "pointer",
    opacity: 0.5,
    textTransform: "capitalize",
    transition: "all 0.15s",
    _hover: { opacity: 0.8 },
  }),
  typeBtnActive: css({
    opacity: 1,
    fontWeight: "medium",
  }),
  typeBtn_error: css({ color: "red.600", _dark: { color: "red.400" } }),
  typeBtn_warning: css({ color: "orange.600", _dark: { color: "orange.400" } }),
  typeBtn_info: css({ color: "blue.600", _dark: { color: "blue.400" } }),
  typeBtn_success: css({ color: "green.600", _dark: { color: "green.400" } }),
  searchInput: css({
    px: "3",
    py: "1.5",
    fontSize: "sm",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.canvas",
    w: "150px",
    _focus: { outline: "none", borderColor: "blue.500" },
  }),
  actionBtn: css({
    px: "2",
    py: "1",
    fontSize: "sm",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.canvas",
    cursor: "pointer",
    opacity: 0.6,
    minW: "28px",
    textAlign: "center",
    transition: "all 0.15s",
    _hover: { opacity: 1 },
  }),
  actionBtnActive: css({
    opacity: 1,
    bg: "blue.100",
    borderColor: "blue.300",
    color: "blue.700",
    _dark: { bg: "blue.900", borderColor: "blue.700", color: "blue.300" },
  }),
  stats: css({
    px: "3",
    py: "1.5",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  timelineContainer: css({
    flex: 1,
    overflowY: "auto",
    p: "3",
  }),
  dateGroup: css({
    mb: "4",
  }),
  dateHeader: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    mb: "3",
  }),
  dateLine: css({
    flex: 1,
    h: "1px",
    bg: "border.default",
  }),
  dateLabel: css({
    fontSize: "xs",
    fontWeight: "semibold",
    color: "fg.muted",
    textTransform: "uppercase",
    letterSpacing: "wide",
    px: "2",
  }),
  eventsList: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
  }),
  eventNode: css({
    display: "flex",
    alignItems: "flex-start",
    gap: "3",
    p: "2",
    rounded: "md",
    cursor: "pointer",
    transition: "background 0.15s",
    _hover: { bg: "bg.subtle" },
  }),
  eventHighlight: css({
    bg: "yellow.50",
    _dark: { bg: "yellow.950/50" },
    _hover: { bg: "yellow.100", _dark: { bg: "yellow.950/70" } },
  }),
  timelineConnector: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pt: "1",
    w: "16px",
    flexShrink: 0,
  }),
  timelineLine: css({
    w: "2px",
    h: "100%",
    minH: "20px",
    bg: "border.default",
    position: "absolute",
    top: 0,
    bottom: 0,
  }),
  timelineDot: css({
    w: "12px",
    h: "12px",
    rounded: "full",
    border: "2px solid",
    borderColor: "bg.canvas",
    boxShadow: "sm",
    position: "relative",
    zIndex: 1,
  }),
  dotInfo: css({
    bg: "blue.500",
  }),
  dotWarning: css({
    bg: "orange.500",
  }),
  dotError: css({
    bg: "red.500",
  }),
  dotSuccess: css({
    bg: "green.500",
  }),
  eventTime: css({
    fontSize: "xs",
    fontFamily: "mono",
    color: "fg.muted",
    w: "70px",
    flexShrink: 0,
    pt: "0.5",
  }),
  eventContent: css({
    flex: 1,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: "2",
  }),
  typeBadge: css({
    fontSize: "xs",
    px: "1.5",
    py: "0.5",
    rounded: "sm",
    fontWeight: "medium",
    textTransform: "lowercase",
  }),
  bgInfo: css({
    bg: "blue.100",
    _dark: { bg: "blue.900/50" },
  }),
  bgWarning: css({
    bg: "orange.100",
    _dark: { bg: "orange.900/50" },
  }),
  bgError: css({
    bg: "red.100",
    _dark: { bg: "red.900/50" },
  }),
  bgSuccess: css({
    bg: "green.100",
    _dark: { bg: "green.900/50" },
  }),
  textInfo: css({
    color: "blue.700",
    _dark: { color: "blue.300" },
  }),
  textWarning: css({
    color: "orange.700",
    _dark: { color: "orange.300" },
  }),
  textError: css({
    color: "red.700",
    _dark: { color: "red.300" },
  }),
  textSuccess: css({
    color: "green.700",
    _dark: { color: "green.300" },
  }),
  eventTitle: css({
    fontWeight: "medium",
    flex: 1,
    minW: "150px",
  }),
  eventSource: css({
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.subtle",
    px: "1.5",
    py: "0.5",
    rounded: "sm",
    fontFamily: "mono",
  }),
  expandIcon: css({
    fontSize: "xs",
    color: "fg.muted",
    transition: "transform 0.15s",
    cursor: "pointer",
  }),
  expandIconRotated: css({
    transform: "rotate(90deg)",
  }),
  eventDescription: css({
    w: "100%",
    mt: "2",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    fontSize: "sm",
    color: "fg.muted",
    whiteSpace: "pre-wrap",
    lineHeight: "relaxed",
  }),
  eventMetadata: css({
    w: "100%",
    mt: "2",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    fontSize: "xs",
    fontFamily: "mono",
  }),
  metadataRow: css({
    display: "flex",
    gap: "2",
    py: "0.5",
  }),
  metadataKey: css({
    color: "fg.muted",
    fontWeight: "medium",
  }),
  metadataValue: css({
    color: "fg.default",
    wordBreak: "break-all",
  }),
  loading: css({
    p: "4",
    textAlign: "center",
    color: "fg.muted",
  }),
  empty: css({
    p: "4",
    textAlign: "center",
    color: "fg.muted",
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<TimelineViewer />, document.getElementById("app")!);
