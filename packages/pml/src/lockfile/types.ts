/**
 * Lockfile Types (Story 14.7)
 *
 * Types for client-side MCP integrity tracking.
 * Lockfile stored at ${workspace}/.pml/mcp.lock (per-project)
 *
 * @module lockfile/types
 */

// ============================================================================
// Lockfile Structure
// ============================================================================

/**
 * Lockfile entry for a single MCP.
 *
 * Tracks the integrity hash at time of first fetch.
 */
export interface LockfileEntry {
  /** Full 5-part FQDN with hash */
  fqdn: string;

  /** Full SHA-256 integrity hash */
  integrity: string;

  /** ISO timestamp of first fetch */
  fetchedAt: string;

  /** ISO timestamp of last validation */
  lastValidated: string;

  /** MCP type at time of fetch (only client-routed types need lockfile) */
  type: "deno" | "stdio";

  /** Whether user approved this entry */
  approved: boolean;
}

/**
 * Lockfile structure stored at ${workspace}/.pml/mcp.lock
 */
export interface Lockfile {
  /** Schema version for migrations */
  version: 1;

  /** Map of 4-part FQDN (without hash) to entry */
  entries: Record<string, LockfileEntry>;

  /** ISO timestamp of last modification */
  updatedAt: string;
}

// ============================================================================
// Validation Results
// ============================================================================

/**
 * Result of integrity validation.
 */
export interface IntegrityValidationResult {
  /** Whether integrity matches lockfile */
  valid: boolean;

  /** Lockfile entry (if exists) */
  lockEntry?: LockfileEntry;

  /** Current integrity from server */
  serverIntegrity: string;

  /** Whether this is a new entry (not in lockfile) */
  isNew: boolean;
}

/**
 * Result when integrity check requires approval.
 */
export interface IntegrityApprovalRequired {
  /** True when approval is required */
  approvalRequired: true;

  /** Discriminant for approval type */
  approvalType: "integrity";

  /** 4-part FQDN (without hash) */
  fqdnBase: string;

  /** Old hash from lockfile (4-char) */
  oldHash: string;

  /** New hash from server (4-char) */
  newHash: string;

  /** When the old entry was fetched */
  oldFetchedAt: string;

  /** Human-readable description */
  description: string;

  /** Workflow ID for continuation */
  workflowId: string;
}

// ============================================================================
// Manager Options
// ============================================================================

/**
 * Options for LockfileManager.
 */
export interface LockfileManagerOptions {
  /** Workspace root path (required for per-project lockfile) */
  workspace?: string;

  /** Path to lockfile (default: ${workspace}/.pml/mcp.lock) */
  lockfilePath?: string;

  /** Whether to auto-create lockfile if missing */
  autoCreate?: boolean;

  /** Whether to auto-approve new entries */
  autoApproveNew?: boolean;
}

/**
 * Options for adding/updating an entry.
 */
export interface AddEntryOptions {
  /** Full 5-part FQDN */
  fqdn: string;

  /** Full SHA-256 integrity hash */
  integrity: string;

  /** MCP type (only client-routed types: deno, stdio) */
  type: "deno" | "stdio";

  /** Whether user approved this entry */
  approved?: boolean;
}

/**
 * Options for cleanup.
 */
export interface CleanupOptions {
  /** List of FQDNs that should be kept */
  keepFqdns: string[];

  /** Whether to actually delete (false = dry run) */
  execute?: boolean;
}

/**
 * Result of cleanup operation.
 */
export interface CleanupResult {
  /** Entries that were/would be removed */
  removed: string[];

  /** Entries that were kept */
  kept: string[];

  /** Whether cleanup was executed (vs dry run) */
  executed: boolean;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error when integrity validation fails.
 */
export class IntegrityMismatchError extends Error {
  constructor(
    public readonly fqdnBase: string,
    public readonly oldHash: string,
    public readonly newHash: string,
  ) {
    super(
      `Integrity mismatch for ${fqdnBase}: expected ${oldHash}, got ${newHash}`,
    );
    this.name = "IntegrityMismatchError";
  }
}

/**
 * Error when user rejects integrity change.
 */
export class IntegrityRejectedError extends Error {
  constructor(
    public readonly fqdnBase: string,
  ) {
    super(`User rejected integrity change for ${fqdnBase}`);
    this.name = "IntegrityRejectedError";
  }
}
