/**
 * Contrast Checker UI - WCAG Color Accessibility Checker
 *
 * Luxury/Editorial Magazine Design with styled-system
 *
 * Features:
 * - Playfair Display serif for headings, Inter for body
 * - Warm off-white/deep black color scheme
 * - Gold/bronze accents with olive/bordeaux badges
 * - Asymmetric editorial layout with 3:2 color swatches
 * - Soft diffuse shadows and fine borders
 * - Elegant animations and hover states
 * - Light/dark mode toggle
 *
 * @module lib/std/src/ui/contrast-checker
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Grid, Stack } from "../../styled-system/jsx";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface WCAGLevels {
  aa: { normal: boolean; large: boolean };
  aaa: { normal: boolean; large: boolean };
}

interface ColorSuggestion {
  color: string;
  contrastRatio: number;
  rating: string;
}

interface ContrastData {
  foreground: string;
  background: string;
  contrastRatio: number;
  wcag: WCAGLevels;
  rating: "Fail" | "AA Large" | "AA" | "AAA";
  isLargeText: boolean;
  fontSize: number;
  fontWeight: string;
  suggestions?: ColorSuggestion[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Contrast Checker", version: "1.0.0" });
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

function getTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#1a1a1a" : "#faf9f7";
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

// ============================================================================
// Animated Counter Hook
// ============================================================================

function useAnimatedNumber(target: number, duration: number = 800): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);

  useEffect(() => {
    startValue.current = value;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (target - startValue.current) * eased;

      setValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

// ============================================================================
// Theme Colors (Editorial Magazine)
// ============================================================================

const theme = {
  light: {
    bg: "#faf9f7",
    bgSubtle: "#f5f4f2",
    text: "#1a1a1a",
    textMuted: "#6b6b6b",
    accent: "#b8860b",
    border: "rgba(0, 0, 0, 0.08)",
    borderFine: "rgba(0, 0, 0, 0.06)",
    passOlive: { bg: "#f0f4ec", text: "#4a5d23", border: "#c8d6b8" },
    failBordeaux: { bg: "#fdf2f2", text: "#8b2942", border: "#e8c4cb" },
    shadow: "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)",
    shadowHover: "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
  },
  dark: {
    bg: "#0d0d0d",
    bgSubtle: "#1a1a1a",
    text: "#faf9f7",
    textMuted: "#8a8a8a",
    accent: "#d4a017",
    border: "rgba(255, 255, 255, 0.08)",
    borderFine: "rgba(255, 255, 255, 0.06)",
    passOlive: { bg: "#1a2310", text: "#a4c45a", border: "#3d4a28" },
    failBordeaux: { bg: "#1f1012", text: "#e07a8a", border: "#4a2a32" },
    shadow: "0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)",
    shadowHover: "0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4)",
  },
};

// ============================================================================
// SVG Icons
// ============================================================================

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ============================================================================
// Components
// ============================================================================

function ThemeToggle({
  isDark,
  onToggle,
  colors
}: {
  isDark: boolean;
  onToggle: () => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Flex
      as="button"
      position="absolute"
      top="6"
      right="6"
      w="10"
      h="10"
      rounded="full"
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      transition="all 0.3s ease"
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        borderColor: colors.borderFine,
        background: colors.bgSubtle,
        color: isHovered ? colors.accent : colors.textMuted,
        boxShadow: isHovered ? colors.shadowHover : colors.shadow,
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Flex>
  );
}

function ColorSwatch({
  color,
  label,
  onCopy,
  colors,
}: {
  color: string;
  label: string;
  onCopy?: () => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box flex="1">
      <Box
        fontSize="2xs"
        fontWeight="medium"
        letterSpacing="widest"
        textTransform="uppercase"
        mb="3"
        style={{ color: colors.textMuted }}
      >
        {label}
      </Box>
      <Flex
        w="full"
        aspectRatio="3/2"
        rounded="sm"
        direction="column"
        alignItems="center"
        justifyContent="center"
        gap="2"
        overflow="hidden"
        transition="all 0.3s ease"
        onClick={onCopy}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          borderColor: colors.borderFine,
          backgroundColor: color,
          transform: isHovered ? "scale(1.02)" : "scale(1)",
          boxShadow: isHovered ? colors.shadowHover : colors.shadow,
          cursor: onCopy ? "pointer" : "default",
        }}
        title={onCopy ? "Click to copy" : undefined}
      >
        <Box
          fontSize="sm"
          fontWeight="medium"
          letterSpacing="wider"
          opacity="0.9"
          style={{ color: getTextColor(color) }}
        >
          {color.toUpperCase()}
        </Box>
      </Flex>
    </Box>
  );
}

function ContrastRatioDisplay({
  ratio,
  colors
}: {
  ratio: number;
  colors: typeof theme.light;
}) {
  const animatedRatio = useAnimatedNumber(ratio);

  return (
    <Flex direction="column" alignItems="center" gap="1" py="8">
      <Box
        fontSize="2xs"
        fontWeight="medium"
        letterSpacing="widest"
        textTransform="uppercase"
        style={{ color: colors.textMuted }}
      >
        Contrast Ratio
      </Box>
      <Flex alignItems="baseline" gap="0.5">
        <Box
          fontFamily="serif"
          fontSize="6xl"
          fontWeight="semibold"
          lineHeight="none"
          letterSpacing="tight"
          style={{ color: colors.text }}
        >
          {animatedRatio.toFixed(2)}
        </Box>
        <Box
          fontFamily="serif"
          fontSize="2xl"
          fontWeight="normal"
          ml="1"
          style={{ color: colors.textMuted }}
        >
          :1
        </Box>
      </Flex>
    </Flex>
  );
}

function Separator({ colors }: { colors: typeof theme.light }) {
  return (
    <Box
      h="1px"
      my="6"
      style={{
        background: `linear-gradient(to right, transparent, ${colors.border}, transparent)`,
      }}
    />
  );
}

function RatingBadge({
  rating,
  colors
}: {
  rating: string;
  colors: typeof theme.light;
}) {
  const isPass = rating !== "Fail";
  const badgeColors = isPass ? colors.passOlive : colors.failBordeaux;

  return (
    <Flex
      display="inline-flex"
      alignItems="center"
      gap="2"
      px="5"
      py="2.5"
      rounded="full"
      fontSize="xs"
      fontWeight="semibold"
      letterSpacing="wider"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: badgeColors.bg,
        color: badgeColors.text,
        borderColor: badgeColors.border,
      }}
    >
      {isPass ? <CheckIcon /> : <XIcon />}
      {rating}
    </Flex>
  );
}

function WCAGBadge({
  level,
  size,
  pass,
  colors,
}: {
  level: "AA" | "AAA";
  size: "normal" | "large";
  pass: boolean;
  colors: typeof theme.light;
}) {
  const badgeColors = pass ? colors.passOlive : colors.failBordeaux;

  return (
    <Flex
      alignItems="center"
      justifyContent="space-between"
      px="4"
      py="3"
      rounded="sm"
      fontSize="2xs"
      fontWeight="medium"
      transition="all 0.3s ease"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: badgeColors.bg,
        borderColor: badgeColors.border,
      }}
    >
      <Flex alignItems="center" gap="2">
        <Box fontWeight="bold" letterSpacing="wider" style={{ color: badgeColors.text }}>
          {level}
        </Box>
        <Box opacity="0.7" letterSpacing="wide" style={{ color: badgeColors.text }}>
          {size === "large" ? "Large Text" : "Normal Text"}
        </Box>
      </Flex>
      <Box style={{ color: badgeColors.text }}>
        {pass ? <CheckIcon /> : <XIcon />}
      </Box>
    </Flex>
  );
}

function TextPreview({
  foreground,
  background,
  fontSize,
  fontWeight,
  colors,
}: {
  foreground: string;
  background: string;
  fontSize: number;
  fontWeight: string;
  colors: typeof theme.light;
}) {
  return (
    <Box
      rounded="sm"
      overflow="hidden"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        borderColor: colors.borderFine,
        boxShadow: colors.shadow,
      }}
    >
      <Box
        p="8"
        textAlign="center"
        style={{ backgroundColor: background, color: foreground }}
      >
        <Box
          fontFamily="serif"
          mb="3"
          lineHeight="tight"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight === "bold" ? 700 : 400,
          }}
        >
          Sample Text
        </Box>
        <Box fontSize="sm" lineHeight="relaxed" opacity="0.9">
          The quick brown fox jumps over the lazy dog
        </Box>
      </Box>
      <Flex
        px="4"
        py="2.5"
        fontSize="2xs"
        fontWeight="medium"
        letterSpacing="wide"
        textTransform="uppercase"
        justifyContent="center"
        style={{
          borderTopWidth: "0.5px",
          borderTopStyle: "solid",
          background: colors.bgSubtle,
          color: colors.textMuted,
          borderColor: colors.borderFine,
        }}
      >
        {fontSize}px {fontWeight}
      </Flex>
    </Box>
  );
}

function SuggestionCard({
  suggestion,
  background,
  onSelect,
  colors,
}: {
  suggestion: ColorSuggestion;
  background: string;
  onSelect: (color: string) => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isAAA = suggestion.rating === "AAA";

  return (
    <Flex
      alignItems="center"
      gap="4"
      p="4"
      rounded="sm"
      cursor="pointer"
      transition="all 0.3s ease"
      onClick={() => onSelect(suggestion.color)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: isHovered ? colors.bgSubtle : "transparent",
        borderColor: isHovered ? colors.border : "transparent",
      }}
    >
      <Flex
        w="16"
        h="10"
        rounded="xs"
        alignItems="center"
        justifyContent="center"
        fontSize="sm"
        fontFamily="serif"
        fontWeight="semibold"
        transition="transform 0.3s ease"
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          borderColor: colors.borderFine,
          backgroundColor: background,
          color: suggestion.color,
          boxShadow: colors.shadow,
          transform: isHovered ? "scale(1.05)" : "scale(1)",
        }}
      >
        Aa
      </Flex>

      <Box flex="1">
        <Box fontSize="sm" fontWeight="medium" letterSpacing="wider" style={{ color: colors.text }}>
          {suggestion.color.toUpperCase()}
        </Box>
        <Box fontSize="2xs" mt="0.5" style={{ color: colors.textMuted }}>
          {suggestion.contrastRatio}:1
        </Box>
      </Box>

      <Box
        px="2.5"
        py="1"
        rounded="full"
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="wider"
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          background: isAAA ? colors.passOlive.bg : colors.bgSubtle,
          color: isAAA ? colors.passOlive.text : colors.accent,
          borderColor: isAAA ? colors.passOlive.border : colors.border,
        }}
      >
        {suggestion.rating}
      </Box>
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ContrastChecker() {
  const [data, setData] = useState<ContrastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const colors = isDark ? theme.dark : theme.light;

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[contrast-checker] Connected to MCP host");
    }).catch(() => {
      console.log("[contrast-checker] No MCP host (standalone mode)");
      // Demo data for standalone mode
      setData({
        foreground: "#1a1a1a",
        background: "#faf9f7",
        contrastRatio: 15.2,
        wcag: {
          aa: { normal: true, large: true },
          aaa: { normal: true, large: true },
        },
        rating: "AAA",
        isLargeText: false,
        fontSize: 16,
        fontWeight: "normal",
        suggestions: [
          { color: "#2d2d2d", contrastRatio: 12.5, rating: "AAA" },
          { color: "#444444", contrastRatio: 8.2, rating: "AA" },
        ],
      });
      setLoading(false);
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text) as ContrastData;
        setData(parsed);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleCopy = useCallback((value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    notifyModel("copy", { value, label });
  }, []);

  const handleSelectSuggestion = useCallback((color: string) => {
    navigator.clipboard.writeText(color);
    setCopied("suggestion");
    setTimeout(() => setCopied(null), 2000);
    notifyModel("selectSuggestion", { color });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
    notifyModel("toggleTheme", { isDark: !isDark });
  }, [isDark]);

  // Loading state
  if (loading) {
    return (
      <Flex
        p="12"
        minH="100vh"
        alignItems="center"
        justifyContent="center"
        fontSize="sm"
        letterSpacing="wide"
        textTransform="uppercase"
        style={{ color: colors.textMuted, background: colors.bg }}
      >
        Checking contrast...
      </Flex>
    );
  }

  // Error state
  if (error) {
    return (
      <Box p="12" fontFamily="sans" fontSize="sm" minH="100vh" style={{ background: colors.bg }}>
        <Box
          p="5"
          rounded="sm"
          style={{
            borderWidth: "0.5px",
            borderStyle: "solid",
            background: colors.failBordeaux.bg,
            color: colors.failBordeaux.text,
            borderColor: colors.failBordeaux.border,
          }}
        >
          {error}
        </Box>
      </Box>
    );
  }

  // Empty state
  if (!data) {
    return (
      <Flex
        p="12"
        minH="100vh"
        alignItems="center"
        justifyContent="center"
        fontSize="sm"
        letterSpacing="wide"
        textTransform="uppercase"
        style={{ color: colors.textMuted, background: colors.bg }}
      >
        No contrast data
      </Flex>
    );
  }

  const hasSuggestions = data.suggestions && data.suggestions.length > 0;

  return (
    <Box
      p="12"
      fontFamily="sans"
      fontSize="sm"
      minH="100vh"
      position="relative"
      transition="all 0.3s ease"
      style={{
        color: colors.text,
        background: colors.bg,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
      }}
    >
      {/* Theme toggle */}
      <ThemeToggle isDark={isDark} onToggle={toggleTheme} colors={colors} />

      {/* Header */}
      <Box as="header" mb="10" maxW="400px">
        <Box
          as="h1"
          fontFamily="serif"
          fontSize="3xl"
          fontWeight="semibold"
          mb="2"
          letterSpacing="tight"
          style={{ color: colors.text }}
        >
          Contrast Checker
        </Box>
        <Box
          fontSize="xs"
          letterSpacing="wide"
          lineHeight="relaxed"
          style={{ color: colors.textMuted }}
        >
          WCAG 2.1 Color Accessibility Analysis
        </Box>
      </Box>

      {/* Color swatches - asymmetric layout */}
      <Flex gap="6" mb="2">
        <ColorSwatch
          color={data.foreground}
          label="Foreground"
          onCopy={() => handleCopy(data.foreground, "foreground")}
          colors={colors}
        />
        <ColorSwatch
          color={data.background}
          label="Background"
          onCopy={() => handleCopy(data.background, "background")}
          colors={colors}
        />
      </Flex>

      <Separator colors={colors} />

      {/* Contrast ratio - large editorial typography */}
      <Box textAlign="center">
        <ContrastRatioDisplay ratio={data.contrastRatio} colors={colors} />
        <RatingBadge rating={data.rating} colors={colors} />
      </Box>

      <Separator colors={colors} />

      {/* Text preview */}
      <Box mb="8">
        <Box
          fontSize="2xs"
          fontWeight="medium"
          letterSpacing="widest"
          textTransform="uppercase"
          mb="4"
          style={{ color: colors.textMuted }}
        >
          Preview
        </Box>
        <TextPreview
          foreground={data.foreground}
          background={data.background}
          fontSize={data.fontSize}
          fontWeight={data.fontWeight}
          colors={colors}
        />
      </Box>

      {/* WCAG compliance badges */}
      <Box mb="8">
        <Box
          fontSize="2xs"
          fontWeight="medium"
          letterSpacing="widest"
          textTransform="uppercase"
          mb="4"
          style={{ color: colors.textMuted }}
        >
          WCAG Compliance
        </Box>
        <Grid columns={2} gap="2">
          <WCAGBadge level="AA" size="normal" pass={data.wcag.aa.normal} colors={colors} />
          <WCAGBadge level="AA" size="large" pass={data.wcag.aa.large} colors={colors} />
          <WCAGBadge level="AAA" size="normal" pass={data.wcag.aaa.normal} colors={colors} />
          <WCAGBadge level="AAA" size="large" pass={data.wcag.aaa.large} colors={colors} />
        </Grid>
      </Box>

      {/* Suggestions section */}
      {hasSuggestions && (
        <Box>
          <Separator colors={colors} />
          <Box
            fontSize="2xs"
            fontWeight="medium"
            letterSpacing="widest"
            textTransform="uppercase"
            mb="4"
            style={{ color: colors.textMuted }}
          >
            Suggested Alternatives
          </Box>
          <Stack gap="1">
            {data.suggestions!.map((suggestion, i) => (
              <SuggestionCard
                key={i}
                suggestion={suggestion}
                background={data.background}
                onSelect={handleSelectSuggestion}
                colors={colors}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Copy feedback toast */}
      {copied && (
        <Flex
          position="fixed"
          bottom="8"
          left="50%"
          transform="translateX(-50%)"
          px="6"
          py="3"
          rounded="full"
          fontSize="2xs"
          fontWeight="medium"
          letterSpacing="wider"
          zIndex="100"
          animation="fade-in"
          style={{
            background: colors.text,
            color: colors.bg,
            boxShadow: colors.shadow,
          }}
        >
          Copied {copied}
        </Flex>
      )}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<ContrastChecker />);
