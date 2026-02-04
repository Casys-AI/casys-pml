/**
 * Diff Viewer UI for MCP Apps
 *
 * Side-by-side or unified diff display with:
 * - Syntax highlighting for additions/deletions
 * - Line numbers
 * - Collapsible unchanged sections
 * - Navigation between changes
 *
 * @module lib/std/src/ui/diff-viewer
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Grid } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { ButtonGroup } from "../../components/ui/button";
import * as Select from "../../components/ui/select";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffSide {
  content: string;
  filename?: string;
}

interface DiffData {
  filename?: string;
  oldFile?: string;
  newFile?: string;
  hunks?: DiffHunk[];
  unified?: string;
  additions?: number;
  deletions?: number;
  // New fields for syntax highlighting
  left?: DiffSide;
  right?: DiffSide;
  language?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// Syntax Highlighting
// ============================================================================

type SupportedLanguage = "javascript" | "typescript" | "python" | "json" | "css" | "html" | "sql" | "bash" | "plain";

interface SyntaxToken {
  type: "keyword" | "string" | "comment" | "number" | "operator" | "function" | "type" | "plain";
  value: string;
}

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "python",
  ".pyw": "python",
  ".json": "json",
  ".jsonc": "json",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "html",
  ".svg": "html",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "bash",
};

const LANGUAGE_PATTERNS: Record<SupportedLanguage, { patterns: Array<{ regex: RegExp; type: SyntaxToken["type"] }> }> = {
  javascript: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|as|default|async|await|yield|typeof|instanceof|in|of|void|delete|this|super|static|get|set|null|undefined|true|false)\b/g, type: "keyword" },
      { regex: /\b(Array|Object|String|Number|Boolean|Function|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|Math|JSON|console|window|document)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~?:]+/g, type: "operator" },
    ],
  },
  typescript: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|implements|import|export|from|as|default|async|await|yield|typeof|instanceof|in|of|void|delete|this|super|static|get|set|null|undefined|true|false|type|interface|enum|namespace|module|declare|abstract|readonly|private|protected|public|keyof|infer|never|unknown|any)\b/g, type: "keyword" },
      { regex: /\b(Array|Object|String|Number|Boolean|Function|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|Math|JSON|console|Partial|Required|Readonly|Pick|Omit|Record|Exclude|Extract|NonNullable|ReturnType|InstanceType)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~?:]+/g, type: "operator" },
    ],
  },
  python: {
    patterns: [
      { regex: /#.*$/gm, type: "comment" },
      { regex: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, type: "string" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/g, type: "keyword" },
      { regex: /\b(int|float|str|bool|list|dict|tuple|set|frozenset|bytes|bytearray|type|object|range|enumerate|zip|map|filter|print|len|open|input)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?j?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~@]+/g, type: "operator" },
    ],
  },
  json: {
    patterns: [
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1(?=\s*:)/g, type: "keyword" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(true|false|null)\b/g, type: "keyword" },
      { regex: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
    ],
  },
  css: {
    patterns: [
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /(@[a-zA-Z-]+)\b/g, type: "keyword" },
      { regex: /([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)\s*(?=\{)/g, type: "function" },
      { regex: /\b(inherit|initial|unset|revert|none|auto|!important)\b/g, type: "keyword" },
      { regex: /#[0-9a-fA-F]{3,8}\b/g, type: "number" },
      { regex: /-?\b\d+\.?\d*(px|em|rem|%|vh|vw|deg|s|ms)?\b/g, type: "number" },
      { regex: /[:;{}(),]/g, type: "operator" },
    ],
  },
  html: {
    patterns: [
      { regex: /<!--[\s\S]*?-->/g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g, type: "keyword" },
      { regex: /\b([a-zA-Z-]+)(?==)/g, type: "function" },
      { regex: /[<>\/=]/g, type: "operator" },
    ],
  },
  sql: {
    patterns: [
      { regex: /--.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|CASCADE|TRUNCATE|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|EXISTS|CASE|WHEN|THEN|ELSE|END|WITH|RECURSIVE)\b/gi, type: "keyword" },
      { regex: /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|CHAR|VARCHAR|TEXT|BLOB|DATE|TIME|DATETIME|TIMESTAMP|BOOLEAN|BOOL|SERIAL|UUID)\b/gi, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~,;()]+/g, type: "operator" },
    ],
  },
  bash: {
    patterns: [
      { regex: /#.*$/gm, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\$[a-zA-Z_][a-zA-Z0-9_]*/g, type: "function" },
      { regex: /\$\{[^}]+\}/g, type: "function" },
      { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|break|continue|local|export|readonly|declare|typeset|unset|shift|source|alias|unalias|true|false)\b/g, type: "keyword" },
      { regex: /\b(echo|printf|read|cd|pwd|ls|cp|mv|rm|mkdir|rmdir|touch|cat|grep|sed|awk|find|xargs|sort|uniq|wc|head|tail|cut|tr|tee|chmod|chown|sudo|apt|yum|brew|npm|yarn|git|docker|curl|wget)\b/g, type: "type" },
      { regex: /\b\d+\b/g, type: "number" },
      { regex: /[|&;<>()$`\\!]+/g, type: "operator" },
    ],
  },
  plain: {
    patterns: [],
  },
};

function detectLanguage(filename?: string, languageOverride?: string): SupportedLanguage {
  if (languageOverride) {
    const normalized = languageOverride.toLowerCase();
    if (normalized in LANGUAGE_PATTERNS) {
      return normalized as SupportedLanguage;
    }
    // Try common aliases
    if (normalized === "js") return "javascript";
    if (normalized === "ts") return "typescript";
    if (normalized === "py") return "python";
    if (normalized === "sh" || normalized === "shell") return "bash";
  }

  if (filename) {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    if (ext in EXTENSION_TO_LANGUAGE) {
      return EXTENSION_TO_LANGUAGE[ext];
    }
  }

  return "plain";
}

function tokenize(code: string, language: SupportedLanguage): SyntaxToken[] {
  if (language === "plain" || !LANGUAGE_PATTERNS[language]) {
    return [{ type: "plain", value: code }];
  }

  const { patterns } = LANGUAGE_PATTERNS[language];
  const tokens: Array<{ start: number; end: number; type: SyntaxToken["type"]; value: string }> = [];

  // Find all matches for all patterns
  for (const { regex, type } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        value: match[0],
      });
    }
  }

  // Sort by position
  tokens.sort((a, b) => a.start - b.start);

  // Remove overlapping tokens (earlier patterns win)
  const filtered: typeof tokens = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.start >= lastEnd) {
      filtered.push(token);
      lastEnd = token.end;
    }
  }

  // Build result with gaps filled as plain text
  const result: SyntaxToken[] = [];
  let pos = 0;
  for (const token of filtered) {
    if (token.start > pos) {
      result.push({ type: "plain", value: code.slice(pos, token.start) });
    }
    result.push({ type: token.type, value: token.value });
    pos = token.end;
  }
  if (pos < code.length) {
    result.push({ type: "plain", value: code.slice(pos) });
  }

  return result;
}

type ViewMode = "inline" | "side-by-side";

const STORAGE_KEY = "diff-viewer-mode";

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "inline" || stored === "side-by-side") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "inline";
}

function storeViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage not available
  }
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Diff Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Syntax Highlighting Styles
// ============================================================================

const syntaxStyles: Record<SyntaxToken["type"], string> = {
  keyword: css({
    color: "purple.600",
    fontWeight: "medium",
    _dark: { color: "purple.400" },
  }),
  string: css({
    color: "green.700",
    _dark: { color: "green.400" },
  }),
  comment: css({
    color: "gray.500",
    fontStyle: "italic",
    _dark: { color: "gray.400" },
  }),
  number: css({
    color: "orange.600",
    _dark: { color: "orange.400" },
  }),
  operator: css({
    color: "fg.default",
  }),
  function: css({
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  type: css({
    color: "cyan.700",
    _dark: { color: "cyan.400" },
  }),
  plain: css({
    color: "inherit",
  }),
};

// ============================================================================
// Components
// ============================================================================

function HighlightedCode({ content, language }: { content: string; language: SupportedLanguage }) {
  const tokens = useMemo(() => tokenize(content, language), [content, language]);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={syntaxStyles[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}

function UnifiedView({ hunks, language }: { hunks: DiffHunk[]; language: SupportedLanguage }) {
  return (
    <Box overflowX="auto">
      {hunks.map((hunk, hi) => (
        <Box key={hi} borderBottom="1px solid" borderColor="border.subtle" _last={{ borderBottom: "none" }}>
          <Box p="2" bg="blue.50" color="blue.700" fontSize="xs" _dark={{ bg: "blue.950", color: "blue.300" }}>
            {hunk.header}
          </Box>
          {hunk.lines.map((line, li) => (
            <Flex
              key={li}
              minH="24px"
              bg={line.type === "add" ? "green.50" : line.type === "remove" ? "red.50" : line.type === "header" ? "bg.subtle" : undefined}
              _hover={{ bg: line.type === "add" ? "green.100" : line.type === "remove" ? "red.100" : "bg.subtle" }}
              _dark={{
                bg: line.type === "add" ? "green.950/50" : line.type === "remove" ? "red.950/50" : line.type === "header" ? "bg.subtle" : undefined,
                _hover: { bg: line.type === "add" ? "green.900/50" : line.type === "remove" ? "red.900/50" : "bg.subtle" },
              }}
              onClick={() => notifyModel("click", { hunk: hi, line: li, type: line.type })}
            >
              <Box
                w="10"
                px="2"
                py="0.5"
                textAlign="right"
                color="fg.muted"
                bg="bg.subtle"
                borderRight="1px solid"
                borderColor="border.subtle"
                userSelect="none"
                fontSize="xs"
              >
                {line.type === "remove" ? line.oldLine || "" : ""}
              </Box>
              <Box
                w="10"
                px="2"
                py="0.5"
                textAlign="right"
                color="fg.muted"
                bg="bg.subtle"
                borderRight="1px solid"
                borderColor="border.subtle"
                userSelect="none"
                fontSize="xs"
              >
                {line.type === "add" ? line.newLine || "" : ""}
              </Box>
              <Box
                w="10"
                px="2"
                py="0.5"
                textAlign="right"
                color="fg.muted"
                bg="bg.subtle"
                borderRight="1px solid"
                borderColor="border.subtle"
                userSelect="none"
                fontSize="xs"
              >
                {line.type === "context" ? line.oldLine || "" : ""}
              </Box>
              <Box w="5" px="1" py="0.5" textAlign="center" fontWeight="bold" userSelect="none">
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </Box>
              <Box flex="1" px="2" py="0.5" whiteSpace="pre">
                <HighlightedCode content={line.content} language={language} />
              </Box>
            </Flex>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function SplitView({ hunks, language }: { hunks: DiffHunk[]; language: SupportedLanguage }) {
  return (
    <Grid gridTemplateColumns="1fr 1fr">
      {/* Old file (left) */}
      <Box overflowX="auto" borderRight="1px solid" borderColor="border.default">
        <Box p="2" bg="bg.subtle" fontWeight="medium" fontSize="xs" color="fg.muted" borderBottom="1px solid" borderColor="border.default">
          Old
        </Box>
        {hunks.map((hunk, hi) => (
          <Box key={hi} borderBottom="1px solid" borderColor="border.subtle" _last={{ borderBottom: "none" }}>
            {hunk.lines
              .filter((l) => l.type !== "add")
              .map((line, li) => (
                <Flex
                  key={li}
                  minH="24px"
                  bg={line.type === "remove" ? "red.50" : undefined}
                  _hover={{ bg: line.type === "remove" ? "red.100" : "bg.subtle" }}
                  _dark={{
                    bg: line.type === "remove" ? "red.950/50" : undefined,
                    _hover: { bg: line.type === "remove" ? "red.900/50" : "bg.subtle" },
                  }}
                >
                  <Box
                    w="10"
                    px="2"
                    py="0.5"
                    textAlign="right"
                    color="fg.muted"
                    bg="bg.subtle"
                    borderRight="1px solid"
                    borderColor="border.subtle"
                    userSelect="none"
                    fontSize="xs"
                  >
                    {line.oldLine || ""}
                  </Box>
                  <Box flex="1" px="2" py="0.5" whiteSpace="pre">
                    <HighlightedCode content={line.content} language={language} />
                  </Box>
                </Flex>
              ))}
          </Box>
        ))}
      </Box>

      {/* New file (right) */}
      <Box overflowX="auto">
        <Box p="2" bg="bg.subtle" fontWeight="medium" fontSize="xs" color="fg.muted" borderBottom="1px solid" borderColor="border.default">
          New
        </Box>
        {hunks.map((hunk, hi) => (
          <Box key={hi} borderBottom="1px solid" borderColor="border.subtle" _last={{ borderBottom: "none" }}>
            {hunk.lines
              .filter((l) => l.type !== "remove")
              .map((line, li) => (
                <Flex
                  key={li}
                  minH="24px"
                  bg={line.type === "add" ? "green.50" : undefined}
                  _hover={{ bg: line.type === "add" ? "green.100" : "bg.subtle" }}
                  _dark={{
                    bg: line.type === "add" ? "green.950/50" : undefined,
                    _hover: { bg: line.type === "add" ? "green.900/50" : "bg.subtle" },
                  }}
                >
                  <Box
                    w="10"
                    px="2"
                    py="0.5"
                    textAlign="right"
                    color="fg.muted"
                    bg="bg.subtle"
                    borderRight="1px solid"
                    borderColor="border.subtle"
                    userSelect="none"
                    fontSize="xs"
                  >
                    {line.newLine || ""}
                  </Box>
                  <Box flex="1" px="2" py="0.5" whiteSpace="pre">
                    <HighlightedCode content={line.content} language={language} />
                  </Box>
                </Flex>
              ))}
          </Box>
        ))}
      </Box>
    </Grid>
  );
}

interface LanguageItem {
  value: SupportedLanguage;
  label: string;
}

const languageItems: LanguageItem[] = [
  { value: "plain", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
];

function LanguageSelector({
  language,
  onLanguageChange
}: {
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
}) {
  return (
    <Select.Root
      items={languageItems}
      value={[language]}
      onValueChange={(details) => {
        if (details.value[0]) {
          onLanguageChange(details.value[0] as SupportedLanguage);
        }
      }}
      positioning={{ sameWidth: true }}
      size="sm"
    >
      <Select.Control>
        <Select.Trigger className={css({ minW: "120px" })}>
          <Select.ValueText placeholder="Language" />
          <Select.Indicator />
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          {languageItems.map((item) => (
            <Select.Item key={item.value} item={item}>
              <Select.ItemText>{item.label}</Select.ItemText>
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DiffViewer() {
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [currentHunk, setCurrentHunk] = useState(0);
  const [manualLanguage, setManualLanguage] = useState<SupportedLanguage | null>(null);

  // Detect language from filename or override
  const detectedLanguage = useMemo(() => {
    // Priority: manual selection > data.language override > filename detection
    if (manualLanguage) return manualLanguage;
    if (diffData?.language) return detectLanguage(undefined, diffData.language);
    // Try to detect from various filename sources
    const filename = diffData?.filename || diffData?.left?.filename || diffData?.right?.filename || diffData?.newFile || diffData?.oldFile;
    return detectLanguage(filename);
  }, [diffData, manualLanguage]);

  // Handle view mode change with localStorage persistence
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
    notifyModel("viewModeChange", { mode });
  }, []);

  // Handle language change
  const handleLanguageChange = useCallback((lang: SupportedLanguage) => {
    setManualLanguage(lang);
    notifyModel("languageChange", { language: lang });
  }, []);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[diff-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[diff-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setDiffData(null);
          return;
        }

        // Try to parse as JSON first, otherwise treat as unified diff string
        let data: DiffData;
        try {
          data = JSON.parse(textContent.text);
        } catch {
          data = { unified: textContent.text };
        }

        // Parse unified diff string if present
        if (data.unified && !data.hunks) {
          data.hunks = parseUnifiedDiff(data.unified);
        }

        setDiffData(data);
        setCurrentHunk(0);
      } catch (e) {
        setError(`Failed to parse diff: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Stats
  const stats = useMemo(() => {
    if (!diffData?.hunks) return { additions: 0, deletions: 0 };
    let additions = diffData.additions || 0;
    let deletions = diffData.deletions || 0;

    if (!additions && !deletions) {
      for (const hunk of diffData.hunks) {
        for (const line of hunk.lines) {
          if (line.type === "add") additions++;
          if (line.type === "remove") deletions++;
        }
      }
    }

    return { additions, deletions };
  }, [diffData]);

  // Navigation
  const navigateHunk = useCallback((direction: "prev" | "next") => {
    if (!diffData?.hunks) return;
    const newHunk = direction === "next"
      ? Math.min(currentHunk + 1, diffData.hunks.length - 1)
      : Math.max(currentHunk - 1, 0);
    setCurrentHunk(newHunk);
    notifyModel("navigate", { hunk: newHunk, direction });
  }, [diffData, currentHunk]);

  // Render states
  if (loading) {
    return (
      <Box p="4" fontFamily="mono" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="10" textAlign="center" color="fg.muted">Loading diff...</Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="mono" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="4" bg="red.50" color="red.700" rounded="md" _dark={{ bg: "red.950", color: "red.300" }}>{error}</Box>
      </Box>
    );
  }

  if (!diffData?.hunks || diffData.hunks.length === 0) {
    return (
      <Box p="4" fontFamily="mono" fontSize="sm" color="fg.default" bg="bg.canvas">
        <Box p="10" textAlign="center" color="fg.muted">No diff to display</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="mono" fontSize="sm" color="fg.default" bg="bg.canvas">
      {/* Header */}
      <Flex justify="space-between" align="center" mb="3" flexWrap="wrap" gap="2">
        <Flex align="center" gap="3">
          {diffData.filename && <Box fontWeight="semibold" color="fg.default">{diffData.filename}</Box>}
          <Flex gap="2" fontSize="xs">
            <Box color="green.600" _dark={{ color: "green.400" }}>+{stats.additions}</Box>
            <Box color="red.600" _dark={{ color: "red.400" }}>-{stats.deletions}</Box>
          </Flex>
        </Flex>

        <Flex gap="3" align="center">
          {/* Language selector */}
          <LanguageSelector
            language={detectedLanguage}
            onLanguageChange={handleLanguageChange}
          />

          {/* View mode toggle */}
          <ButtonGroup size="sm" variant="outline">
            <Button
              variant={viewMode === "inline" ? "solid" : "outline"}
              onClick={() => handleViewModeChange("inline")}
              title="Inline view: additions and deletions on the same lines"
            >
              <span className={css({ mr: "1", fontSize: "xs", opacity: 0.8 })}>&#9776;</span>
              Inline
            </Button>
            <Button
              variant={viewMode === "side-by-side" ? "solid" : "outline"}
              onClick={() => handleViewModeChange("side-by-side")}
              title="Side-by-side view: old and new files in two columns"
            >
              <span className={css({ mr: "1", fontSize: "xs", opacity: 0.8 })}>&#9871;</span>
              Split
            </Button>
          </ButtonGroup>

          {/* Hunk navigation */}
          {diffData.hunks.length > 1 && (
            <Flex align="center" gap="2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentHunk === 0}
                onClick={() => navigateHunk("prev")}
              >
                Prev
              </Button>
              <Box fontSize="xs" color="fg.muted">
                {currentHunk + 1} / {diffData.hunks.length}
              </Box>
              <Button
                variant="outline"
                size="sm"
                disabled={currentHunk >= diffData.hunks.length - 1}
                onClick={() => navigateHunk("next")}
              >
                Next
              </Button>
            </Flex>
          )}
        </Flex>
      </Flex>

      {/* Diff content */}
      <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden">
        {viewMode === "inline" ? (
          <UnifiedView hunks={diffData.hunks} language={detectedLanguage} />
        ) : (
          <SplitView hunks={diffData.hunks} language={detectedLanguage} />
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function parseUnifiedDiff(unified: string): DiffHunk[] {
  const lines = unified.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -1,3 +1,4 @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentHunk = {
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: line.slice(1), newLine: newLine++ });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "remove", content: line.slice(1), oldLine: oldLine++ });
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({ type: "context", content: line.slice(1) || "", oldLine: oldLine++, newLine: newLine++ });
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<DiffViewer />);
