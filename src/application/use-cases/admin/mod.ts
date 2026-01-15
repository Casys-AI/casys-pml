/**
 * Admin Use Cases Module
 *
 * Use cases for capability administration operations.
 *
 * @module application/use-cases/admin
 */

// Use cases
export { RenameCapabilityUseCase, type RenameCapabilityDeps } from "./rename-capability.ts";
export { MergeCapabilitiesUseCase, type MergeCapabilitiesDeps } from "./merge-capabilities.ts";

// Types
export type {
  Scope,
  CapabilityVisibility,
  RenameCapabilityRequest,
  RenameCapabilityResult,
  MergeCapabilitiesRequest,
  MergeCapabilitiesResult,
  OnCapabilityMerged,
} from "./types.ts";
