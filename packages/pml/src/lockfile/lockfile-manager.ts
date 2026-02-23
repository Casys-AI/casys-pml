/**
 * Lockfile Manager (Story 14.7)
 *
 * Manages the MCP lockfile for integrity tracking.
 * Lockfile stored at ${workspace}/.pml/mcp.lock (per-project)
 *
 * @module lockfile/lockfile-manager
 */

import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { uuidv7 } from "../utils/uuid.ts";
import type {
  AddEntryOptions,
  IntegrityApprovalRequired,
  IntegrityValidationResult,
  Lockfile,
  LockfileEntry,
  LockfileManagerOptions,
} from "./types.ts";

/**
 * Get lockfile path for workspace.
 * Uses ${workspace}/.pml/mcp.lock for per-project lockfile.
 */
function getLockfilePath(workspace?: string): string {
  if (workspace) {
    return join(workspace, ".pml", "mcp.lock");
  }
  // Fallback to home directory if no workspace provided
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
  return join(home, ".pml", "mcp.lock");
}

/**
 * Extract 4-char hash from full SHA-256 hash.
 */
function shortHash(fullHash: string): string {
  return fullHash.substring(0, 4).toLowerCase();
}

/**
 * Extract 4-part FQDN base from 5-part FQDN.
 * Exported for use in auto-cleanup.ts
 */
export function fqdnBase(fqdn: string): string {
  const parts = fqdn.split(".");
  if (parts.length === 5) {
    return parts.slice(0, 4).join(".");
  }
  return fqdn;
}

/**
 * Lockfile Manager
 *
 * Provides CRUD operations for the MCP lockfile.
 */
export class LockfileManager {
  private lockfilePath: string;
  private autoCreate: boolean;
  private autoApproveNew: boolean;
  private lockfile: Lockfile | null = null;
  /** Serializes concurrent save() calls to prevent race conditions on the temp file */
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(options: LockfileManagerOptions = {}) {
    this.lockfilePath = options.lockfilePath || getLockfilePath(options.workspace);
    this.autoCreate = options.autoCreate ?? true;
    this.autoApproveNew = options.autoApproveNew ?? true;
  }

  /**
   * Load lockfile from disk.
   *
   * Creates empty lockfile if autoCreate is true.
   */
  async load(): Promise<Lockfile> {
    if (this.lockfile) {
      return this.lockfile;
    }

    try {
      const content = await Deno.readTextFile(this.lockfilePath);
      // Handle empty file as if not found
      if (!content.trim()) {
        throw new Deno.errors.NotFound("Lockfile is empty");
      }
      this.lockfile = JSON.parse(content) as Lockfile;
      return this.lockfile;
    } catch (e) {
      if ((e instanceof Deno.errors.NotFound || e instanceof SyntaxError) && this.autoCreate) {
        // Create empty lockfile
        this.lockfile = {
          version: 1,
          entries: {},
          updatedAt: new Date().toISOString(),
        };
        await this.save();
        return this.lockfile;
      }
      throw e;
    }
  }

