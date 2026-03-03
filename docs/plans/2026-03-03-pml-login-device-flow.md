# PML Login — OAuth Device Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow `pml login` to authenticate against pml.casys.ai via OAuth Device Flow (RFC 8628), so new users get an API key without manual copy-paste. Like `gh auth login`.

**Architecture:** CLI sends a device code request to `pml.casys.ai/api/v1/auth/device`, opens browser to verification URL, polls for token, stores result in FileTokenStore via `resolveApiKey` infrastructure (already wired in `pml-context.ts`).

**Tech Stack:** Deno, existing `FileTokenStore` from `lib/server/src/client-auth/`, `@std/fmt/colors` for TUI

**Depends on:** `resolveApiKey` + FileTokenStore wiring (completed 2026-03-03)

---

## Context for Implementer

### What already exists

- **`FileTokenStore`** (`lib/server/src/client-auth/token-store/file-store.ts`): Stores credentials as JSON in `~/.pml/credentials/` with chmod 600. One file per server URL (SHA-256 hashed filename).
- **`resolveApiKey()`** (`packages/pml/src/auth/resolve-api-key.ts`): Priority chain: env var > FileTokenStore > undefined. Already wired into boot in `pml-context.ts`.
- **`pml connect`** (`packages/pml/src/cli/connect-command.ts`): Existing OAuth PKCE flow for third-party MCP servers. Uses `CallbackServer` for localhost redirect. **Not the same flow** — device flow has no redirect, just polling.
- **`pml connections list|remove`** (`packages/pml/src/cli/connections-command.ts`): Already works with FileTokenStore. `pml login` tokens will be visible here.
- **`pml init --api-key`**: Stores key in FileTokenStore. The login flow replaces manual `--api-key` for new users.
- **`StoredCredentials`** interface (`lib/server/src/client-auth/types.ts`): `{ serverUrl, tokens: OAuthTokens, obtainedAt, authServerUrl? }`. We store API key as `tokens.access_token`.

### `pml init` vs `pml login` — separation of concerns

- **`pml init`** = scaffolds `.mcp.json` + `.pml.json` config files. Does NOT handle auth.
  - `--api-key` flag remains for CI/CD (non-interactive, stores in FileTokenStore)
  - The interactive API key prompt added in the FileTokenStore PR gets **removed** — replaced by `pml login`
- **`pml login`** = authenticates the user via device flow, stores API key in FileTokenStore
- **`pml logout`** = removes stored API key (sugar over `pml connections remove`)

Typical new user flow: `pml init` → `pml login` → ready.

### What needs to be built

1. **Server-side** (`src/api/`): Device flow logic + Fresh thin wrappers
2. **Client-side** (`packages/pml/src/auth/`): Device flow polling client
3. **CLI commands** (`packages/pml/src/cli/`): `pml login` + `pml logout`
4. **Cleanup**: Remove interactive API key prompt from `pml init`

### OAuth Device Flow (RFC 8628) — How it works

```
CLI                          Cloud (pml.casys.ai)              Browser
 │                                │                              │
 │ POST /api/v1/auth/device       │                              │
 │ { client_id }                  │                              │
 │──────────────────────────────►│                              │
 │                                │                              │
 │ { device_code, user_code,      │                              │
 │   verification_uri,            │                              │
 │   verification_uri_complete,   │                              │
 │   expires_in, interval }       │                              │
 │◄──────────────────────────────│                              │
 │                                │                              │
 │ Opens browser ─────────────────────────────────────────────►│
 │ Shows: "Enter code ABCD-1234"  │                              │ User logs in
 │                                │                              │ Enters code
 │ Poll POST /api/v1/auth/token   │                              │ Authorizes
 │ { device_code, grant_type=     │                              │
 │   device_code }                │                              │
 │──────────────────────────────►│                              │
 │                                │ (authorization_pending)      │
 │ Poll again...                  │                              │
 │──────────────────────────────►│                              │
 │                                │ { access_token, token_type } │
 │◄──────────────────────────────│                              │
 │                                │                              │
 │ Store in FileTokenStore        │                              │
```

---

## Task 1: Server-side — Device flow API logic + Fresh thin wrappers

