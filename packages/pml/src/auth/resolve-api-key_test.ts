import { assertEquals } from "@std/assert";
import { resolveApiKey } from "./resolve-api-key.ts";
import { MemoryTokenStore } from "../../../../lib/server/src/client-auth/token-store/memory-store.ts";

function makeStore(key?: string): MemoryTokenStore {
  const store = new MemoryTokenStore();
  if (key) {
    store.set("https://pml.casys.ai", {
      serverUrl: "https://pml.casys.ai",
      tokens: { access_token: key, token_type: "bearer" },
      obtainedAt: Date.now(),
    });
  }
  return store;
}

Deno.test("resolveApiKey - env var wins over store", async () => {
  const store = makeStore("stored-key");
  Deno.env.set("PML_API_KEY", "env-key");
  try {
    const key = await resolveApiKey("https://pml.casys.ai", store);
    assertEquals(key, "env-key");
  } finally {
    Deno.env.delete("PML_API_KEY");
  }
});

Deno.test("resolveApiKey - empty env var falls through to store", async () => {
  const store = makeStore("stored-key");
  Deno.env.set("PML_API_KEY", "");
  try {
    const key = await resolveApiKey("https://pml.casys.ai", store);
    assertEquals(key, "stored-key");
  } finally {
    Deno.env.delete("PML_API_KEY");
  }
});

Deno.test("resolveApiKey - store fallback when no env var", async () => {
  const store = makeStore("stored-key");
  Deno.env.delete("PML_API_KEY");
  const key = await resolveApiKey("https://pml.casys.ai", store);
  assertEquals(key, "stored-key");
});

Deno.test("resolveApiKey - returns undefined when nothing available", async () => {
  const store = makeStore();
  Deno.env.delete("PML_API_KEY");
  const key = await resolveApiKey("https://pml.casys.ai", store);
  assertEquals(key, undefined);
});
