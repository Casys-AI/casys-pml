/**
 * SamplingBridge Tests
 *
 * Tests for the bidirectional LLM sampling communication.
 *
 * @module tests/unit/lib/server/sampling-bridge.test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { SamplingBridge } from "../../../../lib/server/src/sampling-bridge.ts";
import type {
  SamplingClient,
  SamplingParams,
  SamplingResult,
} from "../../../../lib/server/src/types.ts";

/**
 * Create a mock sampling client with proper cleanup support
 */
function createMockClient(options?: {
  delay?: number;
  shouldFail?: boolean;
  failMessage?: string;
}): SamplingClient & { cleanup: () => void } {
  const timers: ReturnType<typeof setTimeout>[] = [];

  return {
    createMessage: async (params: SamplingParams): Promise<SamplingResult> => {
      if (options?.delay) {
        await new Promise<void>((resolve) => {
          const timerId = setTimeout(resolve, options.delay);
          timers.push(timerId);
        });
      }
      if (options?.shouldFail) {
        throw new Error(options.failMessage ?? "Mock client failed");
      }
      return {
        content: [
          {
            type: "text",
            text: `Response to: ${params.messages[0]?.content}`,
          },
        ],
        stopReason: "end_turn",
      };
    },
    cleanup: () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.length = 0;
    },
  };
}

Deno.test("SamplingBridge - Basic Operations", async (t) => {
  await t.step("requestSampling() returns client result", async () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    const result = await bridge.requestSampling({
      messages: [{ role: "user", content: "Hello" }],
    });

    assertEquals(result.stopReason, "end_turn");
    assertEquals(result.content.length, 1);
    assertEquals(result.content[0].text, "Response to: Hello");
  });

  await t.step("requestSampling() with custom params", async () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    const result = await bridge.requestSampling({
      messages: [
        { role: "user", content: "Analyze data" },
        { role: "assistant", content: "OK" },
        { role: "user", content: "More details" },
      ],
      maxTokens: 1000,
    });

    assertEquals(result.content[0].text, "Response to: Analyze data");
  });

  await t.step("getClient() returns the sampling client", () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    assertEquals(bridge.getClient(), client);
  });

  await t.step("createMessage() is an alias for requestSampling()", async () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    // createMessage should work the same as requestSampling
    const result = await bridge.createMessage({
      messages: [{ role: "user", content: "Via createMessage" }],
    });

    assertEquals(result.stopReason, "end_turn");
    assertEquals(result.content[0].text, "Response to: Via createMessage");
  });

  await t.step("getPendingCount() returns 0 after completion", async () => {
    const client = createMockClient({ delay: 10 });
    const bridge = new SamplingBridge(client);

    const promise = bridge.requestSampling({
      messages: [{ role: "user", content: "Test" }],
    });

    // During execution, pending count is 1
    assertEquals(bridge.getPendingCount(), 1);

    await promise;

    // After completion, pending count is 0
    assertEquals(bridge.getPendingCount(), 0);
  });
});

Deno.test("SamplingBridge - Timeout Handling", async (t) => {
  await t.step("times out when client takes too long", async () => {
    const client = createMockClient({ delay: 200 });
    const bridge = new SamplingBridge(client, { timeout: 50 });

    try {
      await assertRejects(
        async () => {
          await bridge.requestSampling({
            messages: [{ role: "user", content: "Slow request" }],
          });
        },
        Error,
        "timed out after 50ms",
      );
    } finally {
      client.cleanup(); // Prevent timer leak
    }
  });

  await t.step("per-request timeout overrides default", async () => {
    const client = createMockClient({ delay: 100 });
    const bridge = new SamplingBridge(client, { timeout: 200 });

    try {
      // Should timeout with short per-request timeout
      await assertRejects(
        async () => {
          await bridge.requestSampling(
            { messages: [{ role: "user", content: "Test" }] },
            50,
          );
        },
        Error,
        "timed out after 50ms",
      );
    } finally {
      client.cleanup(); // Prevent timer leak
    }
  });

  await t.step("clears timeout on success (no memory leak)", async () => {
    const client = createMockClient({ delay: 10 });
    const bridge = new SamplingBridge(client, { timeout: 1000 });

    // Run many requests - if timeouts aren't cleared, this would leak
    for (let i = 0; i < 100; i++) {
      await bridge.requestSampling({
        messages: [{ role: "user", content: `Request ${i}` }],
      });
    }

    assertEquals(bridge.getPendingCount(), 0);
  });

  await t.step("clears pending request after timeout", async () => {
    const client = createMockClient({ delay: 200 });
    const bridge = new SamplingBridge(client, { timeout: 50 });

    try {
      await bridge.requestSampling({
        messages: [{ role: "user", content: "Test" }],
      });
    } catch {
      // Expected timeout
    } finally {
      client.cleanup(); // Prevent timer leak
    }

    // Pending request should be cleaned up
    assertEquals(bridge.getPendingCount(), 0);
  });
});

