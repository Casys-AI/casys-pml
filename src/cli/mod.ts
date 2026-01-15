#!/usr/bin/env -S deno run -A
/**
 * PML CLI Entry Point
 *
 * @module cli
 */

import { loadSync } from "@std/dotenv";
import { Command } from "@cliffy/command";
import { createInitCommand } from "./init-command.ts";
import { createServeCommand } from "./serve-command.ts";
import { createStdioCommand } from "./stdio-command.ts";
import { createUpgradeCommand } from "./upgrade-command.ts";
import { PACKAGE_VERSION } from "./shared/constants.ts";

// Load .env file if present (won't override existing env vars)
try {
  loadSync({ export: true });
} catch {
  // .env not found - ignore
}

/**
 * Main CLI command
 */
// deno-lint-ignore no-explicit-any
export const main: Command<any, any, any, any, any> = new Command()
  .name("pml")
  .version(PACKAGE_VERSION)
  .description(
    "PML - Procedural Memory Layer\n\nIntelligent MCP orchestration with learning capabilities.",
  )
  .command("init", createInitCommand())
  .command("stdio", createStdioCommand())
  .command("serve", createServeCommand())
  .command("upgrade", createUpgradeCommand());

// Run if called directly
if (import.meta.main) {
  await main.parse(Deno.args);
}
