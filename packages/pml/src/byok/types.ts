/**
 * BYOK (Bring Your Own Key) Types
 *
 * Types for API key detection, validation, and HIL approval flow.
 *
 * @module byok/types
 */

// ============================================================================
// Core Key Types
// ============================================================================

/**
 * Required key for a tool or capability.
 */
export interface RequiredKey {
  /** Environment variable name (e.g., "TAVILY_API_KEY") */
  name: string;
  /** Tool that requires this key */
  requiredBy: string;
}

/**
 * Result of checking required keys.
 */
export interface KeyCheckResult {
  /** Whether all required keys are valid */
  allValid: boolean;
  /** Missing environment variables */
  missing: string[];
  /** Keys with invalid/placeholder values */
  invalid: string[];
}

// ============================================================================
// Placeholder Detection
// ============================================================================

/**
 * Patterns for detecting placeholder values.
 * These are values that look like API keys but are clearly placeholders.
 */
export const INVALID_KEY_PATTERNS: RegExp[] = [
  /^$/, // Empty
  /^x{2,}$/i, // xxx, XXX, xxxx
  /^your[-_]?key/i, // your-key, your_key, yourkey
  /^<.*>$/, // <your-key>, <api-key>
  /^TODO$/i, // TODO
  /^CHANGE[-_]?ME$/i, // CHANGE_ME, CHANGEME
  /^placeholder$/i, // placeholder
  /^test[-_]?key$/i, // test-key, test_key
  /^fake[-_]?key$/i, // fake-key, fake_key
  /^example$/i, // example
  /^insert[-_]?here$/i, // insert-here, insert_here
  /^replace[-_]?me$/i, // replace-me, replace_me
];

// ============================================================================
// HIL Approval Types
// ============================================================================

/**
 * HIL approval response for missing API keys.
 *
 * Returned when tool execution is blocked due to missing keys.
 * The user must add the keys to .env and continue the workflow.
 */
export interface ApiKeyApprovalRequired {
  /** Always true for approval responses */
  approvalRequired: true;
  /** Distinguishes from dependency approval */
  approvalType: "api_key_required";
  /** Workflow ID for continuation */
  workflowId: string;
  /** Missing key names */
  missingKeys: string[];
  /** Human-readable instruction */
  instruction: string;
}

/**
 * Result of reloading .env after user action.
 */
export interface EnvReloadResult {
  /** Whether reload was successful */
  success: boolean;
  /** Keys that are now valid */
  valid: string[];
  /** Keys that are still missing */
  stillMissing: string[];
  /** Keys with placeholder values */
  stillInvalid: string[];
  /** Error message if reload failed */
  error?: string;
}

// ============================================================================
// Sanitization Types
// ============================================================================

/**
 * Patterns for redacting API keys from logs.
 *
 * These patterns match common API key formats and redact them
 * to prevent accidental exposure in logs or error messages.
 */
export const REDACT_PATTERNS: RegExp[] = [
  // Generic API key assignments: FOO_API_KEY=abc123
  /([A-Z_]+_API_KEY)=([^\s"']+)/gi,
  // Anthropic: sk-ant-api03-...
  /(sk-ant-[a-zA-Z0-9-]+)/g,
  // OpenAI style: sk-...
  /(sk-[a-zA-Z0-9]{20,})/g,
  // Tavily: tvly-...
  /(tvly-[a-zA-Z0-9]+)/g,
  // Exa: exa-...
  /(exa[_-][a-zA-Z0-9]+)/gi,
  // Generic Bearer token
  /(Bearer\s+[a-zA-Z0-9._-]+)/gi,
];

/**
 * Options for sanitizing text.
 */
export interface SanitizeOptions {
  /** Replacement text for redacted values (default: "[REDACTED]") */
  replacement?: string;
  /** Additional patterns to match */
  additionalPatterns?: RegExp[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * BYOK configuration options.
 */
export interface ByokConfig {
  /** Workspace root path (for .env location) */
  workspace: string;
  /** Whether to auto-reload .env on continue (default: true) */
  autoReload?: boolean;
  /** Custom .env file path (relative to workspace) */
  envPath?: string;
}

/**
 * Error thrown when required keys are missing.
 */
export class MissingKeysError extends Error {
  constructor(
    public readonly missingKeys: string[],
    public readonly invalidKeys: string[],
  ) {
    const parts: string[] = [];
    if (missingKeys.length > 0) {
      parts.push(`Missing: ${missingKeys.join(", ")}`);
    }
    if (invalidKeys.length > 0) {
      parts.push(`Invalid: ${invalidKeys.join(", ")}`);
    }
    super(`Required API keys not configured. ${parts.join(". ")}`);
    this.name = "MissingKeysError";
  }
}
