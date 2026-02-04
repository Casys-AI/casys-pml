/**
 * Palette Viewer UI for MCP Apps
 *
 * Interactive palette display with:
 * - Color swatches preview
 * - Click to select/copy color
 * - Hover for HEX/RGB info
 * - Export CSS variables
 * - Contrast checker between adjacent colors
 * - Palette type display (complementary, analogous, etc.)
 *
 * @module lib/std/src/ui/palette-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, VStack, HStack, Center } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Code } from "../../components/ui/code";
import { Spinner } from "../../components/ui/spinner";
import * as Card from "../../components/ui/card";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ColorItem {
  hex: string;
  name?: string;
  rgb?: { r: number; g: number; b: number };
}

interface PaletteData {
  colors: ColorItem[];
  type?: "complementary" | "analogous" | "triadic" | "tetradic" | "split-complementary" | "custom";
  baseColor?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Palette Viewer", version: "1.0.0" });
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace(/^#/, "");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
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

function calculateContrast(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  const luminance = getLuminance(rgb);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function getPaletteTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    complementary: "Complementary",
    analogous: "Analogous",
    triadic: "Triadic",
    tetradic: "Tetradic",
    "split-complementary": "Split-Complementary",
    custom: "Custom",
  };
  return labels[type || "custom"] || "Custom";
}

// ============================================================================
// Components
// ============================================================================

function ColorSwatch({
  color,
  index,
  isSelected,
  onClick,
}: {
  color: ColorItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const rgb = color.rgb || hexToRgb(color.hex);
  const textColor = getTextColor(color.hex);

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onClick();
    notifyModel("select", { hex: color.hex, name: color.name, index });
  }, [color, index, onClick]);

  return (
    <VStack
      gap="0"
      position="relative"
      cursor="pointer"
      transition="transform 0.15s ease"
      _hover={{ transform: "translateY(-4px)" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Swatch */}
      <Center
        w="20"
        h="20"
        rounded="lg"
        border="3px solid"
        borderColor={isSelected ? "blue.500" : "transparent"}
        shadow={isSelected ? "lg" : "md"}
        transition="all 0.15s ease"
        style={{ backgroundColor: color.hex }}
        onClick={handleClick}
      >
        {copied && (
          <Box fontSize="xs" fontWeight="bold" style={{ color: textColor }}>
            Copied!
          </Box>
        )}
      </Center>

      {/* Label */}
      <VStack gap="0.5" mt="2" textAlign="center">
        <Code size="sm">{color.hex.toUpperCase()}</Code>
        {color.name && (
          <Box fontSize="xs" color="fg.muted">
            {color.name}
          </Box>
        )}
      </VStack>

      {/* Hover Tooltip */}
      {isHovered && (
        <Card.Root
          position="absolute"
          bottom="100%"
          left="50%"
          transform="translateX(-50%)"
          mb="2"
          zIndex={10}
          css={{ whiteSpace: "nowrap" }}
        >
          <Card.Body p="2">
            <Box fontWeight="semibold" mb="1" fontSize="xs">
              {color.hex.toUpperCase()}
            </Box>
            <Box color="fg.muted" fontSize="xs">
              RGB({rgb.r}, {rgb.g}, {rgb.b})
            </Box>
            <Box mt="1" color="fg.subtle" fontSize="2xs">
              Click to copy
            </Box>
          </Card.Body>
        </Card.Root>
      )}
    </VStack>
  );
}

function ContrastIndicator({ color1, color2 }: { color1: string; color2: string }) {
  const contrast = calculateContrast(color1, color2);
  const passAA = contrast >= 4.5;
  const passAALarge = contrast >= 3;

  return (
    <VStack gap="0" px="2" py="1" align="center" justify="center">
      <Box
        fontSize="2xs"
        fontFamily="mono"
        fontWeight="medium"
        color={
          passAA
            ? { base: "green.600", _dark: "green.400" }
            : passAALarge
              ? { base: "yellow.600", _dark: "yellow.400" }
              : { base: "red.600", _dark: "red.400" }
        }
      >
        {contrast.toFixed(1)}:1
      </Box>
      <Box fontSize="3xs" color="fg.subtle">
        {passAA ? "AA" : passAALarge ? "AA Large" : "Fail"}
      </Box>
    </VStack>
  );
}

