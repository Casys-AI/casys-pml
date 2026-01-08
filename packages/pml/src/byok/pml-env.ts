/**
 * PML Environment Manager
 *
 * Loads and saves environment variables from/to .pml.json.
 * Supports incremental updates - new keys are added as capabilities request them.
 *
 * Flow:
 * 1. Capability requests envRequired: ["TAVILY_API_KEY"]
 * 2. Check .pml.json env section → not found
 * 3. HIL asks user for the key
 * 4. User provides key → saved to .pml.json
 * 5. Next time → key is already there, no HIL
 *
 * @module byok/pml-env
 */

import { join } from "@std/path";
import type { PmlConfig } from "../types.ts";

const PML_CONFIG_FILE = ".pml.json";

/**
 * Load environment variables from .pml.json and export to Deno.env.
 *
 * @param workspace - Workspace root path
 * @returns Record of loaded env vars (empty if none)
 */
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

/**
 * Get an environment variable from .pml.json config.
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @returns Value or undefined if not set
 */
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

/**
 * Save an environment variable to .pml.json.
 * Creates env section if it doesn't exist.
 * Preserves existing config and adds the new key.
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @param value - Environment variable value
 */
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
    config = { version: "0.1.0" };
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

/**
 * Check if an environment variable is available.
 * Checks both Deno.env and .pml.json.
 *
 * @param workspace - Workspace root path
 * @param key - Environment variable name
 * @returns true if key is available
 */
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

/**
 * Get missing environment variables from a list of required keys.
 *
 * @param workspace - Workspace root path
 * @param required - List of required env var names
 * @returns List of missing keys
 */
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
