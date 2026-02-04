/**
 * Certificate Viewer UI for MCP Apps
 *
 * Interactive SSL/TLS certificate viewer with:
 * - Status badge (VALID, EXPIRING SOON, EXPIRED)
 * - Days remaining display
 * - Subject and issuer details
 * - Validity period with progress bar
 * - Subject Alternative Names (SANs) list
 * - Certificate chain (collapsible)
 *
 * @module lib/std/src/ui/certificate-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack, Grid } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import * as Card from "../../components/ui/card";
import * as Progress from "../../components/ui/progress";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface CertificateData {
  host: string;
  port: number;
  valid: boolean;
  certificate: {
    subject: Record<string, string>;
    issuer: Record<string, string>;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    serialNumber: string;
    signatureAlgorithm: string;
    sans: string[];
  };
  chain?: Array<{
    subject: string;
    issuer: string;
  }>;
  status: "valid" | "expiring" | "expired";
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Certificate Viewer", version: "1.0.0" });
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

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getValidityProgress(validFrom: string, validTo: string): number {
  const from = new Date(validFrom).getTime();
  const to = new Date(validTo).getTime();
  const now = Date.now();

  if (now < from) return 0;
  if (now > to) return 100;

  const total = to - from;
  const elapsed = now - from;
  return Math.round((elapsed / total) * 100);
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// ============================================================================
// Icon Component
// ============================================================================

function Icon({ name, size = 4 }: { name: string; size?: number }) {
  const icons: Record<string, string> = {
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    "lock-open": "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    "shield-check": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
    "shield-alert": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4m0 4h.01",
    building: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01",
    calendar: "M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 6v6l4 2",
    globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z",
    link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    chevronDown: "M6 9l6 6 6-6",
    chevronUp: "M18 15l-6-6-6 6",
    copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    check: "M20 6 9 17l-5-5",
    alertTriangle: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01",
  };

  const path = icons[name] || icons.shield;

  return (
    <svg
      width={size * 4}
      height={size * 4}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  );
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status, daysRemaining }: { status: string; daysRemaining: number }) {
  const config = {
    valid: {
      bg: "green.100",
      bgDark: "green.900/30",
      color: "green.800",
      colorDark: "green.300",
      icon: "shield-check",
      label: "VALID",
    },
    expiring: {
      bg: "orange.100",
      bgDark: "orange.900/30",
      color: "orange.800",
      colorDark: "orange.300",
      icon: "shield-alert",
      label: "EXPIRING SOON",
    },
    expired: {
      bg: "red.100",
      bgDark: "red.900/30",
      color: "red.800",
      colorDark: "red.300",
      icon: "lock-open",
      label: "EXPIRED",
    },
  };

  const cfg = config[status as keyof typeof config] || config.valid;

  const daysText = daysRemaining >= 0
    ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`
    : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? "s" : ""} ago`;

  return (
    <Box
      p="4"
      rounded="xl"
      mb="4"
      bg={{ base: cfg.bg, _dark: cfg.bgDark }}
    >
      <Flex alignItems="center" gap="3">
        <Box color={{ base: cfg.color, _dark: cfg.colorDark }}>
          <Icon name={cfg.icon} size={8} />
        </Box>
        <Box>
          <Box
            fontSize="lg"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="wide"
            color={{ base: cfg.color, _dark: cfg.colorDark }}
          >
            {cfg.label}
          </Box>
          <Box fontSize="2xl" fontWeight="bold" color="fg.default">
            {daysText}
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}

// ============================================================================
// Info Card Component
// ============================================================================

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: preact.ComponentChildren;
}) {
  return (
    <Card.Root>
      <Card.Header p="3" bg="bg.subtle">
        <Flex alignItems="center" gap="2">
          <Box color="fg.muted">
            <Icon name={icon} />
          </Box>
          <Card.Title fontSize="sm">{title}</Card.Title>
        </Flex>
      </Card.Header>
      <Card.Body p="4">{children}</Card.Body>
    </Card.Root>
  );
}

// ============================================================================
// Key-Value Row Component
// ============================================================================

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" alignItems="flex-start" gap="2" py="1">
      <Box color="fg.muted" fontSize="sm" flexShrink={0}>{label}</Box>
      <Box
        color="fg.default"
        fontSize="sm"
        fontWeight="medium"
        textAlign="right"
        wordBreak="break-word"
      >
        {value || "-"}
      </Box>
    </Flex>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ValidityProgressBar({ progress, status }: { progress: number; status: string }) {
  const colorMap = {
    valid: "green",
    expiring: "orange",
    expired: "red",
  } as const;

  const colorPalette = colorMap[status as keyof typeof colorMap] || "green";

  return (
    <Box mb="2">
      <Progress.Root value={progress} colorPalette={colorPalette}>
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <Flex justify="flex-end" mt="1">
        <Box fontSize="xs" color="fg.muted">{progress}% elapsed</Box>
      </Flex>
    </Box>
  );
}

// ============================================================================
// SANs List Component
// ============================================================================

function SansList({ sans }: { sans: string[] }) {
  if (!sans || sans.length === 0) {
    return <Box color="fg.muted" fontStyle="italic">None</Box>;
  }

  return (
    <Flex flexWrap="wrap" gap="2">
      {sans.map((san) => (
        <Badge
          key={san}
          size="sm"
          variant="outline"
          colorPalette="blue"
          fontFamily="mono"
        >
          {san}
        </Badge>
      ))}
    </Flex>
  );
}

// ============================================================================
// Certificate Chain Component
// ============================================================================

function CertificateChain({
  chain,
}: {
  chain: Array<{ subject: string; issuer: string }>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!chain || chain.length === 0) {
    return null;
  }

  return (
    <InfoCard title="Certificate Chain" icon="link">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setExpanded(!expanded);
          notifyModel("toggleChain", { expanded: !expanded });
        }}
        w="full"
        justifyContent="flex-start"
      >
        <Icon name={expanded ? "chevronUp" : "chevronDown"} />
        <span>
          {chain.length} certificate{chain.length !== 1 ? "s" : ""} in chain
        </span>
      </Button>

      {expanded && (
        <Stack gap="2" mt="3">
          {chain.map((cert, index) => (
            <Box
              key={index}
              p="3"
              bg="bg.subtle"
              rounded="md"
              borderWidth="1px"
              borderColor="border.default"
              position="relative"
            >
              <Flex
                position="absolute"
                left="-8px"
                top="50%"
                transform="translateY(-50%)"
                w="4"
                h="4"
                bg="blue.500"
                rounded="full"
                alignItems="center"
                justifyContent="center"
                color="white"
                fontSize="xs"
                fontWeight="bold"
              >
                {index + 1}
              </Flex>
              <Box fontSize="xs" color="fg.muted" mb="1">Subject</Box>
              <Box
                fontSize="sm"
                fontFamily="mono"
                color="fg.default"
                wordBreak="break-all"
                mb="2"
              >
                {cert.subject}
              </Box>
              <Box fontSize="xs" color="fg.muted" mb="1">Issuer</Box>
              <Box
                fontSize="sm"
                fontFamily="mono"
                color="fg.muted"
                wordBreak="break-all"
              >
                {cert.issuer}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </InfoCard>
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
    notifyModel("copy", { section: label });
    setTimeout(() => setCopied(false), 2000);
  }, [text, label]);

  return (
    <Button variant="outline" size="xs" onClick={handleCopy}>
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copied!" : label}
    </Button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CertificateViewer() {
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[certificate-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[certificate-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
      } catch (e) {
        setError(
          `Failed to parse certificate data: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">Loading certificate...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Flex
          alignItems="center"
          gap="2"
          p="4"
          bg={{ base: "red.50", _dark: "red.950" }}
          color={{ base: "red.700", _dark: "red.300" }}
          rounded="md"
        >
          <Icon name="alertTriangle" />
          {error}
        </Flex>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="10" textAlign="center" color="fg.muted">No certificate data</Box>
      </Box>
    );
  }

  const cert = data.certificate;
  const progress = getValidityProgress(cert.validFrom, cert.validTo);

  // Format subject display
  const subjectDisplay = cert.subject.CN || Object.values(cert.subject)[0] || "Unknown";
  const orgDisplay = cert.subject.O || cert.subject.OU || "";

  // Format issuer display
  const issuerDisplay = cert.issuer.CN || cert.issuer.O || "Unknown";
  const issuerOrgDisplay = cert.issuer.O || "";

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Header with host info */}
      <Flex alignItems="center" justifyContent="space-between" mb="4">
        <Flex alignItems="center" gap="2">
          <Icon name="lock" />
          <Box fontFamily="mono" fontWeight="medium">
            {data.host}:{data.port}
          </Box>
        </Flex>
        <CopyButton text={JSON.stringify(data, null, 2)} label="Copy All" />
      </Flex>

      {/* Status Badge */}
      <StatusBadge status={data.status} daysRemaining={cert.daysRemaining} />

      {/* Main Grid */}
      <Grid gap="4">
        {/* Subject Section */}
        <InfoCard title="Subject" icon="shield">
          <Box mb="2">
            <Box fontSize="lg" fontWeight="semibold" color="fg.default">
              {subjectDisplay}
            </Box>
            {orgDisplay && (
              <Box fontSize="sm" color="fg.muted">{orgDisplay}</Box>
            )}
          </Box>
          <Box borderTopWidth="1px" borderColor="border.subtle" pt="2">
            {Object.entries(cert.subject).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </Box>
        </InfoCard>

        {/* Issuer Section */}
        <InfoCard title="Issuer" icon="building">
          <Box mb="2">
            <Box fontSize="lg" fontWeight="semibold" color="fg.default">
              {issuerDisplay}
            </Box>
            {issuerOrgDisplay && issuerOrgDisplay !== issuerDisplay && (
              <Box fontSize="sm" color="fg.muted">{issuerOrgDisplay}</Box>
            )}
          </Box>
          <Box borderTopWidth="1px" borderColor="border.subtle" pt="2">
            {Object.entries(cert.issuer).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </Box>
        </InfoCard>

        {/* Validity Section */}
        <InfoCard title="Validity Period" icon="calendar">
          <Flex justifyContent="space-between" alignItems="center" mb="3">
            <Box>
              <Box fontSize="xs" color="fg.muted">From</Box>
              <Box fontSize="sm" fontWeight="medium">
                {formatDate(cert.validFrom)}
              </Box>
            </Box>
            <Box color="fg.muted">-&gt;</Box>
            <Box textAlign="right">
              <Box fontSize="xs" color="fg.muted">To</Box>
              <Box fontSize="sm" fontWeight="medium">
                {formatDate(cert.validTo)}
              </Box>
            </Box>
          </Flex>
          <ValidityProgressBar progress={progress} status={data.status} />
        </InfoCard>

        {/* SANs Section */}
        <InfoCard title="Subject Alternative Names (SANs)" icon="globe">
          <SansList sans={cert.sans} />
        </InfoCard>

        {/* Technical Details */}
        <InfoCard title="Technical Details" icon="clock">
          <KeyValueRow label="Serial Number" value={cert.serialNumber} />
          <KeyValueRow label="Signature Algorithm" value={cert.signatureAlgorithm} />
        </InfoCard>

        {/* Certificate Chain */}
        {data.chain && <CertificateChain chain={data.chain} />}
      </Grid>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<CertificateViewer />);
