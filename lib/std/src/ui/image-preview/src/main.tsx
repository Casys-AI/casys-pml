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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Box, Flex, VStack, HStack, Center } from "../../styled-system/jsx";
import { css } from "../../styled-system/css";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import "../../global.css";

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
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Center p="10" color="fg.muted">Loading image...</Center>
      </Box>
    );
  }

  if (!imageData) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Center p="10" color="fg.muted">No image data</Center>
      </Box>
    );
  }

  if (!imageData.valid || imageData.error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <VStack
          gap="2"
          p="6"
          bg={{ base: "red.50", _dark: "red.950" }}
          rounded="lg"
          textAlign="center"
          alignItems="center"
        >
          <Center
            w="40px"
            h="40px"
            fontSize="xl"
            fontWeight="bold"
            color={{ base: "red.500", _dark: "red.300" }}
            bg={{ base: "red.100", _dark: "red.900" }}
            rounded="full"
          >
            X
          </Center>
          <Box fontSize="md" fontWeight="semibold" color={{ base: "red.700", _dark: "red.300" }}>
            Invalid Image
          </Box>
          <Box fontSize="sm" color={{ base: "red.600", _dark: "red.400" }}>
            {imageData.error || "Unknown error"}
          </Box>
        </VStack>
      </Box>
    );
  }

  return (
    <VStack gap="3" p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Toolbar */}
      <Flex justify="space-between" align="center" gap="2" flexWrap="wrap" w="full">
        <HStack gap="1" alignItems="center">
          <IconButton variant="outline" size="sm" onClick={handleZoomOut} title="Zoom out">
            -
          </IconButton>
          <Box minW="50px" textAlign="center" fontSize="xs" color="fg.muted">{zoom}%</Box>
          <IconButton variant="outline" size="sm" onClick={handleZoomIn} title="Zoom in">
            +
          </IconButton>
          <Button variant="outline" size="sm" onClick={handleZoomReset} title="Reset zoom">
            Reset
          </Button>
        </HStack>
        <Button variant="solid" size="sm" onClick={handleDownload} title="Download image">
          Download
        </Button>
      </Flex>

      {/* Image container */}
      <Center
        flex="1"
        overflow="auto"
        border="1px solid"
        borderColor="border.default"
        rounded="lg"
        bg="bg.subtle"
        minH="150px"
        p="2"
        w="full"
        className={css({
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
        })}
      >
        <Box style={{ transform: `scale(${zoom / 100})`, transition: "transform 0.2s ease", transformOrigin: "center center" }}>
          <img
            ref={imageRef}
            src={imageData.dataUri}
            alt="Preview"
            className={css({ display: "block", maxW: "100%", maxH: "400px", objectFit: "contain" })}
          />
        </Box>
      </Center>

      {/* Metadata */}
      <Flex
        gap="4"
        flexWrap="wrap"
        p="3"
        bg="bg.subtle"
        rounded="lg"
        border="1px solid"
        borderColor="border.default"
        w="full"
      >
        <VStack gap="0.5" alignItems="flex-start">
          <Box fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Type</Box>
          <Box fontSize="sm" fontWeight="medium" fontFamily="mono">{getMimeTypeLabel(imageData.mimeType)}</Box>
        </VStack>
        {imageData.width && imageData.height && (
          <VStack gap="0.5" alignItems="flex-start">
            <Box fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Dimensions</Box>
            <Box fontSize="sm" fontWeight="medium" fontFamily="mono">{imageData.width} x {imageData.height}</Box>
          </VStack>
        )}
        <VStack gap="0.5" alignItems="flex-start">
          <Box fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">Size</Box>
          <Box fontSize="sm" fontWeight="medium" fontFamily="mono">{formatBytes(imageData.size)}</Box>
        </VStack>
      </Flex>
    </VStack>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<ImagePreview />);