**Files:**
- Create: `src/api/auth.ts` — core logic (handlers)
- Create: `src/web/routes/api/auth/device.ts` — Fresh thin wrapper
- Create: `src/web/routes/api/auth/token.ts` — Fresh thin wrapper
- Create: `src/web/routes/auth/device.tsx` — user-facing auth page
- Create: `src/db/migrations/054_device_codes.ts` — migration

**Context:** API logic lives in `src/api/` (same pattern as `algorithm.ts`, `capabilities.ts`, etc.). Fresh routes in `src/web/routes/api/` are thin wrappers that call the logic. The database has a `users` table with API keys. We need a `device_codes` table for pending authorizations.

**Step 1: Create the migration for device_codes table**

Create: `src/db/migrations/054_device_codes.ts`

```typescript
import type { Migration } from "../types.ts";

export const migration: Migration = {
  version: 54,
  name: "device_codes",
  up: `
    CREATE TABLE IF NOT EXISTS device_codes (
      device_code TEXT PRIMARY KEY,
      user_code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      interval_seconds INTEGER NOT NULL DEFAULT 5,
      authorized_user_id TEXT,
      authorized_at TIMESTAMPTZ,
      api_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_device_codes_user_code ON device_codes(user_code);
    CREATE INDEX idx_device_codes_expires_at ON device_codes(expires_at);
  `,
  down: `DROP TABLE IF EXISTS device_codes;`,
};
```

**Step 2: Run migration**

Run: `deno task db:migrate`
Expected: Migration 054 applied

**Step 3: Write the core API logic**

Create: `src/api/auth.ts`

```typescript
/**
 * Device Authorization Flow — API Logic (RFC 8628)
 *
 * Core handlers for device code issuance and token polling.
 * Called by Fresh thin wrappers in src/web/routes/api/auth/.
 *
 * @module api/auth
 */

import { db } from "../db/mod.ts";

const DEVICE_CODE_TTL_SECONDS = 900; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

function generateCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

/**
 * POST /api/v1/auth/device — Issue a device code + user code.
 */
export async function handleDeviceCodeRequest(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const clientId = body.client_id ?? "pml-cli";

  const deviceCode = crypto.randomUUID();
  const userCode = `${generateCode(4)}-${generateCode(4)}`;
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

  await db.queryObject`
    INSERT INTO device_codes (device_code, user_code, client_id, expires_at, interval_seconds)
    VALUES (${deviceCode}, ${userCode}, ${clientId}, ${expiresAt}, ${POLL_INTERVAL_SECONDS})
  `;

  const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? "https://pml.casys.ai";

  return Response.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${cloudUrl}/auth/device`,
    verification_uri_complete: `${cloudUrl}/auth/device?code=${userCode}`,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  });
}

/**
 * POST /api/v1/auth/token — Poll for device authorization result.
 */
