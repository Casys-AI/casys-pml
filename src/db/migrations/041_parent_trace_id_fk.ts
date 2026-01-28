/**
 * Migration 041: Ensure parent_trace_id FK constraint
 *
 * ADR-041: Parent-child trace hierarchy for nested capability execution.
 *
 * This migration ensures the FK constraint on parent_trace_id is properly
 * configured. The constraint is DEFERRABLE INITIALLY DEFERRED to allow
 * batch inserts where children might be inserted before parents within
 * the same transaction.
 *
 * @module db/migrations/041_parent_trace_id_fk
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "041_parent_trace_id_fk";

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Ensuring parent_trace_id FK constraint...`);

  // Step 1: Drop existing FK constraint if it exists
  try {
    await db.exec(`
      ALTER TABLE execution_trace
      DROP CONSTRAINT IF EXISTS execution_trace_parent_trace_id_fkey
    `);
    log.info(`[${MIGRATION_NAME}] Dropped existing FK constraint`);
  } catch {
    log.info(`[${MIGRATION_NAME}] No existing FK constraint to drop`);
  }

  // Step 2: Clean up any orphan parent_trace_id references
  await db.exec(`
    UPDATE execution_trace
    SET parent_trace_id = NULL
    WHERE parent_trace_id IS NOT NULL
      AND parent_trace_id NOT IN (SELECT id FROM execution_trace)
  `);
  log.info(`[${MIGRATION_NAME}] Cleaned up orphan references`);

  // Step 3: Add FK constraint (DEFERRABLE for batch insert safety)
  await db.exec(`
    ALTER TABLE execution_trace
    ADD CONSTRAINT execution_trace_parent_trace_id_fkey
    FOREIGN KEY (parent_trace_id)
    REFERENCES execution_trace(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED
  `);

  log.info(`[${MIGRATION_NAME}] ✓ FK constraint added (DEFERRABLE INITIALLY DEFERRED)`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Reverting FK constraint...`);

  // Drop the deferrable constraint
  await db.exec(`
    ALTER TABLE execution_trace
    DROP CONSTRAINT IF EXISTS execution_trace_parent_trace_id_fkey
  `);

  // Re-add as non-deferrable (original from migration 020)
  await db.exec(`
    ALTER TABLE execution_trace
    ADD CONSTRAINT execution_trace_parent_trace_id_fkey
    FOREIGN KEY (parent_trace_id)
    REFERENCES execution_trace(id)
    ON DELETE SET NULL
  `);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createParentTraceIdFkMigration(): Migration {
  return {
    version: 41,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
