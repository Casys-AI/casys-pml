/**
 * Scope Filter Helper
 *
 * Provides scope-based filtering for capability IDs after SHGAT scoring.
 * Used to enforce multi-tenant isolation by post-filtering results.
 *
 * @module application/use-cases/discover/scope-filter
 */

import type { DbClient } from "../../../db/types.ts";
import type { Scope } from "./types.ts";

/**
 * Filter capability IDs by user scope
 *
 * Returns only the capability IDs that are:
 * - In the user's org/project scope, OR
 * - Have visibility = 'public'
 *
 * This is used to post-filter SHGAT results to enforce multi-tenant isolation.
 *
 * @param db - Database client for query execution
 * @param capabilityIds - Array of capability IDs to filter
 * @param scope - User's org/project scope
 * @returns Set of allowed capability IDs
 *
 * @example
 * ```typescript
 * const shgatResults = shgat.scoreAllCapabilities(embedding);
 * const allowedIds = await filterCapabilityIdsByScope(
 *   db,
 *   shgatResults.map(r => r.capabilityId),
 *   { org: "alice", project: "default" }
 * );
 * const filtered = shgatResults.filter(r => allowedIds.has(r.capabilityId));
 * ```
 */
export async function filterCapabilityIdsByScope(
  db: DbClient,
  capabilityIds: string[],
  scope: Scope,
): Promise<Set<string>> {
  if (capabilityIds.length === 0) {
    return new Set();
  }

  // Query capability_records to find IDs that match scope or are public
  // Uses workflow_pattern_id as the capability ID since that's what SHGAT uses
  interface FilterRow {
    pattern_id: string;
  }

  const rows = (await db.query(
    `
    SELECT wp.pattern_id
    FROM workflow_pattern wp
    JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
    WHERE wp.pattern_id = ANY($1::uuid[])
    AND (
      (cr.org = $2 AND cr.project = $3)
      OR cr.visibility = 'public'
    )
    `,
    [capabilityIds, scope.org, scope.project],
  )) as unknown as FilterRow[];

  return new Set(rows.map((r) => r.pattern_id));
}

/**
 * Filter capability record IDs by user scope (using capability_records.id)
 *
 * Similar to filterCapabilityIdsByScope but uses capability_records.id
 * instead of workflow_pattern.pattern_id.
 *
 * @param db - Database client for query execution
 * @param capabilityRecordIds - Array of capability_records.id to filter
 * @param scope - User's org/project scope
 * @returns Set of allowed capability record IDs
 */
export async function filterCapabilityRecordIdsByScope(
  db: DbClient,
  capabilityRecordIds: string[],
  scope: Scope,
): Promise<Set<string>> {
  if (capabilityRecordIds.length === 0) {
    return new Set();
  }

  interface FilterRow {
    id: string;
  }

  const rows = (await db.query(
    `
    SELECT id
    FROM capability_records
    WHERE id = ANY($1::uuid[])
    AND (
      (org = $2 AND project = $3)
      OR visibility = 'public'
    )
    `,
    [capabilityRecordIds, scope.org, scope.project],
  )) as unknown as FilterRow[];

  return new Set(rows.map((r) => r.id));
}

/**
 * Check if a user can mutate a capability (rename, merge, etc.)
 *
 * Mutations are only allowed on capabilities owned by the user.
 * Public capabilities owned by others cannot be modified.
 *
 * @param db - Database client for query execution
 * @param capabilityId - The capability record ID to check
 * @param userId - The user's ID (null for local mode)
 * @returns True if the user can mutate this capability
 */
export async function canUserMutateCapability(
  db: DbClient,
  capabilityId: string,
  userId: string | null,
): Promise<boolean> {
  // In local mode (no userId), allow mutations on all local capabilities
  if (!userId) {
    interface ScopeRow {
      org: string;
    }
    const rows = (await db.query(
      `SELECT org FROM capability_records WHERE id = $1`,
      [capabilityId],
    )) as unknown as ScopeRow[];

    // Allow mutation if capability is in 'local' org (legacy/system records)
    return rows.length > 0 && rows[0].org === "local";
  }

  // In cloud mode, check ownership via user_id
  interface OwnerRow {
    user_id: string | null;
  }
  const rows = (await db.query(
    `SELECT user_id FROM capability_records WHERE id = $1`,
    [capabilityId],
  )) as unknown as OwnerRow[];

  if (rows.length === 0) {
    return false;
  }

  // Allow mutation if:
  // - user_id is null (legacy/system record)
  // - user_id matches the requesting user
  return rows[0].user_id === null || rows[0].user_id === userId;
}
