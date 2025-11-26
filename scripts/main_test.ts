/**
 * Tests for main module
 *
 * @module main_test
 */

import { assertEquals } from "jsr:@std/assert@1.0.11";
import { main } from "./main.ts";

Deno.test("main function runs without errors", () => {
  // Test that main() doesn't throw
  main();
});

Deno.test("main is exported correctly", () => {
  assertEquals(typeof main, "function");
});
