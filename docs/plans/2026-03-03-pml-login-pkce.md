# PML Login — OAuth PKCE via lib/server Infrastructure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `pml login` authenticates against pml.casys.ai via standard OAuth PKCE, reusing `lib/server/src/client-auth/` (CallbackServer, FileTokenStore) — zero custom auth protocol.

**Architecture:** CLI starts a CallbackServer on localhost, opens browser to `pml.casys.ai/oauth/authorize`, which chains GitHub OAuth if no session exists. Once authenticated, the server generates an auth code and redirects to localhost. CLI exchanges the code for an API key via `POST /oauth/token`. The API key is stored in FileTokenStore and picked up by `resolveApiKey()` at boot.

**Tech Stack:** Deno, existing `CallbackServer` + `FileTokenStore` from `lib/server/src/client-auth/`, `@deno/kv-oauth` (existing GitHub OAuth), Deno KV for auth codes, Web Crypto API for PKCE

**Depends on:** `resolveApiKey` + FileTokenStore wiring (completed 2026-03-03)

---

## Context for Implementer

### What already exists (DO NOT rebuild)

| Component | File | What it does |
|-----------|------|-------------|
| `CallbackServer` | `lib/server/src/client-auth/callback-server.ts` | Localhost HTTP server that captures OAuth redirect code. Auto-assigns port, handles timeout. |
| `FileTokenStore` | `lib/server/src/client-auth/token-store/file-store.ts` | Stores credentials as JSON in `~/.pml/credentials/` with chmod 600. One file per server URL (SHA-256 hashed). |
| `resolveApiKey()` | `packages/pml/src/auth/resolve-api-key.ts` | Priority: env var > FileTokenStore > undefined. Wired into boot in `pml-context.ts`. |
| `openBrowser()` | `packages/pml/src/cli/connect-command.ts:15-27` | Cross-platform browser open (xdg-open/open/start). |
| `generateApiKey()` | `src/lib/api-key.ts` | Generates `ac_` + 24 random chars + Argon2 hash. |
| `getSessionId()` | `src/server/auth/oauth.ts` | Gets GitHub session ID from request cookies. |
| `getSession()` | `src/server/auth/session.ts` | Gets session data from Deno KV. |
| GitHub OAuth flow | `src/web/routes/auth/signin.ts`, `callback.ts` | Full GitHub OAuth via `@deno/kv-oauth`. Creates user + API key on first login. |
| `pml connections list\|remove` | `packages/pml/src/cli/connections-command.ts` | Already manages FileTokenStore entries. `pml logout` will be sugar over `connections remove`. |
| `pml connect` | `packages/pml/src/cli/connect-command.ts` | PKCE flow for third-party MCP servers. Reference for `pml login`, but NOT reused directly (uses MCP SDK discovery which we don't need). |

### `pml init` vs `pml login` — separation of concerns

- **`pml init`** = scaffolds `.mcp.json` + `.pml.json` config files. Does NOT handle auth.
  - `--api-key` flag remains for CI/CD (non-interactive, stores in FileTokenStore)
  - The interactive API key prompt gets **removed** — replaced by `pml login`
- **`pml login`** = authenticates the user via PKCE, stores API key in FileTokenStore
- **`pml logout`** = removes stored API key (sugar over `pml connections remove`)

Typical new user flow: `pml init` → `pml login` → ready.

### The OAuth PKCE Flow

```
pml login (CLI)               pml.casys.ai (Server)           GitHub
    │                              │                              │
    │ Start CallbackServer         │                              │
    │ on localhost:PORT            │                              │
    │                              │                              │
    │ Open browser ───────────────►│                              │
    │ /oauth/authorize             │                              │
    │   ?client_id=pml-cli         │                              │
    │   &redirect_uri=localhost    │                              │
    │   &code_challenge=...        │ No GitHub session?           │
    │   &response_type=code        │ Set pml_oauth_params cookie  │
    │                              │──────────────────────────────►│
    │                              │ signIn() → GitHub OAuth      │
    │                              │                              │ User authorizes
    │                              │◄──────────────────────────────│
    │                              │ /auth/callback               │
    │                              │ Creates user + session        │
    │                              │ Detects cookie → redirect     │
    │                              │ back to /oauth/authorize      │
    │                              │                              │
    │                              │ Has session now!              │
    │                              │ Generate auth code            │
    │ ◄───────────────────────────│ Redirect to localhost:PORT    │
    │ /callback?code=AUTH_CODE    │                              │
    │                              │                              │
    │ POST /oauth/token ──────────►│                              │
    │ { code, code_verifier,       │ Verify PKCE                  │
    │   client_id, grant_type }    │ Generate new API key          │
    │                              │ Store hash in DB              │
    │ ◄───────────────────────────│ { access_token: "ac_xxx" }    │
    │                              │                              │
    │ Store in FileTokenStore      │                              │
    │ resolveApiKey() finds it ✓   │                              │
```

### Design decisions

1. **No MCP SDK discovery** — we control both sides, hardcode endpoints. Can add `/.well-known/oauth-authorization-server` later for third-party MCP clients.
2. **API key = OAuth access_token** — token endpoint generates a new `ac_` API key (like `/auth/regenerate`). No new auth mechanism. `validateApiKeyFromDb()` works unchanged.
3. **`pml login` regenerates the API key** — old key is replaced. If user already has a key configured elsewhere, they should use `pml init --api-key` for that scenario.
4. **Auto-approve for `pml-cli`** — no consent screen. The user initiated `pml login` themselves, that's consent enough.
5. **GitHub session chaining via cookie** — `/oauth/authorize` stores params in `pml_oauth_params` cookie, redirects to GitHub OAuth. Callback detects cookie, redirects back to authorize. Minimal change to existing callback code (~10 lines).

---

## Task 1: PKCE utilities

**Files:**
- Create: `lib/server/src/client-auth/pkce.ts`
- Create: `lib/server/src/client-auth/pkce_test.ts`

**Step 1: Write the failing test**

```typescript
// lib/server/src/client-auth/pkce_test.ts
import { assertEquals, assertNotEquals } from "@std/assert";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  verifyCodeChallenge,
} from "./pkce.ts";

Deno.test("generateCodeVerifier - produces 43+ char base64url string", () => {
  const verifier = generateCodeVerifier();
  assertEquals(verifier.length >= 43, true);
  assertEquals(/^[A-Za-z0-9\-._~]+$/.test(verifier), true);
});

Deno.test("generateCodeVerifier - each call is unique", () => {
  assertNotEquals(generateCodeVerifier(), generateCodeVerifier());
});

Deno.test("generateCodeChallenge - S256 hash of verifier", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  // Known SHA-256 of above (RFC 7636 Appendix B)
  const challenge = await generateCodeChallenge(verifier);
  assertEquals(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

Deno.test("verifyCodeChallenge - returns true for valid pair", async () => {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  assertEquals(await verifyCodeChallenge(verifier, challenge), true);
});

Deno.test("verifyCodeChallenge - returns false for wrong verifier", async () => {
  const challenge = await generateCodeChallenge("correct-verifier");
  assertEquals(await verifyCodeChallenge("wrong-verifier", challenge), false);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read lib/server/src/client-auth/pkce_test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// lib/server/src/client-auth/pkce.ts
/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0.
 *
 * Used by both:
 * - CLI client: generate verifier + challenge
 * - Server: verify challenge against verifier
 *
 * @module lib/server/client-auth/pkce
 */

/** Generate a cryptographically random code verifier (RFC 7636 §4.1) */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** Generate S256 code challenge from verifier (RFC 7636 §4.2) */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(hash));
}

/** Verify a code_verifier against a stored code_challenge */
export async function verifyCodeChallenge(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  const computed = await generateCodeChallenge(verifier);
  return computed === challenge;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

**Step 4: Run tests**

Run: `deno test --allow-read lib/server/src/client-auth/pkce_test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add lib/server/src/client-auth/pkce.ts lib/server/src/client-auth/pkce_test.ts
git commit -m "feat(lib/server): PKCE utilities for OAuth code exchange"
```

---

## Task 2: Auth code storage in Deno KV

**Files:**
- Create: `src/server/auth/oauth-codes.ts`
- Create: `src/server/auth/oauth-codes_test.ts`

**Step 1: Write the failing test**

```typescript
// src/server/auth/oauth-codes_test.ts
import { assertEquals } from "@std/assert";
import { consumeAuthCode, createAuthCode } from "./oauth-codes.ts";

Deno.test("createAuthCode + consumeAuthCode round-trip", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const code = await createAuthCode(kv, {
      userId: "user-123",
      codeChallenge: "test-challenge",
      redirectUri: "http://localhost:9999/callback",
      clientId: "pml-cli",
    });

    assertEquals(typeof code, "string");
    assertEquals(code.length > 0, true);

    const data = await consumeAuthCode(kv, code);
    assertEquals(data?.userId, "user-123");
    assertEquals(data?.codeChallenge, "test-challenge");
    assertEquals(data?.redirectUri, "http://localhost:9999/callback");
    assertEquals(data?.clientId, "pml-cli");

    // Second consume returns null (code is consumed)
    assertEquals(await consumeAuthCode(kv, code), null);
  } finally {
    kv.close();
  }
});

