/**
 * Color Picker UI for MCP Apps
 *
 * Interactive color display with:
 * - Color swatch preview
 * - Multiple format display (HEX, RGB, HSL)
 * - Palette visualization
 * - Copy to clipboard
 * - Contrast checker
 *
 * @module lib/std/src/ui/color-picker
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack } from "../../styled-system/jsx";
import { Code } from "../../components/ui/code";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ColorData {
  // Single color
  hex?: string;
  rgb?: { r: number; g: number; b: number };
  hsl?: { h: number; s: number; l: number };

  // Palette
  palette?: string[];
  colors?: Array<{
    hex: string;
    name?: string;
    rgb?: { r: number; g: number; b: number };
  }>;

  // Contrast
  foreground?: string;
  background?: string;
  contrast?: number;
  wcagAA?: boolean;
  wcagAAA?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Color Picker", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Components
// ============================================================================

function ColorSwatch({
  color,
  size = "md",
  label,
  onClick,
}: {
  color: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  onClick?: () => void;
}) {
  const sizes = {
    sm: { width: "32px", height: "32px" },
    md: { width: "64px", height: "64px" },
    lg: { width: "96px", height: "96px" },
  };

  return (
    <Flex
      direction="column"
      alignItems="center"
      gap="1"
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
    >
      <Box
        style={{ ...sizes[size], backgroundColor: color }}
        rounded="lg"
        borderWidth="2px"
        borderColor="border.default"
        shadow="sm"
        transition="transform 0.15s"
        _hover={onClick ? { transform: "scale(1.05)" } : {}}
        title={color}
      />
      {label && (
        <Box fontSize="xs" color="fg.muted" textAlign="center">
          {label}
        </Box>
      )}
    </Flex>
  );
}

function ColorFormats({ hex, rgb, hsl }: { hex?: string; rgb?: ColorData["rgb"]; hsl?: ColorData["hsl"] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback((format: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(format);
    setTimeout(() => setCopied(null), 1500);
    notifyModel("copy", { format, value });
  }, []);

  const formats = [
    { name: "HEX", value: hex || "" },
    { name: "RGB", value: rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "" },
    { name: "HSL", value: hsl ? `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)` : "" },
  ].filter((f) => f.value);

  return (
    <Stack gap="2">
      {formats.map((format) => (
        <Flex
          key={format.name}
          alignItems="center"
          gap="2"
          p="2"
          bg="bg.subtle"
          rounded="md"
          cursor="pointer"
          _hover={{ bg: "bg.muted" }}
          onClick={() => copyToClipboard(format.name, format.value)}
        >
          <Box w="10" fontSize="xs" fontWeight="medium" color="fg.muted">
            {format.name}
          </Box>
          <Code flex="1" fontSize="sm">
            {format.value}
          </Code>
          <Box fontSize="xs" color="fg.muted">
            {copied === format.name ? "Copied" : "Click to copy"}
          </Box>
        </Flex>
      ))}
    </Stack>
  );
}

function ContrastChecker({
  foreground,
  background,
  contrast,
  wcagAA,
  wcagAAA,
}: {
  foreground: string;
  background: string;
  contrast?: number;
  wcagAA?: boolean;
  wcagAAA?: boolean;
}) {
  const ratio = contrast || calculateContrast(foreground, background);
  const passAA = wcagAA ?? ratio >= 4.5;
  const passAAA = wcagAAA ?? ratio >= 7;

  return (
    <Box borderWidth="1px" borderColor="border.default" rounded="lg" overflow="hidden">
      {/* Preview */}
      <Box
        p="6"
        textAlign="center"
        style={{ backgroundColor: background, color: foreground }}
      >
        <Box fontSize="lg" fontWeight="semibold">Sample Text</Box>
        <Box fontSize="sm">The quick brown fox jumps over the lazy dog</Box>
      </Box>

      {/* Results */}
      <Flex
        p="3"
        bg="bg.subtle"
        justify="space-between"
        alignItems="center"
      >
        <Flex alignItems="center" gap="2">
          <Box fontSize="sm" color="fg.muted">Contrast:</Box>
          <Box fontWeight="bold" fontFamily="mono">{ratio.toFixed(2)}:1</Box>
        </Flex>
        <Flex gap="2">
          <Box
            px="2"
            py="0.5"
            rounded="full"
            fontSize="xs"
            fontWeight="medium"
            bg={{ base: passAA ? "green.100" : "red.100", _dark: passAA ? "green.900" : "red.900" }}
            color={{ base: passAA ? "green.700" : "red.700", _dark: passAA ? "green.300" : "red.300" }}
          >
            AA {passAA ? "Pass" : "Fail"}
          </Box>
          <Box
            px="2"
            py="0.5"
            rounded="full"
            fontSize="xs"
            fontWeight="medium"
            bg={{ base: passAAA ? "green.100" : "red.100", _dark: passAAA ? "green.900" : "red.900" }}
            color={{ base: passAAA ? "green.700" : "red.700", _dark: passAAA ? "green.300" : "red.300" }}
          >
            AAA {passAAA ? "Pass" : "Fail"}
          </Box>
        </Flex>
      </Flex>
    </Box>
  );
}

