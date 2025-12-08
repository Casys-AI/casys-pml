/**
 * Shared Authentication Module
 *
 * Provides mode detection and validation helpers used by both:
 * - Fresh Dashboard (port 8080) - session-based auth
 * - API Server (port 3003) - API Key auth
 *
 * Mode Detection:
 * - Cloud mode: GITHUB_CLIENT_ID is set → full auth required
 * - Local mode: No GITHUB_CLIENT_ID → auth bypassed, user_id = "local"
 *
 * @module lib/auth
 */

import * as log from "@std/log";
import { getApiKeyPrefix, verifyApiKey } from "./api-key.ts";
import { getDb } from "../server/auth/db.ts";
import { users } from "../db/schema/users.ts";
import { eq } from "drizzle-orm";

/**
 * Check if running in cloud mode (multi-tenant with auth)
 * Cloud mode is enabled when GITHUB_CLIENT_ID is set.
 */
export function isCloudMode(): boolean {
  return !!Deno.env.get("GITHUB_CLIENT_ID");
}

/**
 * Get default user ID for local mode
 * Returns "local" in local mode, null in cloud mode (requires auth)
 */
export function getDefaultUserId(): string | null {
  return isCloudMode() ? null : "local";
}

/**
 * Auth result from request validation
 */
export interface AuthResult {
  user_id: string;
  username?: string;
}

/**
 * Validate API Key from request header
 * Used by API Server (port 3003) for MCP and API routes.
 *
 * @param req - HTTP Request
 * @returns AuthResult if valid, null if invalid/missing
 */
export async function validateRequest(
  req: Request,
): Promise<AuthResult | null> {
  // Local mode: bypass auth, return default user
  if (!isCloudMode()) {
    return { user_id: "local", username: "local" };
  }

  // Cloud mode: require API Key header
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    log.debug("Missing x-api-key header");
    return null;
  }

  return await validateApiKeyFromDb(apiKey);
}

/**
 * Validate API Key against database
 * 1. Validate format (ac_ + 24 chars)
 * 2. Extract prefix for O(1) lookup
 * 3. Find user by prefix
 * 4. Verify full key against stored hash
 *
 * @param apiKey - Full API key (ac_xxx)
 * @returns AuthResult if valid, null if invalid
 */
export async function validateApiKeyFromDb(
  apiKey: string,
): Promise<AuthResult | null> {
  try {
    // Validate format before DB lookup (fail fast)
    if (!apiKey.startsWith("ac_") || apiKey.length !== 27) {
      log.debug("Invalid API key format");
      return null;
    }

    // Extract prefix for lookup
    const prefix = getApiKeyPrefix(apiKey);

    // Find user by prefix
    const db = await getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.apiKeyPrefix, prefix))
      .limit(1);

    if (result.length === 0) {
      log.debug("No user found for API key prefix");
      return null;
    }

    const user = result[0];

    // Verify full key against hash
    if (!user.apiKeyHash) {
      log.debug("User has no API key hash");
      return null;
    }

    const isValid = await verifyApiKey(apiKey, user.apiKeyHash);
    if (!isValid) {
      log.debug("API key verification failed");
      return null;
    }

    return {
      user_id: user.id,
      username: user.username,
    };
  } catch (error) {
    log.error("Error validating API key", { error });
    return null;
  }
}

/**
 * Log auth mode at startup
 * Call this from both servers during initialization.
 */
export function logAuthMode(serverName: string): void {
  const mode = isCloudMode() ? "CLOUD" : "LOCAL";
  log.info(`[${serverName}] Auth mode: ${mode}`);
  if (!isCloudMode()) {
    log.info(
      `[${serverName}] Running in local mode - auth bypassed, user_id = "local"`,
    );
  }
}
