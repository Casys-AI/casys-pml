/**
 * QR Viewer UI - Display QR codes
 *
 * Renders QR codes from:
 * - SVG string
 * - Data URL (base64)
 * - ASCII art
 *
 * Features:
 * - Download button
 * - Copy data
 * - Size adjustment
 *
 * @module lib/std/src/ui/qr-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface QRData {
  // SVG content or data URL
  svg?: string;
  dataUrl?: string;
  ascii?: string;

  // Original data encoded
  data?: string;

  // Metadata
  size?: number;
  errorCorrection?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "QR Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Main Component
// ============================================================================

function QRViewer() {
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [displaySize, setDisplaySize] = useState(200);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(textContent.text);
            setQrData(parsed);
          } catch {
            // Might be raw SVG or ASCII
            const text = textContent.text;
            if (text.trim().startsWith("<svg") || text.trim().startsWith("<?xml")) {
              setQrData({ svg: text });
            } else if (text.includes("█") || text.includes("▀") || text.includes("##")) {
              setQrData({ ascii: text });
            } else {
              setQrData({ data: text });
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse QR data", e);
      }
    };
  }, []);

  const copyData = useCallback(() => {
    if (qrData?.data) {
      navigator.clipboard.writeText(qrData.data);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      notifyModel("copy", { data: qrData.data });
    }
  }, [qrData]);

  const downloadSvg = useCallback(() => {
    if (qrData?.svg) {
      const blob = new Blob([qrData.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qrcode.svg";
      a.click();
      URL.revokeObjectURL(url);
      notifyModel("download", { format: "svg" });
    }
  }, [qrData]);

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading QR...</div></div>;
  }

  if (!qrData) {
    return <div class={styles.container}><div class={styles.empty}>No QR code</div></div>;
  }

  return (
    <div class={styles.container}>
      {/* QR Display */}
      <div class={styles.qrContainer}>
        {qrData.svg && (
          <div
            class={styles.qrImage}
            style={{ width: displaySize, height: displaySize }}
            dangerouslySetInnerHTML={{ __html: qrData.svg }}
          />
        )}

        {qrData.dataUrl && (
          <img
            src={qrData.dataUrl}
            alt="QR Code"
            class={styles.qrImage}
            style={{ width: displaySize, height: displaySize }}
          />
        )}

        {qrData.ascii && (
          <pre class={styles.ascii}>{qrData.ascii}</pre>
        )}

        {!qrData.svg && !qrData.dataUrl && !qrData.ascii && qrData.data && (
          <div class={styles.placeholder}>
            <span class={styles.placeholderIcon}>⬜</span>
            <span>QR for: {qrData.data.slice(0, 30)}{qrData.data.length > 30 ? "..." : ""}</span>
          </div>
        )}
      </div>

      {/* Data display */}
      {qrData.data && (
        <div class={styles.dataSection}>
          <div class={styles.dataLabel}>Encoded data:</div>
          <div class={styles.dataValue}>
            {qrData.data.length > 100 ? qrData.data.slice(0, 100) + "..." : qrData.data}
          </div>
        </div>
      )}

      {/* Controls */}
      <div class={styles.controls}>
        {/* Size slider */}
        <div class={styles.sizeControl}>
          <label class={styles.sizeLabel}>Size: {displaySize}px</label>
          <input
            type="range"
            min="100"
            max="400"
            value={displaySize}
            onInput={(e) => setDisplaySize(parseInt((e.target as HTMLInputElement).value, 10))}
            class={styles.slider}
          />
        </div>

        {/* Buttons */}
        <div class={styles.buttons}>
          {qrData.data && (
            <button class={styles.btn} onClick={copyData}>
              {copied ? "✓ Copied" : "Copy data"}
            </button>
          )}
          {qrData.svg && (
            <button class={styles.btn} onClick={downloadSvg}>
              ↓ Download SVG
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      {(qrData.errorCorrection || qrData.size) && (
        <div class={styles.meta}>
          {qrData.errorCorrection && <span>EC: {qrData.errorCorrection}</span>}
          {qrData.size && <span>Size: {qrData.size}x{qrData.size}</span>}
        </div>
      )}
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
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3",
  }),
  qrContainer: css({
    p: "4",
    bg: "white",
    rounded: "lg",
    shadow: "sm",
    border: "1px solid",
    borderColor: "border.default",
  }),
  qrImage: css({
    display: "block",
    "& svg": {
      width: "100%",
      height: "100%",
    },
  }),
  ascii: css({
    fontFamily: "mono",
    fontSize: "4px",
    lineHeight: "4px",
    letterSpacing: "-1px",
    whiteSpace: "pre",
    color: "black",
  }),
  placeholder: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2",
    p: "8",
    color: "fg.muted",
  }),
  placeholderIcon: css({
    fontSize: "4xl",
  }),
  dataSection: css({
    w: "100%",
    maxW: "300px",
  }),
  dataLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    mb: "1",
  }),
  dataValue: css({
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    fontFamily: "mono",
    fontSize: "xs",
    wordBreak: "break-all",
  }),
  controls: css({
    display: "flex",
    flexDirection: "column",
    gap: "2",
    w: "100%",
    maxW: "300px",
  }),
  sizeControl: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  sizeLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    minW: "70px",
  }),
  slider: css({
    flex: 1,
    h: "4px",
    appearance: "none",
    bg: "bg.muted",
    rounded: "full",
    cursor: "pointer",
    "&::-webkit-slider-thumb": {
      appearance: "none",
      w: "14px",
      h: "14px",
      bg: "blue.500",
      rounded: "full",
      cursor: "pointer",
    },
  }),
  buttons: css({
    display: "flex",
    gap: "2",
    justifyContent: "center",
  }),
  btn: css({
    px: "3",
    py: "1.5",
    fontSize: "xs",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  meta: css({
    display: "flex",
    gap: "3",
    fontSize: "xs",
    color: "fg.muted",
  }),
  loading: css({ p: "6", color: "fg.muted" }),
  empty: css({ p: "6", color: "fg.muted" }),
};

// ============================================================================
// Mount
// ============================================================================

render(<QRViewer />, document.getElementById("app")!);
