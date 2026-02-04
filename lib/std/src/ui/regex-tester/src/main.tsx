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

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack, Grid } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

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
    <Badge
      size="sm"
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        bg: isValid ? { base: "green.100", _dark: "green.900/50" } : { base: "red.100", _dark: "red.900/50" },
        color: isValid ? { base: "green.700", _dark: "green.300" } : { base: "red.700", _dark: "red.300" },
      })}
    >
      <Box as="span" fontSize="sm">
        {isValid ? "\u2713" : "\u2717"}
      </Box>
      <Box as="span" maxW="200px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {isValid ? "Valid regex" : error || "Invalid regex"}
      </Box>
    </Badge>
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
        <Box
          as="span"
          key={i}
          bg={segment.highlighted ? { base: "yellow.200", _dark: "yellow.700" } : undefined}
          color={segment.highlighted ? { base: "yellow.900", _dark: "yellow.100" } : undefined}
          px={segment.highlighted ? "0.5" : undefined}
          rounded={segment.highlighted ? "sm" : undefined}
          title={segment.highlighted ? `Match ${segment.matchIndex + 1}` : undefined}
        >
          {segment.text}
        </Box>
      ))}
    </>
  );
}

function MatchesList({ matches }: { matches: MatchResult[] }) {
  if (matches.length === 0) {
    return <Box color="fg.muted" fontStyle="italic" textAlign="center" py="4">No matches found</Box>;
  }

  return (
    <Stack gap="2">
      {matches.map((match, i) => (
        <Box key={i} p="2" bg="bg.subtle" rounded="md" border="1px solid" borderColor="border.subtle">
          <Flex justify="space-between" align="center" mb="1">
            <Box fontWeight="semibold" fontSize="xs" color={{ base: "blue.600", _dark: "blue.400" }}>
              Match {i + 1}
            </Box>
            <Box fontSize="xs" color="fg.muted">at index {match.index}</Box>
          </Flex>
          <Box fontFamily="mono" fontSize="sm" bg="bg.muted" px="2" py="1" rounded="sm" overflowX="auto">
            <code>{match.fullMatch}</code>
          </Box>
          {match.groups.length > 0 && (
            <Box mt="2" pt="2" borderTop="1px solid" borderColor="border.subtle">
              <Box fontSize="xs" fontWeight="medium" color="fg.muted" mb="1">Captured Groups:</Box>
              {match.groups.map((group, gi) => (
                <Flex key={gi} align="center" gap="2" fontSize="xs" py="0.5">
                  <Box color="fg.muted" fontWeight="medium">Group {gi + 1}:</Box>
                  <Box as="code" fontFamily="mono" bg="bg.muted" px="1" rounded="sm">{group ?? "(undefined)"}</Box>
                </Flex>
              ))}
            </Box>
          )}
          {match.namedGroups && Object.keys(match.namedGroups).length > 0 && (
            <Box mt="2" pt="2" borderTop="1px solid" borderColor="border.subtle">
              <Box fontSize="xs" fontWeight="medium" color="fg.muted" mb="1">Named Groups:</Box>
              {Object.entries(match.namedGroups).map(([name, value]) => (
                <Flex key={name} align="center" gap="2" fontSize="xs" py="0.5">
                  <Box color="fg.muted" fontWeight="medium">{name}:</Box>
                  <Box as="code" fontFamily="mono" bg="bg.muted" px="1" rounded="sm">{value ?? "(undefined)"}</Box>
                </Flex>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Stack>
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
    return <Box color="fg.muted" fontStyle="italic">Enter a pattern to see explanation</Box>;
  }

  return (
    <Box p="3" borderTop="1px solid" borderColor="border.default">
      {flagsExplanation.length > 0 && (
        <Box mb="3">
          <Box fontSize="xs" fontWeight="medium" color="fg.muted" mb="1" textTransform="uppercase" letterSpacing="wide">
            Flags:
          </Box>
          {flagsExplanation.map((exp, i) => (
            <Box key={i} fontSize="xs" color="fg.default" py="0.5" fontFamily="mono">{exp}</Box>
          ))}
        </Box>
      )}
      {patternExplanation.length > 0 && (
        <Box>
          <Box fontSize="xs" fontWeight="medium" color="fg.muted" mb="1" textTransform="uppercase" letterSpacing="wide">
            Pattern breakdown:
          </Box>
          <Stack gap="1">
            {patternExplanation.map((part, i) => (
              <Flex
                key={i}
                align="center"
                gap="2"
                py="1"
                borderBottom="1px solid"
                borderColor="border.subtle"
                _last={{ borderBottom: "none" }}
              >
                <Box
                  as="code"
                  fontFamily="mono"
                  fontSize="sm"
                  bg="bg.muted"
                  px="2"
                  py="0.5"
                  rounded="sm"
                  minW="10"
                  textAlign="center"
                  color={{ base: "purple.600", _dark: "purple.400" }}
                >
                  {part.pattern}
                </Box>
                <Box fontSize="xs" color="fg.muted">{part.description}</Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
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
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="4xl" mx="auto">
        <Box p="10" textAlign="center" color="fg.muted">Loading...</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" maxW="4xl" mx="auto">
      {/* Header */}
      <Flex justify="space-between" align="center" mb="4" pb="3" borderBottom="1px solid" borderColor="border.default">
        <Box as="h1" fontSize="xl" fontWeight="semibold" m="0">Regex Tester</Box>
        <ValidityIndicator isValid={isValid} error={error} />
      </Flex>

      {/* Pattern Input */}
      <Box mb="4">
        <Box as="label" display="block" mb="1" fontWeight="medium" color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
          Pattern
        </Box>
        <Flex
          align="center"
          bg="bg.subtle"
          border="1px solid"
          borderColor="border.default"
          rounded="md"
          overflow="hidden"
          _focusWithin={{ borderColor: "blue.500", ring: "2", ringColor: "blue.500/20" }}
        >
          <Box px="2" color="fg.muted" fontFamily="mono" fontSize="md" fontWeight="bold">/</Box>
          <Box
            as="input"
            type="text"
            flex="1"
            px="2"
            py="2"
            bg="transparent"
            border="none"
            outline="none"
            fontFamily="mono"
            fontSize="sm"
            color="fg.default"
            value={pattern}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePatternChange(e.target.value)}
            placeholder="Enter regex pattern..."
            spellcheck={false}
          />
          <Box px="2" color="fg.muted" fontFamily="mono" fontSize="md" fontWeight="bold">/</Box>
          <Box
            as="input"
            type="text"
            w="16"
            px="2"
            py="2"
            bg="bg.muted"
            border="none"
            borderLeft="1px solid"
            borderColor="border.default"
            outline="none"
            fontFamily="mono"
            fontSize="sm"
            color="fg.default"
            textAlign="center"
            value={flags}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFlagsChange(e.target.value)}
            placeholder="flags"
            maxLength={6}
          />
        </Flex>
      </Box>

      {/* Flag Toggles */}
      <Box mb="4">
        <Box as="label" display="block" mb="1" fontWeight="medium" color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
          Flags
        </Box>
        <Flex flexWrap="wrap" gap="2">
          {[
            { flag: "g", label: "Global", desc: "Find all matches" },
            { flag: "i", label: "Case-insensitive", desc: "Ignore case" },
            { flag: "m", label: "Multiline", desc: "^ and $ match lines" },
            { flag: "s", label: "Dotall", desc: ". matches newlines" },
            { flag: "u", label: "Unicode", desc: "Unicode mode" },
          ].map(({ flag, label, desc }) => (
            <Button
              key={flag}
              variant={flags.includes(flag) ? "solid" : "outline"}
              size="xs"
              onClick={() => toggleFlag(flag)}
              title={desc}
            >
              <Box as="span" fontFamily="mono" fontWeight="bold">{flag}</Box>
              <Box as="span" fontSize="xs" color="fg.muted">{label}</Box>
            </Button>
          ))}
        </Flex>
      </Box>

      {/* Test String */}
      <Box mb="4">
        <Box as="label" display="block" mb="1" fontWeight="medium" color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
          Test String
        </Box>
        <Box
          as="textarea"
          w="full"
          px="3"
          py="2"
          bg="bg.subtle"
          border="1px solid"
          borderColor="border.default"
          rounded="md"
          fontFamily="mono"
          fontSize="sm"
          color="fg.default"
          resize="vertical"
          minH="120px"
          value={testString}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleTestStringChange(e.target.value)}
          placeholder="Enter text to test against the regex..."
          spellcheck={false}
          className={css({ _focus: { outline: "none", borderColor: "blue.500", ring: "2", ringColor: "blue.500/20" } })}
        />
      </Box>

      {/* Results Section */}
      <Grid gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="4" mb="4">
        {/* Highlighted Preview */}
        <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden">
          <Flex justify="space-between" align="center" px="3" py="2" bg="bg.subtle" borderBottom="1px solid" borderColor="border.default" fontWeight="medium" fontSize="sm">
            <Box>Highlighted Matches</Box>
            <Box fontSize="xs" color="fg.muted" bg="bg.muted" px="2" py="0.5" rounded="full">
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </Box>
          </Flex>
          <Box p="3" maxH="300px" overflowY="auto">
            {testString ? (
              <Box as="pre" m="0" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all" lineHeight="1.6">
                <HighlightedText text={testString} matches={matches} />
              </Box>
            ) : (
              <Box color="fg.muted" fontStyle="italic">Enter a test string to see matches</Box>
            )}
          </Box>
        </Box>

        {/* Matches List */}
        <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden">
          <Flex justify="space-between" align="center" px="3" py="2" bg="bg.subtle" borderBottom="1px solid" borderColor="border.default" fontWeight="medium" fontSize="sm">
            <Box>Match Details</Box>
          </Flex>
          <Box p="3" maxH="300px" overflowY="auto">
            <MatchesList matches={matches} />
          </Box>
        </Box>
      </Grid>

      {/* Explanation Panel */}
      <Box border="1px solid" borderColor="border.default" rounded="lg" overflow="hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowExplanation(!showExplanation)}
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
            w: "full",
            bg: "bg.subtle",
            fontWeight: "medium",
            textAlign: "left",
            justifyContent: "flex-start",
            rounded: "0",
            _hover: { bg: "bg.muted" },
          })}
        >
          <Box as="span" fontSize="xs" color="fg.muted">
            {showExplanation ? "\u25BC" : "\u25B6"}
          </Box>
          Regex Explanation
        </Button>
        {showExplanation && (
          <ExplanationPanel pattern={pattern} flags={flags} />
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<RegexTester />);
