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

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

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

const statusConfig: Record<StatusType, { icon: string; color: string; bg: string }> = {
  valid: { icon: "✓", color: "green.700", bg: "green.100" },
  invalid: { icon: "✗", color: "red.700", bg: "red.100" },
  warning: { icon: "!", color: "yellow.700", bg: "yellow.100" },
  info: { icon: "i", color: "blue.700", bg: "blue.100" },
  pending: { icon: "○", color: "gray.600", bg: "gray.100" },
};

// ============================================================================
// Components
// ============================================================================

function Badge({ item }: { item: StatusItem }) {
  const status = normalizeStatus(item.status);
  const config = statusConfig[status];

  return (
    <div
      class={styles.badge}
      onClick={() => notifyModel("click", { status, label: item.label, value: item.value })}
    >
      <div class={css(styles.iconCircle, styles[`bg_${status}`])}>
        <span class={css(styles.icon, styles[`color_${status}`])}>{config.icon}</span>
      </div>
      <div class={styles.content}>
        <div class={styles.header}>
          {item.label && <span class={styles.label}>{item.label}</span>}
          <span class={css(styles.statusText, styles[`color_${status}`])}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {item.value !== undefined && (
          <div class={styles.value}>{String(item.value)}</div>
        )}
        {item.message && (
          <div class={styles.message}>{item.message}</div>
        )}
      </div>
    </div>
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
    return <div class={styles.container}><div class={styles.loading}>...</div></div>;
  }

  if (!data) {
    return <div class={styles.container}><div class={styles.empty}>No status</div></div>;
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
    <div class={styles.container}>
      {/* Title */}
      {data.title && <div class={styles.title}>{data.title}</div>}

      {/* Summary for multiple items */}
      {items.length > 1 && (
        <div class={styles.summary}>
          {validCount > 0 && <span class={styles.summaryValid}>✓ {validCount}</span>}
          {invalidCount > 0 && <span class={styles.summaryInvalid}>✗ {invalidCount}</span>}
          {warningCount > 0 && <span class={styles.summaryWarning}>! {warningCount}</span>}
        </div>
      )}

      {/* Badges */}
      <div class={styles.badges}>
        {items.map((item, i) => (
          <Badge key={i} item={item} />
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
    p: "3",
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
  }),
  title: css({
    fontSize: "sm",
    fontWeight: "semibold",
    mb: "2",
  }),
  summary: css({
    display: "flex",
    gap: "3",
    mb: "2",
    fontSize: "xs",
    fontWeight: "medium",
  }),
  summaryValid: css({ color: "green.600" }),
  summaryInvalid: css({ color: "red.600" }),
  summaryWarning: css({ color: "yellow.600" }),
  badges: css({
    display: "flex",
    flexDirection: "column",
    gap: "2",
  }),
  badge: css({
    display: "flex",
    alignItems: "flex-start",
    gap: "2",
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    cursor: "pointer",
    transition: "background 0.15s",
    _hover: { bg: "bg.muted" },
  }),
  iconCircle: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    w: "24px",
    h: "24px",
    rounded: "full",
    flexShrink: 0,
  }),
  icon: css({
    fontSize: "xs",
    fontWeight: "bold",
  }),
  content: css({
    flex: 1,
    minW: 0,
  }),
  header: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  label: css({
    fontWeight: "medium",
  }),
  statusText: css({
    fontSize: "xs",
    fontWeight: "semibold",
  }),
  value: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.muted",
    mt: "0.5",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
  message: css({
    fontSize: "xs",
    color: "fg.muted",
    mt: "0.5",
  }),
  // Status colors
  bg_valid: css({ bg: "green.100", _dark: { bg: "green.900/50" } }),
  bg_invalid: css({ bg: "red.100", _dark: { bg: "red.900/50" } }),
  bg_warning: css({ bg: "yellow.100", _dark: { bg: "yellow.900/50" } }),
  bg_info: css({ bg: "blue.100", _dark: { bg: "blue.900/50" } }),
  bg_pending: css({ bg: "gray.100", _dark: { bg: "gray.800" } }),
  color_valid: css({ color: "green.700", _dark: { color: "green.400" } }),
  color_invalid: css({ color: "red.700", _dark: { color: "red.400" } }),
  color_warning: css({ color: "yellow.700", _dark: { color: "yellow.400" } }),
  color_info: css({ color: "blue.700", _dark: { color: "blue.400" } }),
  color_pending: css({ color: "gray.600", _dark: { color: "gray.400" } }),
  loading: css({ color: "fg.muted" }),
  empty: css({ color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<StatusBadge />, document.getElementById("app")!);
