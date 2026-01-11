/**
 * Tests for BYOK Key Checker
 *
 * Story 14.6: BYOK API Key Management
 * Tests AC1, AC4, AC5 - Key detection, multiple keys, validation
 */

import { assertEquals, assertFalse } from "@std/assert";
import {
  checkKeys,
  getKey,
  getRequiredKeys,
  getRequiredKeysForTool,
  isValidKeyValue,
  TOOL_REQUIRED_KEYS,
} from "../src/byok/mod.ts";

// ============================================================================
// isValidKeyValue Tests (AC5)
// ============================================================================

Deno.test("isValidKeyValue - valid key", () => {
  assertEquals(isValidKeyValue("tvly-abc123xyz"), true);
  assertEquals(isValidKeyValue("sk-ant-api03-real-key"), true);
  assertEquals(isValidKeyValue("some-valid-api-key-12345"), true);
});

Deno.test("isValidKeyValue - undefined", () => {
  assertFalse(isValidKeyValue(undefined));
});

Deno.test("isValidKeyValue - empty string", () => {
  assertFalse(isValidKeyValue(""));
  assertFalse(isValidKeyValue("   ")); // whitespace only
});

Deno.test("isValidKeyValue - placeholder xxx", () => {
  assertFalse(isValidKeyValue("xxx"));
  assertFalse(isValidKeyValue("XXX"));
  assertFalse(isValidKeyValue("xxxx"));
});

Deno.test("isValidKeyValue - placeholder your-key", () => {
  assertFalse(isValidKeyValue("your-key"));
  assertFalse(isValidKeyValue("your_key"));
  assertFalse(isValidKeyValue("yourkey"));
  assertFalse(isValidKeyValue("Your-Key-Here"));
});

Deno.test("isValidKeyValue - placeholder angle brackets", () => {
  assertFalse(isValidKeyValue("<your-api-key>"));
  assertFalse(isValidKeyValue("<API_KEY>"));
});

Deno.test("isValidKeyValue - placeholder TODO", () => {
  assertFalse(isValidKeyValue("TODO"));
  assertFalse(isValidKeyValue("todo"));
});

Deno.test("isValidKeyValue - placeholder CHANGE_ME", () => {
  assertFalse(isValidKeyValue("CHANGE_ME"));
  assertFalse(isValidKeyValue("CHANGEME"));
  assertFalse(isValidKeyValue("change-me"));
});

Deno.test("isValidKeyValue - placeholder placeholder", () => {
  assertFalse(isValidKeyValue("placeholder"));
  assertFalse(isValidKeyValue("PLACEHOLDER"));
});

Deno.test("isValidKeyValue - placeholder test-key", () => {
  assertFalse(isValidKeyValue("test-key"));
  assertFalse(isValidKeyValue("test_key"));
});

Deno.test("isValidKeyValue - placeholder fake-key", () => {
  assertFalse(isValidKeyValue("fake-key"));
  assertFalse(isValidKeyValue("fake_key"));
});

Deno.test("isValidKeyValue - placeholder example", () => {
  assertFalse(isValidKeyValue("example"));
});

Deno.test("isValidKeyValue - placeholder insert-here", () => {
  assertFalse(isValidKeyValue("insert-here"));
  assertFalse(isValidKeyValue("insert_here"));
});

Deno.test("isValidKeyValue - placeholder replace-me", () => {
  assertFalse(isValidKeyValue("replace-me"));
  assertFalse(isValidKeyValue("replace_me"));
});

// ============================================================================
// checkKeys Tests (AC1, AC4)
// ============================================================================

Deno.test("checkKeys - all keys present and valid", () => {
  // Set up test env vars
  Deno.env.set("TEST_KEY_1", "valid-key-123");
  Deno.env.set("TEST_KEY_2", "valid-key-456");

  const result = checkKeys([
    { name: "TEST_KEY_1", requiredBy: "test:tool1" },
    { name: "TEST_KEY_2", requiredBy: "test:tool2" },
  ]);

  assertEquals(result.allValid, true);
  assertEquals(result.missing, []);
  assertEquals(result.invalid, []);

  // Cleanup
  Deno.env.delete("TEST_KEY_1");
  Deno.env.delete("TEST_KEY_2");
});

