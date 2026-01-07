/**
 * HIL Integration for Missing API Keys
 *
 * Creates HIL pause responses when API keys are missing.
 * The user adds keys to .env and continues the workflow.
 *
 * @module byok/hil-integration
 */

import type { ApiKeyApprovalRequired, KeyCheckResult } from "./types.ts";

/**
 * Generate a unique workflow ID for tracking.
 */
function generateWorkflowId(): string {
  return `wf-byok-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Format instruction message for missing keys.
 *
 * Generates a clear, actionable message telling the user
 * exactly what to add to their .env file.
 *
 * @param missingKeys - Keys that are not set
 * @param invalidKeys - Keys with placeholder values
 * @returns Human-readable instruction
 *
 * @example
 * ```ts
 * formatKeyInstruction(["TAVILY_API_KEY"], []);
 * // "Add the following to your .env file:\nTAVILY_API_KEY=your-tavily-key"
 * ```
 */
export function formatKeyInstruction(
  missingKeys: string[],
  invalidKeys: string[],
): string {
  const lines: string[] = [];

  if (missingKeys.length > 0) {
    lines.push("Add the following to your .env file:");
    for (const key of missingKeys) {
      lines.push(`${key}=your-${formatKeyHint(key)}`);
    }
  }

  if (invalidKeys.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Replace the placeholder values for:");
    for (const key of invalidKeys) {
      lines.push(`${key} (currently has an invalid/placeholder value)`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a hint for what kind of value a key expects.
 *
 * @param keyName - Environment variable name
 * @returns Hint string
 */
function formatKeyHint(keyName: string): string {
  const name = keyName.toLowerCase();

  if (name.includes("tavily")) return "tavily-key";
  if (name.includes("exa")) return "exa-key";
  if (name.includes("anthropic")) return "anthropic-key";
  if (name.includes("openai")) return "openai-key";
  if (name.includes("firecrawl")) return "firecrawl-key";
  if (name.includes("brave")) return "brave-key";
  if (name.includes("serper")) return "serper-key";
  if (name.includes("github")) return "github-token";

  // Generic fallback
  return "api-key";
}

/**
 * Create HIL pause response for missing API keys.
 *
 * This function returns an `ApiKeyApprovalRequired` object that
 * signals to the caller that execution should pause until the
 * user configures the required keys.
 *
 * @param checkResult - Result from checkKeys()
 * @param workflowId - Optional: existing workflow ID for continuation
 * @returns ApiKeyApprovalRequired response
 *
 * @example
 * ```ts
 * const check = checkKeys(requiredKeys);
 * if (!check.allValid) {
 *   return pauseForMissingKeys(check);
 * }
 * ```
 */
export function pauseForMissingKeys(
  checkResult: KeyCheckResult,
  workflowId?: string,
): ApiKeyApprovalRequired {
  return {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: workflowId ?? generateWorkflowId(),
    missingKeys: [...checkResult.missing, ...checkResult.invalid], // Combine for simplicity
    instruction: formatKeyInstruction(checkResult.missing, checkResult.invalid),
  };
}

/**
 * Check if a result is an API key approval required response.
 *
 * Type guard for distinguishing from other approval types.
 *
 * @param result - Unknown result to check
 * @returns true if result is ApiKeyApprovalRequired
 */
export function isApiKeyApprovalRequired(
  result: unknown,
): result is ApiKeyApprovalRequired {
  return (
    typeof result === "object" &&
    result !== null &&
    "approvalRequired" in result &&
    (result as ApiKeyApprovalRequired).approvalRequired === true &&
    "approvalType" in result &&
    (result as ApiKeyApprovalRequired).approvalType === "api_key_required"
  );
}

/**
 * Result of handling continue_workflow for API keys.
 */
export interface ApiKeyContinueResult {
  /** Whether all keys are now valid */
  success: boolean;
  /** Keys that are now valid */
  validKeys: string[];
  /** Keys that are still missing or invalid */
  remainingIssues: string[];
  /** Error message if still failing */
  error?: string;
}

/**
 * Handle continue_workflow for API key approval.
 *
 * This function is called when the user clicks Continue after
 * adding keys to .env. It:
 * 1. Reloads the .env file
 * 2. Re-checks the previously missing/invalid keys
 * 3. Returns success if all valid, error if still missing
 *
 * @param originalApproval - The original ApiKeyApprovalRequired response
 * @param workspace - Workspace root path (for .env location)
 * @returns Result indicating success or remaining issues
 *
 * @example
 * ```ts
 * // User clicked Continue after adding keys
 * const result = await handleApiKeyContinue(originalApproval, workspace);
 * if (result.success) {
 *   // Proceed with execution
 * } else {
 *   // Still missing keys
 *   console.log("Still missing:", result.remainingIssues);
 * }
 * ```
 */
export async function handleApiKeyContinue(
  originalApproval: ApiKeyApprovalRequired,
  workspace: string,
): Promise<ApiKeyContinueResult> {
  // Dynamic import to avoid circular dependencies
  const { reloadEnv } = await import("./env-loader.ts");
  const { checkKeys } = await import("./key-checker.ts");

  // 1. Reload .env file
  try {
    await reloadEnv(workspace);
  } catch (error) {
    return {
      success: false,
      validKeys: [],
      remainingIssues: [...originalApproval.missingKeys, ...originalApproval.invalidKeys],
      error: `Failed to reload .env: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // 2. Re-check the keys that were missing/invalid
  const allKeys = [
    ...originalApproval.missingKeys,
    ...originalApproval.invalidKeys,
  ];

  const checkResult = checkKeys(
    allKeys.map((name) => ({ name, requiredBy: "continue_workflow" })),
  );

  // 3. Determine which keys are now valid
  const validKeys = allKeys.filter(
    (k) => !checkResult.missing.includes(k) && !checkResult.invalid.includes(k),
  );

  const remainingIssues = [...checkResult.missing, ...checkResult.invalid];

  if (checkResult.allValid) {
    return {
      success: true,
      validKeys,
      remainingIssues: [],
    };
  }

  return {
    success: false,
    validKeys,
    remainingIssues,
    error: formatKeyInstruction(checkResult.missing, checkResult.invalid),
  };
}