  /**
   * Save lockfile to disk.
   *
   * Serialized via saveQueue to prevent concurrent writes from racing
   * on the same temp file (causes "No such file or directory" on rename).
   */
  save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(() => this.doSave(), () => this.doSave());
    return this.saveQueue;
  }

  private async doSave(): Promise<void> {
    if (!this.lockfile) {
      throw new Error("Lockfile not loaded");
    }

    this.lockfile.updatedAt = new Date().toISOString();

    // Ensure directory exists
    const dir = this.lockfilePath.substring(0, this.lockfilePath.lastIndexOf("/"));
    await ensureDir(dir);

    // Write atomically (write to temp, then rename)
    const tempPath = `${this.lockfilePath}.tmp`;
    await Deno.writeTextFile(tempPath, JSON.stringify(this.lockfile, null, 2));
    await Deno.rename(tempPath, this.lockfilePath);
  }

  /**
   * Get entry by 4-part FQDN base.
   */
  async getEntry(fqdnOrBase: string): Promise<LockfileEntry | null> {
    const lockfile = await this.load();
    const base = fqdnBase(fqdnOrBase);
    return lockfile.entries[base] ?? null;
  }

  /**
   * Check if entry exists.
   */
  async hasEntry(fqdnOrBase: string): Promise<boolean> {
    const entry = await this.getEntry(fqdnOrBase);
    return entry !== null;
  }

  /**
   * Add or update an entry.
   */
  async addEntry(options: AddEntryOptions): Promise<LockfileEntry> {
    const lockfile = await this.load();
    const base = fqdnBase(options.fqdn);
    const now = new Date().toISOString();

    const entry: LockfileEntry = {
      fqdn: options.fqdn,
      integrity: options.integrity,
      fetchedAt: lockfile.entries[base]?.fetchedAt || now,
      lastValidated: now,
      type: options.type,
      approved: options.approved ?? this.autoApproveNew,
    };

    lockfile.entries[base] = entry;
    await this.save();

    return entry;
  }

  /**
   * Remove an entry.
   */
  async removeEntry(fqdnOrBase: string): Promise<boolean> {
    const lockfile = await this.load();
    const base = fqdnBase(fqdnOrBase);

    if (lockfile.entries[base]) {
      delete lockfile.entries[base];
      await this.save();
      return true;
    }

    return false;
  }

  /**
   * Validate integrity against lockfile.
   *
   * AC11: Creates entry if new
   * AC12: Validates hash if exists
   * AC14: Returns approval required if hash changed
   *
   * @param fqdn - Full 5-part FQDN
   * @param serverIntegrity - Integrity hash from server
   * @param type - MCP type
   * @param existingWorkflowId - Optional: reuse existing workflowId (from execute_locally flow)
   * @returns Validation result or approval required
   */
  async validateIntegrity(
    fqdn: string,
    serverIntegrity: string,
    type: "deno" | "stdio",
    existingWorkflowId?: string,
  ): Promise<IntegrityValidationResult | IntegrityApprovalRequired> {
    const base = fqdnBase(fqdn);
    const entry = await this.getEntry(base);

    // AC11: New entry - auto-add if autoApproveNew
    if (!entry) {
      if (this.autoApproveNew) {
        await this.addEntry({ fqdn, integrity: serverIntegrity, type, approved: true });
      }

      return {
        valid: true,
        serverIntegrity,
        isNew: true,
      };
    }

    // AC12: Existing entry - validate integrity
    if (entry.integrity === serverIntegrity) {
      // Update lastValidated
      entry.lastValidated = new Date().toISOString();
      await this.save();

      return {
        valid: true,
        lockEntry: entry,
        serverIntegrity,
        isNew: false,
      };
    }

    // AC14: Hash mismatch - need user approval
    // Reuse existingWorkflowId if provided (from execute_locally flow) to preserve LearningContext correlation
    return {
      approvalRequired: true,
      approvalType: "integrity",
      fqdnBase: base,
      oldHash: shortHash(entry.integrity),
      newHash: shortHash(serverIntegrity),
      oldFetchedAt: entry.fetchedAt,
      description: `MCP ${base} has changed since last fetch (${entry.fetchedAt}). Old hash: ${shortHash(entry.integrity)}, new hash: ${shortHash(serverIntegrity)}. Approve update?`,
      workflowId: existingWorkflowId ?? uuidv7(),
    };
  }

  /**
   * Approve an integrity change after user confirmation.
   *
   * @param fqdn - Full 5-part FQDN
   * @param newIntegrity - New integrity hash
   * @param type - MCP type
   */
  async approveIntegrityChange(
    fqdn: string,
    newIntegrity: string,
    type: "deno" | "stdio",
  ): Promise<LockfileEntry> {
    return await this.addEntry({
      fqdn,
      integrity: newIntegrity,
      type,
      approved: true,
    });
  }

  /**
   * Get all entries.
   */
  async getAllEntries(): Promise<LockfileEntry[]> {
    const lockfile = await this.load();
    return Object.values(lockfile.entries);
  }

  /**
   * Get all FQDN bases.
   */
  async getAllFqdnBases(): Promise<string[]> {
    const lockfile = await this.load();
    return Object.keys(lockfile.entries);
  }

  /**
   * Clear all entries.
   */
  async clear(): Promise<void> {
    const lockfile = await this.load();
    lockfile.entries = {};
    await this.save();
  }

  /**
   * Get lockfile path.
   */
  getPath(): string {
    return this.lockfilePath;
  }
}
