/**
 * Migration 049: GRU Parameters Persistence
 *
 * Creates table for persisting GRU transition model weights.
 * Same pattern as shgat_params (migration 027).
 * Single-row table, updated after each training run.
 */

import type { Migration } from "../migrations.ts";

export function createGRUParamsMigration(): Migration {
  return {
    version: 49,
    name: "gru_params",
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS gru_params (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL DEFAULT 'local' UNIQUE,
          params JSONB NOT NULL,
          config JSONB,
          metrics JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_gru_params_user_id ON gru_params(user_id);

        COMMENT ON TABLE gru_params IS 'Persisted GRU transition model weights for next-tool prediction';
      `);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS gru_params;`);
    },
  };
}
