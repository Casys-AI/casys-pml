/**
 * UI Utils Tests
 *
 * Tests for the extractUiMeta helper function.
 *
 * @module execution/ui-utils_test
 */

import { assertEquals } from "@std/assert";
import { extractUiMeta } from "./ui-utils.ts";

Deno.test("extractUiMeta - returns null for null input", () => {
  assertEquals(extractUiMeta(null), null);
});

Deno.test("extractUiMeta - returns null for undefined input", () => {
  assertEquals(extractUiMeta(undefined), null);
});

Deno.test("extractUiMeta - returns null for string input", () => {
  assertEquals(extractUiMeta("string"), null);
});

Deno.test("extractUiMeta - returns null for number input", () => {
  assertEquals(extractUiMeta(123), null);
});

Deno.test("extractUiMeta - returns null for object without _meta", () => {
  assertEquals(extractUiMeta({ data: "value" }), null);
});

Deno.test("extractUiMeta - returns null for object with empty _meta", () => {
  assertEquals(extractUiMeta({ _meta: {} }), null);
});

Deno.test("extractUiMeta - returns null for _meta without ui", () => {
  assertEquals(extractUiMeta({ _meta: { other: "field" } }), null);
});

Deno.test("extractUiMeta - returns null for _meta.ui without resourceUri", () => {
  assertEquals(extractUiMeta({ _meta: { ui: {} } }), null);
});

Deno.test("extractUiMeta - returns null for _meta.ui with only context", () => {
  assertEquals(extractUiMeta({ _meta: { ui: { context: {} } } }), null);
});

Deno.test("extractUiMeta - extracts resourceUri without context", () => {
  const result = extractUiMeta({
    _meta: { ui: { resourceUri: "ui://test/resource" } },
  });
  assertEquals(result?.resourceUri, "ui://test/resource");
  assertEquals(result?.context, undefined);
});

Deno.test("extractUiMeta - extracts resourceUri with context", () => {
  const result = extractUiMeta({
    _meta: {
      ui: {
        resourceUri: "ui://postgres/table/abc",
        context: { query: "SELECT *", rows: 100 },
      },
    },
  });
  assertEquals(result?.resourceUri, "ui://postgres/table/abc");
  assertEquals(result?.context, { query: "SELECT *", rows: 100 });
});

Deno.test("extractUiMeta - preserves complex context objects", () => {
  const complexContext = {
    filter: { region: "EU", status: ["active", "pending"] },
    pagination: { page: 1, limit: 50 },
    nested: { deep: { value: true } },
  };

  const result = extractUiMeta({
    data: { someOtherData: "ignored" },
    _meta: {
      ui: {
        resourceUri: "ui://complex/test",
        context: complexContext,
      },
    },
  });

  assertEquals(result?.resourceUri, "ui://complex/test");
  assertEquals(result?.context, complexContext);
});

Deno.test("extractUiMeta - ignores other _meta fields", () => {
  const result = extractUiMeta({
    _meta: {
      timing: { duration: 100 },
      tracing: { id: "abc123" },
      ui: { resourceUri: "ui://only/ui/matters" },
    },
  });
  assertEquals(result?.resourceUri, "ui://only/ui/matters");
});
