/**
 * Tests for main module
 *
 * @module main_test
 */

import { assertEquals } from "jsr:@std/assert@1.0.11";
import { main } from "../src/main.ts";

Deno.test({
  name: "main function runs without errors",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Test that main() doesn't throw
    await main();
  },
});

Deno.test("main is exported correctly", () => {
  assertEquals(typeof main, "function");
});
