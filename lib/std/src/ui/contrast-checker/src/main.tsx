/**
 * Contrast Checker UI - WCAG Color Accessibility Checker
 *
 * Luxury/Editorial Magazine Design
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

import { render } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";

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
// Theme Colors
// ============================================================================

const theme = {
  light: {
    bg: "#faf9f7",
    bgSubtle: "#f5f4f2",
    text: "#1a1a1a",
    textMuted: "#6b6b6b",
    accent: "#b8860b",
    accentHover: "#9a7209",
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
    accentHover: "#e8b420",
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
  return (
    <button
      onClick={onToggle}
      style={{
        position: "absolute",
        top: "24px",
        right: "24px",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: `0.5px solid ${colors.borderFine}`,
        background: colors.bgSubtle,
        color: colors.textMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: colors.shadow,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = colors.accent;
        e.currentTarget.style.boxShadow = colors.shadowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = colors.textMuted;
        e.currentTarget.style.boxShadow = colors.shadow;
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
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
    <div style={{ flex: 1 }}>
      <span
        style={{
          display: "block",
          fontFamily: "'Inter', sans-serif",
          fontSize: "10px",
          fontWeight: "500",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: colors.textMuted,
          marginBottom: "12px",
        }}
      >
        {label}
      </span>
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 2",
          borderRadius: "4px",
          border: `0.5px solid ${colors.borderFine}`,
          cursor: onCopy ? "pointer" : "default",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
          transform: isHovered ? "scale(1.02)" : "scale(1)",
          boxShadow: isHovered ? colors.shadowHover : colors.shadow,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          backgroundColor: color,
          overflow: "hidden",
        }}
        onClick={onCopy}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={onCopy ? "Click to copy" : undefined}
      >
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "13px",
            fontWeight: "500",
            letterSpacing: "0.05em",
            color: getTextColor(color),
            opacity: 0.9,
          }}
        >
          {color.toUpperCase()}
        </span>
      </div>
    </div>
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        padding: "32px 0",
      }}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "10px",
          fontWeight: "500",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: colors.textMuted,
        }}
      >
        Contrast Ratio
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "56px",
            fontWeight: "600",
            color: colors.text,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {animatedRatio.toFixed(2)}
        </span>
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "24px",
            fontWeight: "400",
            color: colors.textMuted,
            marginLeft: "4px",
          }}
        >
          :1
        </span>
      </div>
    </div>
  );
}

function Separator({ colors }: { colors: typeof theme.light }) {
  return (
    <div
      style={{
        height: "1px",
        background: `linear-gradient(to right, transparent, ${colors.border}, transparent)`,
        margin: "24px 0",
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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        borderRadius: "100px",
        fontSize: "12px",
        fontFamily: "'Inter', sans-serif",
        fontWeight: "600",
        letterSpacing: "0.05em",
        background: badgeColors.bg,
        color: badgeColors.text,
        border: `0.5px solid ${badgeColors.border}`,
      }}
    >
      {isPass ? <CheckIcon /> : <XIcon />}
      {rating}
    </div>
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: "4px",
        fontSize: "11px",
        fontFamily: "'Inter', sans-serif",
        fontWeight: "500",
        background: badgeColors.bg,
        border: `0.5px solid ${badgeColors.border}`,
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontWeight: "700",
            letterSpacing: "0.05em",
            color: badgeColors.text,
          }}
        >
          {level}
        </span>
        <span
          style={{
            color: badgeColors.text,
            opacity: 0.7,
            letterSpacing: "0.02em",
          }}
        >
          {size === "large" ? "Large Text" : "Normal Text"}
        </span>
      </div>
      <div style={{ color: badgeColors.text }}>
        {pass ? <CheckIcon /> : <XIcon />}
      </div>
    </div>
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
    <div
      style={{
        borderRadius: "4px",
        overflow: "hidden",
        border: `0.5px solid ${colors.borderFine}`,
        boxShadow: colors.shadow,
      }}
    >
      <div
        style={{
          padding: "32px 24px",
          textAlign: "center",
          backgroundColor: background,
          color: foreground,
        }}
      >
        <p
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight === "bold" ? 700 : 400,
            marginBottom: "12px",
            lineHeight: 1.2,
          }}
        >
          Sample Text
        </p>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "14px",
            lineHeight: 1.6,
            opacity: 0.9,
          }}
        >
          The quick brown fox jumps over the lazy dog
        </p>
      </div>
      <div
        style={{
          padding: "10px 16px",
          background: colors.bgSubtle,
          fontSize: "10px",
          fontFamily: "'Inter', sans-serif",
          fontWeight: "500",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: colors.textMuted,
          textAlign: "center",
          borderTop: `0.5px solid ${colors.borderFine}`,
        }}
      >
        {fontSize}px {fontWeight}
      </div>
    </div>
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px",
        background: isHovered ? colors.bgSubtle : "transparent",
        borderRadius: "4px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        border: `0.5px solid ${isHovered ? colors.border : "transparent"}`,
      }}
      onClick={() => onSelect(suggestion.color)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          width: "64px",
          height: "40px",
          borderRadius: "3px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          fontFamily: "'Playfair Display', serif",
          fontWeight: "600",
          border: `0.5px solid ${colors.borderFine}`,
          backgroundColor: background,
          color: suggestion.color,
          boxShadow: colors.shadow,
          transition: "transform 0.3s ease",
          transform: isHovered ? "scale(1.05)" : "scale(1)",
        }}
      >
        Aa
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "13px",
            fontWeight: "500",
            letterSpacing: "0.05em",
            color: colors.text,
          }}
        >
          {suggestion.color.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "11px",
            color: colors.textMuted,
            marginTop: "2px",
          }}
        >
          {suggestion.contrastRatio}:1
        </div>
      </div>

      <span
        style={{
          padding: "4px 10px",
          borderRadius: "100px",
          fontSize: "10px",
          fontFamily: "'Inter', sans-serif",
          fontWeight: "600",
          letterSpacing: "0.05em",
          background: isAAA ? colors.passOlive.bg : colors.bgSubtle,
          color: isAAA ? colors.passOlive.text : colors.accent,
          border: `0.5px solid ${isAAA ? colors.passOlive.border : colors.border}`,
        }}
      >
        {suggestion.rating}
      </span>
    </div>
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
      <div
        style={{
          padding: "48px 32px",
          fontFamily: "'Inter', sans-serif",
          fontSize: "13px",
          color: colors.textMuted,
          background: colors.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Checking contrast...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: "32px",
          fontFamily: "'Inter', sans-serif",
          fontSize: "13px",
          background: colors.bg,
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            background: colors.failBordeaux.bg,
            color: colors.failBordeaux.text,
            borderRadius: "4px",
            border: `0.5px solid ${colors.failBordeaux.border}`,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  // Empty state
  if (!data) {
    return (
      <div
        style={{
          padding: "48px 32px",
          fontFamily: "'Inter', sans-serif",
          fontSize: "13px",
          color: colors.textMuted,
          background: colors.bg,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        No contrast data
      </div>
    );
  }

  const hasSuggestions = data.suggestions && data.suggestions.length > 0;

  return (
    <div
      style={{
        padding: "48px 32px",
        fontFamily: "'Inter', sans-serif",
        fontSize: "14px",
        color: colors.text,
        background: colors.bg,
        minHeight: "100vh",
        position: "relative",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      {/* Theme toggle */}
      <ThemeToggle isDark={isDark} onToggle={toggleTheme} colors={colors} />

      {/* Header */}
      <header style={{ marginBottom: "40px", maxWidth: "400px" }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "28px",
            fontWeight: "600",
            color: colors.text,
            marginBottom: "8px",
            letterSpacing: "-0.01em",
          }}
        >
          Contrast Checker
        </h1>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "12px",
            color: colors.textMuted,
            letterSpacing: "0.02em",
            lineHeight: 1.5,
          }}
        >
          WCAG 2.1 Color Accessibility Analysis
        </p>
      </header>

      {/* Color swatches - asymmetric layout */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "8px" }}>
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
      </div>

      <Separator colors={colors} />

      {/* Contrast ratio - large editorial typography */}
      <div style={{ textAlign: "center" }}>
        <ContrastRatioDisplay ratio={data.contrastRatio} colors={colors} />
        <RatingBadge rating={data.rating} colors={colors} />
      </div>

      <Separator colors={colors} />

      {/* Text preview */}
      <div style={{ marginBottom: "32px" }}>
        <span
          style={{
            display: "block",
            fontFamily: "'Inter', sans-serif",
            fontSize: "10px",
            fontWeight: "500",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: colors.textMuted,
            marginBottom: "16px",
          }}
        >
          Preview
        </span>
        <TextPreview
          foreground={data.foreground}
          background={data.background}
          fontSize={data.fontSize}
          fontWeight={data.fontWeight}
          colors={colors}
        />
      </div>

      {/* WCAG compliance badges */}
      <div style={{ marginBottom: "32px" }}>
        <span
          style={{
            display: "block",
            fontFamily: "'Inter', sans-serif",
            fontSize: "10px",
            fontWeight: "500",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: colors.textMuted,
            marginBottom: "16px",
          }}
        >
          WCAG Compliance
        </span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "8px",
          }}
        >
          <WCAGBadge level="AA" size="normal" pass={data.wcag.aa.normal} colors={colors} />
          <WCAGBadge level="AA" size="large" pass={data.wcag.aa.large} colors={colors} />
          <WCAGBadge level="AAA" size="normal" pass={data.wcag.aaa.normal} colors={colors} />
          <WCAGBadge level="AAA" size="large" pass={data.wcag.aaa.large} colors={colors} />
        </div>
      </div>

      {/* Suggestions section */}
      {hasSuggestions && (
        <div>
          <Separator colors={colors} />
          <span
            style={{
              display: "block",
              fontFamily: "'Inter', sans-serif",
              fontSize: "10px",
              fontWeight: "500",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: colors.textMuted,
              marginBottom: "16px",
            }}
          >
            Suggested Alternatives
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {data.suggestions!.map((suggestion, i) => (
              <SuggestionCard
                key={i}
                suggestion={suggestion}
                background={data.background}
                onSelect={handleSelectSuggestion}
                colors={colors}
              />
            ))}
          </div>
        </div>
      )}

      {/* Copy feedback toast */}
      {copied && (
        <div
          style={{
            position: "fixed",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            background: colors.text,
            color: colors.bg,
            padding: "12px 24px",
            borderRadius: "100px",
            fontSize: "11px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: "500",
            letterSpacing: "0.05em",
            boxShadow: colors.shadow,
            zIndex: 100,
            animation: "fadeInUp 0.3s ease",
          }}
        >
          Copied {copied}
        </div>
      )}

      {/* Inline keyframes for animation */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ContrastChecker />, document.getElementById("app")!);
