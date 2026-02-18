/**
 * Migration 047: Restore intent_embedding on execution_trace
 *
 * Reverses the column removal from migration 030, but with correct semantics:
 * - Migration 030 removed intent_embedding because it stored the CAPABILITY DESCRIPTION embedding
 *   and became stale on rename.
 * - This migration restores it to store the ACTUAL USER INTENT embedding at execution time.
 *   User intents are immutable — renaming a capability doesn't invalidate them.
 *
 * The SELECT_TRACE_WITH_INTENT query uses COALESCE(et.intent_embedding, wp.intent_embedding)
 * so old traces without the column fallback to the capability description (same as before).
 *
 * @module db/migrations/047_restore_trace_intent_embedding
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createRestoreTraceIntentEmbeddingMigration(): Migration {
  return {
    version: 47,
    name: "restore_trace_intent_embedding",
    up: async (db: DbClient) => {
      log.info("Migration 047: Restoring intent_embedding on execution_trace...");

      // 1. Add column (nullable — old traces will be NULL, filled by COALESCE fallback)
      await db.exec(`
        ALTER TABLE execution_trace
        ADD COLUMN IF NOT EXISTS intent_embedding vector(1024)
      `);
      log.info("  ✓ Added intent_embedding column");

      // 2. Add index for ANN search (IVFFlat, lightweight for current volume)
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_exec_trace_intent_embedding
        ON execution_trace
        USING ivfflat (intent_embedding vector_cosine_ops)
        WITH (lists = 20)
      `);
      log.info("  ✓ Created IVFFlat index");

      // 3. Comment explaining the semantic difference from migration 030
      try {
        await db.exec(`
          COMMENT ON COLUMN execution_trace.intent_embedding IS
            'BGE-M3 1024D embedding of the actual user intent at execution time. '
            'NOT the capability description — immutable per trace. '
            'NULL for pre-047 traces (COALESCE fallback to workflow_pattern.intent_embedding).'
        `);
      } catch {
        // Comments are optional
      }

      log.info("✓ Migration 047 complete: intent_embedding restored for diverse training");
    },
    down: async (db: DbClient) => {
      log.info("Migration 047 rollback: Removing intent_embedding...");

      await db.exec(`DROP INDEX IF EXISTS idx_exec_trace_intent_embedding`);
      await db.exec(`ALTER TABLE execution_trace DROP COLUMN IF EXISTS intent_embedding`);

      log.info("Migration 047 rollback complete");
    },
  };
}
