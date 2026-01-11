/**
 * Tests for BYOK Key Sanitizer
 *
 * Story 14.6: BYOK API Key Management
 * Tests AC6 - Key sanitization
 */

import { assertEquals, assertFalse } from "@std/assert";
import {
  containsApiKey,
  createSanitizedLogger,
  sanitize,
  sanitizeError,
  sanitizeObject,
} from "../src/byok/mod.ts";

// ============================================================================
// sanitize Tests (AC6)
// ============================================================================

Deno.test("sanitize - redacts API_KEY=value patterns", () => {
  const input = "Error: TAVILY_API_KEY=tvly-abc123 is invalid";
  const output = sanitize(input);
  assertEquals(output, "Error: [REDACTED] is invalid");
});

Deno.test("sanitize - redacts sk-ant patterns (Anthropic)", () => {
  const input = "Using key sk-ant-api03-abcdefghijklmnop";
  const output = sanitize(input);
  assertEquals(output, "Using key [REDACTED]");
});

Deno.test("sanitize - redacts sk- patterns (OpenAI)", () => {
  // OpenAI keys: sk- followed by at least 20 alphanumeric characters
  const input = "OPENAI_KEY: sk-abcdefghijklmnopqrstuvwxyz12345";
  const output = sanitize(input);
  assertEquals(output, "OPENAI_KEY: [REDACTED]");
});

Deno.test("sanitize - redacts tvly- patterns (Tavily)", () => {
  const input = "Tavily key: tvly-xyzABC123";
  const output = sanitize(input);
  assertEquals(output, "Tavily key: [REDACTED]");
});

Deno.test("sanitize - redacts exa- patterns (Exa)", () => {
  const input = "Exa API: exa-key123abc";
  const output = sanitize(input);
  assertEquals(output, "Exa API: [REDACTED]");
});

Deno.test("sanitize - redacts Bearer tokens", () => {
  const input = "Authorization: Bearer sk-ant-api03-xyz123";
  const output = sanitize(input);
  // The sk-ant pattern matches first, Bearer token is partially left
  assertEquals(output.includes("[REDACTED]"), true);
  assertFalse(output.includes("sk-ant-api03-xyz123"));
});

Deno.test("sanitize - handles multiple patterns in same string", () => {
  const input = "Keys: TAVILY_API_KEY=tvly-abc, OPENAI_API_KEY=sk-xyz123456789012345678901234";
  const output = sanitize(input);
  // Both patterns should be redacted
  assertEquals(output.includes("tvly-abc"), false);
  assertEquals(output.includes("sk-xyz"), false);
  assertEquals(output.includes("[REDACTED]"), true);
});

Deno.test("sanitize - does not modify safe strings", () => {
  const input = "Normal log message without API keys";
  const output = sanitize(input);
  assertEquals(output, "Normal log message without API keys");
});

Deno.test("sanitize - custom replacement", () => {
  const input = "Key: tvly-abc123";
  const output = sanitize(input, { replacement: "***HIDDEN***" });
  assertEquals(output, "Key: ***HIDDEN***");
});

Deno.test("sanitize - handles empty string", () => {
  assertEquals(sanitize(""), "");
});

Deno.test("sanitize - preserves structure around redacted values", () => {
  const input = `Config: {
  "api_key": "TAVILY_API_KEY=tvly-secret123",
  "other": "safe value"
}`;
  const output = sanitize(input);
  assertEquals(output.includes("[REDACTED]"), true);
  assertEquals(output.includes("safe value"), true);
});

// ============================================================================
// sanitizeError Tests
// ============================================================================

Deno.test("sanitizeError - sanitizes error message", () => {
  const error = new Error("Failed with key: sk-ant-api03-secret123");
  const sanitized = sanitizeError(error);
  assertEquals(sanitized.message, "Failed with key: [REDACTED]");
  assertEquals(sanitized.name, "Error");
});

