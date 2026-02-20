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

/**
 * Default MCP namespace for standard tools (pml.mcp)
 */
export const MCP_DEFAULT_ORG = "pml";
export const MCP_DEFAULT_PROJECT = "mcp";

/**
 * Build FQDN for an MCP standard tool.
 * Format: pml.mcp.{namespace}.{action}
 *
 * @param namespace - Tool namespace (e.g., "std", "memory")
 * @param action - Tool action (e.g., "fs_list", "create_entities")
 * @returns FQDN string: pml.mcp.namespace.action
 */
export function buildMcpFqdn(namespace: string, action: string): string {
  return `${MCP_DEFAULT_ORG}.${MCP_DEFAULT_PROJECT}.${namespace}.${action}`;
}

/**
 * Capability record type for FQDN resolution
 */
export interface CapabilityRecord {
  org: string;
  project: string;
  namespace: string;
  action: string;
  hash: string;
}

/**
 * MCP tool record type (from pml_registry)
 */
export interface McpToolRecord {
  fqdn: string;  // Full 5-part FQDN with hash
}

/**
 * Options for FQDN resolution
 */
export interface ResolveFqdnOptions {
  /** Lookup in capability_records (user scope + public) */
  lookupCapability?: (
    toolId: string,
    scope: UserScope,
  ) => Promise<CapabilityRecord | null>;

  /** Lookup in pml_registry (MCP standard tools) */
  lookupMcpTool?: (
    fqdnWithoutHash: string,
  ) => Promise<McpToolRecord | null>;
}

/**
 * Resolve tool ID to FQDN with proper resolution order.
 *
 * Resolution order:
 * 1. User's private capabilities (capability_records WHERE org=user.org)
 * 2. Public capabilities (capability_records WHERE visibility='public')
 * 3. MCP standard tools (pml_registry WHERE org='pml' AND project='mcp')
 * 4. Error if not found anywhere
 *
 * @param toolId - Tool ID in "namespace:action" format
 * @param scope - User scope for registry lookup
 * @param options - Lookup functions for capability registry and MCP registry
 * @returns FQDN string
 * @throws Error if tool not found in any registry
 *
 * @example
 * ```typescript
 * const fqdn = await resolveToolFqdn("std:fs_list", scope, {
 *   lookupCapability: async (id, s) => await capRegistry.resolveByName(id, s),
 *   lookupMcpTool: async (fqdn) => await mcpRegistry.getByFqdnWithoutHash(fqdn),
 * });
 * // → "pml.mcp.std.fs_list.a1b2" (from pml_registry)
 *
 * const fqdn2 = await resolveToolFqdn("my_cap:fetch", scope, { ... });
 * // → "alice.default.my_cap.fetch.c3d4" (from capability_records)
 * ```
 */
export async function resolveToolFqdn(
  toolId: string,
  scope: UserScope,
  options: ResolveFqdnOptions = {},
): Promise<string> {
  const { lookupCapability, lookupMcpTool } = options;

  const colonIndex = toolId.indexOf(":");
  const namespace = colonIndex > 0 ? toolId.substring(0, colonIndex) : "misc";
  const action = colonIndex > 0 ? toolId.substring(colonIndex + 1) : toolId;

  // 1. Try capability registry lookup (user scope + public)
  if (lookupCapability) {
    const record = await lookupCapability(toolId, scope);
    if (record) {
      // Use record's FQDN (user capability or public capability)
      return buildFqdn(
        { org: record.org, project: record.project },
        record.namespace,
        record.action,
        record.hash,
      );
    }
  }

  // 2. Try MCP registry lookup (pml.mcp namespace)
  const mcpFqdnWithoutHash = buildMcpFqdn(namespace, action);
  if (lookupMcpTool) {
    const mcpRecord = await lookupMcpTool(mcpFqdnWithoutHash);
    if (mcpRecord) {
      return mcpRecord.fqdn;  // Full FQDN with hash from pml_registry
    }
  }

  // 3. No lookup functions provided - assume MCP standard tool (legacy fallback)
  // This allows the function to work without DB access during testing
  if (!lookupCapability && !lookupMcpTool) {
    return mcpFqdnWithoutHash;
  }

  // 4. Not found in any registry
  throw new Error(`Tool not found: ${toolId} (checked capability_records and pml_registry)`);
}

/**
 * Batch-resolve tool IDs to FQDNs for DB storage (ADR-068).
 *
 * Skips internal pseudo-tools (code:*, loop:*) — they pass through unchanged.
 * Falls back to original ID if resolution fails (graceful degradation).
 *
 * @param toolIds - Tool IDs in short format ("std:psql_query")
 * @param scope - User scope for registry lookup
 * @param options - Lookup functions (same as resolveToolFqdn)
 * @returns Array of FQDNs (or original ID if resolution fails)
 */
export async function resolveToolIdsToFqdns(
  toolIds: string[],
  scope: UserScope,
  options: ResolveFqdnOptions = {},
): Promise<string[]> {
  return Promise.all(
    toolIds.map(async (toolId) => {
      try {
        // Internal pseudo-tools are not MCP tools — keep as-is
        if (toolId.startsWith("code:") || toolId.startsWith("loop:")) {
          return toolId;
        }
        return await resolveToolFqdn(toolId, scope, options);
      } catch {
        // Resolution failed — keep original ID rather than losing data
        log.debug(`[resolveToolIdsToFqdns] Failed to resolve ${toolId} to FQDN, keeping original`);
        return toolId;
      }
    }),
  );
}