Deno.test("SamplingBridge - Error Handling", async (t) => {
  await t.step("propagates client errors", async () => {
    const client = createMockClient({
      shouldFail: true,
      failMessage: "API rate limited",
    });
    const bridge = new SamplingBridge(client);

    await assertRejects(
      async () => {
        await bridge.requestSampling({
          messages: [{ role: "user", content: "Test" }],
        });
      },
      Error,
      "API rate limited",
    );
  });

  await t.step("cleans up pending request on error", async () => {
    const client = createMockClient({ shouldFail: true });
    const bridge = new SamplingBridge(client);

    try {
      await bridge.requestSampling({
        messages: [{ role: "user", content: "Test" }],
      });
    } catch {
      // Expected error
    }

    assertEquals(bridge.getPendingCount(), 0);
  });
});

Deno.test("SamplingBridge - External Response Handling", async (t) => {
  await t.step("handleResponse() resolves pending request", async () => {
    // Create a client that never resolves (simulating bidirectional pattern)
    const client: SamplingClient = {
      createMessage: () => new Promise(() => {}), // Never resolves
    };
    const bridge = new SamplingBridge(client, { timeout: 5000 });

    const resultPromise = bridge.requestSampling({
      messages: [{ role: "user", content: "Test" }],
    });

    // Wait a bit for the request to be registered
    await new Promise((r) => setTimeout(r, 10));

    // Simulate external response (e.g., from stdio)
    bridge.handleResponse(1, {
      content: [{ type: "text", text: "External response" }],
      stopReason: "end_turn",
    });

    const result = await resultPromise;
    assertEquals(result.content[0].text, "External response");
  });

  await t.step("handleError() rejects pending request", async () => {
    const client: SamplingClient = {
      createMessage: () => new Promise(() => {}), // Never resolves
    };
    const bridge = new SamplingBridge(client, { timeout: 5000 });

    const resultPromise = bridge.requestSampling({
      messages: [{ role: "user", content: "Test" }],
    });

    await new Promise((r) => setTimeout(r, 10));

    bridge.handleError(1, new Error("External error"));

    await assertRejects(
      () => resultPromise,
      Error,
      "External error",
    );
  });

  await t.step("handleResponse() ignores unknown request IDs", () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    // Should not throw
    bridge.handleResponse(999, {
      content: [{ type: "text", text: "Unknown" }],
      stopReason: "end_turn",
    });

    assertEquals(bridge.getPendingCount(), 0);
  });

  await t.step("handleError() ignores unknown request IDs", () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    // Should not throw
    bridge.handleError(999, new Error("Unknown error"));

    assertEquals(bridge.getPendingCount(), 0);
  });
});

Deno.test("SamplingBridge - Cancellation", async (t) => {
  await t.step("cancelAll() rejects all pending requests", async () => {
    const client: SamplingClient = {
      createMessage: () => new Promise(() => {}), // Never resolves
    };
    const bridge = new SamplingBridge(client, { timeout: 5000 });

    const promises = [
      bridge.requestSampling({ messages: [{ role: "user", content: "1" }] }),
      bridge.requestSampling({ messages: [{ role: "user", content: "2" }] }),
      bridge.requestSampling({ messages: [{ role: "user", content: "3" }] }),
    ];

    await new Promise((r) => setTimeout(r, 10));
    assertEquals(bridge.getPendingCount(), 3);

    bridge.cancelAll();
    assertEquals(bridge.getPendingCount(), 0);

    // All promises should reject
    for (const promise of promises) {
      await assertRejects(
        () => promise,
        Error,
        "cancelled (server shutdown)",
      );
    }
  });

  await t.step("cancelAll() is idempotent", () => {
    const client = createMockClient();
    const bridge = new SamplingBridge(client);

    // Calling cancelAll multiple times should not throw
    bridge.cancelAll();
    bridge.cancelAll();
    bridge.cancelAll();

    assertEquals(bridge.getPendingCount(), 0);
  });
});

Deno.test("SamplingBridge - Concurrent Requests", async (t) => {
  await t.step("handles multiple concurrent requests", async () => {
    const client = createMockClient({ delay: 10 });
    const bridge = new SamplingBridge(client);

    const promises = Array.from({ length: 10 }, (_, i) =>
      bridge.requestSampling({
        messages: [{ role: "user", content: `Request ${i}` }],
      }),
    );

    const results = await Promise.all(promises);

    assertEquals(results.length, 10);
    for (let i = 0; i < 10; i++) {
      assertEquals(results[i].content[0].text, `Response to: Request ${i}`);
    }
    assertEquals(bridge.getPendingCount(), 0);
  });

  await t.step("each request gets unique ID", async () => {
    const client: SamplingClient = {
      createMessage: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return {
          content: [{ type: "text", text: "OK" }],
          stopReason: "end_turn" as const,
        };
      },
    };
    const bridge = new SamplingBridge(client, { timeout: 1000 });

    // Start 5 requests
    const promises = Array.from({ length: 5 }, () =>
      bridge.requestSampling({
        messages: [{ role: "user", content: "Test" }],
      }),
    );

    await Promise.all(promises);

    // All requests should complete with no pending
    assertEquals(bridge.getPendingCount(), 0);
  });
});
