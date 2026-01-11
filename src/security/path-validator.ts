/**
 * Path Validation Module
 *
 * Security-focused path validation ensuring all file operations
 * stay within workspace boundaries.
 *
 * @module security/path-validator
 */

import { isAbsolute, join, normalize } from "@std/path";

/**
 * Error codes for path validation failures
 */
export type PathValidationErrorCode =
  | "PATH_OUTSIDE_WORKSPACE"
  | "PATH_TRAVERSAL_ATTACK"
  | "PATH_NOT_FOUND"
  | "PATH_INVALID"
  | "WORKSPACE_INVALID";

/**
 * Path validation error details
 */
export interface PathValidationError {
  /** Error code for programmatic handling */
  code: PathValidationErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original path that was validated */
  path: string;
  /** Workspace path used for validation */
  workspace: string;
}

/**
 * Path validation result
 */
export interface PathValidationResult {
  /** Whether the path is valid and within workspace */
  valid: boolean;
  /** Normalized absolute path (if valid) */
  normalizedPath?: string;
  /** Error details (if invalid) */
  error?: PathValidationError;
}

/**
 * Path validator configuration
 */
export interface PathValidatorConfig {
  /** Allow access to the workspace root itself (not just subdirs) */
  allowWorkspaceRoot?: boolean;
  /** Check that path exists before validating */
  requireExists?: boolean;
}

/**
 * Default validator configuration
 */
const DEFAULT_CONFIG: PathValidatorConfig = {
  allowWorkspaceRoot: true,
  requireExists: false,
};

/**
 * Validate inputs and check for traversal attacks.
 * Shared between async and sync versions.
 *
 * @returns PathValidationResult if invalid, null if inputs are valid
 */
function validateInputs(
  path: string,
  workspace: string,
): PathValidationResult | null {
  // Validate path
  if (!path || typeof path !== "string") {
    return {
      valid: false,
      error: {
        code: "PATH_INVALID",
        message: "Path is empty or invalid",
        path: String(path),
        workspace,
      },
    };
  }

  // Validate workspace
  if (!workspace || typeof workspace !== "string") {
    return {
      valid: false,
      error: {
        code: "WORKSPACE_INVALID",
        message: "Workspace path is empty or invalid",
        path,
        workspace: String(workspace),
      },
    };
  }

  // Check for traversal attacks
  if (containsTraversalPattern(path)) {
    return {
      valid: false,
      error: {
        code: "PATH_TRAVERSAL_ATTACK",
        message: `Path contains directory traversal pattern: ${path}`,
        path,
        workspace,
      },
    };
  }

  return null; // Inputs are valid
}

/**
 * Create error result for path outside workspace.
 */
function outsideWorkspaceError(
  path: string,
  workspace: string,
  realPath?: string,
): PathValidationResult {
  return {
    valid: false,
    error: {
      code: "PATH_OUTSIDE_WORKSPACE",
      message: realPath
        ? `Path is outside workspace: ${path} (resolved: ${realPath})`
        : `Path is outside workspace: ${path}`,
      path,
      workspace,
    },
  };
}

/**
 * Create error result for invalid workspace.
 */
function invalidWorkspaceError(
  path: string,
  workspace: string,
): PathValidationResult {
  return {
    valid: false,
    error: {
      code: "WORKSPACE_INVALID",
      message: `Workspace does not exist or is inaccessible: ${workspace}`,
      path,
      workspace,
    },
  };
}

/**
 * Create error result for path not found.
 */
function pathNotFoundError(
  path: string,
  workspace: string,
): PathValidationResult {
  return {
    valid: false,
    error: {
      code: "PATH_NOT_FOUND",
      message: `Path does not exist: ${path}`,
      path,
      workspace,
    },
  };
}

/**
 * Validate that a path is within the workspace boundary.
 *
 * Security features:
 * - Resolves symlinks to detect escapes via symlinks
 * - Prevents directory traversal attacks (../)
 * - Normalizes paths before comparison
 *
 * @param path Path to validate (relative or absolute)
 * @param workspace Workspace root path
 * @param config Optional validation configuration
 * @returns Validation result with normalized path or error details
 *
 * @example
 * ```ts
 * const result = await validatePath("./src/main.ts", "/home/user/project");
 * if (result.valid) {
 *   console.log(`Safe path: ${result.normalizedPath}`);
 * } else {
 *   console.error(`Rejected: ${result.error?.message}`);
 * }
 * ```
 */
