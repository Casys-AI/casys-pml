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

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css, cx } from "../../styled-system/css";
import "./styles.css";

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

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
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
    <div
      class={css({
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        transition: "transform 0.15s ease",
        _hover: { transform: "translateY(-4px)" },
      })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Swatch */}
      <div
        class={cx(
          css({
            w: "20",
            h: "20",
            rounded: "lg",
            border: "3px solid",
            borderColor: isSelected ? "blue.500" : "transparent",
            shadow: isSelected ? "lg" : "md",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          })
        )}
        style={{ backgroundColor: color.hex }}
        onClick={handleClick}
      >
        {copied && (
          <span style={{ color: textColor }} class={css({ fontSize: "xs", fontWeight: "bold" })}>
            Copied!
          </span>
        )}
      </div>

      {/* Label */}
      <div class={css({ mt: "2", textAlign: "center" })}>
        <code class={css({ fontSize: "xs", fontFamily: "mono", color: "fg.default" })}>
          {color.hex.toUpperCase()}
        </code>
        {color.name && (
          <p class={css({ fontSize: "xs", color: "fg.muted", mt: "0.5" })}>
            {color.name}
          </p>
        )}
      </div>

      {/* Hover Tooltip */}
      {isHovered && (
        <div
          class={css({
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            mb: "2",
            p: "2",
            bg: "bg.canvas",
            border: "1px solid",
            borderColor: "border.default",
            rounded: "md",
            shadow: "lg",
            zIndex: 10,
            whiteSpace: "nowrap",
            fontSize: "xs",
          })}
        >
          <div class={css({ fontWeight: "semibold", mb: "1" })}>{color.hex.toUpperCase()}</div>
          <div class={css({ color: "fg.muted" })}>
            RGB({rgb.r}, {rgb.g}, {rgb.b})
          </div>
          <div class={css({ mt: "1", color: "fg.subtle", fontSize: "2xs" })}>
            Click to copy
          </div>
        </div>
      )}
    </div>
  );
}

function ContrastIndicator({ color1, color2 }: { color1: string; color2: string }) {
  const contrast = calculateContrast(color1, color2);
  const passAA = contrast >= 4.5;
  const passAALarge = contrast >= 3;

  return (
    <div
      class={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: "2",
        py: "1",
      })}
    >
      <span
        class={css({
          fontSize: "2xs",
          fontFamily: "mono",
          fontWeight: "medium",
          color: passAA ? "green.600" : passAALarge ? "yellow.600" : "red.600",
          _dark: {
            color: passAA ? "green.400" : passAALarge ? "yellow.400" : "red.400",
          },
        })}
      >
        {contrast.toFixed(1)}:1
      </span>
      <span
        class={css({
          fontSize: "3xs",
          color: "fg.subtle",
        })}
      >
        {passAA ? "AA" : passAALarge ? "AA Large" : "Fail"}
      </span>
    </div>
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
    <div class={css({ mb: "4" })}>
      <div class={css({ display: "flex", alignItems: "center", gap: "3", mb: "2" })}>
        <h2 class={css({ fontSize: "lg", fontWeight: "semibold", color: "fg.default" })}>
          {getPaletteTypeLabel(type)} Palette
        </h2>
        <span
          class={css({
            px: "2",
            py: "0.5",
            bg: "bg.subtle",
            rounded: "full",
            fontSize: "xs",
            color: "fg.muted",
          })}
        >
          {colorCount} colors
        </span>
      </div>
      {baseColor && (
        <div class={css({ display: "flex", alignItems: "center", gap: "2" })}>
          <span class={css({ fontSize: "sm", color: "fg.muted" })}>Base color:</span>
          <div
            class={css({
              w: "4",
              h: "4",
              rounded: "sm",
              border: "1px solid",
              borderColor: "border.default",
            })}
            style={{ backgroundColor: baseColor }}
          />
          <code class={css({ fontSize: "sm", fontFamily: "mono", color: "fg.default" })}>
            {baseColor.toUpperCase()}
          </code>
        </div>
      )}
    </div>
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
    <div class={css({ mt: "6" })}>
      <h3 class={css({ fontSize: "sm", fontWeight: "semibold", color: "fg.muted", mb: "2", textTransform: "uppercase", letterSpacing: "wide" })}>
        CSS Variables
      </h3>
      <div
        class={css({
          position: "relative",
          bg: "bg.subtle",
          rounded: "lg",
          border: "1px solid",
          borderColor: "border.default",
          overflow: "hidden",
        })}
      >
        <pre
          class={css({
            p: "3",
            fontSize: "xs",
            fontFamily: "mono",
            color: "fg.default",
            overflowX: "auto",
            m: 0,
          })}
        >
          {fullCss}
        </pre>
        <button
          onClick={handleCopy}
          class={css({
            position: "absolute",
            top: "2",
            right: "2",
            px: "3",
            py: "1.5",
            bg: copied ? "green.500" : "blue.500",
            color: "white",
            rounded: "md",
            fontSize: "xs",
            fontWeight: "medium",
            cursor: "pointer",
            border: "none",
            transition: "background 0.15s ease",
            _hover: { bg: copied ? "green.600" : "blue.600" },
          })}
        >
          {copied ? "Copied!" : "Copy CSS"}
        </button>
      </div>
    </div>
  );
}

function ContrastMatrix({ colors }: { colors: ColorItem[] }) {
  if (colors.length < 2 || colors.length > 8) return null;

  return (
    <div class={css({ mt: "6" })}>
      <h3 class={css({ fontSize: "sm", fontWeight: "semibold", color: "fg.muted", mb: "2", textTransform: "uppercase", letterSpacing: "wide" })}>
        Adjacent Contrast
      </h3>
      <div class={css({ display: "flex", alignItems: "center", gap: "1", flexWrap: "wrap" })}>
        {colors.slice(0, -1).map((color, i) => (
          <div key={i} class={css({ display: "flex", alignItems: "center" })}>
            <div
              class={css({ w: "6", h: "6", rounded: "sm" })}
              style={{ backgroundColor: color.hex }}
            />
            <ContrastIndicator color1={color.hex} color2={colors[i + 1].hex} />
            {i === colors.length - 2 && (
              <div
                class={css({ w: "6", h: "6", rounded: "sm" })}
                style={{ backgroundColor: colors[i + 1].hex }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
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
      <div class={styles.container}>
        <div class={styles.loading}>Loading palette...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>{error}</div>
      </div>
    );
  }

  if (!paletteData || paletteData.colors.length === 0) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No palette data</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <PaletteHeader
        type={paletteData.type}
        baseColor={paletteData.baseColor}
        colorCount={paletteData.colors.length}
      />

      {/* Color Swatches */}
      <div class={css({ display: "flex", flexWrap: "wrap", gap: "4", justifyContent: "center" })}>
        {paletteData.colors.map((color, i) => (
          <ColorSwatch
            key={i}
            color={color}
            index={i}
            isSelected={selectedIndex === i}
            onClick={() => setSelectedIndex(i)}
          />
        ))}
      </div>

      {/* Contrast Matrix */}
      <ContrastMatrix colors={paletteData.colors} />

      {/* CSS Export */}
      <CssExport colors={paletteData.colors} />
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
    minH: "full",
  }),
  loading: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  empty: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  error: css({
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

render(<PaletteViewer />, document.getElementById("app")!);
