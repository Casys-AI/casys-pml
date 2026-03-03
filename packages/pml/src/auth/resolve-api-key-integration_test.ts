import { assertEquals } from "@std/assert";
import { resolveApiKey } from "./resolve-api-key.ts";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";

Deno.test("resolveApiKey integration - FileTokenStore round-trip", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pml-resolve-test-" });
  const store = new FileTokenStore(dir);
  const cloudUrl = "https://pml.casys.ai";

  const original = Deno.env.get("PML_API_KEY");
  Deno.env.delete("PML_API_KEY");

  try {
    // 1. No key anywhere -> undefined
    assertEquals(await resolveApiKey(cloudUrl, store), undefined);

    // 2. Store a key -> resolves from store
    await store.set(cloudUrl, {
      serverUrl: cloudUrl,
      tokens: { access_token: "my-api-key", token_type: "bearer" },
      obtainedAt: Date.now(),
    });
    assertEquals(await resolveApiKey(cloudUrl, store), "my-api-key");

    // 3. Env var overrides store
    Deno.env.set("PML_API_KEY", "override-key");
    assertEquals(await resolveApiKey(cloudUrl, store), "override-key");
  } finally {
    if (original) Deno.env.set("PML_API_KEY", original);
    else Deno.env.delete("PML_API_KEY");
    await Deno.remove(dir, { recursive: true });
  }
});
