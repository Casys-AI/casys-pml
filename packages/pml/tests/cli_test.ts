/**
 * CLI Tests
 *
 * @module tests/cli
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { main } from "../src/cli/mod.ts";
import { PACKAGE_VERSION } from "../src/cli/shared/constants.ts";

Deno.test("cli - version flag works", async () => {
  // Capture the version output by checking the command configuration
  const versionMatch = main.getVersion();
  assertEquals(versionMatch, PACKAGE_VERSION);
});

Deno.test("cli - has init command", () => {
  const commands = main.getCommands();
  const initCmd = commands.find((c) => c.getName() === "init");
  assertEquals(initCmd !== undefined, true);
});

Deno.test("cli - has serve command", () => {
  const commands = main.getCommands();
  const serveCmd = commands.find((c) => c.getName() === "serve");
  assertEquals(serveCmd !== undefined, true);
});

Deno.test("cli - has stdio command (primary interface for Claude Code)", () => {
  const commands = main.getCommands();
  const stdioCmd = commands.find((c) => c.getName() === "stdio");
  assertEquals(stdioCmd !== undefined, true);
});

Deno.test("cli - stdio command has correct description", () => {
  const commands = main.getCommands();
  const stdioCmd = commands.find((c) => c.getName() === "stdio");
  const description = stdioCmd?.getDescription() ?? "";
  assertStringIncludes(description, "stdio");
  assertStringIncludes(description, "Claude Code");
});

Deno.test("cli - init command has expected options", () => {
  const commands = main.getCommands();
  const initCmd = commands.find((c) => c.getName() === "init");
  const options = initCmd?.getOptions() ?? [];
  const optionNames = options.map((o) => o.name);

  assertEquals(optionNames.includes("yes"), true);
  assertEquals(optionNames.includes("force"), true);
  assertEquals(optionNames.includes("port"), true);
  assertEquals(optionNames.includes("api-key"), true);
});

Deno.test("cli - serve command has port option", () => {
  const commands = main.getCommands();
  const serveCmd = commands.find((c) => c.getName() === "serve");
  const options = serveCmd?.getOptions() ?? [];
  const optionNames = options.map((o) => o.name);

  assertEquals(optionNames.includes("port"), true);
});

Deno.test("cli - description is set", () => {
  const description = main.getDescription();
  assertStringIncludes(description, "PML");
  assertStringIncludes(description, "MCP");
});