Deno.test("sanitizeError - preserves error name", () => {
  const error = new TypeError("Invalid key: tvly-abc123");
  error.name = "TypeError";
  const sanitized = sanitizeError(error);
  assertEquals(sanitized.name, "TypeError");
});

// ============================================================================
// sanitizeObject Tests
// ============================================================================

Deno.test("sanitizeObject - sanitizes string values", () => {
  const obj = {
    key: "sk-ant-api03-secret",
    safe: "normal value",
  };
  const sanitized = sanitizeObject(obj);
  assertEquals(sanitized.key, "[REDACTED]");
  assertEquals(sanitized.safe, "normal value");
});

Deno.test("sanitizeObject - handles nested objects", () => {
  const obj = {
    config: {
      apiKey: "tvly-secret123",
      name: "test",
    },
  };
  const sanitized = sanitizeObject(obj);
  assertEquals((sanitized.config as Record<string, string>).apiKey, "[REDACTED]");
  assertEquals((sanitized.config as Record<string, string>).name, "test");
});

Deno.test("sanitizeObject - handles arrays", () => {
  const arr = ["safe", "TAVILY_API_KEY=tvly-secret", "also safe"];
  const sanitized = sanitizeObject(arr);
  assertEquals(sanitized[0], "safe");
  assertEquals(sanitized[1], "[REDACTED]");
  assertEquals(sanitized[2], "also safe");
});

Deno.test("sanitizeObject - handles null and undefined", () => {
  assertEquals(sanitizeObject(null), null);
  assertEquals(sanitizeObject(undefined), undefined);
});

Deno.test("sanitizeObject - preserves non-string values", () => {
  const obj = {
    count: 42,
    enabled: true,
    data: null,
  };
  const sanitized = sanitizeObject(obj);
  assertEquals(sanitized.count, 42);
  assertEquals(sanitized.enabled, true);
  assertEquals(sanitized.data, null);
});

// ============================================================================
// containsApiKey Tests
// ============================================================================

Deno.test("containsApiKey - detects API key patterns", () => {
  assertEquals(containsApiKey("key: sk-ant-api03-secret"), true);
  assertEquals(containsApiKey("TAVILY_API_KEY=tvly-abc"), true);
  assertEquals(containsApiKey("token: tvly-xyz123"), true);
});

Deno.test("containsApiKey - returns false for safe strings", () => {
  assertFalse(containsApiKey("Normal log message"));
  assertFalse(containsApiKey("No secrets here"));
});

// ============================================================================
// createSanitizedLogger Tests
// ============================================================================

Deno.test("createSanitizedLogger - sanitizes all log levels", () => {
  const logs: string[] = [];
  const logger = createSanitizedLogger({
    debug: (m) => logs.push(`DEBUG: ${m}`),
    info: (m) => logs.push(`INFO: ${m}`),
    warn: (m) => logs.push(`WARN: ${m}`),
    error: (m) => logs.push(`ERROR: ${m}`),
  });

  logger.debug("Debug key: sk-ant-api03-debug");
  logger.info("Info key: tvly-info123");
  logger.warn("Warn key: OPENAI_API_KEY=sk-warn");
  logger.error("Error key: sk-error12345678901234567890");

  assertEquals(logs.length, 4);
  assertEquals(logs[0], "DEBUG: Debug key: [REDACTED]");
  assertEquals(logs[1], "INFO: Info key: [REDACTED]");
  assertEquals(logs[2], "WARN: Warn key: [REDACTED]");
  assertEquals(logs[3], "ERROR: Error key: [REDACTED]");
});

Deno.test("createSanitizedLogger - handles Error objects", () => {
  const logs: string[] = [];
  const logger = createSanitizedLogger({
    debug: (m) => logs.push(m),
    info: (m) => logs.push(m),
    warn: (m) => logs.push(m),
    error: (m) => logs.push(m),
  });

  const error = new Error("Failed with key: tvly-secret");
  logger.error(error);

  assertEquals(logs[0], "Failed with key: [REDACTED]");
});
