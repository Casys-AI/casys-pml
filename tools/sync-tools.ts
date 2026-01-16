#!/usr/bin/env -S deno run --allow-all --unstable-worker-options --unstable-ffi
/**
 * Sync Tools Script
 *
 * Standalone script to sync MCP tools to database.
 * Can be run anytime without starting the full server.
 *
 * Usage:
 *   deno task tools:sync              # Dev mode (PGlite)
 *   deno task tools:sync:prod         # Prod mode (PostgreSQL)
 *   deno run -A tools/sync-tools.ts --mode=dev --config=./config/.mcp-servers.json
 *
 * @module tools/sync-tools
 */

import { parseArgs } from "jsr:@std/cli@1.0.25/parse-args";
import { load as loadEnv } from "jsr:@std/dotenv@0.225.3";
import * as colors from "jsr:@std/fmt@1.0.8/colors";

import { createClient, getDb } from "../src/db/mod.ts";
import { MigrationRunner, getAllMigrations } from "../src/db/migrations.ts";
import { SchemaExtractor } from "../src/mcp/schema-extractor.ts";
import { EmbeddingModel, generateEmbeddings } from "../src/vector/embeddings.ts";

const DEFAULT_CONFIG_PATH = "./config/.mcp-servers.json";

interface SyncOptions {
  mode: "dev" | "prod";
  config: string;
  syncMode: "update" | "override";
  verbose: boolean;
}

function printUsage() {
  console.log(`
${colors.bold("sync-tools")} - Sync MCP tools to database

${colors.dim("USAGE:")}
  deno task tools:sync [options]
  deno run -A tools/sync-tools.ts [options]

${colors.dim("OPTIONS:")}
  --mode=<dev|prod>     Environment mode (default: dev)
                        dev  = loads .env
                        prod = loads .env.prod

  --update              Only add new tools, keep existing (default)
  --override            Clear all tools and re-sync from scratch

  --config=<path>       Path to MCP servers config (default: ${DEFAULT_CONFIG_PATH})

  --verbose, -v         Enable verbose logging

  --help, -h            Show this help

${colors.dim("EXAMPLES:")}
  # Sync new tools only (incremental)
  deno task tools:sync

  # Full re-sync (clear + reload)
  deno task tools:override

  # Sync to production
  deno task tools:sync:prod

  # Override production
  deno task tools:override:prod
`);
}

function parseOptions(): SyncOptions {
  const args = parseArgs(Deno.args, {
    string: ["mode", "config"],
    boolean: ["update", "override", "verbose", "help"],
    alias: { v: "verbose", h: "help" },
    default: {
      mode: "dev",
      config: DEFAULT_CONFIG_PATH,
      update: false,
      override: false,
      verbose: false,
    },
  });

  if (args.help) {
    printUsage();
    Deno.exit(0);
  }

  const mode = args.mode as string;
  if (mode !== "dev" && mode !== "prod") {
    console.error(colors.red(`Invalid mode: ${mode}. Must be 'dev' or 'prod'.`));
    Deno.exit(1);
  }

  // Determine sync mode (override wins if both specified, update is default)
  const syncMode = args.override ? "override" : "update";

  return {
    mode: mode as "dev" | "prod",
    config: args.config as string,
    syncMode,
    verbose: args.verbose as boolean,
  };
}

async function main() {
  const options = parseOptions();

  console.log(colors.bold("\n🔧 MCP Tools Sync\n"));
  console.log(`  ${colors.dim("Mode:")}     ${options.mode}`);
  console.log(`  ${colors.dim("Sync:")}     ${options.syncMode}`);
  console.log(`  ${colors.dim("Config:")}   ${options.config}`);
  console.log();

  // Check config file exists
  try {
    await Deno.stat(options.config);
  } catch {
    console.error(colors.red(`Config file not found: ${options.config}`));
    Deno.exit(1);
  }

  // Load .env file based on mode
  const envFile = options.mode === "prod" ? ".env.prod" : ".env";
  try {
    await loadEnv({ envPath: envFile, export: true });
    console.log(`  ${colors.dim("Env:")}      ${envFile}`);
  } catch {
    console.error(colors.red(`Failed to load ${envFile}`));
    Deno.exit(1);
  }

  if (!Deno.env.get("DATABASE_URL")) {
    console.error(colors.red(`DATABASE_URL not found in ${envFile}`));
    Deno.exit(1);
  }

  try {
    // 1. Connect to database
    console.log(colors.dim("Connecting to database..."));
    const db = createClient();
    await db.connect();
    console.log(colors.green("✓ Database connected"));

    // 2. Run migrations
    console.log(colors.dim("Running migrations..."));
    const runner = new MigrationRunner(db);
    await runner.runUp(getAllMigrations());
    console.log(colors.green("✓ Migrations complete"));

    // 3. Override mode: clear existing tools
    if (options.syncMode === "override") {
      console.log(colors.yellow("\n🗑 Override mode: clearing existing tools..."));
      await db.query("DELETE FROM tool_embedding");
      await db.query("DELETE FROM tool_schema");
      await db.query("DELETE FROM config WHERE key = 'mcp_config_hash'");
      console.log(colors.green("✓ Cleared tool_schema, tool_embedding, config hash"));
    }

    // 4. Extract schemas
    console.log(colors.dim("\nExtracting tool schemas..."));
    const extractor = new SchemaExtractor(options.config, db);
    const result = await extractor.extractAndStore();

    if (result.totalToolsExtracted === 0) {
      console.log(colors.yellow("\n⚠ No tools extracted. Check your MCP server config."));
    }

    // 5. Generate embeddings
    if (result.totalToolsExtracted > 0) {
      console.log(colors.dim("\nGenerating embeddings..."));
      const embeddingModel = new EmbeddingModel();
      await embeddingModel.load();
      const embeddingResult = await generateEmbeddings(db, embeddingModel);
      console.log(
        colors.green(
          `✓ Embeddings: ${embeddingResult.newlyGenerated} new, ${embeddingResult.cachedCount} cached`
        )
      );
    }

    // 6. Summary
    console.log(colors.bold("\n✅ Sync complete!\n"));
    console.log(`  ${colors.dim("Servers:")}    ${result.successfulServers}/${result.totalServers}`);
    console.log(`  ${colors.dim("Tools:")}      ${result.totalToolsExtracted}`);
    console.log(`  ${colors.dim("Duration:")}   ${result.duration}ms`);

    if (result.failedServers > 0) {
      console.log(colors.yellow(`\n⚠ ${result.failedServers} server(s) failed:`));
      for (const [serverId, error] of result.failures) {
        console.log(`  ${colors.red("•")} ${serverId}: ${error}`);
      }
    }

    console.log();

    // Cleanup
    await db.close();
  } catch (error) {
    console.error(colors.red(`\n❌ Sync failed: ${error}`));
    if (options.verbose && error instanceof Error) {
      console.error(colors.dim(error.stack || ""));
    }
    Deno.exit(1);
  }
}

// Run
main();
