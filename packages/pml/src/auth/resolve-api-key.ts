/**
 * Resolve PML API key with priority chain:
 * 1. Env var PML_API_KEY (non-empty) — explicit override (CI/CD, .env)
 * 2. TokenStore — stored by `pml init` or `pml connect`
 * 3. undefined — caller decides how to fail
 *
 * @module auth/resolve-api-key
 */

import type { TokenStore } from "../../../../lib/server/src/client-auth/types.ts";

export async function resolveApiKey(
  cloudUrl: string,
  store: TokenStore,
): Promise<string | undefined> {
  // 1. Env var wins if non-empty
  const envKey = Deno.env.get("PML_API_KEY");
  if (envKey?.trim()) return envKey.trim();

  // 2. TokenStore fallback
  const creds = await store.get(cloudUrl);
  if (creds?.tokens?.access_token) {
    return creds.tokens.access_token;
  }

  return undefined;
}
