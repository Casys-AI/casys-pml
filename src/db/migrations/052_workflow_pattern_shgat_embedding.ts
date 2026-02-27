/**
 * Migration 052: Add shgat_embedding to workflow_pattern
 *
 * Stores SHGAT-enriched capability embeddings (message-passing output)
 * alongside the raw BGE-M3 intent_embedding. Used by GRU training to
 * eliminate the tool-cap distribution mismatch in the unified softmax.
 *
 * @module db/migrations/052_workflow_pattern_shgat_embedding
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "052_workflow_pattern_shgat_embedding";

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Adding shgat_embedding to workflow_pattern...`);

  await db.exec(`
    ALTER TABLE workflow_pattern
    ADD COLUMN IF NOT EXISTS shgat_embedding vector(1024)
  `);

  log.info(`[${MIGRATION_NAME}] ✓ shgat_embedding column added (nullable, no index — 672 rows)`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Rolling back...`);

  await db.exec(`ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS shgat_embedding`);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createWorkflowPatternShgatEmbeddingMigration(): Migration {
  return {
    version: 52,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
