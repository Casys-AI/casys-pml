/**
 * McpResourceFetcher Unit Tests
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Tests the MCP resource fetching logic including URI parsing,
 * resource reading, and error handling.
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  McpResourceFetcher,
  parseResourceUri,
  type MCPServerRegistry,
} from "../../../src/services/mcp-resource-fetcher.ts";
import type { MCPClientBase } from "../../../src/mcp/types.ts";

// --- parseResourceUri tests ---

Deno.test("parseResourceUri", async (t) => {
  await t.step("parses standard UI URI", () => {
    const result = parseResourceUri("ui://postgres/table/abc123");
    assertExists(result);
    assertEquals(result.serverId, "postgres");
    assertEquals(result.path, "table/abc123");
  });

  await t.step("parses URI with dashes in server ID", () => {
    const result = parseResourceUri("ui://mcp-std/json-viewer/xyz");
    assertExists(result);
    assertEquals(result.serverId, "mcp-std");
    assertEquals(result.path, "json-viewer/xyz");
  });

  await t.step("parses URI with single path segment", () => {
    const result = parseResourceUri("ui://viz/chart");
    assertExists(result);
    assertEquals(result.serverId, "viz");
    assertEquals(result.path, "chart");
  });

  await t.step("returns null for invalid URI (no ui:// prefix)", () => {
    const result = parseResourceUri("http://example.com/resource");
    assertEquals(result, null);
  });

  await t.step("returns null for invalid URI (no path)", () => {
    const result = parseResourceUri("ui://postgres");
    assertEquals(result, null);
  });

  await t.step("returns null for empty string", () => {
    const result = parseResourceUri("");
    assertEquals(result, null);
  });
});

// --- MockMCPClient & MockRegistry ---

class MockMCPClient {
  serverId: string;
  private readResourceResult: { contents: Array<{ uri: string; mimeType?: string; text?: string }> } | null = null;
  private shouldThrow = false;
  private throwError = new Error("Connection failed");

  readResourceCalls: string[] = [];

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  setReadResourceResult(result: { contents: Array<{ uri: string; mimeType?: string; text?: string }> }) {
    this.readResourceResult = result;
  }

  setThrowOnRead(err?: Error) {
    this.shouldThrow = true;
    if (err) this.throwError = err;
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    this.readResourceCalls.push(uri);
    if (this.shouldThrow) {
      throw this.throwError;
    }
    if (!this.readResourceResult) {
      return { contents: [] };
    }
    return this.readResourceResult;
  }
}

function createMockRegistry(clients: Map<string, MockMCPClient>): MCPServerRegistry {
  return {
    getClient: (id: string) => clients.get(id) as unknown as MCPClientBase | undefined,
    isConnected: (id: string) => clients.has(id),
    listConnectedServers: () => Array.from(clients.keys()),
  };
}

// --- McpResourceFetcher tests ---

Deno.test("McpResourceFetcher", async (t) => {
  await t.step("fetch returns content from MCP server", async () => {
    const client = new MockMCPClient("postgres");
    client.setReadResourceResult({
      contents: [
        { uri: "ui://postgres/table", mimeType: "text/html;profile=mcp-app", text: "<div>Table</div>" },
      ],
    });

    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertExists(result);
    assertEquals(result.content, "<div>Table</div>");
    assertEquals(result.mimeType, "text/html;profile=mcp-app");
    assertEquals(client.readResourceCalls, ["ui://postgres/table"]);
  });

  await t.step("fetch returns null for disconnected server", async () => {
    const registry = createMockRegistry(new Map()); // No clients
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertEquals(result, null);
  });

  await t.step("fetch returns null for invalid URI", async () => {
    const registry = createMockRegistry(new Map());
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("not-a-valid-uri");
    assertEquals(result, null);
  });

  await t.step("fetch returns null when server returns empty contents", async () => {
    const client = new MockMCPClient("postgres");
    // readResource returns default empty contents

    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertEquals(result, null);
  });

  await t.step("fetch returns null when readResource throws", async () => {
    const client = new MockMCPClient("postgres");
    client.setThrowOnRead(new Error("MCP connection lost"));

    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertEquals(result, null);
  });

  await t.step("fetch defaults to text/html;profile=mcp-app when no mimeType", async () => {
    const client = new MockMCPClient("postgres");
    client.setReadResourceResult({
      contents: [
        { uri: "ui://postgres/table", text: "<div>Table</div>" }, // No mimeType
      ],
    });

    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertExists(result);
    assertEquals(result.mimeType, "text/html;profile=mcp-app");
  });

  await t.step("fetch returns null when matching URI content has no text", async () => {
    const client = new MockMCPClient("postgres");
    client.setReadResourceResult({
      contents: [
        { uri: "ui://postgres/table", mimeType: "text/html" }, // No text
      ],
    });

    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    const result = await fetcher.fetch("ui://postgres/table");
    assertEquals(result, null);
  });

  await t.step("isConnected delegates to registry", () => {
    const client = new MockMCPClient("postgres");
    const registry = createMockRegistry(new Map([["postgres", client]]));
    const fetcher = new McpResourceFetcher(registry);

    assertEquals(fetcher.isConnected("postgres"), true);
    assertEquals(fetcher.isConnected("unknown"), false);
  });
});
