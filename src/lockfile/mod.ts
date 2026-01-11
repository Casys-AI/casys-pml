/**
 * Lockfile Module (Story 14.7)
 *
 * Client-side MCP integrity tracking.
 *
 * @module lockfile
 */

// Types
export type {
  AddEntryOptions,
  CleanupOptions,
  CleanupResult,
  IntegrityApprovalRequired,
  IntegrityValidationResult,
  Lockfile,
  LockfileEntry,
  LockfileManagerOptions,
} from "./types.ts";

export {
  IntegrityMismatchError,
  IntegrityRejectedError,
} from "./types.ts";

// Manager
export { fqdnBase, LockfileManager } from "./lockfile-manager.ts";

// Auto-cleanup
export {
  cleanupLockfile,
  cleanupStaleEntries,
  syncWithPermissions,
} from "./auto-cleanup.ts";
