/**
 * Tests for Capability Resolver
 *
 * Tests --expose flag capability resolution: sanitizeToolName(),
 * resolveExposedCapabilities(), buildExposedToolDefinitions()
 *
 * @module tests/capability_resolver_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import {
  sanitizeToolName,
  resolveExposedCapabilities,
  buildExposedToolDefinitions,
  type ExposedCapability,
} from "../src/cli/shared/capability-resolver.ts";

// ============================================================================
// sanitizeToolName Tests
// ============================================================================

Deno.test("sanitizeToolName: colon to underscore", () => {
  assertEquals(sanitizeToolName("weather:forecast"), "weather_forecast");
});

Deno.test("sanitizeToolName: dash to underscore", () => {
  assertEquals(sanitizeToolName("my-tool"), "my_tool");
});

Deno.test("sanitizeToolName: dot to underscore", () => {
  assertEquals(sanitizeToolName("file.convert"), "file_convert");
});

Deno.test("sanitizeToolName: multiple special chars", () => {
  assertEquals(sanitizeToolName("ns:my-action.v2"), "ns_my_action_v2");
});

Deno.test("sanitizeToolName: already clean name passes through", () => {
  assertEquals(sanitizeToolName("weather_forecast"), "weather_forecast");
});

Deno.test("sanitizeToolName: alphanumeric preserved", () => {
  assertEquals(sanitizeToolName("tool123"), "tool123");
});

Deno.test("sanitizeToolName: empty string returns empty", () => {
  assertEquals(sanitizeToolName(""), "");
});

Deno.test("sanitizeToolName: spaces to underscore", () => {
  assertEquals(sanitizeToolName("my tool"), "my_tool");
});

// ============================================================================
// buildExposedToolDefinitions Tests
// ============================================================================

Deno.test("buildExposedToolDefinitions: builds correct MCP tool format", () => {
  const caps: ExposedCapability[] = [
    {
      name: "weather_forecast",
      fqdn: "alice.default.weather.forecast.abc1",
      description: "Get weather forecast",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string" },
        },
        required: ["city"],
      },
    },
  ];

  const tools = buildExposedToolDefinitions(caps);

  assertEquals(tools.length, 1);
  assertEquals(tools[0].name, "weather_forecast");
  assertEquals(tools[0].description, "Get weather forecast");
  assertEquals(tools[0].inputSchema.type, "object");
  assertEquals(
    (tools[0].inputSchema.properties as Record<string, unknown>)?.city,
    { type: "string" },
  );
});

Deno.test("buildExposedToolDefinitions: multiple capabilities", () => {
  const caps: ExposedCapability[] = [
    {
      name: "tool_a",
      fqdn: "a.b.c.d.1111",
      description: "Tool A",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "tool_b",
      fqdn: "e.f.g.h.2222",
      description: "Tool B",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  const tools = buildExposedToolDefinitions(caps);

  assertEquals(tools.length, 2);
  assertEquals(tools[0].name, "tool_a");
  assertEquals(tools[1].name, "tool_b");
});

Deno.test("buildExposedToolDefinitions: empty array returns empty", () => {
  const tools = buildExposedToolDefinitions([]);
  assertEquals(tools.length, 0);
});

// ============================================================================
// resolveExposedCapabilities Tests (with fetch mocking)
// ============================================================================

/**
 * Helper: create a mock cloud response for discover
 */
function mockDiscoverResponse(
  fqdn: string,
  description: string,
  parametersSchema?: Record<string, unknown>,
): Response {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "resolve-test",
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            fqdn,
            description,
            parametersSchema,
          }),
        },
      ],
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

Deno.test("resolveExposedCapabilities: resolves single capability", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        mockDiscoverResponse(
          "alice.default.weather.forecast.abc1",
          "Get weather",
          { type: "object", properties: { city: { type: "string" } } },
        ),
      );
    };

    const result = await resolveExposedCapabilities(
      ["weather:forecast"],
      "https://pml.casys.ai",
      null,
    );

    assertEquals(result.length, 1);
    assertEquals(result[0].name, "weather_forecast");
    assertEquals(result[0].fqdn, "alice.default.weather.forecast.abc1");
    assertEquals(result[0].description, "Get weather");
    assertEquals(result[0].inputSchema.type, "object");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: resolves multiple capabilities", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    let callCount = 0;
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      callCount++;
      const fqdn = callCount === 1
        ? "a.b.weather.forecast.1111"
        : "c.d.file.convert.2222";
      const desc = callCount === 1 ? "Weather" : "File convert";
      return Promise.resolve(mockDiscoverResponse(fqdn, desc));
    };

    const result = await resolveExposedCapabilities(
      ["weather:forecast", "file:convert"],
      "https://pml.casys.ai",
      null,
    );

    assertEquals(result.length, 2);
    assertEquals(result[0].name, "weather_forecast");
    assertEquals(result[1].name, "file_convert");
    assertEquals(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: detects name collisions", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    // Both "a:b" and "a-b" sanitize to "a_b" — collision!
    let callCount = 0;
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      callCount++;
      return Promise.resolve(
        mockDiscoverResponse(`org.proj.ns.action.${callCount}`, "Tool"),
      );
    };

    await assertRejects(
      () =>
        resolveExposedCapabilities(
          ["a:b", "a-b"],
          "https://pml.casys.ai",
          null,
        ),
      Error,
      "Tool name collision",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: fails on missing PML_API_KEY", async () => {
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.delete("PML_API_KEY");

    await assertRejects(
      () =>
        resolveExposedCapabilities(
          ["weather:forecast"],
          "https://pml.casys.ai",
          null,
        ),
      Error,
      "PML_API_KEY is required",
    );
  } finally {
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    }
  }
});

Deno.test("resolveExposedCapabilities: fails on cloud HTTP error", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(new Response("error", { status: 500, statusText: "Internal Server Error" }));
    };

    await assertRejects(
      () =>
        resolveExposedCapabilities(
          ["nonexistent:cap"],
          "https://pml.casys.ai",
          null,
        ),
      Error,
      "cloud returned 500",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: fails on empty content from cloud", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: "test", result: { content: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    };

    await assertRejects(
      () =>
        resolveExposedCapabilities(
          ["nonexistent:cap"],
          "https://pml.casys.ai",
          null,
        ),
      Error,
      "not found in registry",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: handles missing parametersSchema with default", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      // No parametersSchema in response
      return Promise.resolve(
        mockDiscoverResponse("a.b.c.d.1111", "Tool without schema"),
      );
    };

    const result = await resolveExposedCapabilities(
      ["simple:tool"],
      "https://pml.casys.ai",
      null,
    );

    assertEquals(result.length, 1);
    assertEquals(result[0].inputSchema, { type: "object", properties: {} });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});

Deno.test("resolveExposedCapabilities: fails on capability with no FQDN", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Deno.env.get("PML_API_KEY");

  try {
    Deno.env.set("PML_API_KEY", "test-key");

    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      // Response with empty fqdn
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: "test",
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({ description: "No FQDN" }),
          }],
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    };

    await assertRejects(
      () =>
        resolveExposedCapabilities(
          ["broken:cap"],
          "https://pml.casys.ai",
          null,
        ),
      Error,
      "has no FQDN",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      Deno.env.set("PML_API_KEY", originalEnv);
    } else {
      Deno.env.delete("PML_API_KEY");
    }
  }
});