function PaletteHeader({
  type,
  baseColor,
  colorCount,
}: {
  type?: string;
  baseColor?: string;
  colorCount: number;
}) {
  return (
    <Box mb="4">
      <HStack gap="3" mb="2">
        <Box as="h2" fontSize="lg" fontWeight="semibold" color="fg.default">
          {getPaletteTypeLabel(type)} Palette
        </Box>
        <Badge variant="outline" size="sm">
          {colorCount} colors
        </Badge>
      </HStack>
      {baseColor && (
        <HStack gap="2">
          <Box fontSize="sm" color="fg.muted">Base color:</Box>
          <Box
            w="4"
            h="4"
            rounded="sm"
            border="1px solid"
            borderColor="border.default"
            style={{ backgroundColor: baseColor }}
          />
          <Code size="sm">{baseColor.toUpperCase()}</Code>
        </HStack>
      )}
    </Box>
  );
}

function CssExport({ colors }: { colors: ColorItem[] }) {
  const [copied, setCopied] = useState(false);

  const cssVariables = useMemo(() => {
    return colors
      .map((c, i) => {
        const name = c.name ? c.name.toLowerCase().replace(/\s+/g, "-") : `color-${i + 1}`;
        return `  --${name}: ${c.hex};`;
      })
      .join("\n");
  }, [colors]);

  const fullCss = `:root {\n${cssVariables}\n}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullCss);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    notifyModel("export", { format: "css", content: fullCss });
  }, [fullCss]);

  return (
    <Box mt="6">
      <Box
        as="h3"
        fontSize="sm"
        fontWeight="semibold"
        color="fg.muted"
        mb="2"
        textTransform="uppercase"
        letterSpacing="wide"
      >
        CSS Variables
      </Box>
      <Card.Root position="relative">
        <Card.Body p="0">
          <Box
            as="pre"
            p="3"
            fontSize="xs"
            fontFamily="mono"
            color="fg.default"
            overflowX="auto"
            m="0"
          >
            {fullCss}
          </Box>
          <Button
            onClick={handleCopy}
            variant="solid"
            size="sm"
            position="absolute"
            top="2"
            right="2"
          >
            {copied ? "Copied!" : "Copy CSS"}
          </Button>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}

function ContrastMatrix({ colors }: { colors: ColorItem[] }) {
  if (colors.length < 2 || colors.length > 8) return null;

  return (
    <Box mt="6">
      <Box
        as="h3"
        fontSize="sm"
        fontWeight="semibold"
        color="fg.muted"
        mb="2"
        textTransform="uppercase"
        letterSpacing="wide"
      >
        Adjacent Contrast
      </Box>
      <Flex align="center" gap="1" flexWrap="wrap">
        {colors.slice(0, -1).map((color, i) => (
          <HStack key={i} gap="0">
            <Box
              w="6"
              h="6"
              rounded="sm"
              style={{ backgroundColor: color.hex }}
            />
            <ContrastIndicator color1={color.hex} color2={colors[i + 1].hex} />
            {i === colors.length - 2 && (
              <Box
                w="6"
                h="6"
                rounded="sm"
                style={{ backgroundColor: colors[i + 1].hex }}
              />
            )}
          </HStack>
        ))}
      </Flex>
    </Box>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PaletteViewer() {
  const [paletteData, setPaletteData] = useState<PaletteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[palette-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[palette-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setPaletteData(null);
          return;
        }

        const data = JSON.parse(textContent.text) as PaletteData;

        // Normalize: ensure colors array exists
        if (!data.colors || !Array.isArray(data.colors)) {
          setError("Invalid palette data: missing colors array");
          return;
        }

        // Normalize hex values
        data.colors = data.colors.map((c) => ({
          ...c,
          hex: c.hex.startsWith("#") ? c.hex : `#${c.hex}`,
        }));

        setPaletteData(data);
        setSelectedIndex(null);
      } catch (e) {
        setError(`Failed to parse palette data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="full">
        <Center p="10" flexDirection="column" gap="2">
          <Spinner size="md" />
          <Box color="fg.muted">Loading palette...</Box>
        </Center>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="full">
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

  if (!paletteData || paletteData.colors.length === 0) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="full">
        <Center p="10" color="fg.muted">No palette data</Center>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="full">
      {/* Header */}
      <PaletteHeader
        type={paletteData.type}
        baseColor={paletteData.baseColor}
        colorCount={paletteData.colors.length}
      />

      {/* Color Swatches */}
      <Flex flexWrap="wrap" gap="4" justify="center">
        {paletteData.colors.map((color, i) => (
          <ColorSwatch
            key={i}
            color={color}
            index={i}
            isSelected={selectedIndex === i}
            onClick={() => setSelectedIndex(i)}
          />
        ))}
      </Flex>

      {/* Contrast Matrix */}
      <ContrastMatrix colors={paletteData.colors} />

      {/* CSS Export */}
      <CssExport colors={paletteData.colors} />
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<PaletteViewer />);
