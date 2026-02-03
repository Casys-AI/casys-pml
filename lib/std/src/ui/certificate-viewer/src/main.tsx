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

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

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
      class={css({ w: size.toString(), h: size.toString(), flexShrink: 0 })}
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
// Status Badge Component
// ============================================================================

function StatusBadge({ status, daysRemaining }: { status: string; daysRemaining: number }) {
  const config = {
    valid: {
      bg: css({ bg: "green.100", _dark: { bg: "green.900/30" } }),
      text: css({ color: "green.800", _dark: { color: "green.300" } }),
      icon: "shield-check",
      label: "VALID",
    },
    expiring: {
      bg: css({ bg: "orange.100", _dark: { bg: "orange.900/30" } }),
      text: css({ color: "orange.800", _dark: { color: "orange.300" } }),
      icon: "shield-alert",
      label: "EXPIRING SOON",
    },
    expired: {
      bg: css({ bg: "red.100", _dark: { bg: "red.900/30" } }),
      text: css({ color: "red.800", _dark: { color: "red.300" } }),
      icon: "lock-open",
      label: "EXPIRED",
    },
  };

  const cfg = config[status as keyof typeof config] || config.valid;

  const daysText = daysRemaining >= 0
    ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`
    : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? "s" : ""} ago`;

  return (
    <div
      class={`${css({
        display: "flex",
        alignItems: "center",
        gap: "4",
        p: "4",
        rounded: "xl",
        mb: "4",
      })} ${cfg.bg}`}
    >
      <div class={css({ display: "flex", alignItems: "center", gap: "3" })}>
        <div class={cfg.text}>
          <Icon name={cfg.icon} size={8} />
        </div>
        <div>
          <div
            class={`${css({
              fontSize: "lg",
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: "wide",
            })} ${cfg.text}`}
          >
            {cfg.label}
          </div>
          <div class={css({ fontSize: "2xl", fontWeight: "bold", color: "fg.default" })}>
            {daysText}
          </div>
        </div>
      </div>
    </div>
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
    <div
      class={css({
        border: "1px solid",
        borderColor: "border.default",
        rounded: "lg",
        overflow: "hidden",
        bg: "bg.default",
      })}
    >
      <div
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          px: "4",
          py: "3",
          bg: "bg.subtle",
          borderBottom: "1px solid",
          borderColor: "border.default",
        })}
      >
        <span class={css({ color: "fg.muted" })}>
          <Icon name={icon} />
        </span>
        <h3 class={css({ fontSize: "sm", fontWeight: "semibold", color: "fg.default" })}>
          {title}
        </h3>
      </div>
      <div class={css({ p: "4" })}>{children}</div>
    </div>
  );
}