export async function validatePath(
  path: string,
  workspace: string,
  config: PathValidatorConfig = {},
): Promise<PathValidationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Validate inputs and check for traversal attacks (shared logic)
  const inputError = validateInputs(path, workspace);
  if (inputError) return inputError;

  // Normalize to absolute path
  const absolutePath = isAbsolute(path) ? path : join(workspace, path);
  const normalizedPath = normalize(absolutePath);

  // If path should exist, verify it does
  if (cfg.requireExists) {
    try {
      await Deno.stat(normalizedPath);
    } catch {
      return pathNotFoundError(path, workspace);
    }
  }

  // Resolve symlinks to get the real path
  let realPath: string;
  try {
    // For existing paths, resolve symlinks to detect escapes
    if (await pathExists(normalizedPath)) {
      realPath = await Deno.realPath(normalizedPath);
    } else {
      // Path doesn't exist yet - validate the normalized path
      realPath = normalizedPath;
    }
  } catch {
    // If we can't resolve the path, use the normalized version
    realPath = normalizedPath;
  }

  // Resolve workspace to real path
  let realWorkspace: string;
  try {
    realWorkspace = await Deno.realPath(workspace);
  } catch {
    return invalidWorkspaceError(path, workspace);
  }

  // Check if path is within workspace
  if (!isPathWithinWorkspace(realPath, realWorkspace, cfg.allowWorkspaceRoot ?? true)) {
    return outsideWorkspaceError(path, workspace, realPath);
  }

  return { valid: true, normalizedPath: realPath };
}

/**
 * Synchronous path validation (for cases where async is not possible).
 *
 * Note: This version cannot resolve symlinks, so it's less secure.
 * Prefer the async version when possible.
 */
export function validatePathSync(
  path: string,
  workspace: string,
  config: PathValidatorConfig = {},
): PathValidationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Validate inputs and check for traversal attacks (shared logic)
  const inputError = validateInputs(path, workspace);
  if (inputError) return inputError;

  // Normalize to absolute path
  const absolutePath = isAbsolute(path) ? path : join(workspace, path);
  const normalizedPath = normalize(absolutePath);

  // If path should exist, verify it does
  if (cfg.requireExists) {
    try {
      Deno.statSync(normalizedPath);
    } catch {
      return pathNotFoundError(path, workspace);
    }
  }

  // Resolve workspace to real path
  let realWorkspace: string;
  try {
    realWorkspace = Deno.realPathSync(workspace);
  } catch {
    return invalidWorkspaceError(path, workspace);
  }

  // Check if normalized path is within workspace
  if (!isPathWithinWorkspace(normalizedPath, realWorkspace, cfg.allowWorkspaceRoot ?? true)) {
    return outsideWorkspaceError(path, workspace);
  }

  return { valid: true, normalizedPath };
}

/**
 * Check if a path is within a workspace directory.
 */
function isPathWithinWorkspace(
  path: string,
  workspace: string,
  allowRoot: boolean,
): boolean {
  // Ensure workspace ends without trailing slash for consistent comparison
  const normalizedWorkspace = workspace.endsWith("/")
    ? workspace.slice(0, -1)
    : workspace;

  // Path must either be workspace itself (if allowed) or start with workspace/
  if (path === normalizedWorkspace) {
    return allowRoot;
  }

  return path.startsWith(normalizedWorkspace + "/");
}

/**
 * Check for common directory traversal patterns.
 *
 * This is a quick check before path normalization to catch
 * obvious attack attempts early.
 */
function containsTraversalPattern(path: string): boolean {
  // Patterns that indicate traversal attempts
  const patterns = [
    // Unix-style traversal
    "../",
    "/..",
    // Windows-style traversal
    "..\\",
    "\\..",
    // URL-encoded traversal
    "%2e%2e/",
    "%2e%2e\\",
    "..%2f",
    "..%5c",
    // Double-URL-encoded
    "%252e%252e",
    // Null byte injection (can truncate paths in some systems)
    "\x00",
    "%00",
  ];

  const lowerPath = path.toLowerCase();
  return patterns.some((pattern) => lowerPath.includes(pattern.toLowerCase()));
}

/**
 * Check if a path exists (helper function).
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a path validator bound to a specific workspace.
 *
 * Useful when validating multiple paths against the same workspace.
 *
 * @param workspace Workspace root path
 * @param config Optional validator configuration
 * @returns Bound validator function
 *
 * @example
 * ```ts
 * const validate = createPathValidator("/home/user/project");
 * const result1 = await validate("./src/main.ts");
 * const result2 = await validate("./tests/unit/main_test.ts");
 * ```
 */
export function createPathValidator(
  workspace: string,
  config: PathValidatorConfig = {},
): (path: string) => Promise<PathValidationResult> {
  return (path: string) => validatePath(path, workspace, config);
}
