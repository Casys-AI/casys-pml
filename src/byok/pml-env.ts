/**
 * PML Environment Manager
 *
 * DEPRECATED: This module is no longer used.
 *
 * API keys are now managed exclusively via .env file:
 * 1. Capability requests envRequired: ["TAVILY_API_KEY"]
 * 2. HIL tells user to add key to .env
 * 3. User adds key to .env and clicks "continue"
 * 4. reloadEnv() loads from .env
 *
 * The .pml.json file is only used for:
 * - version, workspace, cloud config, permissions
 *
 * These functions are kept (commented) for potential future use
 * if we need placeholder resolution (e.g., ${KEY} in .pml.json → .env value).
 *
 * @module byok/pml-env
 * @deprecated Use reloadEnv() from env-loader.ts instead
 */

// import { join } from "@std/path";
// import type { PmlConfig } from "../types.ts";

// const PML_CONFIG_FILE = ".pml.json";

// =============================================================================
// DEPRECATED FUNCTIONS - Kept for reference
// =============================================================================

/*
 * Load environment variables from .pml.json and export to Deno.env.
 *
 * @deprecated Not used - keys are loaded from .env via reloadEnv()
 *
 * @param workspace - Workspace root path
 * @returns Record of loaded env vars (empty if none)
 *
export async function loadPmlEnv(
  workspace: string,
): Promise<Record<string, string>> {
  const configPath = join(workspace, PML_CONFIG_FILE);

  try {
    const content = await Deno.readTextFile(configPath);
    const config: PmlConfig = JSON.parse(content);

    if (!config.env) {
      return {};
    }

    // Export to Deno.env (won't overwrite existing vars)
    for (const [key, value] of Object.entries(config.env)) {
      if (!Deno.env.get(key)) {
        Deno.env.set(key, value);
      }
    }

    return config.env;
  } catch {
    // No config or parse error - return empty
    return {};
  }
}
*/

/*
 * Get an environment variable from .pml.json config.
 *
 * @deprecated Not used - keys are loaded from .env via reloadEnv()
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @returns Value or undefined if not set
 *
export async function getPmlEnvKey(
  workspace: string,
  key: string,
): Promise<string | undefined> {
  const configPath = join(workspace, PML_CONFIG_FILE);

  try {
    const content = await Deno.readTextFile(configPath);
    const config: PmlConfig = JSON.parse(content);
    return config.env?.[key];
  } catch {
    return undefined;
  }
}
*/

/*
 * Save an environment variable to .pml.json.
 * Creates env section if it doesn't exist.
 * Preserves existing config and adds the new key.
 *
 * @deprecated Not used - keys should be added to .env manually
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @param value - Environment variable value
 *
export async function savePmlEnvKey(
  workspace: string,
  key: string,
  value: string,
): Promise<void> {
  const configPath = join(workspace, PML_CONFIG_FILE);

  // Read existing config
  let config: PmlConfig;
  try {
    const content = await Deno.readTextFile(configPath);
    config = JSON.parse(content);
  } catch {
    // No config exists - create minimal one
    config = { version: "0.2.9" };
  }

  // Add/update env key
  if (!config.env) {
    config.env = {};
  }
  config.env[key] = value;

  // Also set in current process
  Deno.env.set(key, value);

  // Write back to file
  await Deno.writeTextFile(
    configPath,
    JSON.stringify(config, null, 2) + "\n",
  );
}
*/

/*
 * Check if an environment variable is available.
 * Checks both Deno.env and .pml.json.
 *
 * @deprecated Not used - use Deno.env.get() directly
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @returns true if key is available
 *
export async function hasPmlEnvKey(
  workspace: string,
  key: string,
): Promise<boolean> {
  // Check Deno.env first (faster)
  if (Deno.env.get(key)) {
    return true;
  }

  // Check .pml.json
  const pmlValue = await getPmlEnvKey(workspace, key);
  return pmlValue !== undefined;
}
*/

/*
 * Get missing environment variables from a list of required keys.
 *
 * @deprecated Not used - use checkKeys() from key-checker.ts instead
 *
 * @param workspace - Workspace root path
 * @param required - List of required env var names
 * @returns List of missing keys
 *
export async function getMissingEnvKeys(
  workspace: string,
  required: string[],
): Promise<string[]> {
  const missing: string[] = [];

  for (const key of required) {
    const hasKey = await hasPmlEnvKey(workspace, key);
    if (!hasKey) {
      missing.push(key);
    }
  }

  return missing;
}
*/
