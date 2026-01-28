/**
 * Trace Sanitizer Tests
 *
 * Story 14.5b: Test sanitization of execution traces.
 *
 * Tests:
 * - API key detection and masking
 * - Payload truncation (>10KB)
 * - PII masking (emails, phone numbers)
 * - Nested object sanitization
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  getSerializedSize,
  sanitizeTaskResult,
  sanitizeTrace,
  sanitizeValue,
} from "../src/tracing/mod.ts";
import type { LocalExecutionTrace, TraceTaskResult } from "../src/tracing/mod.ts";

Deno.test("sanitizer: redacts API key in object key", () => {
  const input = {
    path: "/home/user/file.txt",
    api_key: "sk-1234567890abcdef",
    content: "Hello world",
  };

  const result = sanitizeValue(input) as Record<string, unknown>;

  assertEquals(result.path, "/home/user/file.txt");
  assertEquals(result.api_key, "[REDACTED]");
  assertEquals(result.content, "Hello world");
});

Deno.test("sanitizer: redacts various sensitive key patterns", () => {
  const input = {
    apiKey: "secret123",
    auth_token: "tok_abc",
    password: "p@ssw0rd",
    SECRET: "mysecret",
    authorization: "Bearer xyz",
    private_key: "-----BEGIN RSA-----",
    session_id: "sess_123",
    cookie: "session=abc123",
  };

  const result = sanitizeValue(input) as Record<string, unknown>;

  // All sensitive keys should be redacted
  for (const key of Object.keys(result)) {
    assertEquals(result[key], "[REDACTED]", `Key ${key} should be redacted`);
  }
});

Deno.test("sanitizer: redacts OpenAI API key in string value", () => {
  const input = "Authorization: sk-abcdefghij1234567890abcdefghij";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[REDACTED]");
  assertEquals(result.includes("sk-abcdef"), false);
});

Deno.test("sanitizer: redacts Bearer token in string value", () => {
  const input = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[REDACTED]");
});

Deno.test("sanitizer: truncates large payloads > 10KB", () => {
  const largeString = "x".repeat(15000); // 15KB

  const result = sanitizeValue(largeString) as string;

  assertStringIncludes(result, "[TRUNCATED:");
  assertStringIncludes(result, "15000 chars");
  // Should have preview
  assertStringIncludes(result, "preview:");
});

Deno.test("sanitizer: masks email addresses", () => {
  const input = "Contact: john.doe@example.com or jane_doe123@company.co.uk";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[EMAIL]");
  assertEquals(result.includes("john.doe@example.com"), false);
  assertEquals(result.includes("jane_doe123@company.co.uk"), false);
});

Deno.test("sanitizer: masks phone numbers", () => {
  const input = "Call me at (555) 123-4567 or +1-555-987-6543";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[PHONE]");
  assertEquals(result.includes("555-123-4567"), false);
  assertEquals(result.includes("555-987-6543"), false);
});

Deno.test("sanitizer: masks SSN", () => {
  const input = "SSN: 123-45-6789";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[SSN]");
  assertEquals(result.includes("123-45-6789"), false);
});

Deno.test("sanitizer: masks credit card numbers", () => {
  const input = "Card: 4111-1111-1111-1111";

  const result = sanitizeValue(input) as string;

  assertStringIncludes(result, "[CARD]");
  assertEquals(result.includes("4111-1111-1111-1111"), false);
});

Deno.test("sanitizer: handles nested objects", () => {
  const input = {
    user: {
      name: "John",
      config: {
        api_key: "secret123",
        password: "pass",
      },
    },
    meta: {
      timestamp: "2024-01-01",
    },
  };

  const result = sanitizeValue(input) as Record<string, Record<string, unknown>>;

  assertEquals(result.user.name, "John");
  assertEquals((result.user.config as Record<string, unknown>).api_key, "[REDACTED]");
  assertEquals((result.user.config as Record<string, unknown>).password, "[REDACTED]");
  assertEquals(result.meta.timestamp, "2024-01-01");
});

Deno.test("sanitizer: handles arrays", () => {
  const input = [
    { name: "item1", token: "tok_123" },
    { name: "item2", api_key: "key_456" },
  ];

  const result = sanitizeValue(input) as Array<Record<string, unknown>>;

  assertEquals(result[0].name, "item1");
  assertEquals(result[0].token, "[REDACTED]");
  assertEquals(result[1].name, "item2");
  assertEquals(result[1].api_key, "[REDACTED]");
});

Deno.test("sanitizer: handles null and undefined", () => {
  assertEquals(sanitizeValue(null), null);
  assertEquals(sanitizeValue(undefined), null);
});

Deno.test("sanitizer: handles special number values", () => {
  assertEquals(sanitizeValue(42), 42);
  assertEquals(sanitizeValue(3.14), 3.14);
  assertEquals(sanitizeValue(NaN), null);
  assertEquals(sanitizeValue(Infinity), null);
  assertEquals(sanitizeValue(-Infinity), null);
});

Deno.test("sanitizer: converts Date to ISO string", () => {
  const date = new Date("2024-01-15T10:30:00Z");
  const result = sanitizeValue(date);

  assertEquals(result, "2024-01-15T10:30:00.000Z");
});

Deno.test("sanitizer: handles non-serializable types", () => {
  assertEquals(sanitizeValue(() => {}), "[FUNCTION]");
  assertEquals(sanitizeValue(Symbol("test")), "[SYMBOL]");
  assertEquals(sanitizeValue(BigInt(123)), "123");
});

Deno.test("sanitizeTaskResult: sanitizes args and result", () => {
  const taskResult: TraceTaskResult = {
    taskId: "t1",
    tool: "http:request",
    args: {
      url: "https://api.example.com",
      headers: {
        authorization: "Bearer secret",
      },
    },
    result: {
      email: "user@example.com",
      data: "response",
    } as unknown as null,
    success: true,
    durationMs: 100,
    timestamp: "2024-01-01T00:00:00Z",
  };

  const result = sanitizeTaskResult(taskResult);

  assertEquals(result.taskId, "t1");
  assertEquals(result.tool, "http:request");
  assertEquals((result.args.headers as Record<string, unknown>).authorization, "[REDACTED]");
  assertStringIncludes(JSON.stringify(result.result), "[EMAIL]");
});

Deno.test("sanitizeTrace: sanitizes entire trace", () => {
  const trace: LocalExecutionTrace = {
    traceId: "test-trace-id",
    capabilityId: "test:capability",
    success: true,
    error: "Token sk-test1234567890test1234567890 expired",
    durationMs: 500,
    taskResults: [
      {
        taskId: "t1",
        tool: "api:call",
        args: { key: "value", api_key: "secret" },
        result: { data: "result" },
        success: true,
        durationMs: 100,
        timestamp: "2024-01-01T00:00:00Z",
      },
    ],
    decisions: [],
    timestamp: "2024-01-01T00:00:00Z",
  };

  const result = sanitizeTrace(trace);

  // Error should be sanitized
  assertStringIncludes(result.error!, "[REDACTED]");
  assertEquals(result.error!.includes("sk-test"), false);

  // Task result args should be sanitized
  assertEquals(result.taskResults[0].args.api_key, "[REDACTED]");
});

Deno.test("getSerializedSize: returns correct size", () => {
  const obj = { key: "value" };
  const size = getSerializedSize(obj);

  assertEquals(size, JSON.stringify(obj).length);
});

Deno.test("getSerializedSize: returns 0 for non-serializable", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const size = getSerializedSize(circular);
  assertEquals(size, 0);
});
