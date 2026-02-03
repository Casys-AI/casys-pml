/**
 * Word Cloud UI for MCP Apps
 *
 * Displays words with size proportional to frequency using SVG.
 * Features:
 * - Spiral placement algorithm to avoid overlaps
 * - Multiple color schemes (blue, rainbow, monochrome)
 * - Hover to see exact count
 * - Click to select words
 *
 * @module lib/std/src/ui/word-cloud
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface WordItem {
  word: string;
  count: number;
  percentage?: number;
}

interface WordCloudData {
  words: WordItem[];
  title?: string;
  maxWords?: number;
  colorScheme?: "blue" | "rainbow" | "monochrome";
}

interface PlacedWord {
  word: string;
  count: number;
  percentage?: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  width: number;
  height: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Word Cloud", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Color Schemes
// ============================================================================

const COLOR_SCHEMES = {
  blue: [
    "#1e40af", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa",
    "#93c5fd", "#1e3a8a", "#1e40af", "#2563eb", "#3b82f6",
  ],
  rainbow: [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e",
  ],
  monochrome: [
    "#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af",
    "#d1d5db", "#3f3f46", "#52525b", "#71717a", "#a1a1aa",
  ],
};

// ============================================================================
// Spiral Placement Algorithm
// ============================================================================

function spiralPlacement(
  words: WordItem[],
  width: number,
  height: number,
  colorScheme: keyof typeof COLOR_SCHEMES,
  maxWords: number
): PlacedWord[] {
  const colors = COLOR_SCHEMES[colorScheme];
  const centerX = width / 2;
  const centerY = height / 2;
  const placed: PlacedWord[] = [];

  // Sort by count descending and limit
  const sortedWords = [...words]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxWords);

  if (sortedWords.length === 0) return [];

  // Calculate font size range
  const maxCount = sortedWords[0].count;
  const minCount = sortedWords[sortedWords.length - 1].count;
  const countRange = maxCount - minCount || 1;

  const minFontSize = 12;
  const maxFontSize = 48;

  // Helper to check overlap with existing words
  function overlaps(rect: { x: number; y: number; width: number; height: number }): boolean {
    const padding = 4;
    for (const p of placed) {
      if (
        rect.x - padding < p.x + p.width + padding &&
        rect.x + rect.width + padding > p.x - padding &&
        rect.y - padding < p.y + p.height + padding &&
        rect.y + rect.height + padding > p.y - padding
      ) {
        return true;
      }
    }
    return false;
  }

  // Helper to check if within bounds
  function inBounds(rect: { x: number; y: number; width: number; height: number }): boolean {
    return (
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= width &&
      rect.y + rect.height <= height
    );
  }

  // Place each word using spiral
  for (let i = 0; i < sortedWords.length; i++) {
    const wordItem = sortedWords[i];
    const ratio = (wordItem.count - minCount) / countRange;
    const fontSize = minFontSize + ratio * (maxFontSize - minFontSize);

    // Estimate word dimensions (rough approximation)
    const charWidth = fontSize * 0.6;
    const wordWidth = wordItem.word.length * charWidth;
    const wordHeight = fontSize * 1.2;

    const color = colors[i % colors.length];

    // Spiral parameters
    let angle = 0;
    let radius = 0;
    const angleStep = 0.5;
    const radiusStep = 2;
    let foundPosition = false;

    // Try spiral positions
    for (let attempt = 0; attempt < 500 && !foundPosition; attempt++) {
      const x = centerX + radius * Math.cos(angle) - wordWidth / 2;
      const y = centerY + radius * Math.sin(angle) - wordHeight / 2;

      const rect = { x, y, width: wordWidth, height: wordHeight };

      if (inBounds(rect) && !overlaps(rect)) {
        placed.push({
          word: wordItem.word,
          count: wordItem.count,
          percentage: wordItem.percentage,
          x,
          y,
          fontSize,
          color,
          width: wordWidth,
          height: wordHeight,
        });
        foundPosition = true;
      }

      angle += angleStep;
      radius += radiusStep / (2 * Math.PI);
    }
  }

  return placed;
}

// ============================================================================
// Word Cloud Component
// ============================================================================

function WordCloudSVG({
  words,
  colorScheme,
  maxWords,
  selectedWord,
  onWordClick,
}: {
  words: WordItem[];
  colorScheme: keyof typeof COLOR_SCHEMES;
  maxWords: number;
  selectedWord: string | null;
  onWordClick: (word: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: Math.max(300, rect.height) });
      }
    }
  }, []);

  const placedWords = useMemo(() => {
    return spiralPlacement(words, dimensions.width, dimensions.height, colorScheme, maxWords);
  }, [words, dimensions.width, dimensions.height, colorScheme, maxWords]);

  return (
    <div ref={containerRef} class={styles.svgContainer}>
      <svg width={dimensions.width} height={dimensions.height} class={styles.svg}>
        {placedWords.map((pw, i) => (
          <g key={i}>
            <text
              x={pw.x + pw.width / 2}
              y={pw.y + pw.height * 0.75}
              textAnchor="middle"
              fontSize={pw.fontSize}
              fontWeight={selectedWord === pw.word ? "bold" : "normal"}
              fill={pw.color}
              opacity={selectedWord && selectedWord !== pw.word ? 0.4 : 1}
              class={styles.wordText}
              onClick={() => {
                onWordClick(pw.word);
                notifyModel("select", { word: pw.word, count: pw.count, percentage: pw.percentage });
              }}
            >
              {pw.word}
              <title>
                {pw.word}: {pw.count}
                {pw.percentage !== undefined ? ` (${pw.percentage.toFixed(1)}%)` : ""}
              </title>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function WordCloud() {
  const [data, setData] = useState<WordCloudData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[word-cloud] Connected to MCP host");
    }).catch(() => {
      console.log("[word-cloud] No MCP host (standalone mode)");
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
        const parsed = JSON.parse(textContent.text) as WordCloudData;
        setData(parsed);
        setSelectedWord(null);
      } catch (e) {
        setError(`Failed to parse word cloud data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleWordClick = (word: string) => {
    setSelectedWord((prev) => (prev === word ? null : word));
  };

  if (loading) {
    return <div class={styles.container}><div class={styles.loading}>Loading word cloud...</div></div>;
  }

  if (error) {
    return <div class={styles.container}><div class={styles.error}>{error}</div></div>;
  }

  if (!data || !data.words || data.words.length === 0) {
    return <div class={styles.container}><div class={styles.empty}>No words to display</div></div>;
  }

  const { words, title, maxWords = 50, colorScheme = "blue" } = data;

  // Find selected word info
  const selectedWordInfo = selectedWord
    ? words.find((w) => w.word === selectedWord)
    : null;

  return (
    <div class={styles.container}>
      {/* Header */}
      {title && (
        <div class={styles.header}>
          <h2 class={styles.title}>{title}</h2>
        </div>
      )}

      {/* Word Cloud */}
      <div class={styles.cloudWrapper}>
        <WordCloudSVG
          words={words}
          colorScheme={colorScheme}
          maxWords={maxWords}
          selectedWord={selectedWord}
          onWordClick={handleWordClick}
        />
      </div>

      {/* Selected Word Info */}
      {selectedWordInfo && (
        <div class={styles.selectedInfo}>
          <span class={styles.selectedWord}>{selectedWordInfo.word}</span>
          <span class={styles.selectedCount}>Count: {selectedWordInfo.count}</span>
          {selectedWordInfo.percentage !== undefined && (
            <span class={styles.selectedPercent}>
              ({selectedWordInfo.percentage.toFixed(1)}%)
            </span>
          )}
          <button
            class={styles.clearBtn}
            onClick={() => setSelectedWord(null)}
          >
            Clear
          </button>
        </div>
      )}

      {/* Stats */}
      <div class={styles.stats}>
        <span>{Math.min(words.length, maxWords)} words displayed</span>
        {words.length > maxWords && (
          <span class={styles.truncated}>(truncated from {words.length})</span>
        )}
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
    minH: "400px",
  }),
  header: css({
    mb: "4",
  }),
  title: css({
    fontSize: "lg",
    fontWeight: "semibold",
    m: "0",
  }),
  cloudWrapper: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
    bg: "bg.default",
    minH: "300px",
  }),
  svgContainer: css({
    w: "full",
    h: "400px",
  }),
  svg: css({
    display: "block",
  }),
  wordText: css({
    cursor: "pointer",
    transition: "opacity 0.2s ease",
    userSelect: "none",
    _hover: {
      opacity: "0.7 !important",
    },
  }),
  selectedInfo: css({
    mt: "4",
    p: "3",
    bg: "bg.subtle",
    rounded: "lg",
    display: "flex",
    alignItems: "center",
    gap: "3",
    flexWrap: "wrap",
  }),
  selectedWord: css({
    fontWeight: "bold",
    fontSize: "md",
  }),
  selectedCount: css({
    color: "fg.muted",
    fontFamily: "mono",
  }),
  selectedPercent: css({
    color: "fg.muted",
  }),
  clearBtn: css({
    ml: "auto",
    px: "3",
    py: "1",
    bg: "bg.muted",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    fontSize: "xs",
    cursor: "pointer",
    _hover: {
      bg: "bg.emphasized",
    },
  }),
  stats: css({
    mt: "3",
    fontSize: "xs",
    color: "fg.muted",
    textAlign: "center",
  }),
  truncated: css({
    ml: "1",
    fontStyle: "italic",
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
    _dark: {
      bg: "red.950",
      color: "red.300",
    },
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<WordCloud />, document.getElementById("app")!);
