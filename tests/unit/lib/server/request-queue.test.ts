/**
 * RequestQueue Tests
 *
 * Tests for the concurrency control and backpressure implementation.
 *
 * @module tests/unit/lib/server/request-queue.test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { RequestQueue } from "../../../../lib/server/request-queue.ts";

Deno.test("RequestQueue - Basic Operations", async (t) => {
  await t.step("acquire() increments inFlight counter", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 10,
      strategy: "sleep",
      sleepMs: 10,
    });

    assertEquals(queue.getInFlight(), 0);

    await queue.acquire();
    assertEquals(queue.getInFlight(), 1);

    await queue.acquire();
    assertEquals(queue.getInFlight(), 2);

    queue.release();
    queue.release();
  });

  await t.step("release() decrements inFlight counter", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 10,
      strategy: "sleep",
      sleepMs: 10,
    });

    await queue.acquire();
    await queue.acquire();
    assertEquals(queue.getInFlight(), 2);

    queue.release();
    assertEquals(queue.getInFlight(), 1);

    queue.release();
    assertEquals(queue.getInFlight(), 0);
  });

  await t.step("getMetrics() returns correct values", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 5,
      strategy: "queue",
      sleepMs: 10,
    });

    await queue.acquire();
    await queue.acquire();

    const metrics = queue.getMetrics();
    assertEquals(metrics.inFlight, 2);
    assertEquals(metrics.queued, 0);

    queue.release();
    queue.release();
  });

  await t.step("isAtCapacity() returns correct state", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 2,
      strategy: "reject",
      sleepMs: 10,
    });

    assertEquals(queue.isAtCapacity(), false);

    await queue.acquire();
    assertEquals(queue.isAtCapacity(), false);

    await queue.acquire();
    assertEquals(queue.isAtCapacity(), true);

    queue.release();
    assertEquals(queue.isAtCapacity(), false);

    queue.release();
  });
});

Deno.test("RequestQueue - Reject Strategy", async (t) => {
  await t.step("throws when at capacity", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 2,
      strategy: "reject",
      sleepMs: 10,
    });

    await queue.acquire();
    await queue.acquire();

    await assertRejects(
      async () => {
        await queue.acquire();
      },
      Error,
      "Server at capacity (2 concurrent requests)",
    );

    queue.release();
    queue.release();
  });

  await t.step("allows acquire after release", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "reject",
      sleepMs: 10,
    });

    await queue.acquire();

    await assertRejects(
      async () => await queue.acquire(),
      Error,
      "Server at capacity",
    );

    queue.release();

    // Should succeed after release
    await queue.acquire();
    assertEquals(queue.getInFlight(), 1);

    queue.release();
  });
});

Deno.test("RequestQueue - Sleep Strategy", async (t) => {
  await t.step("blocks until slot available", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "sleep",
      sleepMs: 5,
    });

    await queue.acquire();

    let acquired = false;
    const acquirePromise = queue.acquire().then(() => {
      acquired = true;
    });

    // Should not be acquired immediately
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(acquired, false);

    // Release slot
    queue.release();

    // Now should acquire
    await acquirePromise;
    assertEquals(acquired, true);
    assertEquals(queue.getInFlight(), 1);

    queue.release();
  });

  await t.step("respects sleepMs timing", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "sleep",
      sleepMs: 50,
    });

    await queue.acquire();

    const startTime = Date.now();
    const acquirePromise = queue.acquire();

    // Release after 25ms
    setTimeout(() => queue.release(), 25);

    await acquirePromise;
    const elapsed = Date.now() - startTime;

    // Should have taken at least ~25ms but less than 100ms
    assertEquals(elapsed >= 20, true);
    assertEquals(elapsed < 100, true);

    queue.release();
  });
});

Deno.test("RequestQueue - Queue Strategy", async (t) => {
  await t.step("queues requests in FIFO order", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "queue",
      sleepMs: 10,
    });

    const order: number[] = [];

    await queue.acquire();

    // Queue up 3 requests
    const p1 = queue.acquire().then(() => order.push(1));
    const p2 = queue.acquire().then(() => order.push(2));
    const p3 = queue.acquire().then(() => order.push(3));

    assertEquals(queue.getQueued(), 3);

    // Release all
    queue.release(); // Wakes up p1
    await p1;
    queue.release(); // Wakes up p2
    await p2;
    queue.release(); // Wakes up p3
    await p3;
    queue.release();

    assertEquals(order, [1, 2, 3]);
  });

  await t.step("getQueued() reflects pending requests", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "queue",
      sleepMs: 10,
    });

    await queue.acquire();

    assertEquals(queue.getQueued(), 0);

    const p1 = queue.acquire();
    assertEquals(queue.getQueued(), 1);

    const p2 = queue.acquire();
    assertEquals(queue.getQueued(), 2);

    queue.release();
    await p1;
    assertEquals(queue.getQueued(), 1);

    queue.release();
    await p2;
    assertEquals(queue.getQueued(), 0);

    queue.release();
  });
});

Deno.test("RequestQueue - Concurrent Access", async (t) => {
  await t.step("handles multiple concurrent acquires correctly", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 3,
      strategy: "queue",
      sleepMs: 10,
    });

    // Start 5 concurrent acquires
    const promises = Array.from({ length: 5 }, () => queue.acquire());

    // First 3 should resolve immediately
    await Promise.all(promises.slice(0, 3));
    assertEquals(queue.getInFlight(), 3);
    assertEquals(queue.getQueued(), 2);

    // Release one and wait for next to acquire
    queue.release();
    await promises[3];
    assertEquals(queue.getInFlight(), 3);
    assertEquals(queue.getQueued(), 1);

    // Release remaining
    queue.release();
    await promises[4];
    queue.release();
    queue.release();
    queue.release();

    assertEquals(queue.getInFlight(), 0);
    assertEquals(queue.getQueued(), 0);
  });

  await t.step("never exceeds maxConcurrent", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 5,
      strategy: "queue",
      sleepMs: 10,
    });

    let maxObserved = 0;
    const trackMax = () => {
      if (queue.getInFlight() > maxObserved) {
        maxObserved = queue.getInFlight();
      }
    };

    // Start 20 concurrent acquires that each track and release
    const promises = Array.from({ length: 20 }, async () => {
      await queue.acquire();
      trackMax();
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      queue.release();
    });

    await Promise.all(promises);

    assertEquals(maxObserved <= 5, true, `Max observed was ${maxObserved}`);
    assertEquals(queue.getInFlight(), 0);
  });
});

Deno.test("RequestQueue - Edge Cases", async (t) => {
  await t.step("maxConcurrent of 1 serializes requests", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 1,
      strategy: "queue",
      sleepMs: 10,
    });

    const results: string[] = [];

    const task = async (name: string, delay: number) => {
      await queue.acquire();
      results.push(`${name}-start`);
      await new Promise((r) => setTimeout(r, delay));
      results.push(`${name}-end`);
      queue.release();
    };

    await Promise.all([task("A", 10), task("B", 5), task("C", 1)]);

    // Should be serialized: A starts first, then B, then C
    assertEquals(results[0], "A-start");
    assertEquals(results[1], "A-end");
    assertEquals(results[2], "B-start");
    assertEquals(results[3], "B-end");
    assertEquals(results[4], "C-start");
    assertEquals(results[5], "C-end");
  });

  await t.step("high concurrency limit allows all through", async () => {
    const queue = new RequestQueue({
      maxConcurrent: 100,
      strategy: "queue",
      sleepMs: 10,
    });

    const startTime = Date.now();
    const promises = Array.from({ length: 50 }, async () => {
      await queue.acquire();
      await new Promise((r) => setTimeout(r, 10));
      queue.release();
    });

    await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    // Should complete in ~10ms since all run in parallel (plus overhead)
    assertEquals(elapsed < 50, true, `Elapsed: ${elapsed}ms`);
  });
});
