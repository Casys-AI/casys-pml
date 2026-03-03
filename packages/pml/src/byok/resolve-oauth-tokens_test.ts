import { assertEquals } from "@std/assert";
import { resolveOAuthTokensToEnv } from "./resolve-oauth-tokens.ts";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";

Deno.test("resolveOAuthTokensToEnv - injects token into env for missing vars", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-oauth-resolve-" });
  const store = new FileTokenStore(dir);
  const serverUrl = "https://mcp.example.com";

  await store.set(serverUrl, {
    serverUrl,
    tokens: { access_token: "oauth-test-token", token_type: "bearer" },
    obtainedAt: Date.now(),
  });

  const original = Deno.env.get("EXAMPLE_API_KEY");
  Deno.env.delete("EXAMPLE_API_KEY");

  try {
    const resolved = await resolveOAuthTokensToEnv(serverUrl, ["EXAMPLE_API_KEY"], store);
    assertEquals(resolved, ["EXAMPLE_API_KEY"]);
    assertEquals(Deno.env.get("EXAMPLE_API_KEY"), "oauth-test-token");
  } finally {
    Deno.env.delete("EXAMPLE_API_KEY");
    if (original) Deno.env.set("EXAMPLE_API_KEY", original);
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveOAuthTokensToEnv - skips vars already set in env", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-oauth-resolve-" });
  const store = new FileTokenStore(dir);
  const serverUrl = "https://mcp.example.com";

  await store.set(serverUrl, {
    serverUrl,
    tokens: { access_token: "oauth-test-token", token_type: "bearer" },
    obtainedAt: Date.now(),
  });

  Deno.env.set("EXAMPLE_API_KEY", "existing-value");

  try {
    const resolved = await resolveOAuthTokensToEnv(serverUrl, ["EXAMPLE_API_KEY"], store);
    assertEquals(resolved, []);
    assertEquals(Deno.env.get("EXAMPLE_API_KEY"), "existing-value");
  } finally {
    Deno.env.delete("EXAMPLE_API_KEY");
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveOAuthTokensToEnv - returns empty when no stored token", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-oauth-resolve-" });

  Deno.env.delete("EXAMPLE_API_KEY");

  try {
    const resolved = await resolveOAuthTokensToEnv(
      "https://unknown-server.com",
      ["EXAMPLE_API_KEY"],
      new FileTokenStore(dir),
    );
    assertEquals(resolved, []);
    assertEquals(Deno.env.get("EXAMPLE_API_KEY"), undefined);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveOAuthTokensToEnv - handles empty envRequired", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-oauth-resolve-" });

  try {
    const resolved = await resolveOAuthTokensToEnv(
      "https://mcp.example.com",
      [],
      new FileTokenStore(dir),
    );
    assertEquals(resolved, []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("resolveOAuthTokensToEnv - empty string env var treated as missing", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-oauth-resolve-" });
  const store = new FileTokenStore(dir);
  const serverUrl = "https://mcp.example.com";

  await store.set(serverUrl, {
    serverUrl,
    tokens: { access_token: "oauth-test-token", token_type: "bearer" },
    obtainedAt: Date.now(),
  });

  Deno.env.set("EXAMPLE_API_KEY", "  ");

  try {
    const resolved = await resolveOAuthTokensToEnv(serverUrl, ["EXAMPLE_API_KEY"], store);
    assertEquals(resolved, ["EXAMPLE_API_KEY"]);
    assertEquals(Deno.env.get("EXAMPLE_API_KEY"), "oauth-test-token");
  } finally {
    Deno.env.delete("EXAMPLE_API_KEY");
    await Deno.remove(dir, { recursive: true });
  }
});
