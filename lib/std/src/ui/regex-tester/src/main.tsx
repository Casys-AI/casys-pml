/**
 * Regex Tester UI for MCP Apps
 *
 * Interactive regex testing with:
 * - Pattern and flags input
 * - Test string textarea
 * - Highlighted matches in text
 * - Captured groups list
 * - Validity indicator
 * - Basic natural language explanation
 *
 * @module lib/std/src/ui/regex-tester
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface RegexTesterProps {
  pattern?: string;
  flags?: string;
  testString?: string;
}

interface MatchResult {
  fullMatch: string;
  index: number;
  groups: string[];
  namedGroups?: Record<string, string>;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Regex Tester", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Regex Explanation
// ============================================================================

interface ExplanationPart {
  pattern: string;
  description: string;
}

function explainRegex(pattern: string): ExplanationPart[] {
  const explanations: ExplanationPart[] = [];

  // Common regex patterns and their explanations
  const patterns: Array<{ regex: RegExp; explain: (match: RegExpMatchArray) => string }> = [
    { regex: /^\^/, explain: () => "Start of string/line" },
    { regex: /\$$/, explain: () => "End of string/line" },
    { regex: /\\d/, explain: () => "Any digit (0-9)" },
    { regex: /\\D/, explain: () => "Any non-digit" },
    { regex: /\\w/, explain: () => "Any word character (a-z, A-Z, 0-9, _)" },
    { regex: /\\W/, explain: () => "Any non-word character" },
    { regex: /\\s/, explain: () => "Any whitespace" },
    { regex: /\\S/, explain: () => "Any non-whitespace" },
    { regex: /\\b/, explain: () => "Word boundary" },
    { regex: /\\B/, explain: () => "Non-word boundary" },
    { regex: /\\n/, explain: () => "Newline" },
    { regex: /\\t/, explain: () => "Tab" },
    { regex: /\\r/, explain: () => "Carriage return" },
    { regex: /\./, explain: () => "Any character (except newline)" },
    { regex: /\[\^([^\]]+)\]/, explain: (m) => `Any character NOT in: ${m[1]}` },
    { regex: /\[([^\]]+)\]/, explain: (m) => `Any character in: ${m[1]}` },
    { regex: /\((\?:)([^)]+)\)/, explain: (m) => `Non-capturing group: ${m[2]}` },
    { regex: /\((\?=)([^)]+)\)/, explain: (m) => `Positive lookahead: ${m[2]}` },
    { regex: /\((\?!)([^)]+)\)/, explain: (m) => `Negative lookahead: ${m[2]}` },
    { regex: /\((\?<=)([^)]+)\)/, explain: (m) => `Positive lookbehind: ${m[2]}` },
    { regex: /\((\?<!)([^)]+)\)/, explain: (m) => `Negative lookbehind: ${m[2]}` },
    { regex: /\((\?<)(\w+)>([^)]+)\)/, explain: (m) => `Named group "${m[2]}": ${m[3]}` },
    { regex: /\(([^)?][^)]*)\)/, explain: (m) => `Capturing group: ${m[1]}` },
    { regex: /\{(\d+),(\d+)\}/, explain: (m) => `Between ${m[1]} and ${m[2]} times` },
    { regex: /\{(\d+),\}/, explain: (m) => `${m[1]} or more times` },
    { regex: /\{(\d+)\}/, explain: (m) => `Exactly ${m[1]} times` },
    { regex: /\+\?/, explain: () => "1 or more (lazy)" },
    { regex: /\*\?/, explain: () => "0 or more (lazy)" },
    { regex: /\?\?/, explain: () => "0 or 1 (lazy)" },
    { regex: /\+/, explain: () => "1 or more times" },
    { regex: /\*/, explain: () => "0 or more times" },
    { regex: /\?/, explain: () => "0 or 1 time (optional)" },
    { regex: /\|/, explain: () => "OR (alternation)" },
    { regex: /\\(\d+)/, explain: (m) => `Backreference to group ${m[1]}` },
  ];

  let remaining = pattern;
  let position = 0;

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, explain } of patterns) {
      const match = remaining.match(regex);
      if (match && match.index === 0) {
        explanations.push({
          pattern: match[0],
          description: explain(match),
        });
        remaining = remaining.slice(match[0].length);
        position += match[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Literal character
      const char = remaining[0];
      if (char === "\\") {
        // Escaped character
        const escaped = remaining.slice(0, 2);
        explanations.push({
          pattern: escaped,
          description: `Literal "${escaped[1]}"`,
        });
        remaining = remaining.slice(2);
        position += 2;
      } else {
        explanations.push({
          pattern: char,
          description: `Literal "${char}"`,
        });
        remaining = remaining.slice(1);
        position += 1;
      }
    }
  }

  return explanations;
}