Deno.test("checkKeys - missing key", () => {
  // Ensure key doesn't exist
  Deno.env.delete("NONEXISTENT_KEY");

  const result = checkKeys([
    { name: "NONEXISTENT_KEY", requiredBy: "test:tool" },
  ]);

  assertFalse(result.allValid);
  assertEquals(result.missing, ["NONEXISTENT_KEY"]);
  assertEquals(result.invalid, []);
});

Deno.test("checkKeys - invalid key (placeholder)", () => {
  Deno.env.set("TEST_PLACEHOLDER_KEY", "xxx");

  const result = checkKeys([
    { name: "TEST_PLACEHOLDER_KEY", requiredBy: "test:tool" },
  ]);

  assertFalse(result.allValid);
  assertEquals(result.missing, []);
  assertEquals(result.invalid, ["TEST_PLACEHOLDER_KEY"]);

  Deno.env.delete("TEST_PLACEHOLDER_KEY");
});

Deno.test("checkKeys - AC4: multiple keys upfront", () => {
  // Mix of valid, missing, and invalid
  Deno.env.set("VALID_KEY", "real-api-key-123");
  Deno.env.set("INVALID_KEY", "TODO");
  Deno.env.delete("MISSING_KEY");

  const result = checkKeys([
    { name: "VALID_KEY", requiredBy: "test:valid" },
    { name: "MISSING_KEY", requiredBy: "test:missing" },
    { name: "INVALID_KEY", requiredBy: "test:invalid" },
  ]);

  assertFalse(result.allValid);
  assertEquals(result.missing, ["MISSING_KEY"]);
  assertEquals(result.invalid, ["INVALID_KEY"]);

  Deno.env.delete("VALID_KEY");
  Deno.env.delete("INVALID_KEY");
});

// ============================================================================
// getRequiredKeysForTool Tests
// ============================================================================

Deno.test("getRequiredKeysForTool - known tool", () => {
  const keys = getRequiredKeysForTool("tavily:search");
  assertEquals(keys, ["TAVILY_API_KEY"]);
});

Deno.test("getRequiredKeysForTool - namespace fallback", () => {
  // Tool not explicitly listed but namespace is
  const keys = getRequiredKeysForTool("tavily:new_action");
  assertEquals(keys, ["TAVILY_API_KEY"]);
});

Deno.test("getRequiredKeysForTool - unknown tool", () => {
  const keys = getRequiredKeysForTool("unknown:tool");
  assertEquals(keys, []);
});

Deno.test("getRequiredKeysForTool - local tool (no key needed)", () => {
  const keys = getRequiredKeysForTool("math:sum");
  assertEquals(keys, []);
});

// ============================================================================
// getRequiredKeys Tests
// ============================================================================

Deno.test("getRequiredKeys - returns RequiredKey objects", () => {
  const keys = getRequiredKeys("tavily:search");
  assertEquals(keys.length, 1);
  assertEquals(keys[0].name, "TAVILY_API_KEY");
  assertEquals(keys[0].requiredBy, "tavily:search");
});

Deno.test("getRequiredKeys - empty for unknown tool", () => {
  const keys = getRequiredKeys("filesystem:read_file");
  assertEquals(keys, []);
});

// ============================================================================
// TOOL_REQUIRED_KEYS mapping Tests
// ============================================================================

Deno.test("TOOL_REQUIRED_KEYS - contains expected mappings", () => {
  // Verify a few key mappings exist
  assertEquals(TOOL_REQUIRED_KEYS["tavily:search"], ["TAVILY_API_KEY"]);
  assertEquals(TOOL_REQUIRED_KEYS["exa:search"], ["EXA_API_KEY"]);
  assertEquals(TOOL_REQUIRED_KEYS["anthropic:message"], ["ANTHROPIC_API_KEY"]);
  assertEquals(TOOL_REQUIRED_KEYS["openai:chat"], ["OPENAI_API_KEY"]);
});

// ============================================================================
// getKey Tests
// ============================================================================

Deno.test("getKey - returns value when set", () => {
  Deno.env.set("TEST_GET_KEY", "test-value");

  const value = getKey("TEST_GET_KEY");
  assertEquals(value, "test-value");

  Deno.env.delete("TEST_GET_KEY");
});

Deno.test("getKey - returns undefined when not set", () => {
  Deno.env.delete("NONEXISTENT_KEY");

  const value = getKey("NONEXISTENT_KEY");
  assertEquals(value, undefined);
});
