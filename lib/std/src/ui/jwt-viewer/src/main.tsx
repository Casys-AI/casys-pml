/**
 * JWT Viewer UI for MCP Apps
 *
 * Interactive JWT token viewer with:
 * - Header section (blue) with algorithm highlight
 * - Payload section (violet) with standard claims explained
 * - Signature section (gray)
 * - Expiration status badges with live countdown
 * - Copy functionality per section
 *
 * @module lib/std/src/ui/jwt-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Box, Flex, VStack, HStack, Center } from "../../styled-system/jsx";
import { css } from "../../styled-system/css";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Code } from "../../components/ui/code";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface JwtData {
  valid: boolean;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  isExpired: boolean;
  expiresAt?: string;
  issuedAt?: string;
  error?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// Standard JWT claims with explanations and colors
const STANDARD_CLAIMS: Record<string, { label: string; icon: string; color: string }> = {
  iss: { label: "Issuer", icon: "building", color: "blue" },
  sub: { label: "Subject", icon: "user", color: "cyan" },
  aud: { label: "Audience", icon: "users", color: "violet" },
  exp: { label: "Expiration", icon: "clock", color: "red" },
  iat: { label: "Issued At", icon: "calendar", color: "green" },
  nbf: { label: "Not Before", icon: "calendar-check", color: "orange" },
  jti: { label: "JWT ID", icon: "fingerprint", color: "purple" },
};

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "JWT Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFullDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
  });
}

interface TimeRemaining {
  text: string;
  shortText: string;
  status: "valid" | "expiring" | "expired";
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

function getTimeRemaining(expTimestamp: number): TimeRemaining {
  const now = Date.now();
  const expMs = expTimestamp * 1000;
  const diff = expMs - now;

  if (diff < 0) {
    const elapsed = Math.abs(diff);
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(elapsed / (1000 * 60));
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    let text: string;
    if (days > 0) {
      text = `Expired ${days}d ${hours % 24}h ago`;
    } else if (hours > 0) {
      text = `Expired ${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      text = `Expired ${minutes}m ${seconds % 60}s ago`;
    } else {
      text = `Expired ${seconds}s ago`;
    }

    return {
      text,
      shortText: days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${minutes}m ago`,
      status: "expired",
      seconds: -seconds,
      minutes: -minutes,
      hours: -hours,
      days: -days,
    };
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  const status = hours < 1 ? "expiring" : "valid";

  let text: string;
  let shortText: string;

  if (days > 0) {
    text = `${days}d ${hours % 24}h ${minutes}m remaining`;
    shortText = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m ${seconds % 60}s remaining`;
    shortText = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    text = `${minutes}m ${seconds % 60}s remaining`;
    shortText = `${minutes}m ${seconds % 60}s`;
  } else {
    text = `${seconds}s remaining`;
    shortText = `${seconds}s`;
  }

  return { text, shortText, status, seconds, minutes, hours, days };
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// ============================================================================
// Icon Component
// ============================================================================

function Icon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    building: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 6v6l4 2",
    calendar: "M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    "calendar-check": "M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    fingerprint: "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38-.24 4.88-.54 6.88M6 6a8 8 0 0 1 12 0M18 12c0 .87-.05 1.73-.14 2.58M2 12a10 10 0 0 1 18-6M2 16c0 .73.03 1.45.09 2.15M22 16c-.12 1.37-.39 2.67-.81 3.88M12 2C6.477 2 2 6.477 2 12M22 12c0-1.18-.2-2.32-.57-3.38",
    copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    check: "M20 6 9 17l-5-5",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    "alert-triangle": "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    "x-circle": "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6m0-6l6 6",
  };

  const path = icons[name] || icons.key;

  return (
    <svg
      className={className || css({ w: "4", h: "4", flexShrink: 0 })}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

// ============================================================================
// Live Countdown Component
// ============================================================================

function LiveCountdown({ exp }: { exp: number }) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(getTimeRemaining(exp));

  useEffect(() => {
    // Update immediately
    setTimeRemaining(getTimeRemaining(exp));

    // Update every second
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(exp));
    }, 1000);

    return () => clearInterval(interval);
  }, [exp]);

  const { text, status } = timeRemaining;

  const statusColors = {
    valid: css({ color: "green.600", _dark: { color: "green.400" } }),
    expiring: css({ color: "orange.600", _dark: { color: "orange.400" } }),
    expired: css({ color: "red.600", _dark: { color: "red.400" } }),
  };

  return (
    <Box fontFamily="mono" fontSize="sm" fontWeight="medium" className={statusColors[status]}>
      {text}
    </Box>
  );
}

// ============================================================================
// Expiration Badge Component
// ============================================================================

function ExpirationBadge({ exp }: { exp: number; expiresAt?: string }) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(getTimeRemaining(exp));

  useEffect(() => {
    setTimeRemaining(getTimeRemaining(exp));
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(exp));
    }, 1000);
    return () => clearInterval(interval);
  }, [exp]);

  const { status } = timeRemaining;

  const statusStyles = {
    valid: css({
      bg: "green.100",
      color: "green.800",
      borderColor: "green.300",
      _dark: { bg: "green.900/30", color: "green.300", borderColor: "green.700" },
    }),
    expiring: css({
      bg: "orange.100",
      color: "orange.800",
      borderColor: "orange.300",
      _dark: { bg: "orange.900/30", color: "orange.300", borderColor: "orange.700" },
    }),
    expired: css({
      bg: "red.100",
      color: "red.800",
      borderColor: "red.300",
      _dark: { bg: "red.900/30", color: "red.300", borderColor: "red.700" },
    }),
  };

  const icons = {
    valid: "check",
    expiring: "alert-triangle",
    expired: "x-circle",
  };

  const labels = {
    valid: "VALID",
    expiring: "EXPIRING",
    expired: "EXPIRED",
  };

  return (
    <Badge
      size="sm"
      className={`${css({
        display: "inline-flex",
        alignItems: "center",
        gap: "1.5",
        fontWeight: "bold",
        textTransform: "uppercase",
        border: "1px solid",
      })} ${statusStyles[status]}`}
    >
      <Icon name={icons[status]} className={css({ w: "3.5", h: "3.5" })} />
      {labels[status]}
    </Badge>
  );
}

// ============================================================================
// Copy Button Component
// ============================================================================

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(text);
    setCopied(true);
    notifyModel(`copy${label}`, { section: label });
    setTimeout(() => setCopied(false), 2000);
  }, [text, label]);

  return (
    <Button variant="outline" size="xs" onClick={handleCopy} className={css({ gap: "1" })}>
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copied!" : `Copy`}
    </Button>
  );
}

// ============================================================================
// Claim Row Component
// ============================================================================

function ClaimRow({
  claimKey,
  value,
  isLast,
}: {
  claimKey: string;
  value: unknown;
  isLast: boolean;
}) {
  const standardClaim = STANDARD_CLAIMS[claimKey];
  const formattedValue = formatJsonValue(claimKey, value);

  const claimColorStyles: Record<string, string> = {
    blue: css({ color: "blue.600", _dark: { color: "blue.400" } }),
    cyan: css({ color: "cyan.600", _dark: { color: "cyan.400" } }),
    violet: css({ color: "violet.600", _dark: { color: "violet.400" } }),
    red: css({ color: "red.600", _dark: { color: "red.400" } }),
    green: css({ color: "green.600", _dark: { color: "green.400" } }),
    orange: css({ color: "orange.600", _dark: { color: "orange.400" } }),
    purple: css({ color: "purple.600", _dark: { color: "purple.400" } }),
  };

  const keyStyle = standardClaim
    ? claimColorStyles[standardClaim.color]
    : css({ color: "fg.default" });

  return (
    <Flex alignItems="flex-start" gap="2" py="1">
      {standardClaim && (
        <Box mt="0.5" flexShrink={0} className={keyStyle}>
          <Icon name={standardClaim.icon} />
        </Box>
      )}
      <Box flex="1" minW="0">
        <Flex alignItems="baseline" flexWrap="wrap" gap="1">
          <Box fontWeight={standardClaim ? "bold" : "medium"} className={keyStyle}>
            "{claimKey}"
          </Box>
          <Box color="fg.muted">:</Box>
          <Box color={getValueColor(value)} wordBreak="break-word">
            {formattedValue}
          </Box>
          {!isLast && <Box color="fg.muted">,</Box>}
        </Flex>
        {standardClaim && (
          <Box fontSize="xs" color="fg.muted" fontStyle="italic">
            {standardClaim.label}
            {["exp", "iat", "nbf"].includes(claimKey) && typeof value === "number" && (
              <> - {formatDate(value)}</>
            )}
          </Box>
        )}
      </Box>
    </Flex>
  );
}

// ============================================================================
// JSON Display Component
// ============================================================================

function JsonDisplay({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);

  return (
    <Box fontFamily="mono" fontSize="sm" lineHeight="relaxed">
      <Box color="fg.muted">{"{"}</Box>
      <Box pl="4">
        {entries.map(([key, value], index) => (
          <ClaimRow
            key={key}
            claimKey={key}
            value={value}
            isLast={index === entries.length - 1}
          />
        ))}
      </Box>
      <Box color="fg.muted">{"}"}</Box>
    </Box>
  );
}

function formatJsonValue(key: string, value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function getValueColor(value: unknown): string {
  if (typeof value === "string") return "green.600";
  if (typeof value === "number") return "blue.600";
  if (typeof value === "boolean") return "purple.600";
  if (value === null) return "gray.500";
  return "fg.default";
}

// ============================================================================
// Section Card Component
// ============================================================================

function SectionCard({
  title,
  color,
  icon,
  children,
  copyText,
  copyLabel,
  badge,
  countdown,
}: {
  title: string;
  color: "blue" | "violet" | "gray";
  icon: string;
  children: preact.ComponentChildren;
  copyText: string;
  copyLabel: string;
  badge?: preact.ComponentChildren;
  countdown?: preact.ComponentChildren;
}) {
  const colorStyles = {
    blue: {
      border: css({ borderColor: "blue.200", _dark: { borderColor: "blue.800" } }),
      header: css({ bg: "blue.50", _dark: { bg: "blue.950/50" } }),
      title: css({ color: "blue.700", _dark: { color: "blue.300" } }),
    },
    violet: {
      border: css({ borderColor: "purple.200", _dark: { borderColor: "purple.800" } }),
      header: css({ bg: "purple.50", _dark: { bg: "purple.950/50" } }),
      title: css({ color: "purple.700", _dark: { color: "purple.300" } }),
    },
    gray: {
      border: css({ borderColor: "gray.200", _dark: { borderColor: "gray.700" } }),
      header: css({ bg: "gray.50", _dark: { bg: "gray.900/50" } }),
      title: css({ color: "gray.700", _dark: { color: "gray.300" } }),
    },
  };

  const style = colorStyles[color];

  return (
    <Box border="1px solid" rounded="lg" overflow="hidden" bg="bg.default" className={style.border}>
      {/* Header */}
      <Flex
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap="2"
        px="4"
        py="3"
        borderBottom="1px solid"
        borderColor="inherit"
        className={style.header}
      >
        <HStack gap="2" flexWrap="wrap" alignItems="center">
          <Box className={style.title}>
            <Icon name={icon} />
          </Box>
          <Box fontSize="sm" fontWeight="semibold" className={style.title}>
            {title}
          </Box>
          {badge}
        </HStack>
        <CopyButton text={copyText} label={copyLabel} />
      </Flex>

      {/* Countdown bar (for payload with exp) */}
      {countdown && (
        <HStack
          gap="2"
          px="4"
          py="2"
          bg="bg.subtle"
          borderBottom="1px solid"
          borderColor="inherit"
          alignItems="center"
        >
          <Icon name="clock" className={css({ w: "4", h: "4", color: "fg.muted" })} />
          {countdown}
        </HStack>
      )}

      {/* Content */}
      <Box p="4" overflowX="auto">
        {children}
      </Box>
    </Box>
  );
}

