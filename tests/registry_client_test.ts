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
    "pml.mcp.filesystem.read_file",
  );
});

Deno.test("toolNameToFqdn - preserves existing FQDN", () => {
  assertEquals(
    toolNameToFqdn("pml.mcp.filesystem.read_file"),
    "pml.mcp.filesystem.read_file",
  );
});

Deno.test("toolNameToFqdn - handles simple namespace", () => {
  assertEquals(toolNameToFqdn("memory:create"), "pml.mcp.memory.create");
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

// =============================================================================
// fetchByFqdn Tests (Story: FQDN resolution in execute_locally)
// =============================================================================

Deno.test("RegistryClient - fetchByFqdn uses FQDN directly (no conversion)", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  const validMetadata = {
    fqdn: "alice.default.fs.listDirectory",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/alice.default.fs.listDirectory",
    tools: ["fs:listDirectory"],
    routing: "client",
  };

  let capturedUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = input.toString();
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await client.fetchByFqdn("alice.default.fs.listDirectory");
    assertEquals(result.metadata.fqdn, "alice.default.fs.listDirectory");
    // Verify FQDN was used directly (not converted)
    assertEquals(capturedUrl.includes("alice.default.fs.listDirectory"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RegistryClient - fetchByFqdn handles 404", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("Not found", { status: 404 });
  };

  try {
    await client.fetchByFqdn("nonexistent.default.test.tool");
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals(error instanceof LoaderError, true);
    assertEquals((error as LoaderError).code, "METADATA_FETCH_FAILED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("RegistryClient - fetchByFqdn uses cache", async () => {
  const client = new RegistryClient({ cloudUrl: "https://pml.casys.ai" });
  client.clearCache();

  const validMetadata = {
    fqdn: "bob.default.db.query",
    type: "stdio",
    tools: ["db:query"],
    routing: "client",
  };

  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    // First fetch
    const result1 = await client.fetchByFqdn("bob.default.db.query");
    assertEquals(result1.fromCache, false);
    assertEquals(fetchCount, 1);

    // Second fetch should use cache
    const result2 = await client.fetchByFqdn("bob.default.db.query");
    assertEquals(result2.fromCache, true);
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
