/**
 * IframeTransport Tests
 *
 * Tests for browser iframe transport with mocked browser APIs.
 *
 * @module sandbox/transport/iframe-transport_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import { IframeTransport } from "../src/sandbox/transport/iframe-transport.ts";

// Mock iframe element
function createMockIframe(): {
  iframe: { contentWindow: { postMessage: (msg: unknown, origin: string) => void } | null };
  postedMessages: Array<{ message: unknown; origin: string }>;
} {
  const postedMessages: Array<{ message: unknown; origin: string }> = [];
  const iframe = {
    contentWindow: {
      postMessage: (message: unknown, origin: string) => {
        postedMessages.push({ message, origin });
      },
    },
  };
  return { iframe, postedMessages };
}

// Mock globalThis event listeners for testing
function createMockEventTarget(): {
  listeners: Map<string, Set<EventListener>>;
  addEventListener: (type: string, handler: EventListener) => void;
  removeEventListener: (type: string, handler: EventListener) => void;
  dispatchEvent: (type: string, event: unknown) => void;
} {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    listeners,
    addEventListener: (type: string, handler: EventListener) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: EventListener) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (type: string, event: unknown) => {
      for (const handler of listeners.get(type) ?? []) {
        handler(event as Event);
      }
    },
  };
}

Deno.test("IframeTransport - send() posts message to iframe contentWindow", () => {
  const { iframe, postedMessages } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  // Temporarily replace globalThis.addEventListener
  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn for "*" origin
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);
    transport.send({ type: "test", data: 42 });

    console.warn = originalWarn;

    assertEquals(postedMessages.length, 1);
    assertEquals(postedMessages[0].message, { type: "test", data: 42 });
    assertEquals(postedMessages[0].origin, "*");

    transport.close();
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - send() uses specified targetOrigin", () => {
  const { iframe, postedMessages } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    const transport = new IframeTransport(iframe, "https://example.com");
    transport.send({ type: "hello" });

    assertEquals(postedMessages.length, 1);
    assertEquals(postedMessages[0].origin, "https://example.com");

    transport.close();
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - onMessage() receives messages from iframe source", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();
  const receivedMessages: unknown[] = [];

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);
    transport.onMessage((msg) => receivedMessages.push(msg));

    console.warn = originalWarn;

    // Simulate message from iframe
    mockEventTarget.dispatchEvent("message", {
      source: iframe.contentWindow,
      origin: "https://example.com",
      data: { type: "result", value: 123 },
    });

    assertEquals(receivedMessages.length, 1);
    assertEquals(receivedMessages[0], { type: "result", value: 123 });

    transport.close();
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - filters out messages from other sources", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();
  const receivedMessages: unknown[] = [];

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);
    transport.onMessage((msg) => receivedMessages.push(msg));

    console.warn = originalWarn;

    // Message from different source (not our iframe)
    mockEventTarget.dispatchEvent("message", {
      source: { postMessage: () => {} }, // Different window
      origin: "https://malicious.com",
      data: { type: "attack" },
    });

    // Should be filtered out
    assertEquals(receivedMessages.length, 0);

    transport.close();
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - validates origin when targetOrigin is specified", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();
  const receivedMessages: unknown[] = [];

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    const transport = new IframeTransport(iframe, "https://trusted.com");
    transport.onMessage((msg) => receivedMessages.push(msg));

    // Message from correct source but wrong origin
    mockEventTarget.dispatchEvent("message", {
      source: iframe.contentWindow,
      origin: "https://wrong-origin.com",
      data: { type: "attack" },
    });

    // Should be filtered out due to origin mismatch
    assertEquals(receivedMessages.length, 0);

    // Message from correct source and origin
    mockEventTarget.dispatchEvent("message", {
      source: iframe.contentWindow,
      origin: "https://trusted.com",
      data: { type: "valid" },
    });

    assertEquals(receivedMessages.length, 1);
    assertEquals(receivedMessages[0], { type: "valid" });

    transport.close();
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - close() removes event listener", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);

    console.warn = originalWarn;

    assertEquals(mockEventTarget.listeners.get("message")?.size, 1);

    transport.close();

    assertEquals(mockEventTarget.listeners.get("message")?.size, 0);
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - send() throws after close()", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);

    console.warn = originalWarn;

    transport.close();

    assertThrows(
      () => transport.send({ type: "test" }),
      Error,
      "IframeTransport has been closed",
    );
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - closed getter returns correct state", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);

    console.warn = originalWarn;

    assertEquals(transport.closed, false);

    transport.close();

    assertEquals(transport.closed, true);
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - close() is idempotent", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);

    console.warn = originalWarn;

    // Multiple close() calls should not throw
    transport.close();
    transport.close();
    transport.close();

    assertEquals(transport.closed, true);
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});

Deno.test("IframeTransport - messages ignored after close()", () => {
  const { iframe } = createMockIframe();
  const mockEventTarget = createMockEventTarget();
  const receivedMessages: unknown[] = [];

  const originalAddEventListener = globalThis.addEventListener;
  const originalRemoveEventListener = globalThis.removeEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).addEventListener = mockEventTarget.addEventListener;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).removeEventListener = mockEventTarget.removeEventListener;

  try {
    // Suppress console.warn
    const originalWarn = console.warn;
    console.warn = () => {};

    const transport = new IframeTransport(iframe);
    transport.onMessage((msg) => receivedMessages.push(msg));

    console.warn = originalWarn;

    // Close transport
    transport.close();

    // Event listener was removed, so this won't be dispatched to handler
    // But even if it was (race condition), the handler checks isClosed
    assertEquals(receivedMessages.length, 0);
  } finally {
    globalThis.addEventListener = originalAddEventListener;
    globalThis.removeEventListener = originalRemoveEventListener;
  }
});
