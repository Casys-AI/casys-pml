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

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

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
  required: {
    icon: "!",
    label: "Required",
    suggestion: "Add the missing property to your data",
  },
  type: {
    icon: "T",
    label: "Type",
    suggestion: "Convert the value to the expected type",
  },
  format: {
    icon: "F",
    label: "Format",
    suggestion: "Ensure the value matches the expected format",
  },
  enum: {
    icon: "E",
    label: "Enum",
    suggestion: "Use one of the allowed values",
  },
  pattern: {
    icon: "R",
    label: "Pattern",
    suggestion: "Ensure the value matches the required pattern",
  },
  minLength: {
    icon: "#",
    label: "Min Length",
    suggestion: "Provide a longer value",
  },
  maxLength: {
    icon: "#",
    label: "Max Length",
    suggestion: "Provide a shorter value",
  },
  minimum: {
    icon: "<",
    label: "Minimum",
    suggestion: "Provide a larger value",
  },
  maximum: {
    icon: ">",
    label: "Maximum",
    suggestion: "Provide a smaller value",
  },
  minItems: {
    icon: "[",
    label: "Min Items",
    suggestion: "Add more items to the array",
  },
  maxItems: {
    icon: "]",
    label: "Max Items",
    suggestion: "Remove some items from the array",
  },
  uniqueItems: {
    icon: "U",
    label: "Unique",
    suggestion: "Remove duplicate items from the array",
  },
  additionalProperties: {
    icon: "+",
    label: "Extra Props",
    suggestion: "Remove unexpected properties",
  },
  const: {
    icon: "=",
    label: "Const",
    suggestion: "Use the exact expected value",
  },
  oneOf: {
    icon: "1",
    label: "One Of",
    suggestion: "Data must match exactly one schema",
  },
  anyOf: {
    icon: "*",
    label: "Any Of",
    suggestion: "Data must match at least one schema",
  },
  allOf: {
    icon: "&",
    label: "All Of",
    suggestion: "Data must match all schemas",
  },
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
    <div class={css(styles.globalStatus, valid ? styles.globalValid : styles.globalInvalid)}>
      <div class={styles.globalIcon}>
        {valid ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </div>
      <div class={styles.globalText}>
        <span class={styles.globalLabel}>{valid ? "VALID" : "INVALID"}</span>
        {!valid && errorCount > 0 && (
          <span class={styles.errorCount}>
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ErrorItem({ error, onCopy }: { error: ValidationError; onCopy: (text: string) => void }) {
  const keywordInfo = getKeywordInfo(error.keyword);
  const hasExpectedActual = error.expected !== undefined || error.actual !== undefined;

  return (
    <div
      class={styles.errorItem}
      onClick={() => {
        notifyModel("select-error", { path: error.path, keyword: error.keyword });
        onCopy(error.path);
      }}
    >
      {/* Path header */}
      <div class={styles.errorHeader}>
        <span class={styles.pathIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </span>
        <code class={styles.path}>{error.path}</code>
      </div>

      {/* Error message */}
      <div class={styles.errorBody}>
        <span class={styles.keywordBadge} title={keywordInfo.label}>
          {keywordInfo.icon}
        </span>
        <div class={styles.errorContent}>
          <div class={styles.errorMessage}>
            {error.keyword && (
              <span class={styles.keywordLabel}>"{error.keyword}"</span>
            )}
            <span>{error.message}</span>
          </div>

          {/* Expected vs Actual */}
          {hasExpectedActual && (
            <div class={styles.comparison}>
              {error.expected !== undefined && (
                <div class={styles.comparisonRow}>
                  <span class={styles.comparisonLabel}>Expected:</span>
                  <code class={styles.comparisonValue}>{formatValue(error.expected)}</code>
                </div>
              )}
              {error.actual !== undefined && (
                <div class={styles.comparisonRow}>
                  <span class={styles.comparisonLabel}>Got:</span>
                  <code class={css(styles.comparisonValue, styles.actualValue)}>
                    {formatValue(error.actual)}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Suggestion */}
          {keywordInfo.suggestion && (
            <div class={styles.suggestion}>
              <span class={styles.suggestionIcon}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 017 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
                </svg>
              </span>
              <span>{keywordInfo.suggestion}</span>
            </div>
          )}
        </div>
      </div>
    </div>
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
    <div class={styles.filterBar}>
      <span class={styles.filterLabel}>Filter:</span>
      <button
        class={css(styles.filterChip, !selectedKeyword && styles.filterChipActive)}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {keywords.map((kw) => {
        const info = getKeywordInfo(kw);
        return (
          <button
            key={kw}
            class={css(styles.filterChip, selectedKeyword === kw && styles.filterChipActive)}
            onClick={() => onSelect(kw)}
          >
            <span class={styles.filterChipIcon}>{info.icon}</span>
            {info.label}
          </button>
        );
      })}
    </div>
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
      <div class={styles.container}>
        <div class={styles.loading}>Loading validation results...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No validation result</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Schema name if provided */}
      {data.schema && <div class={styles.schemaName}>{data.schema}</div>}

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
        <div class={styles.errorList}>
          {filteredErrors.map((error, i) => (
            <ErrorItem
              key={`${error.path}-${i}`}
              error={error}
              onCopy={handleCopyPath}
            />
          ))}
        </div>
      )}

      {/* Copy feedback */}
      {copiedPath && (
        <div class={styles.copyFeedback}>
          Copied: {copiedPath}
        </div>
      )}
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
    position: "relative",
  }),
  schemaName: css({
    fontSize: "xs",
    color: "fg.muted",
    mb: "2",
    fontFamily: "mono",
  }),
  globalStatus: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
    p: "4",
    rounded: "lg",
    mb: "4",
  }),
  globalValid: css({
    bg: "green.100",
    _dark: { bg: "green.900/30" },
  }),
  globalInvalid: css({
    bg: "red.100",
    _dark: { bg: "red.900/30" },
  }),
  globalIcon: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    w: "40px",
    h: "40px",
    rounded: "full",
    bg: "white",
    color: "inherit",
    _dark: { bg: "black/20" },
    "& svg": {
      color: "inherit",
    },
  }),
  globalText: css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5",
  }),
  globalLabel: css({
    fontSize: "lg",
    fontWeight: "bold",
    letterSpacing: "wide",
  }),
  errorCount: css({
    fontSize: "sm",
    color: "fg.muted",
  }),
  filterBar: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    mb: "3",
    flexWrap: "wrap",
  }),
  filterLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
  }),
  filterChip: css({
    display: "inline-flex",
    alignItems: "center",
    gap: "1",
    px: "2",
    py: "1",
    fontSize: "xs",
    fontWeight: "medium",
    rounded: "full",
    border: "1px solid",
    borderColor: "border.default",
    bg: "bg.subtle",
    color: "fg.muted",
    cursor: "pointer",
    transition: "all 0.15s",
    _hover: {
      bg: "bg.muted",
      borderColor: "border.emphasized",
    },
  }),
  filterChipActive: css({
    bg: "accent.default",
    color: "accent.fg",
    borderColor: "accent.default",
    _hover: {
      bg: "accent.emphasized",
      borderColor: "accent.emphasized",
    },
  }),
  filterChipIcon: css({
    fontFamily: "mono",
    fontSize: "10px",
    fontWeight: "bold",
  }),
  errorList: css({
    display: "flex",
    flexDirection: "column",
    gap: "3",
  }),
  errorItem: css({
    bg: "bg.subtle",
    rounded: "md",
    overflow: "hidden",
    cursor: "pointer",
    transition: "all 0.15s",
    border: "1px solid",
    borderColor: "transparent",
    _hover: {
      borderColor: "red.300",
      _dark: { borderColor: "red.700" },
    },
  }),
  errorHeader: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    px: "3",
    py: "2",
    bg: "red.50",
    borderBottom: "1px solid",
    borderColor: "red.100",
    _dark: {
      bg: "red.900/20",
      borderColor: "red.900/40",
    },
  }),
  pathIcon: css({
    display: "flex",
    alignItems: "center",
    color: "red.500",
    flexShrink: 0,
  }),
  path: css({
    fontFamily: "mono",
    fontSize: "xs",
    fontWeight: "semibold",
    color: "red.700",
    _dark: { color: "red.400" },
  }),
  errorBody: css({
    display: "flex",
    gap: "3",
    p: "3",
  }),
  keywordBadge: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    w: "24px",
    h: "24px",
    rounded: "md",
    bg: "gray.200",
    color: "gray.700",
    fontFamily: "mono",
    fontSize: "xs",
    fontWeight: "bold",
    flexShrink: 0,
    _dark: {
      bg: "gray.700",
      color: "gray.300",
    },
  }),
  errorContent: css({
    flex: 1,
    minW: 0,
  }),
  errorMessage: css({
    display: "flex",
    alignItems: "baseline",
    gap: "2",
    flexWrap: "wrap",
    lineHeight: "1.5",
  }),
  keywordLabel: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.muted",
    bg: "bg.muted",
    px: "1.5",
    py: "0.5",
    rounded: "sm",
  }),
  comparison: css({
    mt: "2",
    display: "flex",
    flexDirection: "column",
    gap: "1",
    pl: "2",
    borderLeft: "2px solid",
    borderColor: "border.default",
  }),
  comparisonRow: css({
    display: "flex",
    alignItems: "baseline",
    gap: "2",
  }),
  comparisonLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
    minW: "60px",
  }),
  comparisonValue: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "green.700",
    _dark: { color: "green.400" },
  }),
  actualValue: css({
    color: "red.600",
    _dark: { color: "red.400" },
  }),
  suggestion: css({
    display: "flex",
    alignItems: "flex-start",
    gap: "1.5",
    mt: "2",
    fontSize: "xs",
    color: "blue.700",
    bg: "blue.50",
    px: "2",
    py: "1.5",
    rounded: "sm",
    _dark: {
      color: "blue.300",
      bg: "blue.900/30",
    },
  }),
  suggestionIcon: css({
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    mt: "1px",
  }),
  copyFeedback: css({
    position: "fixed",
    bottom: "4",
    left: "50%",
    transform: "translateX(-50%)",
    bg: "gray.800",
    color: "white",
    px: "3",
    py: "2",
    rounded: "md",
    fontSize: "xs",
    fontFamily: "mono",
    boxShadow: "lg",
    zIndex: 100,
    _dark: {
      bg: "gray.200",
      color: "gray.900",
    },
  }),
  loading: css({
    color: "fg.muted",
    textAlign: "center",
    py: "8",
  }),
  empty: css({
    color: "fg.muted",
    textAlign: "center",
    py: "8",
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<ValidationResultViewer />, document.getElementById("app")!);
