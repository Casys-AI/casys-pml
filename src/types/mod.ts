/**
 * Types Module
 *
 * Re-exports all PML type definitions for convenient importing.
 *
 * @module types
 *
 * @example
 * ```typescript
 * // From loader module (recommended)
 * import type { UiLayout, UiSyncRule, UiOrchestration } from "@casys/pml/loader";
 *
 * // Or direct import
 * import type { UiLayout } from "./ui-orchestration.ts";
 * ```
 */

// UI Orchestration Types (Epic 16)
export type {
  CollectedUiResource,
  CompositeUiDescriptor,
  McpUiCsp,
  McpUiPermissions,
  McpUiResourceMeta,
  McpUiToolMeta,
  ResolvedSyncRule,
  UiLayout,
  UiOrchestration,
  UiSyncRule,
} from "./ui-orchestration.ts";
