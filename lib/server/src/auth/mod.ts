/**
 * Auth module for ConcurrentMCPServer.
 *
 * @module lib/server/auth
 */

// Types
export type {
  AuthInfo,
  AuthOptions,
  ProtectedResourceMetadata,
} from "./types.ts";

// Provider base class
export { AuthProvider } from "./provider.ts";

// Middleware and utilities
export {
  AuthError,
  extractBearerToken,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createAuthMiddleware,
} from "./middleware.ts";

// Scope enforcement
export { createScopeMiddleware } from "./scope-middleware.ts";

// JWT Provider
export { JwtAuthProvider } from "./jwt-provider.ts";
export type { JwtAuthProviderOptions } from "./jwt-provider.ts";

// OIDC Presets
export {
  createGitHubAuthProvider,
  createGoogleAuthProvider,
  createAuth0AuthProvider,
  createOIDCAuthProvider,
} from "./presets.ts";
export type { PresetOptions } from "./presets.ts";

// Config loader (YAML + env)
export { loadAuthConfig, createAuthProviderFromConfig } from "./config.ts";
export type { AuthConfig, AuthProviderName } from "./config.ts";
