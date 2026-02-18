#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Backfill intent embeddings on execution_trace (Migration 047)
 *
 * Encodes actual user intents (from initial_context->>'intent') via BGE-M3
 * and stores them in execution_trace.intent_embedding.
 *
 * This enables diverse intent training for SHGAT K-head scoring instead of
 * using the same capability description embedding for all traces.
 *
 * Usage:
 *   source .env && deno run --allow-net --allow-env --allow-read scripts/backfill-intent-embeddings.ts
 *
 * Options:
 *   --dry-run     Show what would be updated without writing
 *   --limit=N     Process only N traces (default: all)
 *
 * @module scripts/backfill-intent-embeddings
 */

import postgres from "postgres";
import { EmbeddingModel } from "../src/vector/embeddings.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

async function main() {
  if (!DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable not set");
    Deno.exit(1);
  }

  const args = Deno.args;
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const dryRun = args.includes("--dry-run");

  console.log("=== Intent Embedding Backfill (Migration 047) ===\n");
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`Limit: ${limit ?? "all"}`);
  console.log(`Dry run: ${dryRun}\n`);

  const sql = postgres(DATABASE_URL);

  try {
    // 1. Find traces with intent text but no embedding
    const rows = await sql`
      SELECT id, initial_context->>'intent' as intent
      FROM execution_trace
      WHERE initial_context->>'intent' IS NOT NULL
        AND initial_context->>'intent' != ''
        AND intent_embedding IS NULL
      ORDER BY executed_at DESC
      ${limit ? sql`LIMIT ${limit}` : sql``}
    `;

    console.log(`Found ${rows.length} traces to backfill\n`);

    if (rows.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    if (dryRun) {
      console.log("Dry run — showing first 10 intents:");
      for (const row of rows.slice(0, 10)) {
        console.log(`  [${row.id.substring(0, 8)}] "${row.intent}"`);
      }
      console.log(`\n... and ${Math.max(0, rows.length - 10)} more.`);
      return;
    }

    // 2. Load BGE-M3 model
    console.log("Loading BGE-M3 model...");
    const model = new EmbeddingModel();
    await model.load();
    console.log("Model loaded.\n");

    // 3. Process in batches
    const BATCH_SIZE = 16;
    let processed = 0;
    let failed = 0;
    const startTime = performance.now();

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        try {
          const embedding = await model.encode(row.intent as string);
          const embStr = `[${embedding.join(",")}]`;

          await sql`
            UPDATE execution_trace
            SET intent_embedding = ${embStr}::vector
            WHERE id = ${row.id}
          `;
          processed++;
        } catch (err) {
          console.warn(`  Failed to encode [${row.id.substring(0, 8)}]: ${err}`);
          failed++;
        }
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / parseFloat(elapsed)).toFixed(1);
      const pct = ((processed / rows.length) * 100).toFixed(0);
      console.log(
        `  ${processed}/${rows.length} (${pct}%) — ${rate}/s — ${elapsed}s elapsed`,
      );
    }

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ Backfill complete: ${processed} updated, ${failed} failed, ${totalTime}s total`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  Deno.exit(1);
});
