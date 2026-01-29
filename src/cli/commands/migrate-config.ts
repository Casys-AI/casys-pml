/**
 * Migrate Config Command
 *
 * Migrates legacy YAML configuration to JSON format (ADR-009)
 *
 * @module cli/commands/migrate-config
 */

import { Command } from "@cliffy/command";
import { parse as parseYAML } from "@std/yaml";
import { getAgentCardsConfigPath, getLegacyConfigPath } from "../utils.ts";

/**
 * Migrate config command options
 */
interface MigrateConfigOptions {
  force: boolean;
}

/**
 * Server entry from YAML config
 */
interface YamlServerEntry {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transform YAML server array to JSON object format
 */
function transformServersToJson(servers: YamlServerEntry[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};

  for (const server of servers) {
    mcpServers[server.id] = {
      command: server.command,
      ...(server.args && { args: server.args }),
      ...(server.env && { env: server.env }),
    };
  }

  return mcpServers;
}

/**
 * Convert YAML config to JSON format
 */
function convertYamlToJson(yamlConfig: Record<string, unknown>): Record<string, unknown> {
  if (yamlConfig.servers && Array.isArray(yamlConfig.servers)) {
    return {
      mcpServers: transformServersToJson(yamlConfig.servers as YamlServerEntry[]),
      context: yamlConfig.context ?? { topK: 10, similarityThreshold: 0.7 },
      execution: yamlConfig.execution ?? { maxConcurrency: 10, timeout: 30000 },
    };
  }

  if (yamlConfig.mcpServers) {
    return yamlConfig;
  }

  throw new Error("Unknown YAML config format. Expected: { servers: [...] } or { mcpServers: {...} }");
}

/**
 * Execute the migration
 */
async function executeMigration(yamlPath: string, jsonPath: string, force: boolean): Promise<void> {
  console.log("🔄 Migrating configuration: YAML → JSON\n");
  console.log(`  Source: ${yamlPath}`);
  console.log(`  Target: ${jsonPath}\n`);

  if (!await fileExists(yamlPath)) {
    console.log("❌ No YAML config found. Nothing to migrate.");
    console.log(`   Expected location: ${yamlPath}\n`);
    return;
  }

  const jsonExists = await fileExists(jsonPath);
  if (jsonExists && !force) {
    console.log("⚠️  JSON config already exists:");
    console.log(`   ${jsonPath}`);
    console.log("\n   Use --force to overwrite, or delete the JSON file manually.\n");
    return;
  }

  if (jsonExists && force) {
    console.log("⚠️  Overwriting existing JSON config (--force)\n");
  }

  const yamlContent = await Deno.readTextFile(yamlPath);
  const yamlConfig = parseYAML(yamlContent) as Record<string, unknown>;
  const jsonConfig = convertYamlToJson(yamlConfig);
  const jsonContent = JSON.stringify(jsonConfig, null, 2);

  await Deno.writeTextFile(jsonPath, jsonContent);

  console.log("✅ Migration complete!\n");
  console.log(`  JSON config created: ${jsonPath}`);
  console.log(`  Format: MCP ecosystem compatible\n`);
  console.log("🗑️  You can now delete the old YAML config:");
  console.log(`   rm ${yamlPath}\n`);
  console.log("💡 Tip: Casys PML will now use the JSON config automatically.");
}

/**
 * Create migrate-config command
 *
 * Usage:
 *   pml migrate-config          # Migrate YAML -> JSON
 *   pml migrate-config --force  # Overwrite existing JSON
 */
export function createMigrateConfigCommand() {
  return new Command()
    .name("migrate-config")
    .description("Migrate YAML configuration to JSON (ADR-009: MCP ecosystem alignment)")
    .option("--force", "Overwrite existing JSON config if it exists", { default: false })
    .action(async (options: MigrateConfigOptions) => {
      try {
        await executeMigration(getLegacyConfigPath(), getAgentCardsConfigPath(), options.force);
      } catch (error) {
        console.error(`❌ Migration failed: ${error instanceof Error ? error.message : error}`);
        Deno.exit(1);
      }
    });
}
