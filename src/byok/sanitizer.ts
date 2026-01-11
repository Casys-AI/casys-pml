/**
 * Key Sanitizer
 *
 * Redacts API keys from logs and error messages to prevent accidental exposure.
 *
 * **AC6:** Given any log output or error message, when it might contain a key value,
 * then redact patterns: `*_API_KEY=*`, `sk-*`, `tvly-*`, and NEVER log actual key values.
 *
 * @module byok/sanitizer
 */

import type { SanitizeOptions } from "./types.ts";
import { REDACT_PATTERNS } from "./types.ts";

/** Default replacement text for redacted values */
const DEFAULT_REPLACEMENT = "[REDACTED]";

/**
 * Sanitize text by redacting API key patterns.
 *
 * This function identifies and replaces common API key patterns
 * to prevent accidental exposure in logs, error messages, or outputs.
 *
 * @param text - Text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text with keys redacted
 *
 * @example
 * ```ts
 * sanitize("Error: TAVILY_API_KEY=tvly-abc123 is invalid");
 * // "Error: [REDACTED] is invalid"
 *
 * sanitize("Using key sk-ant-api03-xxx...");
 * // "Using key [REDACTED]..."
 * ```
 */
export function sanitize(
  text: string,
  options: SanitizeOptions = {},
): string {
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
  let result = text;

  // Apply built-in patterns
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Apply additional custom patterns
  if (options.additionalPatterns) {
    for (const pattern of options.additionalPatterns) {
      result = result.replace(pattern, replacement);
    }
  }

  return result;
}

/**
 * Sanitize an Error object.
 *
 * Creates a new Error with sanitized message and stack trace.
 *
 * @param error - Error to sanitize
 * @param options - Sanitization options
 * @returns New Error with sanitized message
 *
 * @example
 * ```ts
 * try {
 *   throw new Error("Invalid key: sk-ant-api03-xxx");
 * } catch (e) {
 *   throw sanitizeError(e);
 *   // Error: Invalid key: [REDACTED]
 * }
 * ```
 */
export function sanitizeError(
  error: Error,
  options: SanitizeOptions = {},
): Error {
  const sanitizedMessage = sanitize(error.message, options);
  const sanitizedError = new Error(sanitizedMessage);
  sanitizedError.name = error.name;

  // Sanitize stack trace if present
  if (error.stack) {
    sanitizedError.stack = sanitize(error.stack, options);
  }

  return sanitizedError;
}

/**
 * Sanitize an object by recursively sanitizing string values.
 *
 * Useful for sanitizing JSON-serializable objects before logging.
 *
 * @param obj - Object to sanitize
 * @param options - Sanitization options
 * @returns New object with sanitized string values
 *
 * @example
 * ```ts
 * sanitizeObject({ key: "sk-abc123", nested: { token: "tvly-xxx" } });
 * // { key: "[REDACTED]", nested: { token: "[REDACTED]" } }
 * ```
 */
export function sanitizeObject<T>(
  obj: T,
  options: SanitizeOptions = {},
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitize(obj, options) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options)) as unknown as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeObject(value, options);
    }
    return result as T;
  }

  return obj;
}

/**
 * Logger interface for sanitized logging.
 */
export interface SanitizedLogger {
  /** Log debug message (sanitized) */
  debug: (message: string) => void;
  /** Log info message (sanitized) */
  info: (message: string) => void;
  /** Log warning message (sanitized) */
  warn: (message: string) => void;
  /** Log error message (sanitized) */
  error: (message: string | Error) => void;
}

/**
 * Create a sanitized logger wrapper.
 *
 * Wraps any logger-like object to automatically sanitize messages
 * before they are logged. This ensures API keys are never exposed
 * in logs even if accidentally included.
 *
 * @param logger - Underlying logger to wrap
 * @param options - Sanitization options
 * @returns Sanitized logger
 *
 * @example
 * ```ts
 * import * as log from "@std/log";
 *
 * const safeLog = createSanitizedLogger({
 *   debug: (m) => log.debug(m),
 *   info: (m) => log.info(m),
 *   warn: (m) => log.warning(m),
 *   error: (m) => log.error(String(m)),
 * });
 *
 * safeLog.info("Using key: sk-ant-api03-xxx");
 * // Logs: "Using key: [REDACTED]"
 * ```
 */
export function createSanitizedLogger(
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  },
  options: SanitizeOptions = {},
): SanitizedLogger {
  return {
    debug: (message: string) => logger.debug(sanitize(message, options)),
    info: (message: string) => logger.info(sanitize(message, options)),
    warn: (message: string) => logger.warn(sanitize(message, options)),
    error: (message: string | Error) => {
      if (message instanceof Error) {
        logger.error(sanitize(message.message, options));
      } else {
        logger.error(sanitize(message, options));
      }
    },
  };
}

/**
 * Check if a string contains potential API key patterns.
 *
 * Useful for detecting if sanitization is needed before logging.
 *
 * @param text - Text to check
 * @returns true if text contains potential API key patterns
 */
export function containsApiKey(text: string): boolean {
  for (const pattern of REDACT_PATTERNS) {
    // Create a non-global version to just test for existence
    const testPattern = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    if (testPattern.test(text)) {
      return true;
    }
  }
  return false;
}
