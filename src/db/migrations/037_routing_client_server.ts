/**
 * Migration 037: Update routing constraint to client/server terminology
 *
 * The routing column was created with CHECK (routing IN ('local', 'cloud'))
 * but the codebase now uses 'client'/'server' terminology (Story 13.9).
 *
 * This migration:
 * 1. Converts existing 'local' → 'client' and 'cloud' → 'server'
 * 2. Updates the check constraint to accept new values
 *
 * @module db/migrations/037_routing_client_server
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createRoutingClientServerMigration(): Migration {
  return {
    version: 37,
    name: "routing_client_server",
    up: async (db: DbClient) => {
      log.info("Migration 037: Updating routing constraint to client/server...");

      // 1. Drop old constraint FIRST (before UPDATE to avoid violation)
      await db.exec(`
        ALTER TABLE capability_records
        DROP CONSTRAINT IF EXISTS capability_records_routing_check
      `);
      log.info("  ✓ Dropped old routing constraint");

      // 2. Convert existing values (now safe without constraint)
      await db.exec(`
        UPDATE capability_records
        SET routing = CASE
          WHEN routing = 'local' THEN 'client'
          WHEN routing = 'cloud' THEN 'server'
          ELSE routing
        END
        WHERE routing IN ('local', 'cloud')
      `);
      log.info("  ✓ Converted local→client, cloud→server");

      // 3. Add new constraint
      await db.exec(`
        ALTER TABLE capability_records
        ADD CONSTRAINT capability_records_routing_check
        CHECK (routing IN ('client', 'server'))
      `);
      log.info("  ✓ Added new routing constraint (client/server)");

      // 3. Update column comment
      try {
        await db.exec(`
          COMMENT ON COLUMN capability_records.routing IS
            'Execution location: client (local sandbox) or server (pml.casys.ai HTTP RPC)'
        `);
        log.debug("  ✓ Updated column comment");
      } catch {
        // Comments are optional
      }

      log.info("✓ Migration 037 complete: routing constraint updated to client/server");
    },
    down: async (db: DbClient) => {
      log.info("Migration 037 rollback: Reverting to local/cloud terminology...");

      // Convert back
      await db.exec(`
        UPDATE capability_records
        SET routing = CASE
          WHEN routing = 'client' THEN 'local'
          WHEN routing = 'server' THEN 'cloud'
          ELSE routing
        END
        WHERE routing IN ('client', 'server')
      `);

      // Drop new constraint and restore old one
      await db.exec(`
        ALTER TABLE capability_records
        DROP CONSTRAINT IF EXISTS capability_records_routing_check
      `);

      await db.exec(`
        ALTER TABLE capability_records
        ADD CONSTRAINT capability_records_routing_check
        CHECK (routing IN ('local', 'cloud'))
      `);

      log.info("Migration 037 rollback complete");
    },
  };
}