Deno.test("consumeAuthCode - returns null for unknown code", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    assertEquals(await consumeAuthCode(kv, "nonexistent"), null);
  } finally {
    kv.close();
  }
});
```

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write --allow-env src/server/auth/oauth-codes_test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/server/auth/oauth-codes.ts
/**
 * OAuth authorization code storage in Deno KV.
 *
 * Codes are one-time-use with a 5-minute TTL.
 * Used by /oauth/authorize (create) and /oauth/token (consume).
 *
 * @module server/auth/oauth-codes
 */

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes (RFC 6749 §4.1.2)

export interface AuthCodeData {
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}

/** Create a one-time auth code and store in KV */
export async function createAuthCode(
  kv: Deno.Kv,
  data: AuthCodeData,
): Promise<string> {
  const code = crypto.randomUUID();
  await kv.set(["oauth_codes", code], data, { expireIn: AUTH_CODE_TTL_MS });
  return code;
}

/** Consume an auth code (returns data once, then null) */
export async function consumeAuthCode(
  kv: Deno.Kv,
  code: string,
): Promise<AuthCodeData | null> {
  const result = await kv.get<AuthCodeData>(["oauth_codes", code]);
  if (!result.value) return null;
  await kv.delete(["oauth_codes", code]);
  return result.value;
}
```