// ============================================================================
// Error Display Component
// ============================================================================

function ErrorDisplay({ error }: { error: string }) {
  return (
    <Flex
      alignItems="flex-start"
      gap="3"
      p="4"
      bg={{ base: "red.50", _dark: "red.950/30" }}
      border="1px solid"
      borderColor={{ base: "red.200", _dark: "red.800" }}
      rounded="lg"
      color={{ base: "red.800", _dark: "red.300" }}
    >
      <Icon name="x-circle" className={css({ w: "5", h: "5", flexShrink: 0, mt: "0.5" })} />
      <Box>
        <Box fontWeight="semibold" mb="1">Invalid JWT Token</Box>
        <Box fontSize="sm">{error}</Box>
      </Box>
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function JwtViewer() {
  const [data, setData] = useState<JwtData | null>(null);
  const [loading, setLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[jwt-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[jwt-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setParseError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
      } catch (e) {
        setParseError(`Failed to parse JWT data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <VStack gap="4" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Center p="10" color="fg.muted">
          <HStack gap="2" alignItems="center">
            <Box
              w="4"
              h="4"
              border="2px solid"
              borderColor="border.default"
              borderTopColor="blue.500"
              rounded="full"
              animation="spin 1s linear infinite"
            />
            Loading JWT...
          </HStack>
        </Center>
      </VStack>
    );
  }

  if (parseError) {
    return (
      <VStack gap="4" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <ErrorDisplay error={parseError} />
      </VStack>
    );
  }

  if (!data) {
    return (
      <VStack gap="4" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">No JWT data received</Box>
      </VStack>
    );
  }

  // Handle invalid JWT from the tool
  if (!data.valid && data.error) {
    return (
      <VStack gap="4" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <ErrorDisplay error={data.error} />
      </VStack>
    );
  }

  const hasExp = typeof data.payload?.exp === "number";
  const expTimestamp = data.payload?.exp as number;

  return (
    <VStack gap="4" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Header Section */}
      <SectionCard
        title="Header"
        color="blue"
        icon="key"
        copyText={JSON.stringify(data.header, null, 2)}
        copyLabel="Header"
      >
        <JsonDisplay data={data.header} />
      </SectionCard>

      {/* Payload Section */}
      <SectionCard
        title="Payload"
        color="violet"
        icon="shield"
        copyText={JSON.stringify(data.payload, null, 2)}
        copyLabel="Payload"
        badge={hasExp ? <ExpirationBadge exp={expTimestamp} expiresAt={data.expiresAt} /> : undefined}
        countdown={hasExp ? <LiveCountdown exp={expTimestamp} /> : undefined}
      >
        <JsonDisplay data={data.payload} />

        {/* Time details */}
        {(data.expiresAt || data.issuedAt) && (
          <VStack
            gap="2"
            mt="4"
            pt="4"
            borderTop="1px solid"
            borderColor="border.subtle"
            fontSize="xs"
            color="fg.muted"
            alignItems="flex-start"
          >
            {data.issuedAt && (
              <HStack gap="2" alignItems="center">
                <Icon name="calendar" />
                <span>Issued: {formatFullDate(data.issuedAt)}</span>
              </HStack>
            )}
            {data.expiresAt && (
              <HStack gap="2" alignItems="center">
                <Icon name="clock" />
                <span>Expires: {formatFullDate(data.expiresAt)}</span>
              </HStack>
            )}
          </VStack>
        )}
      </SectionCard>

      {/* Signature Section */}
      <SectionCard
        title="Signature"
        color="gray"
        icon="lock"
        copyText={data.signature}
        copyLabel="Signature"
      >
        <Box fontFamily="mono" fontSize="sm">
          <Code
            wordBreak="break-all"
            color="fg.muted"
            mb="3"
            p="3"
            bg="bg.subtle"
            rounded="md"
            border="1px solid"
            borderColor="border.subtle"
            display="block"
          >
            {data.signature}
          </Code>
          <Flex
            alignItems="center"
            gap="2"
            p="3"
            bg={{ base: "yellow.50", _dark: "yellow.950/30" }}
            border="1px solid"
            borderColor={{ base: "yellow.200", _dark: "yellow.800" }}
            rounded="md"
            fontSize="xs"
            color={{ base: "yellow.800", _dark: "yellow.300" }}
          >
            <Icon name="alert-triangle" className={css({ w: "4", h: "4", flexShrink: 0 })} />
            <span>Signature verification requires the secret key. This view is for inspection only.</span>
          </Flex>
        </Box>
      </SectionCard>
    </VStack>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<JwtViewer />);
