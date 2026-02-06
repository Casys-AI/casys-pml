/**
 * Tests for UiCacheService
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Tests:
 * - Task 0.5: UI available even when MCP server disconnected
 * - Task 0.6: UI refreshed when MCP reconnects and cache expired
 * - URI roundtrip (keyToUri/uriToKey consistency)
 *
 * Uses a mock S3 client (in-memory Map) to avoid external dependencies.
 *
 * @module tests/unit/services/ui-cache-service_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "npm:@aws-sdk/client-s3@3.700.0";
import {
  CachedUiResource,
  ResourceFetcher,
  UiCacheService,
} from "../../../src/services/ui-cache-service.ts";

/**
 * In-memory mock S3 client for testing.
 * Simulates Get/Put/Delete/List operations using a Map.
 */
class MockS3Client {
  readonly store = new Map<string, string>();

  async send(command: unknown): Promise<unknown> {
    if (command instanceof GetObjectCommand) {
      const key = (command as { input: { Key: string } }).input.Key;
      const data = this.store.get(key);
      if (!data) {
        const err = new Error("The specified key does not exist.");
        err.name = "NoSuchKey";
        throw err;
      }
      return {
        Body: { transformToString: async () => data },
      };
    }

    if (command instanceof PutObjectCommand) {
      const input = (command as { input: { Key: string; Body: string } }).input;
      this.store.set(input.Key, input.Body);
      return {};
    }

    if (command instanceof DeleteObjectCommand) {
      const key = (command as { input: { Key: string } }).input.Key;
      this.store.delete(key);
      return {};
    }

    if (command instanceof ListObjectsV2Command) {
      const prefix = (command as { input: { Prefix?: string } }).input.Prefix ?? "";
      const contents: Array<{ Key: string }> = [];
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          contents.push({ Key: key });
        }
      }
      return { Contents: contents };
    }

    throw new Error(`[MockS3Client] Unknown command type`);
  }

  destroy(): void {
    // No-op: data persists across service close/reopen within test lifecycle
  }
}

// Mock resource fetcher for testing
class MockResourceFetcher implements ResourceFetcher {
  private connected = true;
  private resources: Map<string, { content: string; mimeType: string }> = new Map();
  fetchCalls: string[] = [];

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  setResource(uri: string, content: string, mimeType = "text/html;profile=mcp-app"): void {
    this.resources.set(uri, { content, mimeType });
  }

  removeResource(uri: string): void {
    this.resources.delete(uri);
  }

  async fetch(resourceUri: string): Promise<{ content: string; mimeType: string } | null> {
    this.fetchCalls.push(resourceUri);
    if (!this.connected) {
      return null;
    }
    return this.resources.get(resourceUri) ?? null;
  }

  isConnected(_serverId: string): boolean {
    return this.connected;
  }
}

