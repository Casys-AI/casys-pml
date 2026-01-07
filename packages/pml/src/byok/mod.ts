/**
 * BYOK (Bring Your Own Key) Module
 *
 * API key detection, validation, and HIL approval flow.
 *
 * **MVP Scope:** Local `.env` only. Cloud profile deferred.
 *
 * **Flow:**
 * 1. Tool call arrives (e.g., tavily:search)
 * 2. Check required keys via `checkKeys()`
 * 3. If missing → return HIL pause with `pauseForMissingKeys()`
 * 4. User adds keys to .env, clicks Continue
 * 5. Reload .env via `reloadEnv()`
 * 6. Re-check keys → proceed if valid
 *
 * @module byok
 */

// Types
export type {
  ApiKeyApprovalRequired,
  ByokConfig,
  EnvReloadResult,
  KeyCheckResult,
  RequiredKey,
  SanitizeOptions,
} from "./types.ts";

export {
  INVALID_KEY_PATTERNS,
  MissingKeysError,
  REDACT_PATTERNS,
} from "./types.ts";

// Env loader
export { getKey, reloadEnv } from "./env-loader.ts";

// Key checker
export { checkKeys, isValidKeyValue } from "./key-checker.ts";

// Key requirements mapping
export {
  getRequiredKeys,
  getRequiredKeysForTool,
  TOOL_REQUIRED_KEYS,
} from "./key-requirements.ts";

// HIL integration
export {
  formatKeyInstruction,
  handleApiKeyContinue,
  isApiKeyApprovalRequired,
  pauseForMissingKeys,
} from "./hil-integration.ts";
export type { ApiKeyContinueResult } from "./hil-integration.ts";

// Sanitizer
export {
  containsApiKey,
  createSanitizedLogger,
  sanitize,
  sanitizeError,
  sanitizeObject,
} from "./sanitizer.ts";
export type { SanitizedLogger } from "./sanitizer.ts";