// ============================================================================
// Key-Value Row Component
// ============================================================================

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      class={css({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "2",
        py: "1",
      })}
    >
      <span class={css({ color: "fg.muted", fontSize: "sm", flexShrink: 0 })}>{label}</span>
      <span
        class={css({
          color: "fg.default",
          fontSize: "sm",
          fontWeight: "medium",
          textAlign: "right",
          wordBreak: "break-word",
        })}
      >
        {value || "-"}
      </span>
    </div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const barColor = {
    valid: css({ bg: "green.500" }),
    expiring: css({ bg: "orange.500" }),
    expired: css({ bg: "red.500" }),
  };

  return (
    <div class={css({ mb: "2" })}>
      <div
        class={css({
          h: "2",
          bg: "bg.subtle",
          rounded: "full",
          overflow: "hidden",
        })}
      >
        <div
          class={`${css({
            h: "full",
            rounded: "full",
            transition: "width 0.3s",
          })} ${barColor[status as keyof typeof barColor] || barColor.valid}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <div
        class={css({
          display: "flex",
          justifyContent: "flex-end",
          mt: "1",
        })}
      >
        <span class={css({ fontSize: "xs", color: "fg.muted" })}>{progress}% elapsed</span>
      </div>
    </div>
  );
}

// ============================================================================
// SANs List Component
// ============================================================================

function SansList({ sans }: { sans: string[] }) {
  if (!sans || sans.length === 0) {
    return <span class={css({ color: "fg.muted", fontStyle: "italic" })}>None</span>;
  }

  return (
    <div class={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
      {sans.map((san) => (
        <span
          key={san}
          class={css({
            px: "2",
            py: "0.5",
            bg: "blue.50",
            color: "blue.700",
            fontSize: "xs",
            fontFamily: "mono",
            rounded: "md",
            border: "1px solid",
            borderColor: "blue.200",
            _dark: { bg: "blue.950/30", color: "blue.300", borderColor: "blue.800" },
          })}
        >
          {san}
        </span>
      ))}
    </div>
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
      <button
        onClick={() => {
          setExpanded(!expanded);
          notifyModel("toggleChain", { expanded: !expanded });
        }}
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          w: "full",
          p: "2",
          bg: "bg.subtle",
          rounded: "md",
          border: "1px solid",
          borderColor: "border.default",
          cursor: "pointer",
          fontSize: "sm",
          color: "fg.default",
          _hover: { bg: "bg.muted" },
        })}
      >
        <Icon name={expanded ? "chevronUp" : "chevronDown"} />
        <span>
          {chain.length} certificate{chain.length !== 1 ? "s" : ""} in chain
        </span>
      </button>

      {expanded && (
        <div class={css({ mt: "3", display: "flex", flexDirection: "column", gap: "2" })}>
          {chain.map((cert, index) => (
            <div
              key={index}
              class={css({
                p: "3",
                bg: "bg.subtle",
                rounded: "md",
                border: "1px solid",
                borderColor: "border.default",
                position: "relative",
              })}
            >
              <div
                class={css({
                  position: "absolute",
                  left: "-8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  w: "4",
                  h: "4",
                  bg: "blue.500",
                  rounded: "full",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "xs",
                  fontWeight: "bold",
                })}
              >
                {index + 1}
              </div>
              <div class={css({ fontSize: "xs", color: "fg.muted", mb: "1" })}>Subject</div>
              <div
                class={css({
                  fontSize: "sm",
                  fontFamily: "mono",
                  color: "fg.default",
                  wordBreak: "break-all",
                  mb: "2",
                })}
              >
                {cert.subject}
              </div>
              <div class={css({ fontSize: "xs", color: "fg.muted", mb: "1" })}>Issuer</div>
              <div
                class={css({
                  fontSize: "sm",
                  fontFamily: "mono",
                  color: "fg.muted",
                  wordBreak: "break-all",
                })}
              >
                {cert.issuer}
              </div>
            </div>
          ))}
        </div>
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
    <button
      onClick={handleCopy}
      class={css({
        display: "flex",
        alignItems: "center",
        gap: "1",
        px: "2",
        py: "1",
        rounded: "md",
        fontSize: "xs",
        border: "1px solid",
        borderColor: "border.default",
        bg: "bg.subtle",
        color: "fg.muted",
        cursor: "pointer",
        transition: "all 0.15s",
        _hover: { bg: "bg.muted", color: "fg.default" },
      })}
    >
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copied!" : label}
    </button>
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
      <div class={styles.container}>
        <div class={styles.loading}>Loading certificate...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>
          <Icon name="alertTriangle" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No certificate data</div>
      </div>
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
    <div class={styles.container}>
      {/* Header with host info */}
      <div
        class={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "4",
        })}
      >
        <div class={css({ display: "flex", alignItems: "center", gap: "2" })}>
          <Icon name="lock" />
          <span class={css({ fontFamily: "mono", fontWeight: "medium" })}>
            {data.host}:{data.port}
          </span>
        </div>
        <CopyButton text={JSON.stringify(data, null, 2)} label="Copy All" />
      </div>

      {/* Status Badge */}
      <StatusBadge status={data.status} daysRemaining={cert.daysRemaining} />

      {/* Main Grid */}
      <div class={css({ display: "grid", gap: "4" })}>
        {/* Subject Section */}
        <InfoCard title="Subject" icon="shield">
          <div class={css({ mb: "2" })}>
            <div class={css({ fontSize: "lg", fontWeight: "semibold", color: "fg.default" })}>
              {subjectDisplay}
            </div>
            {orgDisplay && (
              <div class={css({ fontSize: "sm", color: "fg.muted" })}>{orgDisplay}</div>
            )}
          </div>
          <div class={css({ borderTop: "1px solid", borderColor: "border.subtle", pt: "2" })}>
            {Object.entries(cert.subject).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </div>
        </InfoCard>

        {/* Issuer Section */}
        <InfoCard title="Issuer" icon="building">
          <div class={css({ mb: "2" })}>
            <div class={css({ fontSize: "lg", fontWeight: "semibold", color: "fg.default" })}>
              {issuerDisplay}
            </div>
            {issuerOrgDisplay && issuerOrgDisplay !== issuerDisplay && (
              <div class={css({ fontSize: "sm", color: "fg.muted" })}>{issuerOrgDisplay}</div>
            )}
          </div>
          <div class={css({ borderTop: "1px solid", borderColor: "border.subtle", pt: "2" })}>
            {Object.entries(cert.issuer).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </div>
        </InfoCard>

        {/* Validity Section */}
        <InfoCard title="Validity Period" icon="calendar">
          <div
            class={css({
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: "3",
            })}
          >
            <div>
              <div class={css({ fontSize: "xs", color: "fg.muted" })}>From</div>
              <div class={css({ fontSize: "sm", fontWeight: "medium" })}>
                {formatDate(cert.validFrom)}
              </div>
            </div>
            <div class={css({ color: "fg.muted" })}>→</div>
            <div class={css({ textAlign: "right" })}>
              <div class={css({ fontSize: "xs", color: "fg.muted" })}>To</div>
              <div class={css({ fontSize: "sm", fontWeight: "medium" })}>
                {formatDate(cert.validTo)}
              </div>
            </div>
          </div>
          <ProgressBar progress={progress} status={data.status} />
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
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    minH: "200px",
  }),
  loading: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  empty: css({ p: "10", textAlign: "center", color: "fg.muted" }),
  error: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    _dark: { bg: "red.950", color: "red.300" },
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<CertificateViewer />, document.getElementById("app")!);
