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

// Load .env file if present (won't override existing env vars)
try {
  loadSync({ export: true });
} catch {
  // .env not found - ignore
}

const VERSION = "0.1.0";

/**
 * Main CLI command
 */
export const main = new Command()
  .name("pml")
  .version(VERSION)
  .description(
    "PML - Procedural Memory Layer\n\nIntelligent MCP orchestration with learning capabilities.",
  )
  .command("init", createInitCommand())
  .command("stdio", createStdioCommand())
  .command("serve", createServeCommand());

// Run if called directly
if (import.meta.main) {
  await main.parse(Deno.args);
}
