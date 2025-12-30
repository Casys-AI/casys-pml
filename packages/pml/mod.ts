/**
 * PML - Procedural Memory Layer
 *
 * Lightweight CLI package for installing and configuring PML.
 *
 * @module @casys/pml
 *
 * @example Install globally
 * ```bash
 * deno install -A -n pml jsr:@casys/pml
 * ```
 *
 * @example Initialize a project
 * ```bash
 * pml init
 * ```
 *
 * @example Start the server
 * ```bash
 * pml serve
 * ```
 */

// CLI
export { main } from "./src/cli/mod.ts";
export { initProject } from "./src/init/mod.ts";

// Workspace resolution (Story 14.2)
export {
  findProjectRoot,
  getWorkspaceSourceDescription,
  isValidWorkspace,
  PROJECT_MARKERS,
  resolveWorkspace,
  resolveWorkspaceWithDetails,
} from "./src/workspace.ts";
export type { WorkspaceLogger, WorkspaceResult } from "./src/workspace.ts";

// Security - Path validation (Story 14.2)
export {
  createPathValidator,
  validatePath,
  validatePathSync,
} from "./src/security/mod.ts";

// Permissions (Story 14.2)
export {
  checkPermission,
  createPermissionChecker,
  getPermissionsSummary,
  loadUserPermissions,
  loadUserPermissionsSync,
  matchesPattern,
} from "./src/permissions/mod.ts";

// Types
export type {
  McpConfig,
  PathValidationError,
  PathValidationErrorCode,
  PathValidationResult,
  PermissionCheckResult,
  PermissionLoadResult,
  PmlConfig,
  PmlPermissions,
  WorkspaceConfig,
  WorkspaceSource,
} from "./src/types.ts";
