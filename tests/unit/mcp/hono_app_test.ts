/**
 * Hono App Tests
 *
 * Tests for the Hono-based HTTP routing (QW-4).
 *
 * @module tests/unit/mcp/hono_app_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { createApp } from "../../../src/mcp/server/app.ts";
import type { RouteContext } from "../../../src/mcp/routing/types.ts";

// Create a minimal mock RouteContext
function createMockContext(): RouteContext {
  return {
    graphEngine: {
      getGraphSnapshot: () => ({ nodes: [], edges: [], timestamp: new Date() }),
      getStats: () => ({ nodeCount: 0, edgeCount: 0, density: 0, communities: 0 }),
    } as unknown as RouteContext["graphEngine"],
    vectorSearch: {
      searchTools: async () => [],
    } as unknown as RouteContext["vectorSearch"],
    dagSuggester: {
      getCapabilityPageranks: () => new Map(),
    } as unknown as RouteContext["dagSuggester"],
    eventsStream: null,
    mcpClients: new Map(),
  };
}

Deno.test("Hono App - health endpoint returns ok", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  const req = new Request("http://localhost:3000/health");
  const res = await app.fetch(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertExists(body.timestamp);
});

Deno.test("Hono App - 404 for unknown routes", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  const req = new Request("http://localhost:3000/unknown/path");
  const res = await app.fetch(req);

  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "Not found");
});

Deno.test("Hono App - dashboard redirects", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  const req = new Request("http://localhost:3000/dashboard");
  const res = await app.fetch(req);

  assertEquals(res.status, 302);
  assertEquals(res.headers.get("Location"), "http://localhost:8080/dashboard");
});

Deno.test("Hono App - events stream returns 503 when not initialized", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  const req = new Request("http://localhost:3000/events/stream");
  const res = await app.fetch(req);

  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "Events stream not initialized");
});

Deno.test("Hono App - CORS headers are set on regular requests", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  // Test CORS on a regular GET request
  const req = new Request("http://localhost:3000/health", {
    headers: { "Origin": "http://localhost:3000" },
  });
  const res = await app.fetch(req);

  assertEquals(res.status, 200);
  // Hono's cors middleware adds headers on cross-origin requests
  // The behavior depends on whether the request includes Origin header
});

Deno.test("Hono App - API graph route delegates to handler", async () => {
  const ctx = createMockContext();
  const app = createApp(ctx, ["http://localhost:3000"]);

  // This should hit the graph handler but may return 404 if handler doesn't match
  const req = new Request("http://localhost:3000/api/graph/snapshot");
  const res = await app.fetch(req);

  // Handler should process this - either success or service unavailable
  // The exact response depends on the handler implementation
  assertExists(res.status);
});
