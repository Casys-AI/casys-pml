/**
 * Workflows Command (Story 5.2)
 *
 * CLI command to manage workflow templates for graph bootstrap.
 *
 * @module cli/commands/workflows
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import { createDefaultClient } from "../../db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../db/migrations.ts";
import { WorkflowSyncService } from "../../graphrag/workflow-sync.ts";
import { WorkflowLoader } from "../../graphrag/workflow-loader.ts";
import { getWorkflowTemplatesPath } from "../utils.ts";
import { getMappingStats, scrapeAndSave } from "../../graphrag/workflow-patterns/mod.ts";
import type { PGliteClient } from "../../db/client.ts";

/**
 * Sync subcommand options
 */
interface SyncOptions {
  file: string;
  force: boolean;
}

/**
 * Validate subcommand options
 */
interface ValidateOptions {
  file: string;
}

/**
 * Scrape subcommand options
 */
interface ScrapeOptions {
  limit: number;
  minViews: number;
  output: string;
  delay: number;
  mappingStats: boolean;
}

/**
 * Default workflow templates path
 */
const DEFAULT_WORKFLOW_PATH = getWorkflowTemplatesPath();

/**
 * Initialize database with migrations
 */
async function initializeDatabase(): Promise<PGliteClient> {
  const db = createDefaultClient();
  await db.connect();
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  return db;
}

/**
 * Create workflows command group
 *
 * Usage:
 *   pml workflows sync              # Sync workflow templates to graph
 *   pml workflows sync --force      # Force sync even if unchanged
 *   pml workflows validate          # Validate YAML without syncing
 *   pml workflows stats             # Show edge statistics
 *   pml workflows scrape            # Scrape n8n templates for patterns
 *   pml workflows scrape --limit 100 # Limit to 100 workflows
 */
export function createWorkflowsCommand() {
  return new Command()
    .name("workflows")
    .description("Manage workflow templates for graph bootstrap (Story 5.2)")
    .command("sync", createSyncSubcommand())
    .command("validate", createValidateSubcommand())
    .command("stats", createStatsSubcommand())
    .command("scrape", createScrapeSubcommand());
}

/**
 * Create sync subcommand
 *
 * Syncs workflow templates from YAML to tool_dependency table.
 * Uses checksum to skip sync if file unchanged (AC #4).
 */