**Step 4: Run tests**

Run: `deno test --allow-read --allow-write --allow-env src/server/auth/oauth-codes_test.ts`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add src/server/auth/oauth-codes.ts src/server/auth/oauth-codes_test.ts
git commit -m "feat(server): OAuth auth code storage in Deno KV"
```

---

## Task 3: OAuth authorize endpoint (server-side)

**Files:**
- Create: `src/api/auth.ts` — core logic
- Create: `src/web/routes/oauth/authorize.ts` — Fresh thin wrapper

**Step 1: Write the core logic**

```typescript
// src/api/auth.ts
/**
 * OAuth Authorization Server — API logic.
 *
 * Handles the PKCE authorization flow for `pml login`.
 * Fresh routes in src/web/routes/oauth/ are thin wrappers.
 *
 * @module api/auth
 */

import { getSessionId } from "../server/auth/oauth.ts";
import { getSession } from "../server/auth/session.ts";
import { getKv } from "../server/auth/kv.ts";
import { createAuthCode } from "../server/auth/oauth-codes.ts";

const ALLOWED_CLIENT_IDS = new Set(["pml-cli"]);

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  state?: string;
}

function parseAuthorizeParams(url: URL): AuthorizeParams | { error: string } {
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "S256";
  const responseType = url.searchParams.get("response_type");
  const state = url.searchParams.get("state") ?? undefined;

  if (!clientId || !redirectUri || !codeChallenge || !responseType) {
    return { error: "Missing required parameters: client_id, redirect_uri, code_challenge, response_type" };
  }
  if (responseType !== "code") {
    return { error: "Unsupported response_type. Must be 'code'." };
  }
  if (codeChallengeMethod !== "S256") {
    return { error: "Unsupported code_challenge_method. Must be 'S256'." };
  }
  if (!ALLOWED_CLIENT_IDS.has(clientId)) {
    return { error: `Unknown client_id: ${clientId}` };
  }
  if (!redirectUri.startsWith("http://localhost:") && !redirectUri.startsWith("http://127.0.0.1:")) {
    return { error: "redirect_uri must be localhost (public client)" };
  }

  return { clientId, redirectUri, codeChallenge, codeChallengeMethod, responseType, state };
}

/**
 * Handle GET /oauth/authorize
 *
 * Flow:
 * 1. Validate params
 * 2. Check GitHub session
 * 3. If no session → store params in cookie → redirect to GitHub signIn
 * 4. If session → auto-approve → generate code → redirect to callback
 */
