/**
 * Cache Types
 *
 * Shared types for cache-related functionality.
 *
 * @module cache/types
 */

import type { StaticStructure } from "../capabilities/types.ts";

/**
 * Learning context for capability saving after HIL approval or client-routed execution.
 *
 * Contains all data needed to call saveCapability when workflow completes.
 * Stored in WorkflowStateCache (Deno KV) with 1-hour TTL.
 */
export interface LearningContext {
  /** Original TypeScript code */
  code: string;
  /** Original intent text */
  intent: string;
  /** Static structure from SWC analysis */
  staticStructure: StaticStructure;
  /** Pre-computed intent embedding for similarity search */
  intentEmbedding?: number[];
  /** Tools used in the code (for capability registration) */
  toolsUsed?: string[];
  /** User ID for multi-tenant isolation */
  userId?: string;
}