function createSyncSubcommand() {
  return new Command()
    .name("sync")
    .description("Sync workflow templates from YAML to graph database")
    .option("--file <path:string>", "Path to workflow templates YAML", { default: DEFAULT_WORKFLOW_PATH })
    .option("--force", "Force sync even if file unchanged", { default: false })
    .action(async (options: SyncOptions) => {
      try {
        log.info("🔄 Syncing workflow templates...\n");

        const db = await initializeDatabase();
        const syncService = new WorkflowSyncService(db);
        const result = await syncService.sync(options.file, options.force);

        if (!result.success) {
          console.error(`\n❌ Sync failed: ${result.error}`);
          await db.close();
          Deno.exit(1);
        }

        console.log("\n✅ Sync complete!");
        console.log(`   Workflows processed: ${result.workflowsProcessed}`);
        console.log(`   Edges created: ${result.edgesCreated}`);
        console.log(`   Edges updated: ${result.edgesUpdated}`);

        if (result.warnings.length > 0) {
          console.log("\n⚠️  Warnings:");
          for (const warning of result.warnings) {
            console.log(`   - ${warning}`);
          }
        }

        await db.close();
      } catch (error) {
        log.error(`❌ Sync failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Create validate subcommand
 *
 * Validates workflow YAML without syncing to database.
 */
function createValidateSubcommand() {
  return new Command()
    .name("validate")
    .description("Validate workflow templates YAML without syncing")
    .option("--file <path:string>", "Path to workflow templates YAML", { default: DEFAULT_WORKFLOW_PATH })
    .action(async (options: ValidateOptions) => {
      try {
        log.info("🔍 Validating workflow templates...\n");

        const loader = new WorkflowLoader();
        const { workflows, validationResults, edges } = await loader.loadAndProcess(options.file);

        const valid = validationResults.filter((r) => r.valid);
        const invalid = validationResults.filter((r) => !r.valid);
        const warningCount = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);

        console.log(`\n📋 Validation Results:`);
        console.log(`   Total workflows: ${workflows.length}`);
        console.log(`   Valid: ${valid.length}`);
        console.log(`   Invalid: ${invalid.length}`);
        console.log(`   Warnings: ${warningCount}`);
        console.log(`   Edges to create: ${edges.length}`);

        if (invalid.length > 0) {
          console.log("\n❌ Invalid workflows:");
          for (const result of invalid) {
            console.log(`   ${result.workflow.name ?? "(unnamed)"}:`);
            for (const error of result.errors) {
              console.log(`     - ${error}`);
            }
          }
        }

        if (warningCount > 0) {
          console.log("\n⚠️  Warnings:");
          for (const result of validationResults) {
            for (const warning of result.warnings) {
              console.log(`   - ${warning}`);
            }
          }
        }

        if (invalid.length === 0) {
          console.log("\n✅ All workflows are valid!");
        } else {
          Deno.exit(1);
        }
      } catch (error) {
        log.error(`❌ Validation failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Create stats subcommand
 *
 * Shows statistics about workflow edges in the database.
 */
function createStatsSubcommand() {
  return new Command()
    .name("stats")
    .description("Show workflow edge statistics from database")
    .action(async () => {
      try {
        log.info("📊 Loading edge statistics...\n");

        const db = await initializeDatabase();
        const syncService = new WorkflowSyncService(db);
        const stats = await syncService.getEdgeStats();

        const userPct = stats.total > 0 ? ((stats.user / stats.total) * 100).toFixed(1) : "0.0";

        console.log(`\n📊 Edge Statistics:`);
        console.log(`   Total edges: ${stats.total}`);
        console.log(`   User-defined (from YAML): ${stats.user}`);
        console.log(`   Learned (from executions): ${stats.learned}`);
        console.log(`   User-defined percentage: ${userPct}%`);

        if (stats.total === 0) {
          console.log("\n⚠️  Graph is empty. Run 'pml workflows sync' to bootstrap.");
        }

        await db.close();
      } catch (error) {
        log.error(`❌ Stats failed: ${error}`);
        Deno.exit(1);
      }
    });
}

/**
 * Display mapping statistics
 */
function displayMappingStats(): void {
  const stats = getMappingStats();
  console.log("\n📊 Tool Mapping Statistics:");
  console.log(`   Total mappings: ${stats.totalMappings}`);
  console.log("\n   By service:");
  for (const [service, count] of Object.entries(stats.byService)) {
    console.log(`     ${service}: ${count}`);
  }
}

/**
 * Execute the scrape operation
 */
async function executeScrape(options: ScrapeOptions): Promise<void> {
  console.log("\n🕷️  Scraping n8n workflow templates...\n");
  console.log(`   Max workflows: ${options.limit}`);
  console.log(`   Min views: ${options.minViews}`);
  console.log(`   Output: ${options.output}`);
  console.log(`   Request delay: ${options.delay}ms\n`);

  const { stats } = await scrapeAndSave(
    {
      maxWorkflows: options.limit,
      minViews: options.minViews,
      requestDelay: options.delay,
    },
    options.output,
  );

  const mappedPct = stats.uniquePatterns > 0
    ? ((stats.mappedPatterns / stats.uniquePatterns) * 100).toFixed(1)
    : "0.0";

  console.log("\n✅ Scrape complete!");
  console.log(`   Workflows processed: ${stats.workflowsProcessed}`);
  console.log(`   Edges extracted: ${stats.edgesExtracted}`);
  console.log(`   Unique patterns: ${stats.uniquePatterns}`);
  console.log(`   Mapped to MCP: ${stats.mappedPatterns}`);
  console.log(`   Unmapped: ${stats.unmappedPatterns}`);
  console.log(`   Mapping coverage: ${mappedPct}%`);
  console.log(`\n📁 Patterns saved to: ${options.output}`);
  console.log("\n💡 Next steps:");
  console.log("   1. Review unmapped patterns in the JSON file");
  console.log("   2. Add mappings to tool-mapper.ts for common unmapped nodes");
  console.log("   3. Run 'pml workflows sync-patterns' to inject into DR-DSP");
}

/**
 * Create scrape subcommand
 *
 * Scrapes n8n workflow templates to extract tool co-occurrence patterns.
 * Saves results to config/workflow-patterns.json for DR-DSP injection.
 */
function createScrapeSubcommand() {
  return new Command()
    .name("scrape")
    .description("Scrape n8n workflow templates for tool co-occurrence patterns")
    .option("--limit <count:number>", "Maximum workflows to fetch", { default: 500 })
    .option("--min-views <count:number>", "Minimum view count to include workflow", { default: 100 })
    .option("--output <path:string>", "Output file path", { default: "config/workflow-patterns.json" })
    .option("--delay <ms:number>", "Delay between API requests in milliseconds", { default: 100 })
    .option("--mapping-stats", "Show mapping statistics only, don't scrape", { default: false })
    .action(async (options: ScrapeOptions) => {
      try {
        if (options.mappingStats) {
          displayMappingStats();
          return;
        }
        await executeScrape(options);
      } catch (error) {
        log.error(`❌ Scrape failed: ${error}`);
        Deno.exit(1);
      }
    });
}
