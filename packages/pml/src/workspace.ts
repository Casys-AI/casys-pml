/**
 * Workspace Resolution Module
 *
 * Detects project workspace using priority-based resolution:
 * 1. PML_WORKSPACE environment variable
 * 2. Project root detection (markers: .git, deno.json, package.json, .pml.json)
 * 3. Current working directory fallback (with warning)
 *
 * @module workspace
 */

import { existsSync } from "@std/fs";
import { dirname, join } from "@std/path";

/**
 * Project markers used to detect project root.
 * Checked in order - first match wins.
 */
export const PROJECT_MARKERS = [
  ".git",
  "deno.json",
  "deno.jsonc",
  "package.json",
  ".pml.json",
] as const;

/**
 * Workspace resolution result
 */
export interface WorkspaceResult {
  /** Resolved workspace path */
  path: string;
  /** How the workspace was resolved */
  source: "env" | "detected" | "fallback";
  /** Marker that was found (if source is "detected") */
  marker?: string;
}

/**
 * Logger interface for workspace resolution
 */
export interface WorkspaceLogger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * Default console logger
 */
const defaultLogger: WorkspaceLogger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
};

/**
 * Resolve the workspace root path.
 *
 * Resolution priority:
 * 1. PML_WORKSPACE environment variable (if set)
 * 2. Project root detection by traversing up from CWD
 * 3. Current working directory (fallback with warning)
 *
 * @param logger Optional logger for resolution messages
 * @returns Resolved workspace path
 *
 * @example
 * ```ts
 * const workspace = resolveWorkspace();
 * console.log(`Workspace: ${workspace}`);
 * ```
 */
export function resolveWorkspace(
  logger: WorkspaceLogger = defaultLogger,
): string {
  const result = resolveWorkspaceWithDetails(logger);
  return result.path;
}

/**
 * Resolve workspace with full details about how it was resolved.
 *
 * @param logger Optional logger for resolution messages
 * @returns WorkspaceResult with path, source, and optional marker
 */
export function resolveWorkspaceWithDetails(
  logger: WorkspaceLogger = defaultLogger,
): WorkspaceResult {
  // Priority 1: Environment variable
  const envWorkspace = Deno.env.get("PML_WORKSPACE");
  if (envWorkspace) {
    // Validate the env var path before using it
    if (!isValidWorkspace(envWorkspace)) {
      logger.warn(
        `⚠ PML_WORKSPACE="${envWorkspace}" is not a valid directory, ignoring`,
      );
      // Fall through to project detection
    } else {
      logger.info(`Using PML_WORKSPACE: ${envWorkspace}`);
      return {
        path: envWorkspace,
        source: "env",
      };
    }
  }

  // Priority 2: Project root detection
  const cwd = Deno.cwd();
  const detected = findProjectRoot(cwd, [...PROJECT_MARKERS]);
  if (detected) {
    logger.info(
      `Detected project root: ${detected.path} (marker: ${detected.marker})`,
    );
    return {
      path: detected.path,
      source: "detected",
      marker: detected.marker,
    };
  }

  // Priority 3: Fallback to CWD
  logger.warn("⚠ No project root detected, using current directory");
  logger.warn("  Set PML_WORKSPACE or run from a project directory");
  return {
    path: cwd,
    source: "fallback",
  };
}

/**
 * Result of project root detection
 */
interface ProjectRootResult {
  /** Path to the project root */
  path: string;
  /** Marker that was found */
  marker: string;
}

/**
 * Find project root by traversing up from start path looking for markers.
 *
 * @param startPath Starting directory to search from
 * @param markers Array of marker filenames to look for
 * @returns Project root result or null if not found
 *
 * @example
 * ```ts
 * const result = findProjectRoot("/home/user/project/src", [".git", "deno.json"]);
 * if (result) {
 *   console.log(`Found ${result.marker} at ${result.path}`);
 * }
 * ```
 */
export function findProjectRoot(
  startPath: string,
  markers: string[],
): ProjectRootResult | null {
  let current = startPath;

  while (true) {
    for (const marker of markers) {
      try {
        const markerPath = join(current, marker);
        if (existsSync(markerPath)) {
          return {
            path: current,
            marker,
          };
        }
      } catch {
        // Permission denied or other error, continue
        // This handles cases where we can't read certain directories
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      return null;
    }
    current = parent;
  }
}

/**
 * Check if a directory is a valid workspace.
 *
 * A workspace is valid if:
 * - The path exists
 * - The path is a directory
 * - The path is readable
 *
 * @param path Path to check
 * @returns true if valid workspace
 */
export function isValidWorkspace(path: string): boolean {
  try {
    const stat = Deno.statSync(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

/**
 * Get workspace info for display purposes.
 *
 * @param result Workspace resolution result
 * @returns Human-readable description of workspace source
 */
export function getWorkspaceSourceDescription(result: WorkspaceResult): string {
  switch (result.source) {
    case "env":
      return "environment variable (PML_WORKSPACE)";
    case "detected":
      return `detected via ${result.marker}`;
    case "fallback":
      return "current directory (fallback)";
  }
}
