/**
 * Pending Workflow Store
 *
 * Stateful store for managing pending approval workflows in the MCP stdio client.
 * Leverages MCP's persistent connection - workflows live in memory for the
 * duration of the Claude Code session.
 *
 * Used for:
 * - Dependency installation approvals (Story 14.4)
 * - API key configuration approvals (Story 14.6)
 * - Integrity update approvals (Story 14.7)
 *
 * @module workflow/pending-store
 */

import type { McpDependency } from "../loader/types.ts";

// =============================================================================
// Types
// =============================================================================

/**
 * Type of approval required.
 */
export type ApprovalType = "dependency" | "api_key_required" | "integrity";

/**
 * A pending workflow awaiting user approval.
 *
 * Stores the original code and context needed to re-execute after approval.
 * Works for all approval types: dependency, api_key, integrity.
 */
export interface PendingWorkflow {
  /** Original code that triggered the approval */
  code: string;
  /** Tool ID that triggered the approval */
  toolId: string;
  /** Type of approval required */
  approvalType: ApprovalType;
  /** Timestamp when workflow was created */
  createdAt: number;

  // Type-specific data
  /** Dependency info (for "dependency" approvals) */
  dependency?: McpDependency;
  /** Missing API keys (for "api_key_required" approvals) */
  missingKeys?: string[];
  /** Integrity info (for "integrity" approvals) */
  integrityInfo?: {
    fqdnBase: string;
    newHash: string;
    oldHash: string;
  };
  /** FQDN map for multi-tenant tool resolution (server-provided) */
  fqdnMap?: Record<string, string>;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Store for pending approval workflows.
 *
 * Maintains a Map of workflows awaiting user approval.
 * Workflows expire after TTL (default 5 minutes) to prevent memory leaks.
 *
 * @example
 * ```typescript
 * const store = new PendingWorkflowStore();
 *
 * // When code execution hits a missing dependency
 * const workflowId = store.create(code, toolId, dependency);
 * // Return approval_required with workflowId to Claude
 *
 * // When continue_workflow arrives
 * const pending = store.get(workflowId);
 * if (pending && approved) {
 *   await installDependency(pending.dependency);
 *   await executeCode(pending.code);
 * }
 * store.delete(workflowId);
 * ```
 */
export class PendingWorkflowStore {
  private workflows = new Map<string, PendingWorkflow>();
  private readonly ttlMs: number;

  /**
   * Create a new PendingWorkflowStore.
   *
   * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Create a new pending workflow.
   *
   * Stores the workflow context and returns a unique ID.
   * Triggers cleanup of expired workflows.
   *
   * @param code - Original code that triggered the approval
   * @param toolId - Tool ID that triggered the approval
   * @param approvalType - Type of approval required
   * @param options - Type-specific options (dependency, missingKeys, integrityInfo)
   * @returns Unique workflow ID (UUID)
   */
  create(
    code: string,
    toolId: string,
    approvalType: ApprovalType,
    options?: {
      dependency?: McpDependency;
      missingKeys?: string[];
      integrityInfo?: { fqdnBase: string; newHash: string; oldHash: string };
    },
  ): string {
    // Clean up expired workflows on each create
    this.cleanup();

    const id = crypto.randomUUID();
    this.workflows.set(id, {
      code,
      toolId,
      approvalType,
      createdAt: Date.now(),
      dependency: options?.dependency,
      missingKeys: options?.missingKeys,
      integrityInfo: options?.integrityInfo,
    });

    return id;
  }

  /**
   * Store a workflow with a specific ID.
   *
   * Use this when you need to reuse an existing workflow ID
   * (e.g., from an approval response) instead of generating a new one.
   *
   * @param id - Workflow ID to use
   * @param code - Original code that triggered the approval
   * @param toolId - Tool ID that triggered the approval
   * @param approvalType - Type of approval required
   * @param options - Type-specific options
   */
  setWithId(
    id: string,
    code: string,
    toolId: string,
    approvalType: ApprovalType,
    options?: {
      dependency?: McpDependency;
      missingKeys?: string[];
      integrityInfo?: { fqdnBase: string; newHash: string; oldHash: string };
      fqdnMap?: Record<string, string>;
    },
  ): void {
    // Clean up expired workflows
    this.cleanup();

    this.workflows.set(id, {
      code,
      toolId,
      approvalType,
      createdAt: Date.now(),
      dependency: options?.dependency,
      missingKeys: options?.missingKeys,
      integrityInfo: options?.integrityInfo,
      fqdnMap: options?.fqdnMap,
    });
  }

  /**
   * Get a pending workflow by ID.
   *
   * Returns null if:
   * - Workflow doesn't exist
   * - Workflow has expired (past TTL)
   *
   * @param id - Workflow ID to retrieve
   * @returns PendingWorkflow or null
   */
  get(id: string): PendingWorkflow | null {
    const workflow = this.workflows.get(id);

    if (!workflow) {
      return null;
    }

    // Check TTL expiration
    if (Date.now() - workflow.createdAt > this.ttlMs) {
      this.workflows.delete(id);
      return null;
    }

    return workflow;
  }

  /**
   * Delete a workflow by ID.
   *
   * Idempotent - safe to call multiple times or with non-existent ID.
   *
   * @param id - Workflow ID to delete
   */
  delete(id: string): void {
    this.workflows.delete(id);
  }

  /**
   * Get the current number of stored workflows.
   *
   * Note: May include expired workflows that haven't been cleaned up yet.
   *
   * @returns Number of workflows in store
   */
  size(): number {
    return this.workflows.size;
  }

  /**
   * Clear all workflows from the store.
   *
   * Useful for testing or resetting state.
   */
  clear(): void {
    this.workflows.clear();
  }

  /**
   * Clean up expired workflows.
   *
   * Called automatically on create(). Can be called manually if needed.
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [id, workflow] of this.workflows) {
      if (now - workflow.createdAt > this.ttlMs) {
        this.workflows.delete(id);
      }
    }
  }
}
