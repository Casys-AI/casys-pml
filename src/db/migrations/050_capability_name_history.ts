/**
 * Migration 049: Capability Name History
 *
 * Tracks capability renames so that old names in execution traces
 * can be mapped to current names during GRU training.
 *
 * Without this, renaming a capability orphans all historical traces
 * that reference the old name (~15% of training data lost).
 *
 * Each row = one rename event: old_name -> new_name at renamed_at.
 * A chain of renames (A->B->C) produces two rows: (A,B) and (B,C).
 * To resolve the current name, follow the chain: A->B->C.
 *
 * Multi-tenant: org + project stored so rename resolution can be
 * scoped per tenant. Two tenants can have same namespace:action
 * pointing to different capabilities.
 *
 * FQDN = org.project.namespace.action.hash (5 parts).
 * old_fqdn/new_fqdn generated for full traceability.
 */

import type { Migration } from "../migrations.ts";

export function createCapabilityNameHistoryMigration(): Migration {
  return {
    version: 50,
    name: "capability_name_history",
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS capability_name_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          capability_id UUID NOT NULL,
          org TEXT NOT NULL DEFAULT 'local',
          project TEXT NOT NULL DEFAULT 'default',
          old_namespace TEXT NOT NULL,
          old_action TEXT NOT NULL,
          old_hash TEXT NOT NULL DEFAULT '',
          new_namespace TEXT NOT NULL,
          new_action TEXT NOT NULL,
          new_hash TEXT NOT NULL DEFAULT '',
          old_name TEXT GENERATED ALWAYS AS (old_namespace || ':' || old_action) STORED,
          new_name TEXT GENERATED ALWAYS AS (new_namespace || ':' || new_action) STORED,
          old_fqdn TEXT GENERATED ALWAYS AS (org || '.' || project || '.' || old_namespace || '.' || old_action || '.' || old_hash) STORED,
          new_fqdn TEXT GENERATED ALWAYS AS (org || '.' || project || '.' || new_namespace || '.' || new_action || '.' || new_hash) STORED,
          renamed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          user_id UUID
        );

        CREATE INDEX IF NOT EXISTS idx_cap_name_history_old
          ON capability_name_history(old_name);

        CREATE INDEX IF NOT EXISTS idx_cap_name_history_old_fqdn
          ON capability_name_history(old_fqdn);

        CREATE INDEX IF NOT EXISTS idx_cap_name_history_capability
          ON capability_name_history(capability_id);

        CREATE INDEX IF NOT EXISTS idx_cap_name_history_scope
          ON capability_name_history(org, project);

        COMMENT ON TABLE capability_name_history IS
          'Tracks capability renames for resolving old names in execution traces during GRU training. Multi-tenant via org+project scope.';
      `);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS capability_name_history;`);
    },
  };
}
