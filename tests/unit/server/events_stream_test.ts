/**
 * Unit tests for EventsStreamManager
 * Story 6.1: Real-time Events Stream (SSE)
 */

import { assertEquals, assertExists } from "@std/assert";
import { EventsStreamManager } from "../../../src/server/events-stream.ts";
import type { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import type { GraphEvent } from "../../../src/graphrag/events.ts";

// Mock GraphRAGEngine
class MockGraphEngine {
  private listeners: Map<string, ((event: GraphEvent) => void)[]> = new Map();

  on(event: "graph_event", listener: (event: GraphEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: "graph_event", listener: (event: GraphEvent) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // Test helper: emit event to all listeners
  emitEvent(event: GraphEvent): void {
    const listeners = this.listeners.get("graph_event");
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }
}

Deno.test("EventsStreamManager - initialization", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine);

  const stats = manager.getStats();
  assertEquals(stats.connectedClients, 0);
  assertExists(stats.uptimeSeconds);

  manager.close();
});

Deno.test("EventsStreamManager - client limit enforcement", async () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine, {
    maxClients: 2,
    heartbeatIntervalMs: 60000,
    corsOrigins: [],
  });

  // Mock abort controller for request cleanup
  const createMockRequest = () => {
    const controller = new AbortController();
    return new Request("http://localhost/events/stream", {
      signal: controller.signal,
    });
  };

  // Add 2 clients (should succeed)
  const req1 = createMockRequest();
  const res1 = manager.handleRequest(req1);
  assertEquals(res1.status, 200);
  assertEquals(res1.headers.get("Content-Type"), "text/event-stream");

  const req2 = createMockRequest();
  const res2 = manager.handleRequest(req2);
  assertEquals(res2.status, 200);

  // 3rd client should be rejected (503)
  const req3 = createMockRequest();
  const res3 = manager.handleRequest(req3);
  assertEquals(res3.status, 503);

  const body = await res3.json();
  assertEquals(body.error, "Too many clients");
  assertEquals(body.max, 2);

  manager.close();
});

Deno.test("EventsStreamManager - CORS headers", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine, {
    maxClients: 100,
    heartbeatIntervalMs: 60000,
    corsOrigins: ["http://localhost:3000", "http://localhost:*"],
  });

  // Test with allowed origin
  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    headers: { "Origin": "http://localhost:3000" },
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");

  manager.close();
});

Deno.test("EventsStreamManager - CORS wildcard pattern", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine, {
    maxClients: 100,
    heartbeatIntervalMs: 60000,
    corsOrigins: ["http://localhost:*"],
  });

  // Test wildcard match
  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    headers: { "Origin": "http://localhost:8080" },
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");

  manager.close();
});

Deno.test("EventsStreamManager - response headers", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine);

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });

  const res = manager.handleRequest(req);

  assertEquals(res.headers.get("Content-Type"), "text/event-stream");
  assertEquals(res.headers.get("Cache-Control"), "no-cache");
  assertEquals(res.headers.get("Connection"), "keep-alive");
  assertEquals(res.headers.get("X-Accel-Buffering"), "no");

  manager.close();
});

Deno.test("EventsStreamManager - stats tracking", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine);

  const stats1 = manager.getStats();
  assertEquals(stats1.connectedClients, 0);

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });
  manager.handleRequest(req);

  const stats2 = manager.getStats();
  assertEquals(stats2.connectedClients, 1);

  manager.close();

  const stats3 = manager.getStats();
  assertEquals(stats3.connectedClients, 0);
});

Deno.test("EventsStreamManager - cleanup on close", () => {
  const mockEngine = new MockGraphEngine() as unknown as GraphRAGEngine;
  const manager = new EventsStreamManager(mockEngine);

  const controller = new AbortController();
  const req = new Request("http://localhost/events/stream", {
    signal: controller.signal,
  });
  manager.handleRequest(req);

  assertEquals(manager.getStats().connectedClients, 1);

  manager.close();

  assertEquals(manager.getStats().connectedClients, 0);
});
