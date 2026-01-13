/**
 * HIL Integration for Missing API Keys
 *
 * Creates HIL pause responses when API keys are missing.
 * The user adds keys to .env and continues the workflow.
 *
 * @module byok/hil-integration
 */

import type { ApiKeyApprovalRequired } from "../loader/types.ts";
import type { KeyCheckResult } from "./types.ts";

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
 * to provide the API key value. The key will be saved to .pml.json.
 *
 * @param missingKeys - Keys that are not set
 * @param invalidKeys - Keys with placeholder values
 * @returns Human-readable instruction
 *
 * @example
 * ```ts
 * formatKeyInstruction(["TAVILY_API_KEY"], []);
 * // "Please provide the following API key:\nTAVILY_API_KEY"
 * ```
 */
export function formatKeyInstruction(
  missingKeys: string[],
  invalidKeys: string[],
): string {
  const allKeys = [...missingKeys, ...invalidKeys];
  const lines: string[] = [];

  if (allKeys.length === 1) {
    const hint = formatKeyHint(allKeys[0]);
    lines.push(`This capability requires ${allKeys[0]}.`);
    lines.push(`Please provide the API key value (format: ${hint}).`);
    lines.push(`It will be saved to .pml.json for future use.`);
  } else {
    lines.push("This capability requires the following API keys:");
    for (const key of allKeys) {
      const hint = formatKeyHint(key);
      lines.push(`  - ${key} (format: ${hint})`);
    }
    lines.push("");
    lines.push("Please provide the values. They will be saved to .pml.json.");
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
 * This function is called when the user provides key values.
 * It saves them to .pml.json and sets them in Deno.env.
 *
 * @param originalApproval - The original ApiKeyApprovalRequired response
 * @param workspace - Workspace root path (for .pml.json location)
 * @param providedKeys - Key values provided by the user
 * @returns Result indicating success or remaining issues
 *
 * @example
 * ```ts
 * // User provided key values
 * const result = await handleApiKeyContinue(
 *   originalApproval,
 *   workspace,
 *   { TAVILY_API_KEY: "tvly-xxx..." }
 * );
 * if (result.success) {
 *   // Proceed with execution - keys saved to .pml.json
 * }
 * ```
 */
export async function handleApiKeyContinue(
  originalApproval: ApiKeyApprovalRequired,
  workspace: string,
  providedKeys?: Record<string, string>,
): Promise<ApiKeyContinueResult> {
  // Dynamic import to avoid circular dependencies
  const { savePmlEnvKey, loadPmlEnv } = await import("./pml-env.ts");
  const { reloadEnv } = await import("./env-loader.ts");
  const { checkKeys } = await import("./key-checker.ts");

  // 1. If keys were provided, save them to .pml.json
  if (providedKeys) {
    for (const [key, value] of Object.entries(providedKeys)) {
      if (value && value.trim()) {
        await savePmlEnvKey(workspace, key, value.trim());
      }
    }
  }

  // 2. Reload env from both .pml.json and .env (user may have edited either)
  await loadPmlEnv(workspace);
  await reloadEnv(workspace);

  // 3. Re-check the keys that were missing/invalid
  const allKeys = [...originalApproval.missingKeys];

  const checkResult = checkKeys(
    allKeys.map((name) => ({ name, requiredBy: "continue_workflow" })),
  );

  // 4. Determine which keys are now valid
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
