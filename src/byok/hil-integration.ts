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
 * to add the API key to their .env file.
 *
 * @param missingKeys - Keys that are not set
 * @param invalidKeys - Keys with placeholder values
 * @returns Human-readable instruction
 *
 * @example
 * ```ts
 * formatKeyInstruction(["TAVILY_API_KEY"], []);
 * // "This capability requires TAVILY_API_KEY.\nPlease add it to your .env file..."
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
    lines.push(`Please add it to your .env file: ${allKeys[0]}=${hint}`);
    lines.push(`Then click "continue" to retry.`);
  } else {
    lines.push("This capability requires the following API keys:");
    for (const key of allKeys) {
      const hint = formatKeyHint(key);
      lines.push(`  - ${key}=${hint}`);
    }
    lines.push("");
    lines.push("Please add them to your .env file, then click \"continue\" to retry.");
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

  if (name.includes("tavily")) return "tvly-xxx...";
  if (name.includes("exa")) return "exa-xxx...";
  if (name.includes("anthropic")) return "sk-ant-xxx...";
  if (name.includes("openai")) return "sk-xxx...";
  if (name.includes("firecrawl")) return "fc-xxx...";
  if (name.includes("brave")) return "BSA-xxx...";
  if (name.includes("serper")) return "xxx...";
  if (name.includes("github")) return "ghp_xxx...";

  // Generic fallback
  return "your-api-key";
}

/**
 * Create HIL pause response for missing API keys.
 *
 * This function returns an `ApiKeyApprovalRequired` object that
 * signals to the caller that execution should pause until the
 * user configures the required keys in .env.
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

// =============================================================================
// DEPRECATED - handleApiKeyContinue
// =============================================================================
//
// This function is no longer used. The continuation flow is now handled
// directly in stdio-command.ts:
//
// 1. User adds key to .env manually
// 2. User clicks "continue"
// 3. stdio-command.ts calls reloadEnv(workspace) to load from .env
// 4. Code re-executes with key available
//
// The providedKeys parameter was never used in the MCP flow because
// we don't want to pass API keys in clear text through the protocol.

/*
export interface ApiKeyContinueResult {
  success: boolean;
  validKeys: string[];
  remainingIssues: string[];
  error?: string;
}

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
*/
