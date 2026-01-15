/**
 * Admin Use Case Types
 *
 * Types for capability administration operations (rename, merge).
 *
 * @module application/use-cases/admin/types
 */

import type { Scope } from "../discover/types.ts";

// Re-export Scope for convenience
export type { Scope };

/**
 * Visibility levels for capability records
 */
export type CapabilityVisibility = "private" | "project" | "org" | "public";

/**
 * Request for renaming a capability
 */
export interface RenameCapabilityRequest {
  /** Current name (namespace:action) or UUID to update */
  target: string;
  /** User scope for resolution */
  scope: Scope;
  /** User ID for ownership check (null for local mode) */
  userId: string | null;
  /** New namespace */
  namespace?: string;
  /** New action name */
  actionName?: string;
  /** New description */
  description?: string;
  /** New tags */
  tags?: string[];
  /** New visibility */
  visibility?: CapabilityVisibility;
}

/**
 * Response from capability rename
 */
export interface RenameCapabilityResult {
  success: boolean;
  id: string;
  fqdn: string;
  displayName: string;
}

/**
 * Request for merging capabilities
 */
export interface MergeCapabilitiesRequest {
  /** Source capability (name, UUID, or FQDN) - will be deleted */
  source: string;
  /** Target capability (name, UUID, or FQDN) - will be updated */
  target: string;
  /** User scope for resolution */
  scope: Scope;
  /** User ID for ownership check (null for local mode) */
  userId: string | null;
  /** If true, use source's code_snippet even if older */
  preferSourceCode?: boolean;
}

/**
 * Response from capability merge
 */
export interface MergeCapabilitiesResult {
  success: boolean;
  targetId: string;
  targetFqdn: string;
  targetDisplayName: string;
  deletedSourceId: string;
  deletedSourceName: string;
  deletedSourcePatternId: string | null;
  targetPatternId: string | null;
  mergedStats: {
    usageCount: number;
    successCount: number;
    totalLatencyMs: number;
  };
  codeSource: "source" | "target";
}

/**
 * Callback type for merge events (graph cache invalidation)
 */
export type OnCapabilityMerged = (response: MergeCapabilitiesResult) => void | Promise<void>;
