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

// Env loader (.env file)
export { envFileExists, getKey, reloadEnv, resolveEnvHeaders } from "./env-loader.ts";

// PML env manager (.pml.json) - DEPRECATED
// These functions are no longer used. API keys are now managed
// exclusively via .env file and reloadEnv().
// See pml-env.ts for details.
//
// export {
//   getMissingEnvKeys,
//   getPmlEnvKey,
//   hasPmlEnvKey,
//   loadPmlEnv,
//   savePmlEnvKey,
// } from "./pml-env.ts";

// Key checker
export { checkKeys, isValidKeyValue } from "./key-checker.ts";

// Key requirements mapping - DEPRECATED
// API key requirements now come from registry metadata (envRequired).
// See: loader/capability-loader.ts ensureDependency()
// The hardcoded mapping has been removed.

// HIL integration
export {
  formatKeyInstruction,
  isApiKeyApprovalRequired,
  pauseForMissingKeys,
} from "./hil-integration.ts";

// DEPRECATED - handleApiKeyContinue is no longer used
// The continuation flow is handled in stdio-command.ts via reloadEnv()
// export { handleApiKeyContinue } from "./hil-integration.ts";
// export type { ApiKeyContinueResult } from "./hil-integration.ts";

// Sanitizer
export {
  containsApiKey,
  createSanitizedLogger,
  sanitize,
  sanitizeError,
  sanitizeObject,
} from "./sanitizer.ts";
export type { SanitizedLogger } from "./sanitizer.ts";
