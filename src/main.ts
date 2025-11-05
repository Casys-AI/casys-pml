/**
 * AgentCards - MCP Server Context Optimization Engine
 *
 * Main entry point for the application.
 *
 * @module main
 */

import { Command } from "@cliffy/command";
import { createInitCommand } from "./cli/commands/init.ts";
import { setupLogger } from "./telemetry/index.ts";
import { createDefaultClient } from "./db/client.ts";
import { TelemetryService } from "./telemetry/telemetry.ts";
import { MigrationRunner, getAllMigrations } from "./db/migrations.ts";

/**
 * Handle --telemetry and --no-telemetry CLI flags
 *
 * Processes telemetry flags before command execution to enable/disable telemetry.
 * Initializes database and runs migrations if needed.
 */
async function handleTelemetryFlags(): Promise<void> {
  // Check if --telemetry or --no-telemetry is in args
  const hasTelemetryFlag = Deno.args.includes("--telemetry");
  const hasNoTelemetryFlag = Deno.args.includes("--no-telemetry");

  if (!hasTelemetryFlag && !hasNoTelemetryFlag) {
    return; // No telemetry flags, skip
  }

  // Initialize database
  const db = createDefaultClient();
  await db.connect();

  // Run migrations to ensure metrics table exists
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());

  // Create telemetry service
  const telemetry = new TelemetryService(db);

  // Set enabled state (--telemetry enables, --no-telemetry disables)
  const enabled = hasTelemetryFlag;
  await telemetry.setEnabled(enabled);

  console.log(`✓ Telemetry ${enabled ? 'enabled' : 'disabled'}`);

  await db.close();
}

/**
 * Main CLI application
 */
export async function main(): Promise<void> {
  // Initialize logging first
  await setupLogger();

  // Handle telemetry flags before command parsing
  await handleTelemetryFlags();

  await new Command()
    .name("agentcards")
    .version("0.1.0")
    .description("MCP Server Context Optimization Engine")
    .globalOption("--telemetry", "Enable telemetry (opt-in)")
    .globalOption("--no-telemetry", "Disable telemetry")
    .command("init", createInitCommand())
    .parse(Deno.args);
}

// Run main if this is the entry point
if (import.meta.main) {
  main();
}