Deno.test("UiCacheService - Basic Operations", async (t) => {
  const mockS3 = new MockS3Client();
  let service: UiCacheService;

  await t.step("setup", async () => {
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 1000 });
    await service.init();
    await service.clearAll();
  });

  await t.step("set and get resource", async () => {
    const resourceUri = "ui://test/resource/1";
    const content = "<html><body>Test</body></html>";
    const mimeType = "text/html;profile=mcp-app";
    const serverId = "test-server";

    await service.set(resourceUri, content, mimeType, serverId);

    const cached = await service.get(resourceUri);
    assertExists(cached);
    assertEquals(cached.content, content);
    assertEquals(cached.mimeType, mimeType);
    assertEquals(cached.serverId, serverId);
  });

  await t.step("isFresh returns true for fresh cache", () => {
    const cached: CachedUiResource = {
      content: "test",
      mimeType: "text/html",
      cachedAt: Date.now() - 100, // 100ms ago, TTL is 1000ms
      serverId: "test",
    };

    assertEquals(service.isFresh(cached), true);
  });

  await t.step("isFresh returns false for stale cache", () => {
    const cached: CachedUiResource = {
      content: "test",
      mimeType: "text/html",
      cachedAt: Date.now() - 2000, // 2s ago, TTL is 1s
      serverId: "test",
    };

    assertEquals(service.isFresh(cached), false);
  });

  await t.step("delete removes resource", async () => {
    const resourceUri = "ui://test/delete/1";
    await service.set(resourceUri, "content", "text/html", "server");

    // Verify exists
    const before = await service.get(resourceUri);
    assertExists(before);

    // Delete
    await service.delete(resourceUri);

    // Verify gone
    const after = await service.get(resourceUri);
    assertEquals(after, null);
  });

  await t.step("URI roundtrip via set and listAll", async () => {
    await service.clearAll();

    // Test various URI depths to verify uriToKey/keyToUri roundtrip
    const testUris = [
      "ui://server/resource",
      "ui://mcp-std/table-viewer",
      "ui://postgres/deep/path/resource",
    ];

    for (const uri of testUris) {
      await service.set(uri, `<html>${uri}</html>`, "text/html", "test");
    }

    const listed = await service.listAll();
    for (const uri of testUris) {
      assertEquals(
        listed.includes(uri),
        true,
        `Expected ${uri} in listed URIs: ${JSON.stringify(listed)}`,
      );
    }
  });

  await t.step("cleanup", () => {
    service.close();
  });
});

Deno.test("UiCacheService - Task 0.5: UI available when MCP disconnected", async (t) => {
  const mockS3 = new MockS3Client();
  let service: UiCacheService;
  let fetcher: MockResourceFetcher;

  await t.step("setup", async () => {
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 1000 });
    await service.init();
    await service.clearAll();
    fetcher = new MockResourceFetcher();
  });

  await t.step("should return cached UI when MCP disconnected (fresh cache)", async () => {
    const resourceUri = "ui://postgres/table/abc123";
    const content = "<html><body>Table UI</body></html>";
    const serverId = "postgres";

    // Pre-populate cache
    await service.set(resourceUri, content, "text/html;profile=mcp-app", serverId);

    // Disconnect MCP
    fetcher.setConnected(false);

    // Get should return cached version
    const result = await service.getOrFetch(resourceUri, serverId, fetcher);

    assertExists(result);
    assertEquals(result.content, content);
    assertEquals(fetcher.fetchCalls.length, 0); // No fetch attempted
  });

  await t.step("should return stale cache when MCP disconnected (expired cache)", async () => {
    const resourceUri = "ui://postgres/table/stale";
    const content = "<html><body>Stale UI</body></html>";
    const serverId = "postgres";

    // Reopen with very short TTL (reuse same mock store for data persistence)
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 1 }); // 1ms TTL
    await service.init();

    // Set resource
    await service.set(resourceUri, content, "text/html;profile=mcp-app", serverId);

    // Wait for it to become stale
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Disconnect MCP
    fetcher.setConnected(false);

    // Should return stale cache as fallback
    const result = await service.getOrFetch(resourceUri, serverId, fetcher);

    assertExists(result);
    assertEquals(result.content, content);
  });

  await t.step("cleanup", () => {
    service.close();
  });
});

