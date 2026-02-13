/**
 * Tests for Exposed Capability Handler
 *
 * Tests execution routing for --expose flag: findExposedCapability(),
 * handleExposedCall()
 *
 * @module tests/exposed_handler_test
 */

import { assertEquals } from "@std/assert";
import {
  findExposedCapability,
  handleExposedCall,
  type ExposedCallContext,
} from "../src/cli/shared/exposed-handler.ts";
import type { ExposedCapability } from "../src/cli/shared/capability-resolver.ts";
import { PendingWorkflowStore } from "../src/workflow/mod.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_CAPS: ExposedCapability[] = [
  {
    name: "weather_forecast",
    fqdn: "alice.default.weather.forecast.abc1",
    description: "Get weather forecast",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
    },
  },
  {
    name: "file_convert",
    fqdn: "bob.default.file.convert.def2",
    description: "Convert file format",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, format: { type: "string" } },
    },
  },
];

const SILENT_LOGGER = {
  debug: (_msg: string) => {},
};

// ============================================================================
// findExposedCapability Tests
// ============================================================================

Deno.test("findExposedCapability: finds matching capability", () => {
  const cap = findExposedCapability("weather_forecast", SAMPLE_CAPS);
  assertEquals(cap?.name, "weather_forecast");
  assertEquals(cap?.fqdn, "alice.default.weather.forecast.abc1");
});

Deno.test("findExposedCapability: returns undefined for no match", () => {
  const cap = findExposedCapability("nonexistent_tool", SAMPLE_CAPS);
  assertEquals(cap, undefined);
});

Deno.test("findExposedCapability: returns undefined for empty array", () => {
  const cap = findExposedCapability("any_tool", []);
  assertEquals(cap, undefined);
});

Deno.test("findExposedCapability: matches exact name only", () => {
  const cap = findExposedCapability("weather", SAMPLE_CAPS);
  assertEquals(cap, undefined);
});

// ============================================================================
// handleExposedCall Tests (with fetch mocking)
// ============================================================================

Deno.test("handleExposedCall: returns handled=false for non-exposed tool", async () => {
  const ctx: ExposedCallContext = {
    id: 1,
    args: {},
    exposedCapabilities: SAMPLE_CAPS,
    loader: null,
    cloudUrl: "https://pml.casys.ai",
    sessionClient: null,
    pendingWorkflowStore: new PendingWorkflowStore(),
    logger: SILENT_LOGGER,
  };

  const result = await handleExposedCall("discover", ctx);
  assertEquals(result.handled, false);
});

Deno.test("handleExposedCall: returns handled=false for unknown tool", async () => {
  const ctx: ExposedCallContext = {
    id: 1,
    args: {},
    exposedCapabilities: SAMPLE_CAPS,
    loader: null,
    cloudUrl: "https://pml.casys.ai",
    sessionClient: null,
    pendingWorkflowStore: new PendingWorkflowStore(),
    logger: SILENT_LOGGER,
  };

  const result = await handleExposedCall("totally_unknown", ctx);
  assertEquals(result.handled, false);
});

Deno.test("handleExposedCall: routes exposed tool via forwardToCloud", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      // Return a cloud response (non-execute_locally, just a simple result)
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({ status: "ok", data: "sunny, 22C" }),
            }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const ctx: ExposedCallContext = {
      id: 1,
      args: { city: "Paris" },
      exposedCapabilities: SAMPLE_CAPS,
      loader: null,
      cloudUrl: "https://pml.casys.ai",
      sessionClient: null,
      pendingWorkflowStore: new PendingWorkflowStore(),
      logger: SILENT_LOGGER,
    };

    const result = await handleExposedCall("weather_forecast", ctx);

    assertEquals(result.handled, true);
    assertEquals(result.response?.jsonrpc, "2.0");
    assertEquals(result.response?.id, 1);

    // Verify the cloud was called with execute + capabilityFqdn
    assertEquals(capturedBody?.method, "tools/call");
    const params = capturedBody?.params as Record<string, unknown>;
    assertEquals(params?.name, "execute");
    const args = params?.arguments as Record<string, unknown>;
    assertEquals(args?.capabilityFqdn, "alice.default.weather.forecast.abc1");
    assertEquals((args?.args as Record<string, unknown>)?.city, "Paris");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("handleExposedCall: handles cloud error", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(new Response("error", { status: 503, statusText: "Service Unavailable" }));
    };

    const ctx: ExposedCallContext = {
      id: 42,
      args: { city: "Paris" },
      exposedCapabilities: SAMPLE_CAPS,
      loader: null,
      cloudUrl: "https://pml.casys.ai",
      sessionClient: null,
      pendingWorkflowStore: new PendingWorkflowStore(),
      logger: SILENT_LOGGER,
    };

    const result = await handleExposedCall("weather_forecast", ctx);

    assertEquals(result.handled, true);
    assertEquals(result.response?.id, 42);
    assertEquals(result.response?.error?.code, -32603);
    assertEquals(typeof result.response?.error?.message, "string");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test({
  name: "handleExposedCall: handles execute_locally response",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      // Simulate execute_locally response from cloud
      const execLocallyResponse = {
        status: "execute_locally",
        code: "const result = await mcp.std.test_tool({ a: 1 }); return result;",
        client_tools: ["std:test_tool"],
        tools_used: [{ id: "std:test_tool", fqdn: "pml.mcp.std.test_tool.1234" }],
        workflowId: "wf-test-123",
      };

      return Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify(execLocallyResponse),
              }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    };

    const ctx: ExposedCallContext = {
      id: 1,
      args: { city: "Paris" },
      exposedCapabilities: SAMPLE_CAPS,
      loader: null, // Will cause executeLocalCode to fail gracefully
      cloudUrl: "https://pml.casys.ai",
      sessionClient: null,
      pendingWorkflowStore: new PendingWorkflowStore(),
      logger: SILENT_LOGGER,
    };

    const result = await handleExposedCall("weather_forecast", ctx);

    // Should be handled (even if local execution fails due to null loader)
    assertEquals(result.handled, true);
    assertEquals(result.response?.jsonrpc, "2.0");
    assertEquals(result.response?.id, 1);
    // The result should exist (either success or error from local execution)
    assertEquals(result.response?.result !== undefined || result.response?.error !== undefined, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
  },
});

Deno.test("handleExposedCall: passes args correctly when undefined", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    let capturedArgs: Record<string, unknown> = {};

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (init?.body) {
        const body = JSON.parse(init.body as string);
        const params = body.params as Record<string, unknown>;
        capturedArgs = (params?.arguments as Record<string, unknown>) ?? {};
      }
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "{}" }] },
        }),
        { status: 200 },
      );
    };

    const ctx: ExposedCallContext = {
      id: 1,
      args: undefined,
      exposedCapabilities: SAMPLE_CAPS,
      loader: null,
      cloudUrl: "https://pml.casys.ai",
      sessionClient: null,
      pendingWorkflowStore: new PendingWorkflowStore(),
      logger: SILENT_LOGGER,
    };

    await handleExposedCall("weather_forecast", ctx);

    // Should send empty object when args is undefined
    assertEquals(capturedArgs?.args, {});
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});
