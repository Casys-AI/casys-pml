/**
 * User Helper Module
 *
 * Provides utilities for user-related operations including
 * multi-tenant FQDN generation for capabilities.
 *
 * @module lib/user
 */

import * as log from "@std/log";
import { getDb } from "../server/auth/db.ts";
import { users } from "../db/schema/users.ts";
import { eq } from "drizzle-orm";

/**
 * Default scope for local mode (no authenticated user)
 */
export const DEFAULT_SCOPE = {
  org: "local",
  project: "default",
} as const;

/**
 * User scope for FQDN generation
 */
export interface UserScope {
  org: string;
  project: string;
}

/**
 * Get username by user ID
 *
 * Used for generating user-scoped FQDNs:
 * {username}.{project}.{namespace}.{action}
 *
 * @param userId - UUID of the user
 * @returns Username or null if not found
 *
 * @example
 * ```typescript
 * const username = await getUsernameById("abc-123-uuid");
 * // Returns "alice" or null
 * ```
 */
export async function getUsernameById(userId: string | null): Promise<string | null> {
  if (!userId || userId === "local") {
    return null;
  }

  try {
    const db = await getDb();
    const result = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return result[0]?.username ?? null;
  } catch (error) {
    log.debug(`Failed to get username for user ${userId}: ${error}`);
    return null;
  }
}

/**
 * Get user scope for FQDN generation
 *
 * Returns the org/project to use when creating capabilities.
 * - Cloud mode: Uses authenticated user's username as org
 * - Local mode: Uses "local" as org
 *
 * @param userId - UUID of the authenticated user (or null/local)
 * @returns UserScope with org and project
 *
 * @example
 * ```typescript
 * // Cloud mode with authenticated user
 * const scope = await getUserScope("abc-123-uuid");
 * // { org: "alice", project: "default" }
 *
 * // Local mode
 * const scope = await getUserScope(null);
 * // { org: "local", project: "default" }
 * ```
 */
export async function getUserScope(userId: string | null): Promise<UserScope> {
  const username = await getUsernameById(userId);

  return {
    org: username ?? DEFAULT_SCOPE.org,
    project: DEFAULT_SCOPE.project,
  };
}

/**
 * Build FQDN from scope and capability parts
 *
 * @param scope - User scope (org, project)
 * @param namespace - Capability namespace
 * @param action - Capability action
 * @param hash - Optional 4-char hash
 * @returns Full FQDN string
 *
 * @example
 * ```typescript
 * const fqdn = buildFqdn(
 *   { org: "alice", project: "default" },
 *   "startup",
 *   "fullProfile",
 *   "a1b2"
 * );
 * // "alice.default.startup.fullProfile.a1b2"
 * ```
 */
export function buildFqdn(
  scope: UserScope,
  namespace: string,
  action: string,
  hash?: string,
): string {
  const parts = [scope.org, scope.project, namespace, action];
  if (hash) {
    parts.push(hash);
  }
  return parts.join(".");
}