export async function handleAuthorize(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = parseAuthorizeParams(url);

  if ("error" in params) {
    return new Response(JSON.stringify({ error: params.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check for existing GitHub session
  const sessionId = await getSessionId(req);
  const kv = await getKv();
  const session = sessionId ? await getSession(kv, sessionId) : null;

  if (!session) {
    // No session — store OAuth params in cookie and redirect to GitHub signIn
    const oauthParams = JSON.stringify({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
      response_type: params.responseType,
      state: params.state,
    });
    const encoded = btoa(oauthParams);

    // Chain to GitHub OAuth via signIn()
    const { signIn } = await import("../server/auth/oauth.ts");
    const signInResponse = await signIn(req);

    // Add our cookie to the signIn response
    const headers = new Headers(signInResponse.headers);
    headers.append(
      "Set-Cookie",
      `pml_oauth_pending=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );

    return new Response(signInResponse.body, {
      status: signInResponse.status,
      headers,
    });
  }

  // Has session — auto-approve for pml-cli (first-party, user initiated login)
  const code = await createAuthCode(kv, {
    userId: session.userId,
    codeChallenge: params.codeChallenge,
    redirectUri: params.redirectUri,
    clientId: params.clientId,
  });

  const redirectUrl = new URL(params.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (params.state) {
    redirectUrl.searchParams.set("state", params.state);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      "Cache-Control": "no-store",
    },
  });
}
```

**Step 2: Write the Fresh thin wrapper**

```typescript
// src/web/routes/oauth/authorize.ts
/**
 * GET /oauth/authorize — Fresh thin wrapper.
 * Core logic in src/api/auth.ts
 */
import { handleAuthorize } from "../../../api/auth.ts";

export const handler = {
  GET(ctx: { req: Request }): Promise<Response> {
    return handleAuthorize(ctx.req);
  },
};
```

**Step 3: Type-check**

Run: `deno check src/api/auth.ts && deno check src/web/routes/oauth/authorize.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add src/api/auth.ts src/web/routes/oauth/authorize.ts
git commit -m "feat(server): OAuth authorize endpoint with GitHub session chaining"
```

---

## Task 4: OAuth token endpoint (server-side)

**Files:**
- Modify: `src/api/auth.ts` — add `handleTokenExchange()`
- Create: `src/web/routes/oauth/token.ts` — Fresh thin wrapper
- Create: `src/api/auth_test.ts` — unit tests for token exchange

**Step 1: Write the failing test**

```typescript
// src/api/auth_test.ts
import { assertEquals } from "@std/assert";
import { consumeAuthCode, createAuthCode } from "../server/auth/oauth-codes.ts";
import { generateCodeChallenge, generateCodeVerifier } from "../../lib/server/src/client-auth/pkce.ts";

// Test the PKCE verification logic directly (handleTokenExchange uses DB, so we test pieces)
Deno.test("auth code + PKCE verification flow", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    const code = await createAuthCode(kv, {
      userId: "user-test",
      codeChallenge: challenge,
      redirectUri: "http://localhost:9999/callback",
      clientId: "pml-cli",
    });

    const data = await consumeAuthCode(kv, code);
    assertEquals(data !== null, true);

    // Verify PKCE
    const { verifyCodeChallenge } = await import("../../lib/server/src/client-auth/pkce.ts");
    const valid = await verifyCodeChallenge(verifier, data!.codeChallenge);
    assertEquals(valid, true);

    // Wrong verifier fails
    const invalid = await verifyCodeChallenge("wrong", data!.codeChallenge);
    assertEquals(invalid, false);
  } finally {
    kv.close();
  }
});
```

**Step 2: Run test**

Run: `deno test --allow-read --allow-write --allow-env src/api/auth_test.ts`
Expected: PASS

**Step 3: Add handleTokenExchange to src/api/auth.ts**

Append to `src/api/auth.ts`:

```typescript
import { consumeAuthCode } from "../server/auth/oauth-codes.ts";
import { verifyCodeChallenge } from "../../lib/server/src/client-auth/pkce.ts";
import { generateApiKey, hashApiKey } from "../lib/api-key.ts";
import { getDb } from "../server/auth/db.ts";
import { users } from "../db/schema/users.ts";
import { eq } from "drizzle-orm";

/**
 * Handle POST /oauth/token
 *
 * Exchanges authorization code for API key.
 * Validates PKCE code_verifier against stored code_challenge.
 */
export async function handleTokenExchange(req: Request): Promise<Response> {
  const body = await req.formData().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "Expected form data" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const grantType = body.get("grant_type")?.toString();
  const code = body.get("code")?.toString();
  const codeVerifier = body.get("code_verifier")?.toString();
  const clientId = body.get("client_id")?.toString();
  const redirectUri = body.get("redirect_uri")?.toString();

  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type", "Must be 'authorization_code'");
  }
  if (!code || !codeVerifier || !clientId || !redirectUri) {
    return tokenError("invalid_request", "Missing required parameters");
  }

  // Consume the auth code (one-time use)
  const kv = await getKv();
  const authData = await consumeAuthCode(kv, code);
  if (!authData) {
    return tokenError("invalid_grant", "Invalid or expired authorization code");
  }

  // Validate client_id and redirect_uri match
  if (authData.clientId !== clientId) {
    return tokenError("invalid_grant", "client_id mismatch");
  }
  if (authData.redirectUri !== redirectUri) {
    return tokenError("invalid_grant", "redirect_uri mismatch");
  }

  // Verify PKCE
  const pkceValid = await verifyCodeChallenge(codeVerifier, authData.codeChallenge);
  if (!pkceValid) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  // Generate new API key for the user (replaces existing key)
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  const db = await getDb();
  await db
    .update(users)
    .set({
      apiKeyHash: keyHash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, authData.userId));

  return new Response(
    JSON.stringify({
      access_token: key,
      token_type: "bearer",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      },
    },
  );
}

function tokenError(error: string, description: string): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
```

**Step 4: Write the Fresh thin wrapper**

```typescript
// src/web/routes/oauth/token.ts
/**
 * POST /oauth/token — Fresh thin wrapper.
 * Core logic in src/api/auth.ts
 */
import { handleTokenExchange } from "../../../api/auth.ts";

export const handler = {
  POST(ctx: { req: Request }): Promise<Response> {
    return handleTokenExchange(ctx.req);
  },
};
```

**Step 5: Type-check**

Run: `deno check src/api/auth.ts && deno check src/web/routes/oauth/token.ts`
Expected: No errors

**Step 6: Commit**

```bash
git add src/api/auth.ts src/api/auth_test.ts src/web/routes/oauth/token.ts
git commit -m "feat(server): OAuth token endpoint with PKCE verification"
```

---

## Task 5: Modify callback to support OAuth return-to

**Files:**
- Modify: `src/web/routes/auth/callback.ts:154-164`

**Step 1: Add return-to detection**

In `src/web/routes/auth/callback.ts`, replace the redirect block (after session creation, lines ~154-164):

```typescript
      // 5. Check for pending PML OAuth flow (pml login chaining)
      const cookieHeader = ctx.req.headers.get("cookie") ?? "";
      const pendingMatch = cookieHeader.match(/pml_oauth_pending=([^;]+)/);

      let redirectUrl: string;
      if (pendingMatch) {
        // Resume OAuth authorize flow after GitHub login
        try {
          const params = JSON.parse(atob(pendingMatch[1]));
          const authorizeUrl = new URL("/oauth/authorize", new URL(ctx.req.url).origin);
          for (const [key, value] of Object.entries(params)) {
            if (typeof value === "string") {
              authorizeUrl.searchParams.set(key, value);
            }
          }
          redirectUrl = authorizeUrl.toString();
        } catch {
          // Cookie parse failed — fall back to dashboard
          redirectUrl = isNewUser ? "/dashboard?welcome=1" : "/dashboard";
        }
      } else {
        redirectUrl = isNewUser ? "/dashboard?welcome=1" : "/dashboard";
      }

      // Merge OAuth response headers with our redirect
      const headers = new Headers(response.headers);
      headers.set("Location", redirectUrl);

      // Clear pending cookie if it was present
      if (pendingMatch) {
        headers.append("Set-Cookie", "pml_oauth_pending=; Path=/; HttpOnly; Max-Age=0");
      }

      return new Response(null, {
        status: 302,
        headers,
      });
```

This replaces lines 154-164 of `callback.ts` (the old redirect block). The rest of the file stays unchanged.

**Step 2: Verify type-check**

Run: `deno check src/web/routes/auth/callback.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/web/routes/auth/callback.ts
git commit -m "feat(server): callback supports pml_oauth_pending cookie for login chaining"
```

---

## Task 6: Login flow client

**Files:**
- Create: `packages/pml/src/auth/login-flow.ts`
- Create: `packages/pml/src/auth/login-flow_test.ts`

**Step 1: Write the login flow**

```typescript
// packages/pml/src/auth/login-flow.ts
/**
 * OAuth PKCE login flow for `pml login`.
 *
 * Reuses:
 * - CallbackServer from lib/server/src/client-auth/
 * - FileTokenStore for credential storage
 * - PKCE utilities from lib/server/src/client-auth/pkce.ts
 *
 * @module auth/login-flow
 */

import { CallbackServer } from "../../../../lib/server/src/client-auth/callback-server.ts";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import {
  generateCodeChallenge,
  generateCodeVerifier,
} from "../../../../lib/server/src/client-auth/pkce.ts";
import * as colors from "@std/fmt/colors";

const CLIENT_ID = "pml-cli";

export interface LoginOptions {
  cloudUrl: string;
  credentialsDir: string;
  openBrowser: (url: string) => Promise<void>;
}

export interface LoginResult {
  success: boolean;
  apiKey?: string;
  error?: string;
}

/**
 * Perform the full login flow:
 * 1. Start callback server on localhost
 * 2. Generate PKCE verifier + challenge
 * 3. Open browser to authorize URL
 * 4. Wait for callback with code
 * 5. Exchange code for API key
 * 6. Store in FileTokenStore
 */
export async function performLogin(options: LoginOptions): Promise<LoginResult> {
  const { cloudUrl, credentialsDir, openBrowser } = options;
  const tokenStore = new FileTokenStore(credentialsDir);

  // 1. Start callback server
  const callbackServer = new CallbackServer({ timeout: 120_000 });
  const { port, codePromise } = await callbackServer.start();
  const redirectUri = `http://localhost:${port}/callback`;

  try {
    // 2. Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // 3. Open browser to authorize
    const authorizeUrl = new URL(`${cloudUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set("client_id", CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("response_type", "code");

    console.log(colors.dim(`\n  Opening browser to sign in...`));
    console.log(colors.dim(`  If it doesn't open, visit:`));
    console.log(`  ${colors.cyan(authorizeUrl.toString())}\n`);

    await openBrowser(authorizeUrl.toString());

    // 4. Wait for callback
    const code = await codePromise;

    // 5. Exchange code for token
    console.log(colors.dim("  Exchanging code for API key..."));

    const tokenResponse = await fetch(`${cloudUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({ error: "unknown" }));
      return { success: false, error: err.error_description ?? err.error ?? "Token exchange failed" };
    }

    const tokens = await tokenResponse.json();
    const apiKey = tokens.access_token;

    if (!apiKey) {
      return { success: false, error: "No access_token in response" };
    }

    // 6. Store in FileTokenStore
    await tokenStore.set(cloudUrl, {
      serverUrl: cloudUrl,
      tokens: { access_token: apiKey, token_type: "bearer" },
      obtainedAt: Date.now(),
    });

    return { success: true, apiKey };
  } finally {
    await callbackServer.close();
  }
}
```

**Step 2: Write a basic unit test**

```typescript
// packages/pml/src/auth/login-flow_test.ts
import { assertEquals } from "@std/assert";
import { generateCodeChallenge, generateCodeVerifier, verifyCodeChallenge } from "../../../../lib/server/src/client-auth/pkce.ts";

// Test the PKCE flow that login-flow.ts depends on
Deno.test("login-flow PKCE dependency - round-trip", async () => {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  assertEquals(await verifyCodeChallenge(verifier, challenge), true);
});
```

**Step 3: Type-check**

Run: `deno check packages/pml/src/auth/login-flow.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pml/src/auth/login-flow.ts packages/pml/src/auth/login-flow_test.ts
git commit -m "feat(pml): login flow client — PKCE + CallbackServer + FileTokenStore"
```

---

## Task 7: `pml login` + `pml logout` CLI commands

**Files:**
- Create: `packages/pml/src/cli/login-command.ts`
- Create: `packages/pml/src/cli/logout-command.ts`
- Modify: `packages/pml/src/cli/mod.ts` — register new commands

**Step 1: Write `pml login` command**

```typescript
// packages/pml/src/cli/login-command.ts
/**
 * `pml login` — Authenticate against PML Cloud via OAuth PKCE.
 *
 * Opens browser, user signs in with GitHub, CLI receives API key.
 * Stores key in ~/.pml/credentials/ via FileTokenStore.
 *
 * @module cli/login-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import { performLogin } from "../auth/login-flow.ts";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";

async function openBrowser(url: string): Promise<void> {
  const cmd = Deno.build.os === "darwin"
    ? "open"
    : Deno.build.os === "windows"
    ? "start"
    : "xdg-open";
  try {
    const process = new Deno.Command(cmd, { args: [url] });
    await process.output();
  } catch {
    // Browser open failed — user will use the printed URL
  }
}

// deno-lint-ignore no-explicit-any
export function createLoginCommand(): Command<any> {
  return new Command()
    .description("Sign in to PML Cloud (opens browser)")
    .option("--cloud-url <url:string>", "PML Cloud URL", {
      default: "https://pml.casys.ai",
    })
    .option("--credentials-dir <dir:string>", "Credentials directory", {
      default: join(Deno.env.get("HOME") ?? "~", ".pml", "credentials"),
    })
    .action(async (options) => {
      const cloudUrl = options.cloudUrl;

      // Check if already logged in
      const tokenStore = new FileTokenStore(options.credentialsDir);
      const existing = await tokenStore.get(cloudUrl);
      if (existing) {
        console.log(colors.green(`\nAlready logged in to ${cloudUrl}`));
        console.log(colors.dim(`  Authenticated since: ${new Date(existing.obtainedAt).toLocaleString()}`));
        console.log(colors.dim(`  To re-authenticate: pml logout && pml login`));
        return;
      }

      console.log(colors.bold(colors.cyan("\nPML Login\n")));

      const result = await performLogin({
        cloudUrl,
        credentialsDir: options.credentialsDir,
        openBrowser,
      });

      if (result.success) {
        console.log(colors.green("\n  Logged in successfully!"));
        console.log(colors.dim(`  API key stored in ${options.credentialsDir}`));
        console.log(colors.dim("  Your CLI is ready to use.\n"));
      } else {
        console.error(colors.red(`\n  Login failed: ${result.error}\n`));
        Deno.exit(1);
      }
    });
}
```

**Step 2: Write `pml logout` command**

```typescript
// packages/pml/src/cli/logout-command.ts
/**
 * `pml logout` — Remove stored PML Cloud credentials.
 *
 * Sugar over `pml connections remove <cloudUrl>`.
 *
 * @module cli/logout-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";

// deno-lint-ignore no-explicit-any
export function createLogoutCommand(): Command<any> {
  return new Command()
    .description("Sign out from PML Cloud (remove stored credentials)")
    .option("--cloud-url <url:string>", "PML Cloud URL", {
      default: "https://pml.casys.ai",
    })
    .option("--credentials-dir <dir:string>", "Credentials directory", {
      default: join(Deno.env.get("HOME") ?? "~", ".pml", "credentials"),
    })
    .action(async (options) => {
      const tokenStore = new FileTokenStore(options.credentialsDir);
      const existing = await tokenStore.get(options.cloudUrl);

      if (!existing) {
        console.log(colors.dim("\nNot currently logged in.\n"));
        return;
      }

      await tokenStore.delete(options.cloudUrl);
      console.log(colors.green(`\nLogged out from ${options.cloudUrl}\n`));
    });
}
```

**Step 3: Wire into CLI**

In `packages/pml/src/cli/mod.ts`, add the imports and register the commands alongside existing ones:

```typescript
import { createLoginCommand } from "./login-command.ts";
import { createLogoutCommand } from "./logout-command.ts";
```

And in the command builder chain:

```typescript
  .command("login", createLoginCommand())
  .command("logout", createLogoutCommand())
```

**Step 4: Type-check**

Run: `deno check packages/pml/src/cli/login-command.ts && deno check packages/pml/src/cli/logout-command.ts && deno check packages/pml/src/cli/mod.ts`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/pml/src/cli/login-command.ts packages/pml/src/cli/logout-command.ts packages/pml/src/cli/mod.ts
git commit -m "feat(pml): add pml login + pml logout commands"
```

---

## Task 8: Cleanup `pml init` — remove interactive prompt

**Files:**
- Modify: `packages/pml/src/init/mod.ts:210-233`

**Step 1: Remove the interactive API key prompt**

Replace lines 210-233 of `packages/pml/src/init/mod.ts` (the interactive prompt + FileTokenStore storage block) with:

```typescript
    // Store API key in FileTokenStore if provided via --api-key flag (CI/CD use case)
    if (options.apiKey) {
      const credentialsDir = join(
        Deno.env.get("HOME") ?? "~", ".pml", "credentials",
      );
      const tokenStore = new FileTokenStore(credentialsDir);
      await tokenStore.set(cloudUrl, {
        serverUrl: cloudUrl,
        tokens: { access_token: options.apiKey, token_type: "bearer" },
        obtainedAt: Date.now(),
      });
      console.log(`  ${colors.green("✓")} API key stored in ~/.pml/credentials/ (chmod 600)`);
    }
```

This removes:
- The `let apiKeyToStore = options.apiKey;` variable
- The `if (!apiKeyToStore && !options.yes)` interactive prompt block
- Uses `options.apiKey` directly

**Step 2: Update "Next steps" message in init-command.ts**

In `packages/pml/src/cli/init-command.ts`, update the next steps to reference `pml login`:

```typescript
        console.log(colors.dim("Next steps:"));
        console.log(
          options.apiKey
            ? `  ${colors.cyan("1.")} API key configured — ready to use`
            : `  ${colors.cyan("1.")} Run: ${colors.bold("pml login")}  (or pml init --api-key <key> for CI/CD)`,
        );
        console.log(`  ${colors.cyan("2.")} Start your AI agent (Claude Code, Cursor, etc.)`);
```

**Step 3: Type-check**

Run: `deno check packages/pml/src/init/mod.ts && deno check packages/pml/src/cli/init-command.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pml/src/init/mod.ts packages/pml/src/cli/init-command.ts
git commit -m "refactor(pml): pml init no longer prompts for API key — use pml login instead"
```

---

## Task 9: Run all tests + type-check + smoke test

**Step 1: Run PKCE tests**

Run: `deno test --allow-read lib/server/src/client-auth/pkce_test.ts`
Expected: 5 PASS

**Step 2: Run auth code tests**

Run: `deno test --allow-read --allow-write --allow-env src/server/auth/oauth-codes_test.ts`
Expected: 2 PASS

**Step 3: Run API auth tests**

Run: `deno test --allow-read --allow-write --allow-env src/api/auth_test.ts`
Expected: 1 PASS

**Step 4: Run existing resolveApiKey tests**

Run: `deno test --allow-env --allow-read --allow-write packages/pml/src/auth/`
Expected: 5 PASS

**Step 5: Run existing client-auth tests**

Run: `deno test --allow-net --allow-read --allow-write --allow-env lib/server/src/client-auth/`
Expected: All PASS (24+5 = 29 tests)

**Step 6: Type-check all modified files**

Run: `deno check src/api/auth.ts && deno check src/web/routes/oauth/authorize.ts && deno check src/web/routes/oauth/token.ts && deno check src/web/routes/auth/callback.ts && deno check packages/pml/src/auth/login-flow.ts && deno check packages/pml/src/cli/mod.ts`
Expected: No errors

**Step 7: Manual smoke test**

```bash
# Verify pml login/logout commands exist
deno run -A packages/pml/src/cli/mod.ts login --help
deno run -A packages/pml/src/cli/mod.ts logout --help

# Verify pml init no longer prompts for API key (--yes mode)
deno run -A packages/pml/src/cli/mod.ts init --yes --force

# Verify connections list still works
deno run -A packages/pml/src/cli/mod.ts connections list
```

Expected: Commands work, `init --yes` no longer asks for API key.

---

## Verification Summary

| Check | Command | Expected |
|-------|---------|----------|
| PKCE utils | `deno test lib/server/src/client-auth/pkce_test.ts` | 5 PASS |
| Auth codes | `deno test src/server/auth/oauth-codes_test.ts` | 2 PASS |
| Auth API | `deno test src/api/auth_test.ts` | 1 PASS |
| resolveApiKey | `deno test packages/pml/src/auth/` | 5 PASS |
| client-auth | `deno test lib/server/src/client-auth/` | 29 PASS |
| Type-check (all) | `deno check` (6 files) | Clean |
| CLI commands | `pml login --help`, `pml logout --help` | Display help |

## Files Changed

| File | Change |
|------|--------|
| `lib/server/src/client-auth/pkce.ts` | **NEW** — PKCE utilities |
| `lib/server/src/client-auth/pkce_test.ts` | **NEW** — 5 tests |
| `src/server/auth/oauth-codes.ts` | **NEW** — auth code KV storage |
| `src/server/auth/oauth-codes_test.ts` | **NEW** — 2 tests |
| `src/api/auth.ts` | **NEW** — authorize + token exchange handlers |
| `src/api/auth_test.ts` | **NEW** — 1 integration test |
| `src/web/routes/oauth/authorize.ts` | **NEW** — Fresh thin wrapper |
| `src/web/routes/oauth/token.ts` | **NEW** — Fresh thin wrapper |
| `src/web/routes/auth/callback.ts` | **MODIFY** — add pml_oauth_pending cookie detection |
| `packages/pml/src/auth/login-flow.ts` | **NEW** — PKCE login flow client |
| `packages/pml/src/auth/login-flow_test.ts` | **NEW** — 1 test |
| `packages/pml/src/cli/login-command.ts` | **NEW** — `pml login` |
| `packages/pml/src/cli/logout-command.ts` | **NEW** — `pml logout` |
| `packages/pml/src/cli/mod.ts` | **MODIFY** — register login/logout |
| `packages/pml/src/init/mod.ts` | **MODIFY** — remove interactive prompt |
| `packages/pml/src/cli/init-command.ts` | **MODIFY** — update next steps message |

## Future Enhancements (P2, NOT in this plan)

- `GET /.well-known/oauth-authorization-server` — metadata endpoint for MCP SDK discovery
- `POST /oauth/register` — dynamic client registration for third-party MCP clients
- Consent screen for non-first-party clients
- Refresh token support
- Device flow fallback for SSH/container environments
