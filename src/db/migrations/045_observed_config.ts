/**
 * Migration 045: Transform observed_args to observed_config
 *
 * Tech-Spec 01.5: Server Config Sync
 *
 * Changes:
 * - Drop observed_args TEXT[] column (was never populated, always {})
 * - Add observed_config JSONB column for { command, args, env }
 * - Change unique constraint from (user_id, tool_id, observed_args) to (user_id, server_namespace)
 *
 * This enables storing MCP server spawn config from client .pml.json
 * so the registry can return metadata.install for execution.
 *
 * @module db/migrations/045_observed_config
 */

import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createObservedConfigMigration() {
  return {
    version: 45,
    name: "observed_config",
    up: async (db: DbClient) => {
      // 1. Drop old unique constraint
      await db.exec(`
        ALTER TABLE tool_observations
        DROP CONSTRAINT IF EXISTS tool_observations_user_id_tool_id_observed_args_key;
      `);
      log.info("  ✓ Dropped old unique constraint");

      // 2. Drop old column (was never populated)
      await db.exec(`
        ALTER TABLE tool_observations
        DROP COLUMN IF EXISTS observed_args;
      `);
      log.info("  ✓ Dropped observed_args TEXT[] column");

      // 3. Add new JSONB column for full config
      await db.exec(`
        ALTER TABLE tool_observations
        ADD COLUMN IF NOT EXISTS observed_config JSONB NOT NULL DEFAULT '{}';
      `);
      log.info("  ✓ Added observed_config JSONB column");

      // 4. Add comment for documentation (may fail on PGlite - that's OK)
      try {
        await db.exec(`
          COMMENT ON COLUMN tool_observations.observed_config IS
            'MCP server spawn config { command, args, env } from client .pml.json';
        `);
      } catch {
        // PGlite may not support COMMENT ON - skip silently
      }

      // 5. Delete all existing rows - they had empty observed_args anyway
      // The new schema stores one config per server, will be re-populated on next sync
      await db.exec(`DELETE FROM tool_observations;`);
      log.info("  ✓ Cleared old tool_observations (will be re-populated on sync)");

      // 6. New unique constraint: one config per user per server
      await db.exec(`
        ALTER TABLE tool_observations
        ADD CONSTRAINT tool_observations_user_server_unique
        UNIQUE (user_id, server_namespace);
      `);
      log.info("  ✓ Added new unique constraint (user_id, server_namespace)");
    },
    down: async (db: DbClient) => {
      // Reverse the changes
      await db.exec(`
        ALTER TABLE tool_observations
        DROP CONSTRAINT IF EXISTS tool_observations_user_server_unique;
      `);
      log.info("  ✓ Dropped unique constraint tool_observations_user_server_unique");

      await db.exec(`
        ALTER TABLE tool_observations
        DROP COLUMN IF EXISTS observed_config;
      `);
      log.info("  ✓ Dropped observed_config column");

      await db.exec(`
        ALTER TABLE tool_observations
        ADD COLUMN IF NOT EXISTS observed_args TEXT[] NOT NULL DEFAULT '{}';
      `);
      log.info("  ✓ Restored observed_args TEXT[] column");

      await db.exec(`
        ALTER TABLE tool_observations
        ADD CONSTRAINT tool_observations_user_id_tool_id_observed_args_key
        UNIQUE (user_id, tool_id, observed_args);
      `);
      log.info("  ✓ Restored old unique constraint");
    },
  };
}
