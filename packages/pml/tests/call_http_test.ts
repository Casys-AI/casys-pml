/**
 * Tests for HTTP Client-Side Execution
 *
 * Tests resolveEnvHeaders() from env-loader.ts
 * and the HTTP dep callHttp() integration pattern.
 *
 * @module tests/call_http_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import { resolveEnvHeaders } from "../src/byok/env-loader.ts";

// ============================================================================
// resolveEnvHeaders Tests
// ============================================================================

Deno.test("resolveEnvHeaders: resolves env var reference", () => {
  const original = Deno.env.get("TEST_API_KEY_RH");
  try {
    Deno.env.set("TEST_API_KEY_RH", "my-secret-key");

    const resolved = resolveEnvHeaders({
      "Authorization": "Bearer ${TEST_API_KEY_RH}",
    });

    assertEquals(resolved["Authorization"], "Bearer my-secret-key");
  } finally {
    if (original) {
      Deno.env.set("TEST_API_KEY_RH", original);
    } else {
      Deno.env.delete("TEST_API_KEY_RH");
    }
  }
});

Deno.test("resolveEnvHeaders: passes through static headers", () => {
  const resolved = resolveEnvHeaders({
    "Content-Type": "application/json",
    "X-Custom": "static-value",
  });

  assertEquals(resolved["Content-Type"], "application/json");
  assertEquals(resolved["X-Custom"], "static-value");
});

Deno.test("resolveEnvHeaders: resolves multiple vars in one header", () => {
  const origA = Deno.env.get("TEST_USER_RH");
  const origB = Deno.env.get("TEST_PASS_RH");
  try {
    Deno.env.set("TEST_USER_RH", "admin");
    Deno.env.set("TEST_PASS_RH", "secret");

    const resolved = resolveEnvHeaders({
      "Authorization": "Basic ${TEST_USER_RH}:${TEST_PASS_RH}",
    });

    assertEquals(resolved["Authorization"], "Basic admin:secret");
  } finally {
    if (origA) Deno.env.set("TEST_USER_RH", origA);
    else Deno.env.delete("TEST_USER_RH");
    if (origB) Deno.env.set("TEST_PASS_RH", origB);
    else Deno.env.delete("TEST_PASS_RH");
  }
});

Deno.test("resolveEnvHeaders: throws on missing env var", () => {
  Deno.env.delete("NONEXISTENT_VAR_12345");

  assertThrows(
    () =>
      resolveEnvHeaders({
        "Authorization": "Bearer ${NONEXISTENT_VAR_12345}",
      }),
    Error,
    "Missing env var NONEXISTENT_VAR_12345",
  );
});

Deno.test("resolveEnvHeaders: empty headers returns empty", () => {
  const resolved = resolveEnvHeaders({});
  assertEquals(Object.keys(resolved).length, 0);
});

Deno.test("resolveEnvHeaders: multiple headers with mixed static and dynamic", () => {
  const orig = Deno.env.get("TEST_TOKEN_RH");
  try {
    Deno.env.set("TEST_TOKEN_RH", "tok_abc123");

    const resolved = resolveEnvHeaders({
      "Authorization": "Bearer ${TEST_TOKEN_RH}",
      "Content-Type": "application/json",
      "X-Request-Id": "static-id",
    });

    assertEquals(resolved["Authorization"], "Bearer tok_abc123");
    assertEquals(resolved["Content-Type"], "application/json");
    assertEquals(resolved["X-Request-Id"], "static-id");
    assertEquals(Object.keys(resolved).length, 3);
  } finally {
    if (orig) Deno.env.set("TEST_TOKEN_RH", orig);
    else Deno.env.delete("TEST_TOKEN_RH");
  }
});

// ============================================================================
// callHttp integration pattern tests (via fetch mock)
// ============================================================================

Deno.test("callHttp pattern: POST with correct body shape", async () => {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedInit = init;
      return Promise.resolve(
        new Response(
          JSON.stringify({ result: { data: "test-result" } }),
          { status: 200 },
        ),
      );
    };

    // Simulate what callHttp does
    const httpUrl = "https://api.example.com/mcp";
    const namespace = "tavily";
    const action = "search";
    const args = { query: "test query" };

    const response = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: `${namespace}:${action}`,
        params: args,
      }),
    });

    const data = await response.json();

    assertEquals(capturedUrl, "https://api.example.com/mcp");
    assertEquals(capturedInit?.method, "POST");
    assertEquals(data.result.data, "test-result");

    // Verify body shape
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.method, "tavily:search");
    assertEquals(body.params.query, "test query");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp pattern: resolved headers are merged with Content-Type", async () => {
  const originalFetch = globalThis.fetch;
  const orig = Deno.env.get("TEST_TAVILY_KEY_CH");

  try {
    Deno.env.set("TEST_TAVILY_KEY_CH", "tvly-test123");

    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedHeaders = Object.fromEntries(
        Object.entries(init?.headers ?? {}),
      );
      return Promise.resolve(
        new Response(JSON.stringify({ result: {} }), { status: 200 }),
      );
    };

    // Simulate callHttp header resolution
    const depHeaders = { "Authorization": "Bearer ${TEST_TAVILY_KEY_CH}" };
    const resolvedHeaders = resolveEnvHeaders(depHeaders);

    await fetch("https://api.example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...resolvedHeaders },
      body: "{}",
    });

    assertEquals(capturedHeaders["Content-Type"], "application/json");
    assertEquals(capturedHeaders["Authorization"], "Bearer tvly-test123");
  } finally {
    globalThis.fetch = originalFetch;
    if (orig) Deno.env.set("TEST_TAVILY_KEY_CH", orig);
    else Deno.env.delete("TEST_TAVILY_KEY_CH");
  }
});

Deno.test("callHttp pattern: HTTP error response handling", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );
    };

    const response = await fetch("https://api.example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    // callHttp would throw LoaderError here
    assertEquals(response.ok, false);
    assertEquals(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp pattern: RPC error in response body", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: -32601, message: "Method not found" },
          }),
          { status: 200 },
        ),
      );
    };

    const response = await fetch("https://api.example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const data = await response.json();

    // callHttp checks data.error and throws
    assertEquals(data.error.code, -32601);
    assertEquals(data.error.message, "Method not found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
