/**
 * Integrity Verification
 *
 * Verifies SHA-256 hashes of installed packages.
 *
 * @module loader/integrity
 */

import { encodeHex } from "@std/encoding/hex";
import type { IntegrityResult, McpDependency } from "./types.ts";

/**
 * Log debug message if PML_DEBUG is enabled.
 */
function logDebug(message: string): void {
  if (Deno.env.get("PML_DEBUG") === "1") {
    console.error(`[pml:integrity] ${message}`);
  }
}

/**
 * Compute SHA-256 hash of data.
 */
async function computeSha256(data: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer copy to ensure proper typing
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return `sha256-${encodeHex(new Uint8Array(hash))}`;
}

/**
 * Compute hash of a file.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const data = await Deno.readFile(filePath);
  return computeSha256(data);
}

/**
 * Compute hash of a string.
 */
export async function computeStringHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  return computeSha256(data);
}

/**
 * Compute package hash for npm packages.
 *
 * For npm packages installed via npx, we hash the package.json content
 * which contains version and dependencies info.
 *
 * Note: Since npx runs packages directly without a fixed install path,
 * we may need to verify via other means (e.g., output signature).
 */
export async function computePackageHash(packagePath: string): Promise<string> {
  try {
    // Try to read package.json
    const packageJsonPath = `${packagePath}/package.json`;
    const packageJson = await Deno.readTextFile(packageJsonPath);

    // Parse to get normalized content
    const pkg = JSON.parse(packageJson);

    // Create deterministic string from key fields
    const keyFields = JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      dependencies: pkg.dependencies ?? {},
      main: pkg.main ?? "index.js",
    });

    return computeStringHash(keyFields);
  } catch (error) {
    logDebug(`Failed to compute package hash: ${error}`);
    throw new Error(`Cannot compute hash for package at ${packagePath}: ${error}`);
  }
}

/**
 * Verify integrity of an installed dependency.
 *
 * @param dep - Dependency metadata with expected integrity
 * @param installedPath - Path where the package is installed
 * @returns Verification result
 */
export async function verifyIntegrity(
  dep: McpDependency,
  installedPath: string,
): Promise<IntegrityResult> {
  logDebug(`Verifying integrity of ${dep.name}@${dep.version}`);

  try {
    const actual = await computePackageHash(installedPath);
    const expected = dep.integrity;
    const valid = actual === expected;

    if (!valid) {
      logDebug(`Integrity mismatch for ${dep.name}: expected ${expected}, got ${actual}`);
    } else {
      logDebug(`Integrity verified for ${dep.name}`);
    }

    return { valid, actual, expected };
  } catch (error) {
    logDebug(`Integrity check error: ${error}`);

    // Return invalid result on error
    return {
      valid: false,
      actual: `error: ${error instanceof Error ? error.message : String(error)}`,
      expected: dep.integrity,
    };
  }
}

/**
 * Verify integrity from raw data (e.g., fetched package content).
 *
 * @param data - Raw package data
 * @param expectedIntegrity - Expected sha256 hash
 * @returns Verification result
 */
export async function verifyDataIntegrity(
  data: Uint8Array,
  expectedIntegrity: string,
): Promise<IntegrityResult> {
  const actual = await computeSha256(data);
  const valid = actual === expectedIntegrity;

  return { valid, actual, expected: expectedIntegrity };
}

/**
 * Parse integrity hash format.
 *
 * Supports: "sha256-<hex>"
 *
 * @param integrity - Integrity string
 * @returns Algorithm and hash, or null if invalid
 */
export function parseIntegrity(
  integrity: string,
): { algorithm: "sha256"; hash: string } | null {
  const match = integrity.match(/^sha256-([a-f0-9]+)$/i);
  if (!match) {
    return null;
  }

  return {
    algorithm: "sha256",
    hash: match[1],
  };
}

/**
 * Validate integrity hash format.
 */
export function isValidIntegrityFormat(integrity: string): boolean {
  return parseIntegrity(integrity) !== null;
}

/**
 * Create a mock integrity hash for development/testing.
 *
 * WARNING: Only use in development. Production must use real hashes.
 */
export async function createMockIntegrity(content: string): Promise<string> {
  return computeStringHash(content);
}
