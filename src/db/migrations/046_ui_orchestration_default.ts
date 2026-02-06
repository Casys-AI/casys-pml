/**
 * Migration 046: Add DEFAULT to ui_orchestration column
 *
 * Story 16.6: Composite UI Viewer & Editor (review follow-up)
 *
 * Adds a sensible DEFAULT for capability_records.ui_orchestration so new
 * capabilities get a valid orchestration state without NULL handling.
 *
 * NOTE: tool_schema.ui_meta intentionally stays without DEFAULT.
 * NULL means "tool has no UI" and the partial index
 * `idx_tool_schema_has_ui WHERE ui_meta IS NOT NULL` relies on this semantic.
 *
 * @module db/migrations/046_ui_orchestration_default
 */

import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createUiOrchestrationDefaultMigration() {
  return {
    version: 46,
    name: "ui_orchestration_default",
    up: async (db: DbClient) => {
      await db.exec(`
        ALTER TABLE capability_records
        ALTER COLUMN ui_orchestration
        SET DEFAULT '{"layout":"stack","sync":[]}'::jsonb;
      `);
      log.info("  ✓ Set DEFAULT for capability_records.ui_orchestration");
    },
    down: async (db: DbClient) => {
      await db.exec(`
        ALTER TABLE capability_records
        ALTER COLUMN ui_orchestration
        DROP DEFAULT;
      `);
      log.info("  ✓ Dropped DEFAULT for capability_records.ui_orchestration");
    },
  };
}
