/**
 * Unit tests for rate limiter
 *
 * Tests the RateLimiter from @casys/mcp-server package.
 */

import { assert, assertEquals } from "@std/assert";
import { RateLimiter } from "@casys/mcp-server";

Deno.test("RateLimiter - allows requests within limit", () => {
  const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 }); // 5 req/sec

  // First 5 requests should succeed
  for (let i = 0; i < 5; i++) {
    const allowed = limiter.checkLimit("test-server");
    assertEquals(allowed, true, `Request ${i + 1} should be allowed`);
  }
});

Deno.test("RateLimiter - blocks requests exceeding limit", () => {
  const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 }); // 5 req/sec

  // First 5 requests succeed
  for (let i = 0; i < 5; i++) {
    limiter.checkLimit("test-server");
  }

  // 6th request should fail
  const allowed = limiter.checkLimit("test-server");
  assertEquals(allowed, false);
});

Deno.test("RateLimiter - allows requests after window expires", async () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 100 }); // 2 req per 100ms

  // Use up the limit
  limiter.checkLimit("test-server");
  limiter.checkLimit("test-server");

  // 3rd request should fail
  assertEquals(limiter.checkLimit("test-server"), false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Should allow requests again
  assertEquals(limiter.checkLimit("test-server"), true);
});

Deno.test("RateLimiter - tracks separate limits per key", () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

  // Max out server1
  limiter.checkLimit("server1");
  limiter.checkLimit("server1");

  // server1 should be blocked
  assertEquals(limiter.checkLimit("server1"), false);

  // server2 should still have capacity
  assertEquals(limiter.checkLimit("server2"), true);
  assertEquals(limiter.checkLimit("server2"), true);
});

Deno.test("RateLimiter - waitForSlot waits until slot available", async () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 100 });

  // Use up the limit
  limiter.checkLimit("test-server");
  limiter.checkLimit("test-server");

  const start = performance.now();

  // This should wait for window to expire
  await limiter.waitForSlot("test-server");

  const elapsed = performance.now() - start;

  // Should have waited approximately 100ms
  assert(elapsed >= 90, `Expected wait >= 90ms, got ${elapsed}ms`);
});

Deno.test("RateLimiter - getCurrentCount returns accurate count", () => {
  const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

  assertEquals(limiter.getCurrentCount("test-server"), 0);

  limiter.checkLimit("test-server");
  assertEquals(limiter.getCurrentCount("test-server"), 1);

  limiter.checkLimit("test-server");
  assertEquals(limiter.getCurrentCount("test-server"), 2);
});

Deno.test("RateLimiter - clear resets key limits", () => {
  const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

  limiter.checkLimit("test-server");
  limiter.checkLimit("test-server");

  // Should be at limit
  assertEquals(limiter.checkLimit("test-server"), false);

  // Clear and try again
  limiter.clear("test-server");
  assertEquals(limiter.checkLimit("test-server"), true);
});

Deno.test("RateLimiter - getRemainingRequests returns correct value", () => {
  const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

  assertEquals(limiter.getRemainingRequests("test-server"), 5);

  limiter.checkLimit("test-server");
  assertEquals(limiter.getRemainingRequests("test-server"), 4);

  limiter.checkLimit("test-server");
  limiter.checkLimit("test-server");
  assertEquals(limiter.getRemainingRequests("test-server"), 2);
});

Deno.test("RateLimiter - getMetrics returns aggregate stats", () => {
  const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });

  limiter.checkLimit("server1");
  limiter.checkLimit("server1");
  limiter.checkLimit("server2");

  const metrics = limiter.getMetrics();
  assertEquals(metrics.keys, 2);
  assertEquals(metrics.totalRequests, 3);
});