function explainFlags(flags: string): string[] {
  const explanations: string[] = [];
  if (flags.includes("g")) explanations.push("g: Global (find all matches)");
  if (flags.includes("i")) explanations.push("i: Case-insensitive");
  if (flags.includes("m")) explanations.push("m: Multiline (^ and $ match line boundaries)");
  if (flags.includes("s")) explanations.push("s: Dotall (. matches newlines)");
  if (flags.includes("u")) explanations.push("u: Unicode mode");
  if (flags.includes("y")) explanations.push("y: Sticky (match at lastIndex)");
  if (flags.includes("d")) explanations.push("d: Indices (include match indices)");
  return explanations;
}

// ============================================================================
// Components
// ============================================================================

function ValidityIndicator({ isValid, error }: { isValid: boolean; error: string | null }) {
  return (
    <div class={css(styles.validity, isValid ? styles.validityValid : styles.validityInvalid)}>
      <span class={styles.validityIcon}>
        {isValid ? "\u2713" : "\u2717"}
      </span>
      <span class={styles.validityText}>
        {isValid ? "Valid regex" : error || "Invalid regex"}
      </span>
    </div>
  );
}

function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: MatchResult[];
}) {
  if (matches.length === 0) {
    return <span>{text}</span>;
  }

  // Build segments with highlighting
  const segments: Array<{ text: string; highlighted: boolean; matchIndex: number }> = [];
  let lastEnd = 0;

  // Sort matches by index
  const sortedMatches = [...matches].sort((a, b) => a.index - b.index);

  for (let i = 0; i < sortedMatches.length; i++) {
    const match = sortedMatches[i];

    // Add text before this match
    if (match.index > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, match.index),
        highlighted: false,
        matchIndex: -1,
      });
    }

    // Add the match
    segments.push({
      text: match.fullMatch,
      highlighted: true,
      matchIndex: i,
    });

    lastEnd = match.index + match.fullMatch.length;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
      highlighted: false,
      matchIndex: -1,
    });
  }

  return (
    <>
      {segments.map((segment, i) => (
        <span
          key={i}
          class={segment.highlighted ? styles.highlight : undefined}
          title={segment.highlighted ? `Match ${segment.matchIndex + 1}` : undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function MatchesList({ matches }: { matches: MatchResult[] }) {
  if (matches.length === 0) {
    return <div class={styles.noMatches}>No matches found</div>;
  }

  return (
    <div class={styles.matchesList}>
      {matches.map((match, i) => (
        <div key={i} class={styles.matchItem}>
          <div class={styles.matchHeader}>
            <span class={styles.matchNumber}>Match {i + 1}</span>
            <span class={styles.matchIndex}>at index {match.index}</span>
          </div>
          <div class={styles.matchValue}>
            <code>{match.fullMatch}</code>
          </div>
          {match.groups.length > 0 && (
            <div class={styles.groupsList}>
              <div class={styles.groupsHeader}>Captured Groups:</div>
              {match.groups.map((group, gi) => (
                <div key={gi} class={styles.groupItem}>
                  <span class={styles.groupNumber}>Group {gi + 1}:</span>
                  <code class={styles.groupValue}>{group ?? "(undefined)"}</code>
                </div>
              ))}
            </div>
          )}
          {match.namedGroups && Object.keys(match.namedGroups).length > 0 && (
            <div class={styles.groupsList}>
              <div class={styles.groupsHeader}>Named Groups:</div>
              {Object.entries(match.namedGroups).map(([name, value]) => (
                <div key={name} class={styles.groupItem}>
                  <span class={styles.groupNumber}>{name}:</span>
                  <code class={styles.groupValue}>{value ?? "(undefined)"}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ExplanationPanel({ pattern, flags }: { pattern: string; flags: string }) {
  const patternExplanation = useMemo(() => {
    if (!pattern) return [];
    try {
      return explainRegex(pattern);
    } catch {
      return [];
    }
  }, [pattern]);

  const flagsExplanation = useMemo(() => explainFlags(flags), [flags]);

  if (!pattern && !flags) {
    return <div class={styles.noExplanation}>Enter a pattern to see explanation</div>;
  }

  return (
    <div class={styles.explanation}>
      {flagsExplanation.length > 0 && (
        <div class={styles.flagsExplanation}>
          <div class={styles.explanationHeader}>Flags:</div>
          {flagsExplanation.map((exp, i) => (
            <div key={i} class={styles.flagItem}>{exp}</div>
          ))}
        </div>
      )}
      {patternExplanation.length > 0 && (
        <div class={styles.patternExplanation}>
          <div class={styles.explanationHeader}>Pattern breakdown:</div>
          <div class={styles.explanationList}>
            {patternExplanation.map((part, i) => (
              <div key={i} class={styles.explanationItem}>
                <code class={styles.explanationPattern}>{part.pattern}</code>
                <span class={styles.explanationDesc}>{part.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function RegexTester() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [testString, setTestString] = useState("");
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  // Validate and compile regex
  const { regex, error, isValid } = useMemo(() => {
    if (!pattern) {
      return { regex: null, error: null, isValid: true };
    }
    try {
      const r = new RegExp(pattern, flags);
      return { regex: r, error: null, isValid: true };
    } catch (e) {
      return {
        regex: null,
        error: e instanceof Error ? e.message : "Invalid regex",
        isValid: false,
      };
    }
  }, [pattern, flags]);

  // Find matches
  const matches = useMemo((): MatchResult[] => {
    if (!regex || !testString) return [];

    const results: MatchResult[] = [];

    if (flags.includes("g")) {
      // Global flag: find all matches
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(testString)) !== null) {
        results.push({
          fullMatch: match[0],
          index: match.index,
          groups: match.slice(1),
          namedGroups: match.groups,
        });
        // Prevent infinite loop on zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      // Non-global: find first match only
      const match = regex.exec(testString);
      if (match) {
        results.push({
          fullMatch: match[0],
          index: match.index,
          groups: match.slice(1),
          namedGroups: match.groups,
        });
      }
    }

    return results;
  }, [regex, testString, flags]);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[regex-tester] Connected to MCP host");
    }).catch(() => {
      console.log("[regex-tester] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) return;

        // Try to parse as JSON for props
        try {
          const data = JSON.parse(textContent.text) as RegexTesterProps;
          if (data.pattern !== undefined) setPattern(data.pattern);
          if (data.flags !== undefined) setFlags(data.flags);
          if (data.testString !== undefined) setTestString(data.testString);
        } catch {
          // Not JSON, use as test string
          setTestString(textContent.text);
        }
      } catch (e) {
        console.error("[regex-tester] Error parsing input:", e);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);

    // Set loading to false after a short delay if no MCP connection
    const timeout = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timeout);
  }, []);

  // Handle input changes with model notification
  const handlePatternChange = useCallback((value: string) => {
    setPattern(value);
    notifyModel("patternChange", { pattern: value });
  }, []);

  const handleFlagsChange = useCallback((value: string) => {
    // Filter to valid flags only
    const validFlags = value.split("").filter((f) => "gimsuy".includes(f)).join("");
    setFlags(validFlags);
    notifyModel("flagsChange", { flags: validFlags });
  }, []);

  const handleTestStringChange = useCallback((value: string) => {
    setTestString(value);
    notifyModel("testStringChange", { testString: value });
  }, []);

  // Flag toggles
  const toggleFlag = useCallback((flag: string) => {
    const newFlags = flags.includes(flag)
      ? flags.replace(flag, "")
      : flags + flag;
    handleFlagsChange(newFlags);
  }, [flags, handleFlagsChange]);

  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <h1 class={styles.title}>Regex Tester</h1>
        <ValidityIndicator isValid={isValid} error={error} />
      </div>

      {/* Pattern Input */}
      <div class={styles.inputSection}>
        <label class={styles.label}>Pattern</label>
        <div class={styles.patternInputWrapper}>
          <span class={styles.patternDelimiter}>/</span>
          <input
            type="text"
            class={styles.patternInput}
            value={pattern}
            onInput={(e) => handlePatternChange((e.target as HTMLInputElement).value)}
            placeholder="Enter regex pattern..."
            spellcheck={false}
          />
          <span class={styles.patternDelimiter}>/</span>
          <input
            type="text"
            class={styles.flagsInput}
            value={flags}
            onInput={(e) => handleFlagsChange((e.target as HTMLInputElement).value)}
            placeholder="flags"
            maxLength={6}
          />
        </div>
      </div>

      {/* Flag Toggles */}
      <div class={styles.flagsSection}>
        <label class={styles.label}>Flags</label>
        <div class={styles.flagToggles}>
          {[
            { flag: "g", label: "Global", desc: "Find all matches" },
            { flag: "i", label: "Case-insensitive", desc: "Ignore case" },
            { flag: "m", label: "Multiline", desc: "^ and $ match lines" },
            { flag: "s", label: "Dotall", desc: ". matches newlines" },
            { flag: "u", label: "Unicode", desc: "Unicode mode" },
          ].map(({ flag, label, desc }) => (
            <button
              key={flag}
              class={css(styles.flagToggle, flags.includes(flag) && styles.flagToggleActive)}
              onClick={() => toggleFlag(flag)}
              title={desc}
            >
              <span class={styles.flagToggleKey}>{flag}</span>
              <span class={styles.flagToggleLabel}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Test String */}
      <div class={styles.inputSection}>
        <label class={styles.label}>Test String</label>
        <textarea
          class={styles.testStringInput}
          value={testString}
          onInput={(e) => handleTestStringChange((e.target as HTMLTextAreaElement).value)}
          placeholder="Enter text to test against the regex..."
          rows={6}
          spellcheck={false}
        />
      </div>

      {/* Results Section */}
      <div class={styles.resultsSection}>
        {/* Highlighted Preview */}
        <div class={styles.resultPanel}>
          <div class={styles.panelHeader}>
            <span>Highlighted Matches</span>
            <span class={styles.matchCount}>
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div class={styles.previewArea}>
            {testString ? (
              <pre class={styles.previewText}>
                <HighlightedText text={testString} matches={matches} />
              </pre>
            ) : (
              <div class={styles.placeholder}>Enter a test string to see matches</div>
            )}
          </div>
        </div>

        {/* Matches List */}
        <div class={styles.resultPanel}>
          <div class={styles.panelHeader}>
            <span>Match Details</span>
          </div>
          <div class={styles.matchesArea}>
            <MatchesList matches={matches} />
          </div>
        </div>
      </div>

      {/* Explanation Panel */}
      <div class={styles.explanationSection}>
        <button
          class={styles.explanationToggle}
          onClick={() => setShowExplanation(!showExplanation)}
        >
          <span class={styles.explanationToggleIcon}>
            {showExplanation ? "\u25BC" : "\u25B6"}
          </span>
          Regex Explanation
        </button>
        {showExplanation && (
          <ExplanationPanel pattern={pattern} flags={flags} />
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
    maxW: "4xl",
    mx: "auto",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "4",
    pb: "3",
    borderBottom: "1px solid",
    borderColor: "border.default",
  }),
  title: css({
    fontSize: "xl",
    fontWeight: "semibold",
    m: "0",
  }),
  validity: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    px: "3",
    py: "1",
    rounded: "full",
    fontSize: "xs",
    fontWeight: "medium",
  }),
  validityValid: css({
    bg: "green.100",
    color: "green.700",
    _dark: { bg: "green.900/50", color: "green.300" },
  }),
  validityInvalid: css({
    bg: "red.100",
    color: "red.700",
    _dark: { bg: "red.900/50", color: "red.300" },
  }),
  validityIcon: css({
    fontSize: "sm",
  }),
  validityText: css({
    maxW: "200px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  inputSection: css({
    mb: "4",
  }),
  label: css({
    display: "block",
    mb: "1",
    fontWeight: "medium",
    color: "fg.muted",
    fontSize: "xs",
    textTransform: "uppercase",
    letterSpacing: "wide",
  }),
  patternInputWrapper: css({
    display: "flex",
    alignItems: "center",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    overflow: "hidden",
    _focusWithin: { borderColor: "blue.500", ring: "2", ringColor: "blue.500/20" },
  }),
  patternDelimiter: css({
    px: "2",
    color: "fg.muted",
    fontFamily: "mono",
    fontSize: "md",
    fontWeight: "bold",
  }),
  patternInput: css({
    flex: 1,
    px: "2",
    py: "2",
    bg: "transparent",
    border: "none",
    outline: "none",
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
  }),
  flagsInput: css({
    w: "16",
    px: "2",
    py: "2",
    bg: "bg.muted",
    border: "none",
    borderLeft: "1px solid",
    borderColor: "border.default",
    outline: "none",
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
    textAlign: "center",
  }),
  flagsSection: css({
    mb: "4",
  }),
  flagToggles: css({
    display: "flex",
    flexWrap: "wrap",
    gap: "2",
  }),
  flagToggle: css({
    display: "flex",
    alignItems: "center",
    gap: "1",
    px: "3",
    py: "1.5",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    cursor: "pointer",
    transition: "all 0.15s",
    _hover: { bg: "bg.muted" },
  }),
  flagToggleActive: css({
    bg: "blue.100",
    borderColor: "blue.300",
    color: "blue.700",
    _hover: { bg: "blue.200" },
    _dark: { bg: "blue.900/50", borderColor: "blue.700", color: "blue.300" },
  }),
  flagToggleKey: css({
    fontFamily: "mono",
    fontWeight: "bold",
  }),
  flagToggleLabel: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  testStringInput: css({
    w: "full",
    px: "3",
    py: "2",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
    resize: "vertical",
    minH: "120px",
    _focus: { outline: "none", borderColor: "blue.500", ring: "2", ringColor: "blue.500/20" },
  }),
  resultsSection: css({
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "4",
    mb: "4",
    "@media (max-width: 768px)": {
      gridTemplateColumns: "1fr",
    },
  }),
  resultPanel: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  panelHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    px: "3",
    py: "2",
    bg: "bg.subtle",
    borderBottom: "1px solid",
    borderColor: "border.default",
    fontWeight: "medium",
    fontSize: "sm",
  }),
  matchCount: css({
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.muted",
    px: "2",
    py: "0.5",
    rounded: "full",
  }),
  previewArea: css({
    p: "3",
    maxH: "300px",
    overflowY: "auto",
  }),
  previewText: css({
    m: "0",
    fontFamily: "mono",
    fontSize: "sm",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    lineHeight: "1.6",
  }),
  highlight: css({
    bg: "yellow.200",
    color: "yellow.900",
    px: "0.5",
    rounded: "sm",
    _dark: { bg: "yellow.700", color: "yellow.100" },
  }),
  placeholder: css({
    color: "fg.muted",
    fontStyle: "italic",
  }),
  matchesArea: css({
    p: "3",
    maxH: "300px",
    overflowY: "auto",
  }),
  matchesList: css({
    display: "flex",
    flexDirection: "column",
    gap: "2",
  }),
  matchItem: css({
    p: "2",
    bg: "bg.subtle",
    rounded: "md",
    border: "1px solid",
    borderColor: "border.subtle",
  }),
  matchHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "1",
  }),
  matchNumber: css({
    fontWeight: "semibold",
    fontSize: "xs",
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  matchIndex: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  matchValue: css({
    fontFamily: "mono",
    fontSize: "sm",
    bg: "bg.muted",
    px: "2",
    py: "1",
    rounded: "sm",
    overflowX: "auto",
  }),
  groupsList: css({
    mt: "2",
    pt: "2",
    borderTop: "1px solid",
    borderColor: "border.subtle",
  }),
  groupsHeader: css({
    fontSize: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    mb: "1",
  }),
  groupItem: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    fontSize: "xs",
    py: "0.5",
  }),
  groupNumber: css({
    color: "fg.muted",
    fontWeight: "medium",
  }),
  groupValue: css({
    fontFamily: "mono",
    bg: "bg.muted",
    px: "1",
    rounded: "sm",
  }),
  noMatches: css({
    color: "fg.muted",
    fontStyle: "italic",
    textAlign: "center",
    py: "4",
  }),
  explanationSection: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
  }),
  explanationToggle: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    w: "full",
    px: "3",
    py: "2",
    bg: "bg.subtle",
    border: "none",
    cursor: "pointer",
    fontWeight: "medium",
    fontSize: "sm",
    textAlign: "left",
    color: "fg.default",
    _hover: { bg: "bg.muted" },
  }),
  explanationToggleIcon: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  explanation: css({
    p: "3",
    borderTop: "1px solid",
    borderColor: "border.default",
  }),
  noExplanation: css({
    color: "fg.muted",
    fontStyle: "italic",
  }),
  flagsExplanation: css({
    mb: "3",
  }),
  explanationHeader: css({
    fontSize: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    mb: "1",
    textTransform: "uppercase",
    letterSpacing: "wide",
  }),
  flagItem: css({
    fontSize: "xs",
    color: "fg.default",
    py: "0.5",
    fontFamily: "mono",
  }),
  patternExplanation: css({}),
  explanationList: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
  }),
  explanationItem: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    py: "1",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
    _last: { borderBottom: "none" },
  }),
  explanationPattern: css({
    fontFamily: "mono",
    fontSize: "sm",
    bg: "bg.muted",
    px: "2",
    py: "0.5",
    rounded: "sm",
    minW: "10",
    textAlign: "center",
    color: "purple.600",
    _dark: { color: "purple.400" },
  }),
  explanationDesc: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  loading: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<RegexTester />, document.getElementById("app")!);