Deno.test("UiCacheService - Task 0.6: UI refreshed when MCP reconnects", async (t) => {
  const mockS3 = new MockS3Client();
  let service: UiCacheService;
  let fetcher: MockResourceFetcher;

  await t.step("setup", async () => {
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 100 }); // Short TTL for testing
    await service.init();
    await service.clearAll();
    fetcher = new MockResourceFetcher();
  });

  await t.step("should refresh stale cache when MCP connected", async () => {
    const resourceUri = "ui://postgres/table/refresh";
    const oldContent = "<html><body>Old UI</body></html>";
    const newContent = "<html><body>New UI</body></html>";
    const serverId = "postgres";

    // Set old content, then wait for it to become stale (TTL is 100ms)
    await service.set(resourceUri, oldContent, "text/html;profile=mcp-app", serverId);

    // Wait for it to become stale
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Set up fetcher with new content
    fetcher.setConnected(true);
    fetcher.setResource(resourceUri, newContent);

    // Get should refresh from MCP
    const result = await service.getOrFetch(resourceUri, serverId, fetcher);

    assertExists(result);
    assertEquals(result.content, newContent);
    assertEquals(fetcher.fetchCalls.length, 1); // Fetch was called

    // Verify cache was updated
    const cached = await service.get(resourceUri);
    assertExists(cached);
    assertEquals(cached.content, newContent);
  });

  await t.step("should use fresh cache without fetching", async () => {
    const resourceUri = "ui://postgres/table/fresh";
    const content = "<html><body>Fresh UI</body></html>";
    const serverId = "postgres";

    // Reset fetch calls
    fetcher.fetchCalls = [];

    // Pre-populate with fresh cache
    await service.set(resourceUri, content, "text/html;profile=mcp-app", serverId);

    // Set up fetcher (should not be called)
    fetcher.setConnected(true);
    fetcher.setResource(resourceUri, "SHOULD NOT BE USED");

    // Get should return cached without fetching
    const result = await service.getOrFetch(resourceUri, serverId, fetcher);

    assertExists(result);
    assertEquals(result.content, content);
    assertEquals(fetcher.fetchCalls.length, 0); // No fetch
  });

  await t.step("should fetch and cache new resource", async () => {
    const resourceUri = "ui://postgres/table/new";
    const content = "<html><body>Brand New UI</body></html>";
    const serverId = "postgres";

    // Reset fetch calls
    fetcher.fetchCalls = [];

    // Set up fetcher with content (no cache exists)
    fetcher.setConnected(true);
    fetcher.setResource(resourceUri, content);

    // Get should fetch and cache
    const result = await service.getOrFetch(resourceUri, serverId, fetcher);

    assertExists(result);
    assertEquals(result.content, content);
    assertEquals(fetcher.fetchCalls.length, 1);

    // Verify cache was created
    const cached = await service.get(resourceUri);
    assertExists(cached);
    assertEquals(cached.content, content);
  });

  await t.step("cleanup", () => {
    service.close();
  });
});

Deno.test("UiCacheService - Statistics", async (t) => {
  const mockS3 = new MockS3Client();
  let service: UiCacheService;

  await t.step("setup", async () => {
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 1000 });
    await service.init();
    await service.clearAll();
  });

  await t.step("getStats returns correct counts", async () => {
    // Add fresh resources
    await service.set("ui://test/fresh1", "c1", "text/html", "s1");
    await service.set("ui://test/fresh2", "c2", "text/html", "s2");

    // Reopen with very short TTL to test stale counting
    service = new UiCacheService({ _testClient: mockS3, ttlMs: 1 }); // 1ms TTL
    await service.init();

    // Add a "stale" resource (will be immediately stale due to 1ms TTL)
    await service.set("ui://test/stale", "stale", "text/html", "s3");

    // Wait a bit to make it stale
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stats = await service.getStats();

    // All 3 will be stale due to short TTL
    assertEquals(stats.totalCached, 3);
    assertEquals(stats.stale, 3);
  });

  await t.step("listAll returns all URIs", async () => {
    const uris = await service.listAll();

    assertEquals(uris.length, 3);
    assertEquals(uris.includes("ui://test/fresh1"), true);
    assertEquals(uris.includes("ui://test/fresh2"), true);
    assertEquals(uris.includes("ui://test/stale"), true);
  });

  await t.step("clearAll removes all resources", async () => {
    await service.clearAll();

    const stats = await service.getStats();
    assertEquals(stats.totalCached, 0);
  });

  await t.step("cleanup", () => {
    service.close();
  });
});
