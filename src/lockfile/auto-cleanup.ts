/**
 * Lockfile Auto-Cleanup (Story 14.7 AC13)
 *
 * Removes lockfile entries that are no longer in user's permissions.
 *
 * @module lockfile/auto-cleanup
 */

import type { CleanupOptions, CleanupResult } from "./types.ts";
import { fqdnBase, LockfileManager } from "./lockfile-manager.ts";

/**
 * Clean up lockfile entries not in permissions.
 *
 * AC13: Auto-cleanup when MCP removed from permissions.
 *
 * @param manager - Lockfile manager instance
 * @param options - Cleanup options
 * @returns Cleanup result
 */
export async function cleanupLockfile(
  manager: LockfileManager,
  options: CleanupOptions,
): Promise<CleanupResult> {
  const { keepFqdns, execute = false } = options;

  // Normalize keepFqdns to bases
  const keepBases = new Set(keepFqdns.map(fqdnBase));

  // Get all current entries
  const allBases = await manager.getAllFqdnBases();

  // Determine what to remove
  const toRemove: string[] = [];
  const toKeep: string[] = [];

  for (const base of allBases) {
    if (keepBases.has(base)) {
      toKeep.push(base);
    } else {
      toRemove.push(base);
    }
  }

  // Execute removal if requested
  if (execute) {
    for (const base of toRemove) {
      await manager.removeEntry(base);
    }
  }

  return {
    removed: toRemove,
    kept: toKeep,
    executed: execute,
  };
}

/**
 * Clean up stale entries older than specified days.
 *
 * @param manager - Lockfile manager instance
 * @param maxAgeDays - Maximum age in days
 * @param execute - Whether to actually delete
 * @returns Cleanup result
 */
export async function cleanupStaleEntries(
  manager: LockfileManager,
  maxAgeDays: number,
  execute = false,
): Promise<CleanupResult> {
  const entries = await manager.getAllEntries();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const toRemove: string[] = [];
  const toKeep: string[] = [];

  for (const entry of entries) {
    const lastValidated = new Date(entry.lastValidated);
    const base = fqdnBase(entry.fqdn);

    if (lastValidated < cutoffDate) {
      toRemove.push(base);
    } else {
      toKeep.push(base);
    }
  }

  if (execute) {
    for (const base of toRemove) {
      await manager.removeEntry(base);
    }
  }

  return {
    removed: toRemove,
    kept: toKeep,
    executed: execute,
  };
}

/**
 * Sync lockfile with current permissions.
 *
 * Convenience function that combines cleanup with current state.
 *
 * @param manager - Lockfile manager instance
 * @param currentPermissions - List of FQDNs currently in permissions
 * @returns Cleanup result
 */
export async function syncWithPermissions(
  manager: LockfileManager,
  currentPermissions: string[],
): Promise<CleanupResult> {
  return await cleanupLockfile(manager, {
    keepFqdns: currentPermissions,
    execute: true,
  });
}
