/**
 * Migration 051: Persistent hash + versioning on tool_schema
 *
 * Problem: MCP tool FQDN hash is recomputed at startup from server config.
 * If anything changes (npx version, args, description), hash changes → FQDN changes →
 * traces become orphaned. 13 tools had multiple hashes in production.
 *
 * Solution:
 * 1. Add `hash` column to tool_schema (persisted at sync time)
 * 2. Add `previous_hash` column (for recent trace resolution on schema change)
 * 3. Backfill existing tools with hash computed from name:description
 * 4. Recreate pml_registry VIEW to expose ts.hash instead of NULL
 *
 * @module db/migrations/051_tool_schema_hash
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";
import { generateHash } from "../../capabilities/fqdn.ts";

const MIGRATION_NAME = "051_tool_schema_hash";

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Adding hash + previous_hash to tool_schema...`);

  // 1. Add columns
  await db.exec(`ALTER TABLE tool_schema ADD COLUMN IF NOT EXISTS hash TEXT`);
  await db.exec(`ALTER TABLE tool_schema ADD COLUMN IF NOT EXISTS previous_hash TEXT`);
  log.info(`[${MIGRATION_NAME}] ✓ Columns added`);

  // 2. Backfill: compute hash for existing tools that don't have one
  const rows = await db.query(
    `SELECT tool_id, name, description FROM tool_schema WHERE hash IS NULL`,
  );

  let backfilled = 0;
  for (const row of rows) {
    const name = row.name as string;
    const description = (row.description as string) || "";
    const hashContent = `${name}:${description}`;
    const shortHash = await generateHash(hashContent);

    await db.exec(
      `UPDATE tool_schema SET hash = $1 WHERE tool_id = $2`,
      [shortHash, row.tool_id],
    );
    backfilled++;
  }
  log.info(`[${MIGRATION_NAME}] ✓ Backfilled ${backfilled} tool hashes`);

  // 3. Recreate pml_registry VIEW to expose ts.hash for MCP tools
  await db.exec(`
    CREATE OR REPLACE VIEW pml_registry AS
      -- MCP Tools (from tool_schema)
      SELECT
        'mcp-tool'::text as record_type,
        tool_id as id,
        name,
        description,
        code_url,
        routing,
        server_id,
        NULL::uuid as workflow_pattern_id,
        NULL::text as org,
        NULL::text as project,
        NULL::text as namespace,
        NULL::text as action,
        'public'::text as visibility,
        ts.hash
      FROM tool_schema ts

      UNION ALL

      -- Capabilities (from capability_records + workflow_pattern)
      SELECT
        'capability'::text as record_type,
        cr.id::text as id,
        cr.namespace || ':' || cr.action as name,
        wp.description,
        NULL::text as code_url,
        cr.routing,
        NULL::text as server_id,
        cr.workflow_pattern_id,
        cr.org,
        cr.project,
        cr.namespace,
        cr.action,
        cr.visibility,
        cr.hash
      FROM capability_records cr
      LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
  `);
  log.info(`[${MIGRATION_NAME}] ✓ pml_registry VIEW updated (ts.hash exposed)`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Rolling back...`);

  // Recreate VIEW without ts.hash (back to migration 040 version: NULL::text as hash)
  await db.exec(`
    CREATE OR REPLACE VIEW pml_registry AS
      SELECT
        'mcp-tool'::text as record_type,
        tool_id as id,
        name,
        description,
        code_url,
        routing,
        server_id,
        NULL::uuid as workflow_pattern_id,
        NULL::text as org,
        NULL::text as project,
        NULL::text as namespace,
        NULL::text as action,
        'public'::text as visibility,
        NULL::text as hash
      FROM tool_schema

      UNION ALL

      SELECT
        'capability'::text as record_type,
        cr.id::text as id,
        cr.namespace || ':' || cr.action as name,
        wp.description,
        NULL::text as code_url,
        cr.routing,
        NULL::text as server_id,
        cr.workflow_pattern_id,
        cr.org,
        cr.project,
        cr.namespace,
        cr.action,
        cr.visibility,
        cr.hash
      FROM capability_records cr
      LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
  `);

  await db.exec(`ALTER TABLE tool_schema DROP COLUMN IF EXISTS previous_hash`);
  await db.exec(`ALTER TABLE tool_schema DROP COLUMN IF EXISTS hash`);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createToolSchemaHashMigration(): Migration {
  return {
    version: 51,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
