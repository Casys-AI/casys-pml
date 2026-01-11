/**
 * Key Checker
 *
 * Validates that required API keys are configured and have valid values.
 *
 * @module byok/key-checker
 */

import { getKey } from "./env-loader.ts";
import type { KeyCheckResult, RequiredKey } from "./types.ts";
import { INVALID_KEY_PATTERNS } from "./types.ts";

/**
 * Check if a key value is valid (not empty, not a placeholder).
 *
 * @param value - The key value to validate
 * @returns true if the value is valid, false otherwise
 *
 * @example
 * ```ts
 * isValidKeyValue("tvly-abc123"); // true
 * isValidKeyValue("xxx"); // false - placeholder
 * isValidKeyValue(""); // false - empty
 * isValidKeyValue("your-key-here"); // false - placeholder
 * ```
 */
export function isValidKeyValue(value: string | undefined): boolean {
  // Undefined or empty is invalid
  if (!value || value.trim() === "") {
    return false;
  }

  const trimmed = value.trim();

  // Check against placeholder patterns
  for (const pattern of INVALID_KEY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  return true;
}

/**
 * Check multiple required keys.
 *
 * Reports all missing/invalid keys upfront (AC4: Multiple Keys Upfront).
 * This allows users to configure all keys at once instead of
 * hitting one error at a time.
 *
 * @param required - Array of required keys to check
 * @returns Result with missing and invalid keys
 *
 * @example
 * ```ts
 * const result = checkKeys([
 *   { name: "TAVILY_API_KEY", requiredBy: "tavily:search" },
 *   { name: "EXA_API_KEY", requiredBy: "exa:search" },
 * ]);
 *
 * if (!result.allValid) {
 *   // Handle missing keys
 *   console.log("Missing:", result.missing);
 *   console.log("Invalid:", result.invalid);
 * }
 * ```
 */
export function checkKeys(required: RequiredKey[]): KeyCheckResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of required) {
    const value = getKey(key.name);

    if (value === undefined || value === "") {
      // Key is completely missing
      missing.push(key.name);
    } else if (!isValidKeyValue(value)) {
      // Key has a placeholder value
      invalid.push(key.name);
    }
    // else: key is valid
  }

  return {
    allValid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Check a single key by name.
 *
 * Convenience wrapper around checkKeys() for single-key validation.
 *
 * @param name - Environment variable name
 * @param requiredBy - Tool/capability that requires this key
 * @returns Result with missing and invalid keys
 */
export function checkKey(name: string, requiredBy: string): KeyCheckResult {
  return checkKeys([{ name, requiredBy }]);
}

/**
 * Get validation error message for a key.
 *
 * Useful for detailed error messages showing why a key is invalid.
 *
 * @param name - Environment variable name
 * @returns Error message or null if valid
 */
export function getKeyValidationError(name: string): string | null {
  const value = getKey(name);

  if (value === undefined) {
    return `${name} is not set`;
  }

  if (value === "" || value.trim() === "") {
    return `${name} is empty`;
  }

  // Check for specific placeholder patterns
  const trimmed = value.trim();

  if (/^x{2,}$/i.test(trimmed)) {
    return `${name} contains placeholder value "xxx"`;
  }

  if (/^your[-_]?key/i.test(trimmed)) {
    return `${name} contains placeholder "your-key..."`;
  }

  if (/^<.*>$/.test(trimmed)) {
    return `${name} contains placeholder "<...>"`;
  }

  if (/^TODO$/i.test(trimmed)) {
    return `${name} contains "TODO"`;
  }

  if (/^CHANGE[-_]?ME$/i.test(trimmed)) {
    return `${name} contains "CHANGE_ME"`;
  }

  if (/^placeholder$/i.test(trimmed)) {
    return `${name} contains "placeholder"`;
  }

  // Generic check for any other invalid pattern
  for (const pattern of INVALID_KEY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `${name} contains an invalid/placeholder value`;
    }
  }

  return null; // Valid
}
