/**
 * Migration 040: Add hash column to pml_registry VIEW
 *
 * Fixes bug where registry service recomputes hash instead of using stored hash.
 * The hash from capability_records.hash should be used directly for FQDN matching.
 *
 * Problem:
 * - Client sends FQDN with hash: superWorldSavior.default.std.exec.43e9
 * - Server finds record but recomputes hash from name:description → e38c
 * - Hash mismatch → 404 "Capability not found"
 *
 * Solution:
 * - Add `hash` column to pml_registry VIEW
 * - Service uses stored hash instead of recomputing
 *
 * @module db/migrations/040_pml_registry_hash_column
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

const MIGRATION_NAME = "040_pml_registry_hash_column";

async function up(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Adding hash column to pml_registry VIEW...`);

  // Recreate VIEW with hash column
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
        NULL::text as hash
      FROM tool_schema

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

  log.info(`[${MIGRATION_NAME}] ✓ pml_registry VIEW updated with hash column`);
}

async function down(db: DbClient): Promise<void> {
  log.info(`[${MIGRATION_NAME}] Removing hash column from pml_registry VIEW...`);

  // Drop VIEW first (required for PGlite - doesn't support CREATE OR REPLACE with column changes)
  await db.exec(`DROP VIEW IF EXISTS pml_registry`);

  // Recreate VIEW without hash column (original version from migration 036)
  await db.exec(`
    CREATE VIEW pml_registry AS
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
        'public'::text as visibility
      FROM tool_schema

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
        cr.visibility
      FROM capability_records cr
      LEFT JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
  `);

  log.info(`[${MIGRATION_NAME}] ✓ Rollback complete`);
}

export function createPmlRegistryHashColumnMigration(): Migration {
  return {
    version: 40,
    name: MIGRATION_NAME,
    up,
    down,
  };
}
