/**
 * Status Badge UI - Valid/Invalid/Warning display
 *
 * Compact badge showing validation status with:
 * - Color-coded status (green/red/yellow)
 * - Icon indicator
 * - Optional details/message
 * - Multiple statuses support
 *
 * @module lib/std/src/ui/status-badge
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack, HStack, Circle } from "../../styled-system/jsx";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

type StatusType = "valid" | "invalid" | "warning" | "info" | "pending";

interface StatusItem {
  status: StatusType | boolean;
  label?: string;
  message?: string;
  value?: string | number | boolean;
}

interface StatusData {
  // Single status
  valid?: boolean;
  status?: StatusType | boolean;
  label?: string;
  message?: string;
  value?: string | number | boolean;

  // Multiple statuses
  items?: StatusItem[];

  // Title
  title?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Status Badge", version: "1.0.0" });
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

function normalizeStatus(status: StatusType | boolean | undefined, valid?: boolean): StatusType {
  if (typeof status === "boolean") return status ? "valid" : "invalid";
  if (status) return status;
  if (typeof valid === "boolean") return valid ? "valid" : "invalid";
  return "info";
}

const statusConfig: Record<StatusType, { icon: string; colorPalette: string }> = {
  valid: { icon: "\u2713", colorPalette: "green" },
  invalid: { icon: "\u2717", colorPalette: "red" },
  warning: { icon: "!", colorPalette: "orange" },
  info: { icon: "i", colorPalette: "blue" },
  pending: { icon: "\u25CB", colorPalette: "gray" },
};

const statusBgColors: Record<StatusType, string> = {
  valid: "green.100",
  invalid: "red.100",
  warning: "yellow.100",
  info: "blue.100",
  pending: "gray.100",
};

const statusBgColorsDark: Record<StatusType, string> = {
  valid: "green.900/50",
  invalid: "red.900/50",
  warning: "yellow.900/50",
  info: "blue.900/50",
  pending: "gray.800",
};

const statusTextColors: Record<StatusType, string> = {
  valid: "green.700",
  invalid: "red.700",
  warning: "yellow.700",
  info: "blue.700",
  pending: "gray.600",
};

const statusTextColorsDark: Record<StatusType, string> = {
  valid: "green.400",
  invalid: "red.400",
  warning: "yellow.400",
  info: "blue.400",
  pending: "gray.400",
};

// ============================================================================
// Components
// ============================================================================

function StatusItemCard({ item }: { item: StatusItem }) {
  const status = normalizeStatus(item.status);
  const config = statusConfig[status];

  const variantMap: Record<StatusType, "default" | "success" | "error" | "warning" | "info"> = {
    valid: "success",
    invalid: "error",
    warning: "warning",
    info: "info",
    pending: "default",
  };

  return (
    <Flex
      align="flex-start"
      gap="2"
      p="2"
      bg="bg.subtle"
      rounded="md"
      cursor="pointer"
      transition="background 0.15s"
      _hover={{ bg: "bg.muted" }}
      onClick={() => notifyModel("click", { status, label: item.label, value: item.value })}
    >
      <Circle
        size="24px"
        flexShrink={0}
        className={css({
          bg: statusBgColors[status],
          _dark: { bg: statusBgColorsDark[status] },
        })}
      >
        <Box
          fontSize="xs"
          fontWeight="bold"
          className={css({
            color: statusTextColors[status],
            _dark: { color: statusTextColorsDark[status] },
          })}
        >
          {config.icon}
        </Box>
      </Circle>
      <Box flex="1" minW="0">
        <HStack gap="2">
          {item.label && <Box fontWeight="medium">{item.label}</Box>}
          <Badge size="sm" variant={variantMap[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </HStack>
        {item.value !== undefined && (
          <Box fontFamily="mono" fontSize="xs" color="fg.muted" mt="0.5" overflow="hidden" textOverflow="ellipsis">
            {String(item.value)}
          </Box>
        )}
        {item.message && (
          <Box fontSize="xs" color="fg.muted" mt="0.5">
            {item.message}
          </Box>
        )}
      </Box>
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function StatusBadge() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

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

          // Normalize various input formats
          if (Array.isArray(parsed)) {
            // Array of statuses
            setData({ items: parsed });
          } else if (typeof parsed === "boolean") {
            // Just a boolean
            setData({ valid: parsed });
          } else if (parsed.items) {
            // Already has items array
            setData(parsed);
          } else {
            // Single status object
            setData(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to parse status data", e);
      }
    };
  }, []);

  if (loading) {
    return (
      <Box p="3" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box color="fg.muted">...</Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p="3" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box color="fg.muted">No status</Box>
      </Box>
    );
  }

  // Convert single status to items array for uniform rendering
  const items: StatusItem[] = data.items || [{
    status: normalizeStatus(data.status, data.valid),
    label: data.label,
    message: data.message,
    value: data.value,
  }];

  // Calculate summary if multiple items
  const validCount = items.filter(i => normalizeStatus(i.status) === "valid").length;
  const invalidCount = items.filter(i => normalizeStatus(i.status) === "invalid").length;
  const warningCount = items.filter(i => normalizeStatus(i.status) === "warning").length;

  return (
    <Box p="3" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
      {/* Title */}
      {data.title && (
        <Box fontSize="sm" fontWeight="semibold" mb="2">
          {data.title}
        </Box>
      )}

      {/* Summary for multiple items */}
      {items.length > 1 && (
        <HStack gap="3" mb="2" fontSize="xs" fontWeight="medium">
          {validCount > 0 && <Box color="green.600">{"\u2713"} {validCount}</Box>}
          {invalidCount > 0 && <Box color="red.600">{"\u2717"} {invalidCount}</Box>}
          {warningCount > 0 && <Box color="yellow.600">! {warningCount}</Box>}
        </HStack>
      )}

      {/* Badges */}
      <VStack gap="2">
        {items.map((item, i) => (
          <StatusItemCard key={i} item={item} />
        ))}
      </VStack>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<StatusBadge />);
