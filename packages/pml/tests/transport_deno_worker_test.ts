/**
 * DenoWorkerTransport Tests
 *
 * @module sandbox/transport/deno-worker-transport_test
 */

import { assertEquals } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { DenoWorkerTransport } from "../src/sandbox/transport/deno-worker-transport.ts";

Deno.test("DenoWorkerTransport - send() calls worker.postMessage", () => {
  const postMessageSpy = spy((_message: unknown) => {});

  const mockWorker = {
    postMessage: postMessageSpy,
    terminate: () => {},
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.send({ type: "test", data: 42 });

  assertSpyCalls(postMessageSpy, 1);
  assertEquals(postMessageSpy.calls[0].args[0], { type: "test", data: 42 });
});

Deno.test("DenoWorkerTransport - onMessage() registers handler and receives data", () => {
  let receivedMessage: unknown = null;

  const mockWorker = {
    postMessage: () => {},
    terminate: () => {},
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.onMessage((msg) => {
    receivedMessage = msg;
  });

  // Simulate message event
  const event = { data: { type: "result", value: 123 } } as MessageEvent;
  mockWorker.onmessage?.(event);

  assertEquals(receivedMessage, { type: "result", value: 123 });
});

Deno.test("DenoWorkerTransport - onError() registers handler and receives errors", () => {
  let receivedErrorMessage: string | null = null;

  const mockWorker = {
    postMessage: () => {},
    terminate: () => {},
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.onError((err) => {
    receivedErrorMessage = err.message;
  });

  // Simulate error event
  const event = { message: "Worker crashed" } as ErrorEvent;
  mockWorker.onerror?.(event);

  assertEquals(receivedErrorMessage, "Worker crashed");
});

Deno.test("DenoWorkerTransport - close() terminates worker", () => {
  const terminateSpy = spy(() => {});

  const mockWorker = {
    postMessage: () => {},
    terminate: terminateSpy,
    onmessage: null,
    onerror: null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.close();

  assertSpyCalls(terminateSpy, 1);
});

Deno.test("DenoWorkerTransport - multiple messages work correctly", () => {
  const messages: unknown[] = [];

  const mockWorker = {
    postMessage: () => {},
    terminate: () => {},
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.onMessage((msg) => {
    messages.push(msg);
  });

  // Simulate multiple messages
  mockWorker.onmessage?.({ data: { id: 1 } } as MessageEvent);
  mockWorker.onmessage?.({ data: { id: 2 } } as MessageEvent);
  mockWorker.onmessage?.({ data: { id: 3 } } as MessageEvent);

  assertEquals(messages.length, 3);
  assertEquals(messages[0], { id: 1 });
  assertEquals(messages[1], { id: 2 });
  assertEquals(messages[2], { id: 3 });
});
