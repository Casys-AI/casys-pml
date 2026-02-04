/**
 * Validation Result UI - Schema validation results display
 *
 * Displays validation results with:
 * - Global status (valid/invalid) with error count
 * - Error list with JSON path, message, and details
 * - Expected vs actual values comparison
 * - Filtering by error type/keyword
 * - Correction suggestions when possible
 *
 * @module lib/std/src/ui/validation-result
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Stack } from "../../styled-system/jsx";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  expected?: unknown;
  actual?: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  schema?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Validation Result", version: "1.0.0" });
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

const keywordConfig: Record<string, { icon: string; label: string; suggestion?: string }> = {
  required: { icon: "!", label: "Required", suggestion: "Add the missing property to your data" },
  type: { icon: "T", label: "Type", suggestion: "Convert the value to the expected type" },
  format: { icon: "F", label: "Format", suggestion: "Ensure the value matches the expected format" },
  enum: { icon: "E", label: "Enum", suggestion: "Use one of the allowed values" },
  pattern: { icon: "R", label: "Pattern", suggestion: "Ensure the value matches the required pattern" },
  minLength: { icon: "#", label: "Min Length", suggestion: "Provide a longer value" },
  maxLength: { icon: "#", label: "Max Length", suggestion: "Provide a shorter value" },
  minimum: { icon: "<", label: "Minimum", suggestion: "Provide a larger value" },
  maximum: { icon: ">", label: "Maximum", suggestion: "Provide a smaller value" },
  minItems: { icon: "[", label: "Min Items", suggestion: "Add more items to the array" },
  maxItems: { icon: "]", label: "Max Items", suggestion: "Remove some items from the array" },
  uniqueItems: { icon: "U", label: "Unique", suggestion: "Remove duplicate items from the array" },
  additionalProperties: { icon: "+", label: "Extra Props", suggestion: "Remove unexpected properties" },
  const: { icon: "=", label: "Const", suggestion: "Use the exact expected value" },
  oneOf: { icon: "1", label: "One Of", suggestion: "Data must match exactly one schema" },
  anyOf: { icon: "*", label: "Any Of", suggestion: "Data must match at least one schema" },
  allOf: { icon: "&", label: "All Of", suggestion: "Data must match all schemas" },
};

function getKeywordInfo(keyword?: string) {
  if (!keyword) return { icon: "?", label: "Error", suggestion: undefined };
  return keywordConfig[keyword] || { icon: "?", label: keyword, suggestion: undefined };
}

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getUniqueKeywords(errors: ValidationError[]): string[] {
  const keywords = new Set<string>();
  errors.forEach((e) => {
    if (e.keyword) keywords.add(e.keyword);
  });
  return Array.from(keywords).sort();
}

// ============================================================================
// Components
// ============================================================================

function GlobalStatus({ valid, errorCount }: { valid: boolean; errorCount: number }) {
  return (
    <Flex
      align="center"
      gap="3"
      p="4"
      rounded="lg"
      mb="4"
      bg={valid ? "green.100" : "red.100"}
      _dark={{ bg: valid ? "green.900/30" : "red.900/30" }}
    >
      <Flex
        align="center"
        justify="center"
        w="40px"
        h="40px"
        rounded="full"
        bg="white"
        _dark={{ bg: "black/20" }}
      >
        {valid ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </Flex>
      <Stack gap="0.5">
        <span className={css({ fontSize: "lg", fontWeight: "bold", letterSpacing: "wide" })}>
          {valid ? "VALID" : "INVALID"}
        </span>
        {!valid && errorCount > 0 && (
          <span className={css({ fontSize: "sm", color: "fg.muted" })}>
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
      </Stack>
    </Flex>
  );
}

function ErrorItem({ error, onCopy }: { error: ValidationError; onCopy: (text: string) => void }) {
  const keywordInfo = getKeywordInfo(error.keyword);
  const hasExpectedActual = error.expected !== undefined || error.actual !== undefined;

  return (
    <Box
      bg="bg.subtle"
      rounded="md"
      overflow="hidden"
      cursor="pointer"
      transition="all 0.15s"
      border="1px solid"
      borderColor="transparent"
      _hover={{ borderColor: "red.300", _dark: { borderColor: "red.700" } }}
      onClick={() => {
        notifyModel("select-error", { path: error.path, keyword: error.keyword });
        onCopy(error.path);
      }}
    >
      {/* Path header */}
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        bg="red.50"
        borderBottom="1px solid"
        borderColor="red.100"
        _dark={{ bg: "red.900/20", borderColor: "red.900/40" }}
      >
        <Flex align="center" color="red.500" flexShrink={0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </Flex>
        <code className={css({ fontFamily: "mono", fontSize: "xs", fontWeight: "semibold", color: "red.700", _dark: { color: "red.400" } })}>
          {error.path}
        </code>
      </Flex>

      {/* Error message */}
      <Flex gap="3" p="3">
        <Flex
          align="center"
          justify="center"
          w="24px"
          h="24px"
          rounded="md"
          bg="gray.200"
          color="gray.700"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="bold"
          flexShrink={0}
          _dark={{ bg: "gray.700", color: "gray.300" }}
          title={keywordInfo.label}
        >
          {keywordInfo.icon}
        </Flex>
        <Box flex="1" minW="0">
          <Flex align="baseline" gap="2" flexWrap="wrap" lineHeight="1.5">
            {error.keyword && (
              <span className={css({ fontFamily: "mono", fontSize: "xs", color: "fg.muted", bg: "bg.muted", px: "1.5", py: "0.5", rounded: "sm" })}>
                "{error.keyword}"
              </span>
            )}
            <span>{error.message}</span>
          </Flex>

          {/* Expected vs Actual */}
          {hasExpectedActual && (
            <Stack mt="2" gap="1" pl="2" borderLeft="2px solid" borderColor="border.default">
              {error.expected !== undefined && (
                <Flex align="baseline" gap="2">
                  <span className={css({ fontSize: "xs", color: "fg.muted", fontWeight: "medium", minW: "60px" })}>Expected:</span>
                  <code className={css({ fontFamily: "mono", fontSize: "xs", color: "green.700", _dark: { color: "green.400" } })}>
                    {formatValue(error.expected)}
                  </code>
                </Flex>
              )}
              {error.actual !== undefined && (
                <Flex align="baseline" gap="2">
                  <span className={css({ fontSize: "xs", color: "fg.muted", fontWeight: "medium", minW: "60px" })}>Got:</span>
                  <code className={css({ fontFamily: "mono", fontSize: "xs", color: "red.600", _dark: { color: "red.400" } })}>
                    {formatValue(error.actual)}
                  </code>
                </Flex>
              )}
            </Stack>
          )}

          {/* Suggestion */}
          {keywordInfo.suggestion && (
            <Flex
              align="flex-start"
              gap="1.5"
              mt="2"
              fontSize="xs"
              color="blue.700"
              bg="blue.50"
              px="2"
              py="1.5"
              rounded="sm"
              _dark={{ color: "blue.300", bg: "blue.900/30" }}
            >
              <Flex align="center" flexShrink={0} mt="1px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 017 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
                </svg>
              </Flex>
              <span>{keywordInfo.suggestion}</span>
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

function FilterBar({
  keywords,
  selectedKeyword,
  onSelect,
}: {
  keywords: string[];
  selectedKeyword: string | null;
  onSelect: (keyword: string | null) => void;
}) {
  if (keywords.length <= 1) return null;

  return (
    <Flex align="center" gap="2" mb="3" flexWrap="wrap">
      <span className={css({ fontSize: "xs", color: "fg.muted", fontWeight: "medium" })}>Filter:</span>
      <Button
        variant={!selectedKeyword ? "solid" : "outline"}
        size="xs"
        onClick={() => onSelect(null)}
      >
        All
      </Button>
      {keywords.map((kw) => {
        const info = getKeywordInfo(kw);
        return (
          <Button
            key={kw}
            variant={selectedKeyword === kw ? "solid" : "outline"}
            size="xs"
            onClick={() => onSelect(kw)}
          >
            <span className={css({ fontFamily: "mono", fontSize: "10px", fontWeight: "bold" })}>{info.icon}</span>
            {info.label}
          </Button>
        );
      })}
    </Flex>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ValidationResultViewer() {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          setData(parsed);
        }
      } catch (e) {
        console.error("Failed to parse validation result", e);
      }
    };
  }, []);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const keywords = useMemo(() => {
    if (!data?.errors) return [];
    return getUniqueKeywords(data.errors);
  }, [data?.errors]);

  const filteredErrors = useMemo(() => {
    if (!data?.errors) return [];
    if (!selectedKeyword) return data.errors;
    return data.errors.filter((e) => e.keyword === selectedKeyword);
  }, [data?.errors, selectedKeyword]);

  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" position="relative">
        <Box color="fg.muted" textAlign="center" py="8">Loading validation results...</Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" position="relative">
        <Box color="fg.muted" textAlign="center" py="8">No validation result</Box>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" position="relative">
      {/* Schema name if provided */}
      {data.schema && (
        <Box fontSize="xs" color="fg.muted" mb="2" fontFamily="mono">{data.schema}</Box>
      )}

      {/* Global status */}
      <GlobalStatus valid={data.valid} errorCount={data.errors?.length || 0} />

      {/* Filter bar */}
      {!data.valid && data.errors && data.errors.length > 0 && (
        <FilterBar
          keywords={keywords}
          selectedKeyword={selectedKeyword}
          onSelect={setSelectedKeyword}
        />
      )}

      {/* Error list */}
      {!data.valid && filteredErrors.length > 0 && (
        <Stack gap="3">
          {filteredErrors.map((error, i) => (
            <ErrorItem
              key={`${error.path}-${i}`}
              error={error}
              onCopy={handleCopyPath}
            />
          ))}
        </Stack>
      )}

      {/* Copy feedback */}
      {copiedPath && (
        <Box
          position="fixed"
          bottom="4"
          left="50%"
          transform="translateX(-50%)"
          bg="gray.800"
          color="white"
          px="3"
          py="2"
          rounded="md"
          fontSize="xs"
          fontFamily="mono"
          boxShadow="lg"
          zIndex={100}
          _dark={{ bg: "gray.200", color: "gray.900" }}
        >
          Copied: {copiedPath}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<ValidationResultViewer />);
