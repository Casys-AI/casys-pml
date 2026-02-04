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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack, Center } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import "../../global.css";

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
            } else if (text.includes("\u2588") || text.includes("\u2580") || text.includes("##")) {
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
    return (
      <Center p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" flexDirection="column" gap="3">
        <Box p="6" color="fg.muted">Loading QR...</Box>
      </Center>
    );
  }

  if (!qrData) {
    return (
      <Center p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" flexDirection="column" gap="3">
        <Box p="6" color="fg.muted">No QR code</Box>
      </Center>
    );
  }

  return (
    <Flex p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" direction="column" align="center" gap="3">
      {/* QR Display */}
      <Box p="4" bg="white" rounded="lg" shadow="sm" border="1px solid" borderColor="border.default">
        {qrData.svg && (
          <Box
            display="block"
            style={{ width: displaySize, height: displaySize }}
            dangerouslySetInnerHTML={{ __html: qrData.svg }}
            className={css({ "& svg": { width: "100%", height: "100%" } })}
          />
        )}

        {qrData.dataUrl && (
          <img
            src={qrData.dataUrl}
            alt="QR Code"
            style={{ width: displaySize, height: displaySize, display: "block" }}
          />
        )}

        {qrData.ascii && (
          <Box
            as="pre"
            fontFamily="mono"
            fontSize="4px"
            lineHeight="4px"
            letterSpacing="-1px"
            whiteSpace="pre"
            color="black"
          >
            {qrData.ascii}
          </Box>
        )}

        {!qrData.svg && !qrData.dataUrl && !qrData.ascii && qrData.data && (
          <Stack align="center" gap="2" p="8" color="fg.muted">
            <Box fontSize="4xl">{"\u2B1C"}</Box>
            <Box>QR for: {qrData.data.slice(0, 30)}{qrData.data.length > 30 ? "..." : ""}</Box>
          </Stack>
        )}
      </Box>

      {/* Data display */}
      {qrData.data && (
        <Box w="100%" maxW="300px">
          <Box fontSize="xs" color="fg.muted" mb="1">Encoded data:</Box>
          <Box p="2" bg="bg.subtle" rounded="md" fontFamily="mono" fontSize="xs" wordBreak="break-all">
            {qrData.data.length > 100 ? qrData.data.slice(0, 100) + "..." : qrData.data}
          </Box>
        </Box>
      )}

      {/* Controls */}
      <Stack gap="2" w="100%" maxW="300px">
        {/* Size slider */}
        <Flex align="center" gap="2">
          <Box as="label" fontSize="xs" color="fg.muted" minW="70px">Size: {displaySize}px</Box>
          <Box
            as="input"
            type="range"
            min="100"
            max="400"
            value={displaySize}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplaySize(parseInt(e.target.value, 10))}
            flex="1"
            h="4px"
            bg="bg.muted"
            rounded="full"
            cursor="pointer"
            className={css({
              appearance: "none",
              "&::-webkit-slider-thumb": {
                appearance: "none",
                w: "14px",
                h: "14px",
                bg: "blue.500",
                rounded: "full",
                cursor: "pointer",
              },
            })}
          />
        </Flex>

        {/* Buttons */}
        <Flex gap="2" justify="center">
          {qrData.data && (
            <Button variant="outline" size="sm" onClick={copyData}>
              {copied ? "Copied" : "Copy data"}
            </Button>
          )}
          {qrData.svg && (
            <Button variant="outline" size="sm" onClick={downloadSvg}>
              Download SVG
            </Button>
          )}
        </Flex>
      </Stack>

      {/* Metadata */}
      {(qrData.errorCorrection || qrData.size) && (
        <Flex gap="3" fontSize="xs" color="fg.muted">
          {qrData.errorCorrection && <Box>EC: {qrData.errorCorrection}</Box>}
          {qrData.size && <Box>Size: {qrData.size}x{qrData.size}</Box>}
        </Flex>
      )}
    </Flex>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<QRViewer />);
