/**
 * Registry Client Tests
 *
 * @module tests/registry_client_test
 */

import { assertEquals } from "@std/assert";
import { RegistryClient, toolNameToFqdn } from "../src/loader/registry-client.ts";
import { LoaderError } from "../src/loader/types.ts";

Deno.test("toolNameToFqdn - converts colon format to FQDN", () => {
  assertEquals(
    toolNameToFqdn("filesystem:read_file"),
    "casys.pml.filesystem.read_file",
  );
});

Deno.test("toolNameToFqdn - preserves existing FQDN", () => {
  assertEquals(
    toolNameToFqdn("casys.pml.filesystem.read_file"),
    "casys.pml.filesystem.read_file",
  );
});

Deno.test("toolNameToFqdn - handles simple namespace", () => {
  assertEquals(toolNameToFqdn("memory:create"), "casys.pml.memory.create");
});

Deno.test("RegistryClient - creates with default timeout", () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  assertEquals(client["cloudUrl"], "https://pml.casys.ai");
  assertEquals(client["timeout"], 10_000);
});

Deno.test("RegistryClient - removes trailing slash from URL", () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai/" });
  assertEquals(client["cloudUrl"], "https://pml.casys.ai");
});

Deno.test("RegistryClient - uses custom timeout", () => {
  const client = new RegistryClient({
    cloudUrl: "https://pml.casys.ai",
    timeout: 5000,
  });
  assertEquals(client["timeout"], 5000);
});

Deno.test("RegistryClient - getCached returns undefined for uncached", () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();
  assertEquals(client.getCached("test:tool"), undefined);
});

Deno.test("RegistryClient - getCachedFqdns returns empty array initially", () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();
  assertEquals(client.getCachedFqdns(), []);
});

// Mock fetch tests
Deno.test("RegistryClient - fetch handles 404", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  // Mock fetch to return 404
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(null, { status: 404 });
  };

  try {
    await client.fetch("nonexistent:tool");
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals(error instanceof LoaderError, true);
    assertEquals((error as LoaderError).code, "METADATA_FETCH_FAILED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RegistryClient - fetch validates metadata schema", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  // Mock fetch to return invalid metadata
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ invalid: "data" }), { status: 200 });
  };

  try {
    await client.fetch("test:tool");
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals(error instanceof LoaderError, true);
    assertEquals((error as LoaderError).code, "METADATA_PARSE_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RegistryClient - fetch succeeds with valid metadata", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  const validMetadata = {
    fqdn: "casys.pml.test.tool",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.test.tool",
    tools: ["test:tool"],
    routing: "client",
  };

  // Mock fetch to return valid metadata
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    const result = await client.fetch("test:tool");
    assertEquals(result.metadata.fqdn, "casys.pml.test.tool");
    assertEquals(result.metadata.type, "deno");
    assertEquals(result.fromCache, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RegistryClient - uses cache on second fetch", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  const validMetadata = {
    fqdn: "casys.pml.cached.tool",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.cached.tool",
    tools: ["cached:tool"],
    routing: "server",
  };

  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    // First fetch
    const result1 = await client.fetch("cached:tool");
    assertEquals(result1.fromCache, false);
    assertEquals(fetchCount, 1);

    // Second fetch should use cache
    const result2 = await client.fetch("cached:tool");
    assertEquals(result2.fromCache, true);
    assertEquals(fetchCount, 1); // No additional fetch
  } finally {
    globalThis.fetch = originalFetch;
  }
});
