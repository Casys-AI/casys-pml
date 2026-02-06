/**
 * Migration 044: Add UI metadata columns for MCP Apps orchestration
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Adds:
 * 1. tool_schema.ui_meta JSONB - Stores _meta.ui from MCP tools (resourceUri, emits, accepts)
 * 2. capability_records.ui_orchestration JSONB - Stores layout + sync rules per capability
 *
 * Schema:
 * - ui_meta: { resourceUri?: string; emits?: string[]; accepts?: string[] }
 * - ui_orchestration: { layout: "split"|"tabs"|"grid"|"stack"; sync?: SyncRule[]; sharedContext?: string[] }
 *
 * @module db/migrations/044_ui_metadata
 */

import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createUiMetadataMigration() {
  return {
    version: 44,
    name: "ui_metadata",
    up: async (db: DbClient) => {
      // 1. Add ui_meta to tool_schema for MCP Apps UI resource information
      await db.exec(`
        ALTER TABLE tool_schema
        ADD COLUMN IF NOT EXISTS ui_meta JSONB;
      `);
      log.info("  ✓ Added tool_schema.ui_meta JSONB column");

      // 2. Add ui_orchestration to capability_records for layout/sync rules
      await db.exec(`
        ALTER TABLE capability_records
        ADD COLUMN IF NOT EXISTS ui_orchestration JSONB;
      `);
      log.info("  ✓ Added capability_records.ui_orchestration JSONB column");

      // 3. Create index for querying tools with UI resources
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tool_schema_has_ui
        ON tool_schema ((ui_meta IS NOT NULL))
        WHERE ui_meta IS NOT NULL;
      `);
      log.info("  ✓ Created partial index idx_tool_schema_has_ui");
    },
    down: async (db: DbClient) => {
      await db.exec(`
        DROP INDEX IF EXISTS idx_tool_schema_has_ui;
      `);
      log.info("  ✓ Dropped index idx_tool_schema_has_ui");

      await db.exec(`
        ALTER TABLE capability_records
        DROP COLUMN IF EXISTS ui_orchestration;
      `);
      log.info("  ✓ Dropped capability_records.ui_orchestration column");

      await db.exec(`
        ALTER TABLE tool_schema
        DROP COLUMN IF EXISTS ui_meta;
      `);
      log.info("  ✓ Dropped tool_schema.ui_meta column");
    },
  };
}
