/**
 * Image Preview UI for MCP Apps
 *
 * Display decoded base64 images with:
 * - Image display
 * - Metadata (size, dimensions, type)
 * - Zoom in/out controls
 * - Download button
 *
 * @module lib/std/src/ui/image-preview
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface ImageData {
  valid: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
  dataUri: string;
  error?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Image Preview", version: "1.0.0" });
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getMimeTypeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/gif": "GIF",
    "image/webp": "WebP",
  };
  return labels[mimeType] || mimeType;
}

// ============================================================================
// Main Component
// ============================================================================

function ImagePreview() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const imageRef = useRef<HTMLImageElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[image-preview] Connected to MCP host");
    }).catch(() => {
      console.log("[image-preview] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text) as ImageData;
          setImageData(parsed);
          setZoom(100); // Reset zoom on new image
        }
      } catch (e) {
        console.error("Failed to parse image data", e);
        setImageData({
          valid: false,
          mimeType: "",
          size: 0,
          dataUri: "",
          error: "Failed to parse tool result",
        });
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 400));
    notifyModel("zoom", { direction: "in", level: Math.min(zoom + 25, 400) });
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 25, 25));
    notifyModel("zoom", { direction: "out", level: Math.max(zoom - 25, 25) });
  }, [zoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
    notifyModel("zoom", { direction: "reset", level: 100 });
  }, []);

  // Download handler
  const handleDownload = useCallback(() => {
    if (!imageData?.dataUri) return;

    const link = document.createElement("a");
    link.href = imageData.dataUri;

    // Determine file extension from MIME type
    const ext = imageData.mimeType.split("/")[1] || "png";
    link.download = `image.${ext}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notifyModel("download", {
      mimeType: imageData.mimeType,
      size: imageData.size,
    });
  }, [imageData]);

  // Render states
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading image...</div>
      </div>
    );
  }

  if (!imageData) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No image data</div>
      </div>
    );
  }

  if (!imageData.valid || imageData.error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>
          <div class={styles.errorIcon}>X</div>
          <div class={styles.errorTitle}>Invalid Image</div>
          <div class={styles.errorMessage}>{imageData.error || "Unknown error"}</div>
        </div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Toolbar */}
      <div class={styles.toolbar}>
        <div class={styles.zoomControls}>
          <button class={styles.btn} onClick={handleZoomOut} title="Zoom out">
            -
          </button>
          <span class={styles.zoomLabel}>{zoom}%</span>
          <button class={styles.btn} onClick={handleZoomIn} title="Zoom in">
            +
          </button>
          <button class={styles.btnSecondary} onClick={handleZoomReset} title="Reset zoom">
            Reset
          </button>
        </div>
        <button class={styles.btnPrimary} onClick={handleDownload} title="Download image">
          Download
        </button>
      </div>

      {/* Image container */}
      <div class={styles.imageContainer}>
        <div class={styles.imageWrapper} style={{ transform: `scale(${zoom / 100})` }}>
          <img
            ref={imageRef}
            src={imageData.dataUri}
            alt="Preview"
            class={styles.image}
          />
        </div>
      </div>

      {/* Metadata */}
      <div class={styles.metadata}>
        <div class={styles.metaItem}>
          <span class={styles.metaLabel}>Type</span>
          <span class={styles.metaValue}>{getMimeTypeLabel(imageData.mimeType)}</span>
        </div>
        {imageData.width && imageData.height && (
          <div class={styles.metaItem}>
            <span class={styles.metaLabel}>Dimensions</span>
            <span class={styles.metaValue}>{imageData.width} x {imageData.height}</span>
          </div>
        )}
        <div class={styles.metaItem}>
          <span class={styles.metaLabel}>Size</span>
          <span class={styles.metaValue}>{formatBytes(imageData.size)}</span>
        </div>
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
    display: "flex",
    flexDirection: "column",
    gap: "3",
    minH: "200px",
  }),
  toolbar: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "2",
    flexWrap: "wrap",
  }),
  zoomControls: css({
    display: "flex",
    alignItems: "center",
    gap: "1",
  }),
  zoomLabel: css({
    minW: "50px",
    textAlign: "center",
    fontSize: "xs",
    color: "fg.muted",
  }),
  btn: css({
    w: "28px",
    h: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "md",
    fontWeight: "bold",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  btnSecondary: css({
    px: "2",
    py: "1",
    fontSize: "xs",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  btnPrimary: css({
    px: "3",
    py: "1.5",
    fontSize: "xs",
    fontWeight: "medium",
    bg: "blue.500",
    color: "white",
    border: "none",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "blue.600" },
  }),
  imageContainer: css({
    flex: 1,
    overflow: "auto",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    bg: "bg.subtle",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minH: "150px",
    p: "2",
    // Checkerboard pattern for transparency
    backgroundImage: `
      linear-gradient(45deg, token(colors.gray.200) 25%, transparent 25%),
      linear-gradient(-45deg, token(colors.gray.200) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, token(colors.gray.200) 75%),
      linear-gradient(-45deg, transparent 75%, token(colors.gray.200) 75%)
    `,
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
    _dark: {
      backgroundImage: `
        linear-gradient(45deg, token(colors.gray.800) 25%, transparent 25%),
        linear-gradient(-45deg, token(colors.gray.800) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, token(colors.gray.800) 75%),
        linear-gradient(-45deg, transparent 75%, token(colors.gray.800) 75%)
      `,
    },
  }),
  imageWrapper: css({
    transition: "transform 0.2s ease",
    transformOrigin: "center center",
  }),
  image: css({
    display: "block",
    maxW: "100%",
    maxH: "400px",
    objectFit: "contain",
  }),
  metadata: css({
    display: "flex",
    gap: "4",
    flexWrap: "wrap",
    p: "3",
    bg: "bg.subtle",
    rounded: "lg",
    border: "1px solid",
    borderColor: "border.default",
  }),
  metaItem: css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5",
  }),
  metaLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    textTransform: "uppercase",
    letterSpacing: "wide",
  }),
  metaValue: css({
    fontSize: "sm",
    fontWeight: "medium",
    fontFamily: "mono",
  }),
  loading: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: "10",
    color: "fg.muted",
  }),
  empty: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: "10",
    color: "fg.muted",
  }),
  error: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2",
    p: "6",
    bg: "red.50",
    rounded: "lg",
    textAlign: "center",
    _dark: { bg: "red.950" },
  }),
  errorIcon: css({
    w: "40px",
    h: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "xl",
    fontWeight: "bold",
    color: "red.500",
    bg: "red.100",
    rounded: "full",
    _dark: { bg: "red.900", color: "red.300" },
  }),
  errorTitle: css({
    fontSize: "md",
    fontWeight: "semibold",
    color: "red.700",
    _dark: { color: "red.300" },
  }),
  errorMessage: css({
    fontSize: "sm",
    color: "red.600",
    _dark: { color: "red.400" },
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<ImagePreview />, document.getElementById("app")!);
