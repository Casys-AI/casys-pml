/**
 * Environment Variable Checker
 *
 * Validates required environment variables for MCP dependencies.
 *
 * @module loader/env-checker
 */

/**
 * Result of environment check.
 */
export interface EnvCheckResult {
  /** Whether all required vars are present */
  valid: boolean;
  /** List of missing variables */
  missing: string[];
  /** List of present variables */
  present: string[];
}

/**
 * Check if required environment variables are set.
 *
 * @param required - List of required variable names
 * @returns Check result with missing/present lists
 */
export function checkEnvVars(required: string[]): EnvCheckResult {
  const missing: string[] = [];
  const present: string[] = [];

  for (const name of required) {
    const value = Deno.env.get(name);

    if (value === undefined || value === "") {
      missing.push(name);
    } else {
      present.push(name);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Format error message for missing environment variables.
 *
 * @param depName - Dependency name
 * @param missing - List of missing variables
 * @returns Formatted error message
 */
export function formatMissingEnvError(depName: string, missing: string[]): string {
  if (missing.length === 0) {
    return "";
  }

  const vars = missing.map((v) => `  - ${v}`).join("\n");

  return (
    `${depName} requires the following environment variables:\n` +
    `${vars}\n\n` +
    `To set them:\n` +
    `  export ${missing[0]}=your_value_here\n` +
    (missing.length > 1
      ? `  (and ${missing.length - 1} more...)\n`
      : "") +
    `\nOr add them to your .env file.`
  );
}

/**
 * Validate environment for a dependency.
 *
 * @param depName - Dependency name
 * @param required - Required environment variables
 * @throws Error if variables are missing
 */
export function validateEnvForDep(depName: string, required: string[]): void {
  if (!required || required.length === 0) {
    return;
  }

  const result = checkEnvVars(required);

  if (!result.valid) {
    throw new Error(formatMissingEnvError(depName, result.missing));
  }
}

/**
 * Get redacted environment info for debugging.
 *
 * Shows which variables are set without revealing values.
 *
 * @param names - Variable names to check
 * @returns Map of name to "set" or "unset"
 */
export function getEnvStatus(names: string[]): Record<string, "set" | "unset"> {
  const result: Record<string, "set" | "unset"> = {};

  for (const name of names) {
    const value = Deno.env.get(name);
    result[name] = value !== undefined && value !== "" ? "set" : "unset";
  }

  return result;
}

/**
 * Common environment variable names for MCP dependencies.
 */
export const CommonEnvVars = {
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  GITHUB_TOKEN: "GITHUB_TOKEN",
  PML_API_KEY: "PML_API_KEY",
} as const;