export async function handleDeviceTokenPoll(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { device_code, grant_type } = body;

  if (grant_type !== "urn:ietf:params:oauth:grant-type:device_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  if (!device_code) {
    return Response.json(
      { error: "invalid_request", error_description: "device_code required" },
      { status: 400 },
    );
  }

  const result = await db.queryObject<{
    expires_at: Date;
    authorized_user_id: string | null;
    api_key: string | null;
  }>`
    SELECT expires_at, authorized_user_id, api_key
    FROM device_codes WHERE device_code = ${device_code}
  `;

  if (result.rows.length === 0) {
    return Response.json(
      { error: "invalid_request", error_description: "unknown device_code" },
      { status: 400 },
    );
  }

  const row = result.rows[0];

  if (new Date(row.expires_at) < new Date()) {
    await db.queryObject`DELETE FROM device_codes WHERE device_code = ${device_code}`;
    return Response.json({ error: "expired_token" }, { status: 400 });
  }

  if (!row.authorized_user_id || !row.api_key) {
    return Response.json({ error: "authorization_pending" }, { status: 400 });
  }

  // Authorized — return API key and clean up
  await db.queryObject`DELETE FROM device_codes WHERE device_code = ${device_code}`;
  return Response.json({ access_token: row.api_key, token_type: "bearer" });
}
```

**Step 4: Write Fresh thin wrappers**

Create: `src/web/routes/api/auth/device.ts`

```typescript
import { handleDeviceCodeRequest } from "../../../../api/auth.ts";
import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  POST: (req) => handleDeviceCodeRequest(req),
};
```

Create: `src/web/routes/api/auth/token.ts`

```typescript
import { handleDeviceTokenPoll } from "../../../../api/auth.ts";
import type { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  POST: (req) => handleDeviceTokenPoll(req),
};
```

**Step 5: Write the user-facing device auth page**

Create: `src/web/routes/auth/device.tsx`

This is the page the user visits in their browser to enter the user_code and authorize the device. **This is a full Fresh page, not an API endpoint.** The page should:

1. Show a form to enter the user_code (or pre-fill from `?code=` query param)
2. Require the user to be logged in (redirect to login if not)
3. On submit: validate user_code against `device_codes` table, set `authorized_user_id` and generate/store `api_key`
4. Show success message: "Device authorized. You can return to the terminal."

> **Decision for implementer:** The exact UI depends on the existing auth system. If `pml.casys.ai` has user accounts with API keys already, the page just needs to look up the user's API key and write it to the device_codes row. If not, this task includes creating user accounts — scope it separately.

**Step 6: Commit**

```bash
git add src/db/migrations/054_device_codes.ts src/api/auth.ts src/web/routes/api/auth/ src/web/routes/auth/device.tsx
git commit -m "feat(cloud): add device code endpoints for pml login (RFC 8628)"
```

---

## Task 2: Client-side — Device flow polling client

**Files:**
- Create: `packages/pml/src/auth/device-flow.ts`
- Create: `packages/pml/src/auth/device-flow_test.ts`

**Step 1: Write the failing test**

```typescript
import { assertEquals, assertRejects } from "@std/assert";
import { pollForToken, requestDeviceCode } from "./device-flow.ts";

// Mock server for testing
function mockServer(responses: Response[]): { url: string; close: () => void } {
  let idx = 0;
  const server = Deno.serve({ port: 0, onListen: () => {} }, () => {
    return responses[idx++] ?? new Response("exhausted", { status: 500 });
  });
  const addr = server.addr as Deno.NetAddr;
  return {
    url: `http://localhost:${addr.port}`,
    close: () => server.shutdown(),
  };
}

Deno.test("requestDeviceCode - returns device code response", async () => {
  const mock = mockServer([
    Response.json({
      device_code: "test-device-code",
      user_code: "ABCD-1234",
      verification_uri: "https://pml.casys.ai/auth/device",
      verification_uri_complete: "https://pml.casys.ai/auth/device?code=ABCD-1234",
      expires_in: 900,
      interval: 5,
    }),
  ]);

  try {
    const result = await requestDeviceCode(mock.url);
    assertEquals(result.device_code, "test-device-code");
    assertEquals(result.user_code, "ABCD-1234");
    assertEquals(result.interval, 5);
  } finally {
    mock.close();
  }
});

Deno.test("pollForToken - returns token after pending responses", async () => {
  const mock = mockServer([
    // First two polls: pending
    Response.json({ error: "authorization_pending" }, { status: 400 }),
    Response.json({ error: "authorization_pending" }, { status: 400 }),
    // Third poll: success
    Response.json({ access_token: "my-api-key", token_type: "bearer" }),
  ]);

  try {
    const result = await pollForToken(mock.url, {
      device_code: "dc-123",
      interval: 0.1, // 100ms for fast test
      expires_in: 30,
    });
    assertEquals(result, "my-api-key");
  } finally {
    mock.close();
  }
});

Deno.test("pollForToken - throws on expired_token", async () => {
  const mock = mockServer([
    Response.json({ error: "expired_token" }, { status: 400 }),
  ]);

  try {
    await assertRejects(
      () => pollForToken(mock.url, {
        device_code: "dc-expired",
        interval: 0.1,
        expires_in: 30,
      }),
      Error,
      "expired",
    );
  } finally {
    mock.close();
  }
});
```

**Step 2: Run test to verify it fails**

Run: `deno test --allow-net --allow-env packages/pml/src/auth/device-flow_test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
/**
 * OAuth Device Flow client (RFC 8628).
 *
 * Handles the CLI side of the device authorization flow:
 * 1. Request a device code from the cloud
 * 2. Poll for token until user authorizes in browser
 *
 * @module auth/device-flow
 */

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface PollOptions {
  device_code: string;
  interval: number; // seconds
  expires_in: number; // seconds
  onPoll?: () => void; // callback for progress indicator
}

