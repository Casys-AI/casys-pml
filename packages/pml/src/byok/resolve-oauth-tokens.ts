/**
 * Resolve OAuth tokens from FileTokenStore into Deno.env.
 *
 * When `pml connect <url>` stores OAuth tokens in ~/.pml/credentials/,
 * this function bridges them into env vars so ensureDependency()'s
 * checkKeys() finds them without triggering HIL.
 *
 * Priority: existing env var wins (never overwrite).
 *
 * @module byok/resolve-oauth-tokens
 */

import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import type { TokenStore } from "../../../../lib/server/src/client-auth/types.ts";
import { join } from "@std/path";

const DEFAULT_CREDENTIALS_DIR = join(
  Deno.env.get("HOME") ?? "~",
  ".pml",
  "credentials",
);

/**
 * Resolve OAuth tokens from FileTokenStore and inject into Deno.env.
 *
 * For each missing env var in `envRequired`, checks if FileTokenStore
 * has a token for `serverUrl`. If found, sets the env var to the
 * access_token. Existing env vars are never overwritten.
 *
 * @param serverUrl - MCP server URL (key in FileTokenStore)
 * @param envRequired - Env var names to resolve
 * @param storeOrDir - TokenStore instance or credentials directory path
 * @returns List of env var names that were resolved from store
 */
export async function resolveOAuthTokensToEnv(
  serverUrl: string,
  envRequired: string[],
  storeOrDir: TokenStore | string = DEFAULT_CREDENTIALS_DIR,
): Promise<string[]> {
  if (!serverUrl || envRequired.length === 0) return [];

  const store = typeof storeOrDir === "string"
    ? new FileTokenStore(storeOrDir)
    : storeOrDir;

  // Check which vars are actually missing before doing I/O
  const missing = envRequired.filter((v) => !Deno.env.get(v)?.trim());
  if (missing.length === 0) return [];

  const stored = await store.get(serverUrl);
  if (!stored?.tokens?.access_token) return [];

  const resolved: string[] = [];
  for (const varName of missing) {
    Deno.env.set(varName, stored.tokens.access_token);
    resolved.push(varName);
  }
  return resolved;
}
