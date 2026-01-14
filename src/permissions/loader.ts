/**
 * Permission Loader Module
 *
 * Loads user permissions from .pml.json in the workspace.
 * User's config is THE source of truth - no fallback to defaults.
 *
 * @module permissions/loader
 */

import { join } from "@std/path";
import type {
  PermissionCheckResult,
  PermissionLoadResult,
  PmlConfig,
  PmlPermissions,
} from "../types.ts";

const PML_CONFIG_FILE = ".pml.json";

/**
 * Logger interface for permission operations
 */
export interface PermissionLogger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * Default console logger
 */
const defaultLogger: PermissionLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
};

/**
 * Empty permissions - everything defaults to "ask" implicitly.
 * checkPermission() returns "ask" for anything not matched.
 */
const EMPTY_PERMISSIONS: PmlPermissions = {
  allow: [],
  deny: [],
  ask: [],
};

/**
 * Process parsed config and return permissions.
 * Shared between async and sync versions.
 */
function processConfig(
  config: PmlConfig,
  configPath: string,
  _logger: PermissionLogger,
): PermissionLoadResult {
  // No permissions section = implicit "ask for everything" (silent)
  if (!config.permissions) {
    return { permissions: EMPTY_PERMISSIONS, source: "config", configPath };
  }

  // User config is THE truth - no merging with defaults
  const permissions = normalizePermissions(config.permissions);
  return { permissions, source: "config", configPath };
}

/**
 * Handle config loading error - silent defaults.
 * Shared between async and sync versions.
 */
function handleLoadError(
  _error: unknown,
  _logger: PermissionLogger,
): PermissionLoadResult {
  // No config = implicit "ask for everything" (silent)
  return { permissions: EMPTY_PERMISSIONS, source: "defaults" };
}

/**
 * Load user permissions from workspace .pml.json file.
 *
 * CRITICAL: User's config is THE source of truth.
 * - If .pml.json exists, use its permissions exactly
 * - If .pml.json doesn't exist, use safe defaults (all tools require ask)
 * - NO fallback to any default config file
 *
 * @param workspace Workspace root path
 * @param logger Optional logger
 * @returns Permission load result
 *
 * @example
 * ```ts
 * const result = await loadUserPermissions("/home/user/project");
 * if (result.source === "config") {
 *   console.log(`Loaded from ${result.configPath}`);
 * } else {
 *   console.log("Using safe defaults");
 * }
 * ```
 */
export async function loadUserPermissions(
  workspace: string,
  logger: PermissionLogger = defaultLogger,
): Promise<PermissionLoadResult> {
  const configPath = join(workspace, PML_CONFIG_FILE);

  try {
    const content = await Deno.readTextFile(configPath);
    const config: PmlConfig = JSON.parse(content);
    return processConfig(config, configPath, logger);
  } catch (error) {
    return handleLoadError(error, logger);
  }
}

/**
 * Synchronous version of loadUserPermissions.
 */
export function loadUserPermissionsSync(
  workspace: string,
  logger: PermissionLogger = defaultLogger,
): PermissionLoadResult {
  const configPath = join(workspace, PML_CONFIG_FILE);

  try {
    const content = Deno.readTextFileSync(configPath);
    const config: PmlConfig = JSON.parse(content);
    return processConfig(config, configPath, logger);
  } catch (error) {
    return handleLoadError(error, logger);
  }
}

/**
 * Normalize permissions to ensure all arrays exist.
 */
function normalizePermissions(
  permissions: Partial<PmlPermissions>,
): PmlPermissions {
  return {
    allow: permissions.allow ?? [],
    deny: permissions.deny ?? [],
    ask: permissions.ask ?? [],
  };
}

/**
 * Check if a tool is allowed, denied, or requires asking.
 *
 * Priority:
 * 1. Deny takes precedence over allow
 * 2. Allow if explicitly permitted
 * 3. Ask if in ask list
 * 4. Default: ask for anything not configured
 *
 * @param tool Tool name (e.g., "filesystem:read_file")
 * @param permissions Permission configuration
 * @returns Permission check result
 *
 * @example
 * ```ts
 * const result = checkPermission("filesystem:read_file", permissions);
 * if (result === "allowed") {
 *   // Execute immediately
 * } else if (result === "denied") {
 *   // Reject with error
 * } else {
 *   // Prompt user for confirmation
 * }
 * ```
 */
export function checkPermission(
  tool: string,
  permissions: PmlPermissions,
): PermissionCheckResult {
  // Deny takes precedence
  if (matchesPattern(tool, permissions.deny)) {
    return "denied";
  }

  // Allow if explicitly permitted
  if (matchesPattern(tool, permissions.allow)) {
    return "allowed";
  }

  // Ask if in ask list or default behavior
  if (matchesPattern(tool, permissions.ask)) {
    return "ask";
  }

  // Default: ask for anything not configured
  return "ask";
}

/**
 * Check if a tool matches any of the patterns.
 *
 * Pattern formats:
 * - "*" - matches all tools
 * - "namespace:*" - matches all tools in namespace (e.g., "filesystem:*")
 * - "namespace" - matches namespace:* (convenience shorthand)
 * - "exact:name" - matches exact tool name
 *
 * @param tool Tool name to check
 * @param patterns Array of patterns to match against
 * @returns true if tool matches any pattern
 */
export function matchesPattern(tool: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Wildcard matches everything
    if (pattern === "*") {
      return true;
    }

    // Namespace wildcard: "filesystem:*" matches "filesystem:read_file"
    if (pattern.endsWith(":*")) {
      const namespace = pattern.slice(0, -2);
      return tool.startsWith(namespace + ":");
    }

    // Convenience: "memory" matches "memory:*" or "memory:anything"
    // (pattern without colon matches namespace wildcard)
    if (!pattern.includes(":") && tool.includes(":")) {
      const toolNamespace = tool.split(":")[0];
      return pattern === toolNamespace;
    }

    // Exact match
    return tool === pattern;
  });
}

/**
 * Create a permission checker bound to specific permissions.
 *
 * @param permissions Permission configuration
 * @returns Bound checker function
 *
 * @example
 * ```ts
 * const check = createPermissionChecker(permissions);
 * const result = check("filesystem:read_file");
 * ```
 */
export function createPermissionChecker(
  permissions: PmlPermissions,
): (tool: string) => PermissionCheckResult {
  return (tool: string) => checkPermission(tool, permissions);
}

/**
 * Get a summary of permissions for display.
 *
 * @param permissions Permission configuration
 * @returns Human-readable summary
 */
export function getPermissionsSummary(permissions: PmlPermissions): string {
  const lines: string[] = [];

  if (permissions.allow.length > 0) {
    lines.push(`Allow: ${permissions.allow.join(", ")}`);
  }

  if (permissions.deny.length > 0) {
    lines.push(`Deny: ${permissions.deny.join(", ")}`);
  }

  if (permissions.ask.length > 0) {
    lines.push(`Ask: ${permissions.ask.join(", ")}`);
  }

  if (lines.length === 0) {
    return "No explicit permissions configured (default: ask for all)";
  }

  return lines.join("\n");
}
