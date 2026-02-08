/**
 * Migration 005: Users Table
 *
 * Creates the users table for multi-tenant support.
 * This table is referenced by tool_observations and other multi-tenant tables.
 *
 * Note: In production, this table may already exist (created by Fresh auth).
 * This migration ensures it exists for test environments (PGlite).
 *
 * @module db/migrations/005_users_table
 */

import type { DbClient } from "../types.ts";

export function createUsersTableMigration() {
  return {
    version: 5,
    name: "users_table",
    up: async (db: DbClient) => {
      // Create users table if not exists
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT,
          email TEXT,
          role TEXT DEFAULT 'user',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          github_id TEXT,
          avatar_url TEXT,
          api_key_hash TEXT,
          api_key_prefix TEXT,
          api_key_created_at TIMESTAMPTZ
        );
      `);

      // Create indexes
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
      `);

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_api_key_prefix ON users(api_key_prefix);
      `);
    },
    down: async (db: DbClient) => {
      await db.exec("DROP TABLE IF EXISTS users CASCADE;");
    },
  };
}
