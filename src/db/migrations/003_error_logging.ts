/**
 * Migration 003: Error Logging Table
 *
 * Adds error_log table for persisting errors to enable post-mortem analysis.
 * Includes indexes for efficient querying by timestamp and error type.
 *
 * @module db/migrations/003_error_logging
 */

import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";

export function createErrorLoggingMigration(): Migration {
  return {
    version: 3,
    name: "error_logging",
    up: async (db: DbClient) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS error_log (
          id SERIAL PRIMARY KEY,
          error_type TEXT NOT NULL,
          message TEXT NOT NULL,
          stack TEXT,
          context JSONB,
          timestamp TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_error_log_timestamp
        ON error_log (timestamp DESC)
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_error_log_type
        ON error_log (error_type)
      `);
    },
    down: async (db: DbClient) => {
      await db.exec("DROP INDEX IF EXISTS idx_error_log_type;");
      await db.exec("DROP INDEX IF EXISTS idx_error_log_timestamp;");
      await db.exec("DROP TABLE IF EXISTS error_log CASCADE;");
    },
  };
}
