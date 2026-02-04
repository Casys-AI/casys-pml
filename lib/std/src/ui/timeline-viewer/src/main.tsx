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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack, HStack, Circle } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { IconButton } from "../../components/ui/icon-button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

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
// Style mappings
// ============================================================================

const dotColors: Record<EventType, string> = {
  info: "blue.500",
  warning: "orange.500",
  error: "red.500",
  success: "green.500",
};

const typeBtnColors: Record<EventType, { color: string; darkColor: string }> = {
  error: { color: "red.600", darkColor: "red.400" },
  warning: { color: "orange.600", darkColor: "orange.400" },
  info: { color: "blue.600", darkColor: "blue.400" },
  success: { color: "green.600", darkColor: "green.400" },
};

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

  const typeConfig: Record<EventType, { colorPalette: string }> = {
    info: { colorPalette: "blue" },
    warning: { colorPalette: "orange" },
    error: { colorPalette: "red" },
    success: { colorPalette: "green" },
  };

  const config = typeConfig[type];

  return (
    <Flex
      align="flex-start"
      gap="3"
      p="2"
      rounded="md"
      cursor="pointer"
      transition="background 0.15s"
      bg={highlight ? "yellow.50" : "transparent"}
      _hover={{ bg: highlight ? "yellow.100" : "bg.subtle" }}
      _dark={highlight ? { bg: "yellow.950/50", _hover: { bg: "yellow.950/70" } } : {}}
      onClick={() => {
        if (hasDescription || hasMetadata) {
          onToggle();
        }
        notifyModel("selectEvent", { event });
      }}
    >
      {/* Timeline connector */}
      <Flex direction="column" align="center" pt="1" w="16px" flexShrink={0}>
        <Box
          w="2px"
          h="100%"
          minH="20px"
          bg="border.default"
          position="absolute"
          top="0"
          bottom="0"
        />
        <Circle
          size="12px"
          border="2px solid"
          borderColor="bg.canvas"
          boxShadow="sm"
          position="relative"
          zIndex={1}
          bg={dotColors[type]}
        />
      </Flex>

      {/* Time */}
      <Box fontSize="xs" fontFamily="mono" color="fg.muted" w="70px" flexShrink={0} pt="0.5">
        {formatTime(date)}
      </Box>

      {/* Content */}
      <Flex flex="1" flexWrap="wrap" align="flex-start" gap="2">
        {/* Type badge */}
        <Badge size="sm" variant="subtle" colorPalette={config.colorPalette}>
          {type}
        </Badge>

        {/* Title */}
        <Box fontWeight="medium" flex="1" minW="150px">
          {event.title}
        </Box>

        {/* Source */}
        {event.source && (
          <Badge size="sm" variant="outline" colorPalette="gray">
            {event.source}
          </Badge>
        )}

        {/* Expand indicator */}
        {(hasDescription || hasMetadata) && (
          <Box
            fontSize="xs"
            color="fg.muted"
            cursor="pointer"
            transition="transform 0.15s"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            {"\u25B6"}
          </Box>
        )}

        {/* Description (collapsible) */}
        {expanded && hasDescription && (
          <Box
            w="100%"
            mt="2"
            p="2"
            bg="bg.subtle"
            rounded="md"
            fontSize="sm"
            color="fg.muted"
            whiteSpace="pre-wrap"
            lineHeight="relaxed"
          >
            {event.description}
          </Box>
        )}

        {/* Metadata (collapsible) */}
        {expanded && hasMetadata && (
          <Box w="100%" mt="2" p="2" bg="bg.subtle" rounded="md" fontSize="xs" fontFamily="mono">
            {Object.entries(event.metadata!).map(([key, value]) => (
              <Flex key={key} gap="2" py="0.5">
                <Box color="fg.muted" fontWeight="medium">{key}:</Box>
                <Box color="fg.default" wordBreak="break-all">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </Box>
              </Flex>
            ))}
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

function DateGroup({ group, expandedIds, toggleExpand, searchFilter }: {
  group: GroupedEvents;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchFilter: string;
}) {
  return (
    <Box mb="4">
      <Flex align="center" gap="2" mb="3">
        <Box flex="1" h="1px" bg="border.default" />
        <Box
          fontSize="xs"
          fontWeight="semibold"
          color="fg.muted"
          textTransform="uppercase"
          letterSpacing="wide"
          px="2"
        >
          {group.label}
        </Box>
        <Box flex="1" h="1px" bg="border.default" />
      </Flex>
      <VStack gap="1">
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
      </VStack>
    </Box>
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

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchFilter(value);
    notifyModel("search", { text: value });
  }, []);

  if (loading) {
    return (
      <Box
        fontFamily="sans"
        fontSize="sm"
        color="fg.default"
        bg="bg.canvas"
        display="flex"
        flexDirection="column"
        maxH="500px"
        border="1px solid"
        borderColor="border.default"
        rounded="lg"
        overflow="hidden"
      >
        <Box p="4" textAlign="center" color="fg.muted">Loading timeline...</Box>
      </Box>
    );
  }

  if (!data?.events?.length) {
    return (
      <Box
        fontFamily="sans"
        fontSize="sm"
        color="fg.default"
        bg="bg.canvas"
        display="flex"
        flexDirection="column"
        maxH="500px"
        border="1px solid"
        borderColor="border.default"
        rounded="lg"
        overflow="hidden"
      >
        <Box p="4" textAlign="center" color="fg.muted">No events</Box>
      </Box>
    );
  }

  const eventTypes: EventType[] = ["error", "warning", "info", "success"];

  return (
    <Box
      fontFamily="sans"
      fontSize="sm"
      color="fg.default"
      bg="bg.canvas"
      display="flex"
      flexDirection="column"
      maxH="500px"
      border="1px solid"
      borderColor="border.default"
      rounded="lg"
      overflow="hidden"
    >
      {/* Header */}
      <Flex
        justify="space-between"
        align="center"
        p="3"
        bg="bg.subtle"
        borderBottom="1px solid"
        borderColor="border.default"
        flexWrap="wrap"
        gap="2"
      >
        {data.title && (
          <Box as="h3" fontSize="md" fontWeight="semibold" m="0">
            {data.title}
          </Box>
        )}

        <Flex gap="2" align="center" flexWrap="wrap">
          {/* Type filters */}
          <HStack gap="1">
            {eventTypes.map((type) => {
              const colors = typeBtnColors[type];
              return (
                <Button
                  key={type}
                  variant={typeFilter.has(type) ? "outline" : "ghost"}
                  size="xs"
                  onClick={() => toggleType(type)}
                  className={css({
                    opacity: typeFilter.has(type) ? 1 : 0.5,
                    textTransform: "capitalize",
                    fontWeight: typeFilter.has(type) ? "medium" : "normal",
                    color: colors.color,
                    _dark: { color: colors.darkColor },
                    _hover: { opacity: 0.8 },
                    transition: "all 0.15s",
                  })}
                >
                  {type}
                </Button>
              );
            })}
          </HStack>

          {/* Search filter */}
          <Input
            type="text"
            placeholder="Search..."
            value={searchFilter}
            onChange={handleSearchChange}
            size="sm"
            className={css({ w: "150px" })}
          />

          {/* Expand/Collapse buttons */}
          <IconButton
            variant="outline"
            size="sm"
            onClick={expandAll}
            title="Expand all"
          >
            +
          </IconButton>
          <IconButton
            variant="outline"
            size="sm"
            onClick={collapseAll}
            title="Collapse all"
          >
            -
          </IconButton>

          {/* Auto-scroll toggle */}
          <IconButton
            variant={autoScroll ? "solid" : "outline"}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to recent"
          >
            {"\u2191"}
          </IconButton>
        </Flex>
      </Flex>

      {/* Stats */}
      <Box px="3" py="1.5" fontSize="xs" color="fg.muted" bg="bg.subtle" borderBottom="1px solid" borderColor="border.subtle">
        {filteredEvents.length} / {data.events.length} events
        {searchFilter && ` matching "${searchFilter}"`}
      </Box>

      {/* Timeline content */}
      <Box flex="1" overflowY="auto" p="3" ref={containerRef}>
        {groupedEvents.map((group) => (
          <DateGroup
            key={group.date.toISOString()}
            group={group}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            searchFilter={searchFilter}
          />
        ))}
      </Box>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<TimelineViewer />);
