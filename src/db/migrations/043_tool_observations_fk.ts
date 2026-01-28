/**
 * Migration 043: Add FK tool_observations → tool_schema
 *
 * F12 Fix: Add foreign key constraint to ensure referential integrity.
 * tool_observations.tool_id must reference an existing tool_schema.tool_id.
 *
 * Note: The sync transaction (F15 fix) inserts tool_schema BEFORE tool_observations,
 * so this FK should not cause issues with the current insert order.
 *
 * @module db/migrations/043_tool_observations_fk
 */

import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createToolObservationsFkMigration() {
  return {
    version: 43,
    name: "tool_observations_fk",
    up: async (db: DbClient) => {
      // Add FK constraint: tool_observations.tool_id → tool_schema.tool_id
      // ON DELETE CASCADE: if a tool is removed from tool_schema, remove its observations
      await db.exec(`
        ALTER TABLE tool_observations
        ADD CONSTRAINT fk_tool_observations_tool_schema
        FOREIGN KEY (tool_id)
        REFERENCES tool_schema(tool_id)
        ON DELETE CASCADE;
      `);

      log.info("  ✓ Added FK constraint tool_observations.tool_id → tool_schema.tool_id");
    },
    down: async (db: DbClient) => {
      await db.exec(`
        ALTER TABLE tool_observations
        DROP CONSTRAINT IF EXISTS fk_tool_observations_tool_schema;
      `);

      log.info("  ✓ Dropped FK constraint fk_tool_observations_tool_schema");
    },
  };
}
