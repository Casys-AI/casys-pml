/**
 * Trace Sanitizer for packages/pml
 *
 * Story 14.5b: Sanitize sensitive data before storage/sync.
 *
 * Provides:
 * - Redaction of sensitive fields (API keys, tokens, passwords)
 * - Truncation of large payloads (>10KB)
 * - PII masking (emails, phone numbers)
 *
 * This is a standalone implementation for packages/pml.
 * It mirrors the logic in src/utils/sanitize-for-storage.ts
 * but cannot import from it (package isolation).
 *
 * @module tracing/sanitizer
 */

import type { JsonValue, LocalExecutionTrace, TraceTaskResult } from "./types.ts";

/**
 * Patterns for sensitive field detection (case-insensitive).
 */
const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /password/i,
  /secret/i,
  /authorization/i,
  /bearer/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /session[_-]?id/i,
  /cookie/i,
  /auth/i,
];

/**
 * Patterns for sensitive value detection (API keys, tokens in values).
 */
const SENSITIVE_VALUE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI API keys
  /Bearer\s+[a-zA-Z0-9._-]+/gi, // Bearer tokens
  /token[=:]\s*["']?[a-zA-Z0-9._-]{20,}["']?/gi, // Generic tokens
  /api[_-]?key[=:]\s*["']?[a-zA-Z0-9._-]{20,}["']?/gi, // API keys in strings
];

/**
 * Patterns for PII detection (AC5-6: PII masking).
 */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL]",
  },
  // Phone numbers (various formats)
  {
    pattern: /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    replacement: "[PHONE]",
  },
  // SSN (US Social Security Numbers)
  {
    pattern: /\d{3}-\d{2}-\d{4}/g,
    replacement: "[SSN]",
  },
  // Credit card numbers (basic pattern)
  {
    pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
    replacement: "[CARD]",
  },
];

/**
 * Maximum size for string values before truncation (10KB - AC6).
 */
const MAX_VALUE_SIZE = 10 * 1024;

/**
 * Maximum depth for recursive sanitization.
 */
const MAX_DEPTH = 20;

/**
 * Redaction markers.
 */
const REDACTED = "[REDACTED]";
const TRUNCATED_PREFIX = "[TRUNCATED:";

/**
 * Check if a key matches sensitive patterns.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitize sensitive patterns in a string value.
 */
function sanitizeStringValue(value: string): string {
  let result = value;

  // Redact sensitive values (API keys, tokens)
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }

  // Mask PII
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Truncate if too large (AC6)
  if (result.length > MAX_VALUE_SIZE) {
    const originalSize = result.length;
    const preview = result.slice(0, 100);
    return `${TRUNCATED_PREFIX} ${originalSize} chars, preview: ${preview}...]`;
  }

  return result;
}

/**
 * Sanitize any JSON-serializable value.
 *
 * @param data - Value to sanitize
 * @param depth - Current recursion depth
 * @returns Sanitized JSON value
 */
export function sanitizeValue(data: unknown, depth = 0): JsonValue {
  // Prevent stack overflow
  if (depth > MAX_DEPTH) {
    return "[MAX_DEPTH_EXCEEDED]";
  }

  // Null/undefined
  if (data === null || data === undefined) {
    return null;
  }

  // Strings - check for sensitive content and PII
  if (typeof data === "string") {
    return sanitizeStringValue(data);
  }

  // Numbers - handle special values
  if (typeof data === "number") {
    if (Number.isNaN(data) || !Number.isFinite(data)) {
      return null;
    }
    return data;
  }

  // Booleans
  if (typeof data === "boolean") {
    return data;
  }

  // Arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeValue(item, depth + 1));
  }

  // Date objects
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Objects
  if (typeof data === "object") {
    const result: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Redact entire value if key is sensitive
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeValue(value, depth + 1);
      }
    }

    return result;
  }

  // Non-serializable types
  if (typeof data === "function") {
    return "[FUNCTION]";
  }
  if (typeof data === "symbol") {
    return "[SYMBOL]";
  }
  if (typeof data === "bigint") {
    return data.toString();
  }

  // Fallback
  return String(data);
}

/**
 * Sanitize a TraceTaskResult.
 *
 * @param result - Task result to sanitize
 * @returns Sanitized task result
 */
export function sanitizeTaskResult(result: TraceTaskResult): TraceTaskResult {
  return {
    ...result,
    args: sanitizeValue(result.args) as Record<string, JsonValue>,
    result: sanitizeValue(result.result),
  };
}

/**
 * Sanitize an entire LocalExecutionTrace.
 *
 * @param trace - Trace to sanitize
 * @returns Sanitized trace ready for storage/sync
 */
export function sanitizeTrace(trace: LocalExecutionTrace): LocalExecutionTrace {
  return {
    ...trace,
    error: trace.error ? sanitizeStringValue(trace.error) : undefined,
    taskResults: trace.taskResults.map(sanitizeTaskResult),
  };
}

/**
 * Get the serialized size of a value in bytes.
 *
 * @param data - Value to measure
 * @returns Size in bytes
 */
export function getSerializedSize(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}
