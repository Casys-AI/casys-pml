/**
 * Migration 053: Add shgat_embedding to tool_embedding
 *
 * Stores SHGAT-enriched tool embeddings (V2V co-occurrence + message passing)
 * alongside the raw BGE-M3 embedding. Previously computed at runtime and discarded.
 * Persisting allows notebooks and inference to use enriched embeddings directly.
 *
 * @module db/migrations/053_tool_embedding_shgat
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "053_tool_embedding_shgat";

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Adding shgat_embedding to tool_embedding...`);

  await db.exec(`
    ALTER TABLE tool_embedding
    ADD COLUMN IF NOT EXISTS shgat_embedding vector(1024)
  `);

  log.info(`[${MIGRATION_NAME}] ✓ shgat_embedding column added (nullable)`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Rolling back...`);

  await db.exec(`ALTER TABLE tool_embedding DROP COLUMN IF EXISTS shgat_embedding`);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createToolEmbeddingShgatMigration(): Migration {
  return {
    version: 53,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
