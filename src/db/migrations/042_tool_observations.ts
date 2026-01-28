/**
 * Migration 042: Tool Observations Table
 *
 * Multi-tenant table to track tools discovered from user-configured MCP servers.
 * Supports the "BYOK extended to MCPs" model (Tech-Spec 01).
 *
 * Key concepts:
 * - tool_schema: Global tool definitions (not multi-tenant)
 * - tool_observations: Per-user observations of tools (multi-tenant)
 *
 * We can't know what's NOT available, only what we've observed.
 * Multiple users observing the same tool is aggregated for coverage analysis.
 *
 * @module db/migrations/042_tool_observations
 */

import type { DbClient } from "../types.ts";

export function createToolObservationsMigration() {
  return {
    version: 42,
    name: "tool_observations",
    up: async (db: DbClient) => {
      // Create tool_observations table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS tool_observations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tool_id TEXT NOT NULL,
          server_namespace TEXT NOT NULL,
          observed_args TEXT[] NOT NULL DEFAULT '{}',
          observed_at TIMESTAMPTZ DEFAULT NOW(),

          UNIQUE (user_id, tool_id, observed_args)
        );
      `);

      // Create indexes for common queries
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tool_obs_user
        ON tool_observations(user_id);
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tool_obs_tool
        ON tool_observations(tool_id);
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tool_obs_namespace
        ON tool_observations(server_namespace);
      `);
    },
    down: async (db: DbClient) => {
      await db.exec("DROP TABLE IF EXISTS tool_observations CASCADE;");
    },
  };
}
