/**
 * Environment Variable Loader
 *
 * Loads and reloads .env files from user workspace.
 *
 * **Important:** The `.env` is read from the **user's workspace**,
 * not a hardcoded path. This is critical for:
 * - Compiled binary (`deno compile`) that runs from any directory
 * - Per-project API key configuration
 *
 * @module byok/env-loader
 */

import { load } from "@std/dotenv";
import { join } from "@std/path";

/**
 * Reload environment variables from .env file.
 *
 * This function reads the .env file from the workspace and exports
 * the variables to `Deno.env`. It should be called:
 * - At startup
 * - After user modifies .env (e.g., during HIL continue flow)
 *
 * @param workspace - Workspace root path (where .env is located)
 * @param envPath - Optional custom .env filename (default: ".env")
 * @throws Error if .env file cannot be read
 *
 * @example
 * ```ts
 * // Initial load at startup
 * await reloadEnv("/home/user/project");
 *
 * // After user adds keys during HIL flow
 * await reloadEnv(workspace);
 * const key = getKey("TAVILY_API_KEY");
 * ```
 */
export async function reloadEnv(
  workspace: string,
  envPath = ".env",
): Promise<void> {
  const fullPath = join(workspace, envPath);

  try {
    // Check if file exists first
    try {
      await Deno.stat(fullPath);
    } catch {
      // .env file doesn't exist - this is OK, just no vars to load
      return;
    }

    // Load .env file - get the parsed values
    const envVars = await load({
      envPath: fullPath,
      export: false, // Don't auto-export, we'll do it manually to force overwrite
    });

    // Manually set each variable to ensure overwrites work
    // @std/dotenv export:true doesn't overwrite existing vars
    for (const [key, value] of Object.entries(envVars)) {
      Deno.env.set(key, value);
    }
  } catch (error) {
    // Re-throw with context
    throw new Error(
      `Failed to load .env from ${fullPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Get an environment variable value.
 *
 * This is a thin wrapper around `Deno.env.get()` for consistency
 * and potential future enhancements (e.g., caching, debugging).
 *
 * @param name - Environment variable name
 * @returns The value or undefined if not set
 *
 * @example
 * ```ts
 * const key = getKey("TAVILY_API_KEY");
 * if (!key) {
 *   // Key not configured
 * }
 * ```
 */
export function getKey(name: string): string | undefined {
  return Deno.env.get(name);
}

/**
 * Resolve environment variable references in HTTP header values.
 *
 * Replaces `${VAR}` patterns in header values with the corresponding
 * `Deno.env.get(VAR)` value. Throws a clear error if any referenced
 * env var is missing (fail-fast, no silent fallbacks).
 *
 * @param headers - Header template with `${VAR}` references
 * @returns Resolved headers with actual env var values
 * @throws Error if any referenced env var is not set
 *
 * @example
 * ```ts
 * const resolved = resolveEnvHeaders({
 *   "Authorization": "Bearer ${TAVILY_API_KEY}",
 *   "X-Custom": "static-value",
 * });
 * // → { "Authorization": "Bearer tvly-abc123...", "X-Custom": "static-value" }
 * ```
 */
export function resolveEnvHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = value.replace(/\$\{(\w+)\}/g, (_, envVar: string) => {
      const val = Deno.env.get(envVar);
      if (!val) {
        throw new Error(
          `Missing env var ${envVar} required for HTTP header "${key}". ` +
          `Add ${envVar}=<value> to your .env file.`,
        );
      }
      return val;
    });
  }
  return resolved;
}

/**
 * Check if a .env file exists in the workspace.
 *
 * @param workspace - Workspace root path
 * @param envPath - Optional custom .env filename (default: ".env")
 * @returns true if .env file exists
 */
export async function envFileExists(
  workspace: string,
  envPath = ".env",
): Promise<boolean> {
  const fullPath = join(workspace, envPath);
  try {
    await Deno.stat(fullPath);
    return true;
  } catch {
    return false;
  }
}