/**
 * Request a device code from the authorization server.
 */
export async function requestDeviceCode(
  cloudUrl: string,
  clientId = "pml-cli",
): Promise<DeviceCodeResponse> {
  const resp = await fetch(`${cloudUrl}/api/v1/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Device code request failed (${resp.status}): ${text}`);
  }

  return await resp.json() as DeviceCodeResponse;
}

/**
 * Poll for token until user authorizes or timeout.
 *
 * @returns The access token (API key)
 * @throws On expiry, server error, or unexpected response
 */
export async function pollForToken(
  cloudUrl: string,
  options: PollOptions,
): Promise<string> {
  const deadline = Date.now() + options.expires_in * 1000;
  const intervalMs = Math.max(options.interval * 1000, 100); // minimum 100ms

  while (Date.now() < deadline) {
    options.onPoll?.();

    const resp = await fetch(`${cloudUrl}/api/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_code: options.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return data.access_token;
    }

    const error = await resp.json().catch(() => ({ error: "unknown" }));

    switch (error.error) {
      case "authorization_pending":
        // Expected — user hasn't authorized yet, keep polling
        break;
      case "slow_down":
        // Back off by adding 5 seconds to interval
        await delay(intervalMs + 5000);
        continue;
      case "expired_token":
        throw new Error("Device code expired. Please run `pml login` again.");
      case "access_denied":
        throw new Error("Authorization denied by user.");
      default:
        throw new Error(`Unexpected error: ${error.error} — ${error.error_description ?? ""}`);
    }

    await delay(intervalMs);
  }

  throw new Error("Device code expired (timeout). Please run `pml login` again.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 4: Run tests**

Run: `deno test --allow-net --allow-env packages/pml/src/auth/device-flow_test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/pml/src/auth/device-flow.ts packages/pml/src/auth/device-flow_test.ts
git commit -m "feat(pml): add device flow polling client (RFC 8628)"
```

---

## Task 3: CLI — `pml login` command

**Files:**
- Create: `packages/pml/src/cli/login-command.ts`
- Modify: `packages/pml/src/cli/mod.ts` (register command)

**Step 1: Write the login command**

```typescript
/**
 * `pml login` — Authenticate against pml.casys.ai via device flow.
 *
 * Opens browser for user to log in and authorize the CLI.
 * Stores the resulting API key in ~/.pml/credentials/.
 *
 * @module cli/login-command
 */

import { Command } from "@cliffy/command";
import { join } from "@std/path";
import * as colors from "@std/fmt/colors";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import { requestDeviceCode, pollForToken } from "../auth/device-flow.ts";

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
    .description("Log in to PML Cloud and store API key")
    .option("--cloud-url <url:string>", "PML Cloud URL", {
      default: "https://pml.casys.ai",
    })
    .option("--no-browser", "Don't open browser automatically")
    .action(async (options) => {
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? options.cloudUrl;
      const credentialsDir = join(
        Deno.env.get("HOME") ?? "~", ".pml", "credentials",
      );
      const store = new FileTokenStore(credentialsDir);

      // Check if already logged in
      const existing = await store.get(cloudUrl);
      if (existing?.tokens?.access_token) {
        console.log(colors.green("Already logged in to PML Cloud."));
        console.log(colors.dim(`  Token obtained: ${new Date(existing.obtainedAt).toISOString()}`));
        console.log(colors.dim(`  Run: pml connections remove ${cloudUrl}  to log out`));
        return;
      }

      // 1. Request device code
      console.log(colors.dim("Requesting device code..."));
      let deviceResp;
      try {
        deviceResp = await requestDeviceCode(cloudUrl);
      } catch (e) {
        console.error(colors.red(`Failed to reach ${cloudUrl}`));
        console.error(colors.dim(e instanceof Error ? e.message : String(e)));
        console.error();
        console.error("Alternative: run " + colors.cyan("pml init --api-key <your-key>"));
        Deno.exit(1);
      }

      // 2. Show user code and open browser
      console.log();
      console.log(colors.bold("  Enter this code in your browser:"));
      console.log();
      console.log(`    ${colors.yellow(colors.bold(deviceResp.user_code))}`);
      console.log();

      const verifyUrl = deviceResp.verification_uri_complete ?? deviceResp.verification_uri;
      console.log(colors.dim(`  ${verifyUrl}`));
      console.log();

      if (!options.noBrowser) {
        await openBrowser(verifyUrl);
        console.log(colors.dim("  Browser opened. Waiting for authorization..."));
      } else {
        console.log(colors.dim("  Open the URL above in your browser."));
      }

      // 3. Poll for token
      let dots = 0;
      try {
        const apiKey = await pollForToken(cloudUrl, {
          device_code: deviceResp.device_code,
          interval: deviceResp.interval,
          expires_in: deviceResp.expires_in,
          onPoll: () => {
            dots = (dots + 1) % 4;
            const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            Deno.stdout.writeSync(
              new TextEncoder().encode(`\r  ${spinner[dots % spinner.length]} Waiting for authorization...`),
            );
          },
        });

        // Clear spinner line
        Deno.stdout.writeSync(new TextEncoder().encode("\r" + " ".repeat(50) + "\r"));

        // 4. Store API key
        await store.set(cloudUrl, {
          serverUrl: cloudUrl,
          tokens: { access_token: apiKey, token_type: "bearer" },
          obtainedAt: Date.now(),
        });

        console.log(colors.green("  Logged in to PML Cloud!"));
        console.log(colors.dim(`  API key stored in ~/.pml/credentials/ (chmod 600)`));
        console.log();
      } catch (e) {
        // Clear spinner line
        Deno.stdout.writeSync(new TextEncoder().encode("\r" + " ".repeat(50) + "\r"));
        console.error(colors.red(`  ${e instanceof Error ? e.message : String(e)}`));
        Deno.exit(1);
      }
    });
}
```

**Step 2: Register in CLI mod.ts**

In `packages/pml/src/cli/mod.ts`, add:

```typescript
import { createLoginCommand } from "./login-command.ts";
```

And register the command (after `connect`):

```typescript
  .command("login", createLoginCommand())
```

**Step 3: Verify type-check**

Run: `deno check packages/pml/src/cli/login-command.ts`
Expected: No errors

**Step 4: Test help renders**

Run: `deno run -A packages/pml/src/cli/mod.ts login --help`
Expected: Shows login command with `--cloud-url` and `--no-browser` options

**Step 5: Commit**

```bash
git add packages/pml/src/cli/login-command.ts packages/pml/src/cli/mod.ts
git commit -m "feat(pml): add 'pml login' command with device flow"
```

---

## Task 4: Wire `pml init` to suggest `pml login`

**Files:**
- Modify: `packages/pml/src/cli/init-command.ts:70-75`
- Modify: `packages/pml/src/server/pml-context.ts:128` (error message)

**Step 1: Update init "Next steps" for login**

In `packages/pml/src/cli/init-command.ts`, update the no-api-key branch:

```typescript
options.apiKey
  ? `  ${colors.cyan("1.")} API key configured — ready to use`
  : `  ${colors.cyan("1.")} Run: ${colors.bold("pml login")}  (or pml init --api-key <key>)`,
```

**Step 2: Update boot error message**

In `packages/pml/src/server/pml-context.ts`, update the error block:

```typescript
  if (!apiKey) {
    console.error("[pml] ERROR: PML_API_KEY not found");
    console.error("[pml] Run: pml login");
    console.error("[pml] Or set: export PML_API_KEY=your_key");
    console.error("[pml] Or run: pml init --api-key <your_key>");
    Deno.exit(1);
  }
```

**Step 3: Type-check**

Run: `deno check packages/pml/src/cli/init-command.ts && deno check packages/pml/src/server/pml-context.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pml/src/cli/init-command.ts packages/pml/src/server/pml-context.ts
git commit -m "feat(pml): point users to 'pml login' in error messages"
```

---

## Task 5: `pml logout` command

**Files:**
- Create: `packages/pml/src/cli/logout-command.ts`
- Modify: `packages/pml/src/cli/mod.ts`

**Step 1: Write logout command**

```typescript
/**
 * `pml logout` — Remove stored PML Cloud credentials.
 *
 * @module cli/logout-command
 */

import { Command } from "@cliffy/command";
import { join } from "@std/path";
import * as colors from "@std/fmt/colors";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";

// deno-lint-ignore no-explicit-any
export function createLogoutCommand(): Command<any> {
  return new Command()
    .description("Log out from PML Cloud (remove stored API key)")
    .option("--cloud-url <url:string>", "PML Cloud URL", {
      default: "https://pml.casys.ai",
    })
    .action(async (options) => {
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? options.cloudUrl;
      const credentialsDir = join(
        Deno.env.get("HOME") ?? "~", ".pml", "credentials",
      );
      const store = new FileTokenStore(credentialsDir);

      const existing = await store.get(cloudUrl);
      if (!existing) {
        console.log("Not logged in.");
        return;
      }

      await store.delete(cloudUrl);
      console.log(colors.green("Logged out from PML Cloud."));
      console.log(colors.dim("API key removed from ~/.pml/credentials/"));
    });
}
```

**Step 2: Register in mod.ts**

```typescript
import { createLogoutCommand } from "./logout-command.ts";
// ...
  .command("logout", createLogoutCommand())
```

**Step 3: Type-check**

Run: `deno check packages/pml/src/cli/logout-command.ts`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pml/src/cli/logout-command.ts packages/pml/src/cli/mod.ts
git commit -m "feat(pml): add 'pml logout' command"
```

---

## Task 6: Integration test — full login flow with mock server

**Files:**
- Create: `packages/pml/src/auth/device-flow-integration_test.ts`

**Step 1: Write the integration test**

```typescript
import { assertEquals } from "@std/assert";
import { requestDeviceCode, pollForToken } from "./device-flow.ts";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import { resolveApiKey } from "./resolve-api-key.ts";

/**
 * Simulates the full device flow with a mock cloud server.
 *
 * The mock server:
 * 1. Returns a device code on POST /api/v1/auth/device
 * 2. Returns authorization_pending twice, then success on POST /api/v1/auth/token
 */
Deno.test("device flow integration - full login round-trip", async () => {
  let tokenPollCount = 0;
  const server = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/api/v1/auth/device" && req.method === "POST") {
      return Response.json({
        device_code: "test-dc-123",
        user_code: "ABCD-1234",
        verification_uri: "http://localhost/auth/device",
        expires_in: 30,
        interval: 0.1,
      });
    }

    if (url.pathname === "/api/v1/auth/token" && req.method === "POST") {
      tokenPollCount++;
      if (tokenPollCount < 3) {
        return Response.json({ error: "authorization_pending" }, { status: 400 });
      }
      return Response.json({
        access_token: "integration-test-api-key",
        token_type: "bearer",
      });
    }

    return new Response("Not found", { status: 404 });
  });

  const addr = server.addr as Deno.NetAddr;
  const mockUrl = `http://localhost:${addr.port}`;

  try {
    // 1. Request device code
    const deviceResp = await requestDeviceCode(mockUrl);
    assertEquals(deviceResp.user_code, "ABCD-1234");

    // 2. Poll for token (should succeed after 3 polls)
    const apiKey = await pollForToken(mockUrl, {
      device_code: deviceResp.device_code,
      interval: 0.1,
      expires_in: 30,
    });
    assertEquals(apiKey, "integration-test-api-key");

    // 3. Store in FileTokenStore
    const dir = await Deno.makeTempDir({ prefix: "pml-login-test-" });
    const store = new FileTokenStore(dir);
    await store.set(mockUrl, {
      serverUrl: mockUrl,
      tokens: { access_token: apiKey, token_type: "bearer" },
      obtainedAt: Date.now(),
    });

    // 4. resolveApiKey finds it
    const original = Deno.env.get("PML_API_KEY");
    Deno.env.delete("PML_API_KEY");
    try {
      const resolved = await resolveApiKey(mockUrl, store);
      assertEquals(resolved, "integration-test-api-key");
    } finally {
      if (original) Deno.env.set("PML_API_KEY", original);
      else Deno.env.delete("PML_API_KEY");
    }

    await Deno.remove(dir, { recursive: true });
  } finally {
    await server.shutdown();
  }
});
```

**Step 2: Run test**

Run: `deno test --allow-net --allow-env --allow-read --allow-write packages/pml/src/auth/device-flow-integration_test.ts`
Expected: 1 test PASS

**Step 3: Commit**

```bash
git add packages/pml/src/auth/device-flow-integration_test.ts
git commit -m "test(pml): add device flow integration test with mock server"
```

---

## Task 7: Run all tests + verify

**Step 1: Run all auth tests**

Run: `deno test --allow-net --allow-env --allow-read --allow-write packages/pml/src/auth/`
Expected: All tests PASS (4 unit + 1 integration resolve + 3 device flow + 1 device flow integration)

**Step 2: Run client-auth tests**

Run: `deno test --allow-net --allow-read --allow-write --allow-env lib/server/src/client-auth/`
Expected: 24 tests PASS (no regression)

**Step 3: Type-check all modified files**

Run: `deno check packages/pml/src/cli/mod.ts`
Expected: No errors (this checks the full CLI entrypoint and all imports)

**Step 4: Manual E2E (requires running cloud server)**

```bash
# Start PML cloud locally (if available)
# Then:
deno run -A packages/pml/src/cli/mod.ts login --cloud-url http://localhost:3003

