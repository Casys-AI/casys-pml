/**
 * Init Command
 *
 * CLI command to migrate Claude Desktop MCP configuration to Casys PML
 *
 * @module cli/commands/init
 */

import { Command } from "@cliffy/command";
import { ConfigMigrator } from "../config-migrator.ts";

/**
 * Init command options
 */
interface InitOptions {
  dryRun: boolean;
  config?: string;
}

/**
 * Create init command
 *
 * Usage:
 *   pml init                    # Auto-detect config and migrate
 *   pml init --dry-run          # Preview migration without changes
 *   pml init --config <path>    # Use custom config path
 */
export function createInitCommand() {
  return new Command()
    .name("init")
    .description("Migrate existing MCP configuration to Casys PML")
    .option("--dry-run", "Preview changes without applying them", { default: false })
    .option("--config <path:string>", "Path to MCP config file (auto-detected if not provided)")
    .action(async (options: InitOptions) => {
      const migrator = new ConfigMigrator();

      const result = await migrator.migrate({
        configPath: options.config,
        dryRun: options.dryRun,
      });

      if (!result.success) {
        Deno.exit(1);
      }
    });
}
