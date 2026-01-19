/**
 * Init Command
 *
 * Initializes a project with PML configuration files.
 *
 * @module cli/init-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { initProject } from "../init/mod.ts";

/**
 * Create init command
 *
 * Usage:
 *   pml init                    # Interactive setup
 *   pml init --yes              # Use defaults, no prompts
 *   pml init --port 3003        # Custom port
 *   pml init --api-key <key>    # Set API key
 */
// deno-lint-ignore no-explicit-any
export function createInitCommand(): Command<any> {
  return new Command()
    .name("init")
    .description("Initialize PML configuration in current directory")
    .option(
      "-y, --yes",
      "Skip prompts and use defaults",
      { default: false },
    )
    .option(
      "-f, --force",
      "Overwrite existing config without backup prompt",
      { default: false },
    )
    .option(
      "-p, --port <port:number>",
      "Server port",
      { default: 3003 },
    )
    .option(
      "-k, --api-key <key:string>",
      "PML API key (for cloud features)",
    )
    .option(
      "--cloud-url <url:string>",
      "PML Cloud URL",
      { default: "https://pml.casys.ai" },
    )
    .action(async (options) => {
      console.log(colors.bold(colors.cyan("\n🚀 PML Init\n")));

      const result = await initProject({
        apiKey: options.apiKey,
        port: options.port,
        cloudUrl: options.cloudUrl,
        yes: options.yes,
        force: options.force,
      });

      if (result.success) {
        console.log(colors.green("\n✓ PML initialized successfully!\n"));
        console.log(`  ${colors.dim("MCP config:")} ${result.mcpConfigPath}`);
        console.log(`  ${colors.dim("PML config:")} ${result.pmlConfigPath}`);
        if (result.backedUp) {
          console.log(`  ${colors.dim("Backup:")} ${result.backedUp}`);
        }
        console.log();
        console.log(colors.dim("Next steps:"));
        console.log(
          `  ${colors.cyan("1.")} Copy .env.example to .env and configure your API keys`,
        );
        console.log(`  ${colors.cyan("2.")} Start your AI agent (Claude Code, Cursor, etc.)`);
        console.log();
      } else {
        console.error(colors.red(`\n✗ Init failed: ${result.error}\n`));
        Deno.exit(1);
      }
    });
}