# Should:
# 1. Show device code
# 2. Open browser
# 3. Wait for authorization
# 4. Store API key on success
```

---

## Verification Summary

| Check | Command | Expected |
|-------|---------|----------|
| Device flow unit tests | `deno test --allow-net packages/pml/src/auth/device-flow_test.ts` | 3 PASS |
| Device flow integration | `deno test --allow-net --allow-env --allow-read --allow-write packages/pml/src/auth/device-flow-integration_test.ts` | 1 PASS |
| resolveApiKey tests | `deno test --allow-env packages/pml/src/auth/resolve-api-key_test.ts` | 4 PASS |
| Client-auth tests | `deno test --allow-net --allow-read --allow-write --allow-env lib/server/src/client-auth/` | 24 PASS |
| Type-check CLI | `deno check packages/pml/src/cli/mod.ts` | Clean |
| `pml login --help` | `deno run -A packages/pml/src/cli/mod.ts login --help` | Shows usage |
| `pml logout --help` | `deno run -A packages/pml/src/cli/mod.ts logout --help` | Shows usage |

## Files Changed

| File | Change |
|------|--------|
| `src/db/migrations/054_device_codes.ts` | NEW — device_codes table |
| `src/web/routes/api/auth/device.ts` | NEW — device code endpoint |
| `src/web/routes/api/auth/token.ts` | NEW — token polling endpoint |
| `src/web/routes/auth/device.tsx` | NEW — user-facing auth page |
| `packages/pml/src/auth/device-flow.ts` | NEW — device flow client |
| `packages/pml/src/auth/device-flow_test.ts` | NEW — 3 unit tests |
| `packages/pml/src/auth/device-flow-integration_test.ts` | NEW — mock server E2E |
| `packages/pml/src/cli/login-command.ts` | NEW — `pml login` |
| `packages/pml/src/cli/logout-command.ts` | NEW — `pml logout` |
| `packages/pml/src/cli/mod.ts` | MOD — register login/logout |
| `packages/pml/src/cli/init-command.ts` | MOD — point to `pml login` |
| `packages/pml/src/server/pml-context.ts` | MOD — updated error message |

## Open Questions for Implementer

1. **User accounts on pml.casys.ai** — Est-ce qu'il y a déjà un système de comptes utilisateur avec login/signup ? Si non, Task 1 Step 5 (la page device auth) nécessite de le construire d'abord.
2. **Rate limiting** — Le endpoint `/api/v1/auth/token` devrait avoir un rate limit par device_code (RFC 8628 §5.2). À ajouter en Task 1 ou en follow-up.
3. **Token rotation** — Est-ce que l'API key retournée est permanente ou expire ? Si elle expire, il faudra un refresh flow dans `resolveApiKey`.