function Palette({ colors }: { colors: Array<{ hex: string; name?: string }> }) {
  const handleColorClick = useCallback((color: { hex: string; name?: string }, index: number) => {
    navigator.clipboard.writeText(color.hex);
    notifyModel("select", { color: color.hex, name: color.name, index });
  }, []);

  return (
    <Flex flexWrap="wrap" gap="3">
      {colors.map((color, i) => (
        <ColorSwatch
          key={i}
          color={color.hex}
          size="md"
          label={color.name || color.hex}
          onClick={() => handleColorClick(color, i)}
        />
      ))}
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ColorPicker() {
  const [colorData, setColorData] = useState<ColorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[color-picker] Connected to MCP host");
    }).catch(() => {
      console.log("[color-picker] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setColorData(null);
          return;
        }

        const data = JSON.parse(textContent.text) as ColorData;

        // Normalize palette format
        if (data.palette && !data.colors) {
          data.colors = data.palette.map((hex) => ({ hex }));
        }

        setColorData(data);
      } catch (e) {
        setError(`Failed to parse color data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render
  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="10" textAlign="center" color="fg.muted">Loading colors...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box
          p="4"
          bg={{ base: "red.50", _dark: "red.950" }}
          color={{ base: "red.700", _dark: "red.300" }}
          rounded="md"
        >
          {error}
        </Box>
      </Box>
    );
  }

  if (!colorData) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="10" textAlign="center" color="fg.muted">No color data</Box>
      </Box>
    );
  }

  const hasMainColor = colorData.hex || colorData.rgb;
  const hasPalette = colorData.colors && colorData.colors.length > 0;
  const hasContrast = colorData.foreground && colorData.background;

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas">
      {/* Main color display */}
      {hasMainColor && (
        <Box mb="6">
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            mb="3"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Color
          </Box>
          <Flex gap="4" alignItems="flex-start">
            <ColorSwatch
              color={colorData.hex || rgbToHex(colorData.rgb!)}
              size="lg"
            />
            <ColorFormats
              hex={colorData.hex}
              rgb={colorData.rgb}
              hsl={colorData.hsl}
            />
          </Flex>
        </Box>
      )}

      {/* Palette */}
      {hasPalette && (
        <Box mb="6">
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            mb="3"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Palette ({colorData.colors!.length} colors)
          </Box>
          <Palette colors={colorData.colors!} />
        </Box>
      )}

      {/* Contrast checker */}
      {hasContrast && (
        <Box>
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            mb="3"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Contrast Check
          </Box>
          <ContrastChecker
            foreground={colorData.foreground!}
            background={colorData.background!}
            contrast={colorData.contrast}
            wcagAA={colorData.wcagAA}
            wcagAAA={colorData.wcagAAA}
          />
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrast(fg: string, bg: string): number {
  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);
  const l1 = getLuminance(fgRgb);
  const l2 = getLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<ColorPicker />);
