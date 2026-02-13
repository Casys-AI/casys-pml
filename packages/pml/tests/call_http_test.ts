/**
 * Tests for HTTP Client-Side Execution
 *
 * Tests resolveEnvHeaders() from env-loader.ts
 * and callHttp() from loader/call-http.ts
 *
 * @module tests/call_http_test
 */

import { assertEquals, assertThrows, assertRejects } from "@std/assert";
import { resolveEnvHeaders } from "../src/byok/env-loader.ts";
import { callHttp } from "../src/loader/call-http.ts";

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
// callHttp Tests (direct function, fetch mocked)
// ============================================================================

Deno.test("callHttp: sends POST with correct body shape", async () => {
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

    const result = await callHttp(
      "https://api.example.com/mcp",
      "tavily",
      "search",
      { query: "test query" },
    );

    assertEquals(capturedUrl, "https://api.example.com/mcp");
    assertEquals(capturedInit?.method, "POST");
    assertEquals(result, { data: "test-result" });

    // Verify body shape
    const body = JSON.parse(capturedInit?.body as string);
    assertEquals(body.method, "tavily:search");
    assertEquals(body.params.query, "test query");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp: merges resolved env headers with Content-Type", async () => {
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

    await callHttp(
      "https://api.example.com/mcp",
      "tavily",
      "search",
      {},
      { "Authorization": "Bearer ${TEST_TAVILY_KEY_CH}" },
    );

    assertEquals(capturedHeaders["Content-Type"], "application/json");
    assertEquals(capturedHeaders["Authorization"], "Bearer tvly-test123");
  } finally {
    globalThis.fetch = originalFetch;
    if (orig) Deno.env.set("TEST_TAVILY_KEY_CH", orig);
    else Deno.env.delete("TEST_TAVILY_KEY_CH");
  }
});

Deno.test("callHttp: throws LoaderError on HTTP error", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );
    };

    await assertRejects(
      () => callHttp("https://api.example.com/mcp", "tavily", "search", {}),
      Error,
      "HTTP dep tavily returned 404",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp: throws LoaderError on RPC error in response body", async () => {
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

    await assertRejects(
      () => callHttp("https://api.example.com/mcp", "tavily", "search", {}),
      Error,
      "RPC error: Method not found",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp: returns result field from response", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ result: { content: [{ type: "text", text: "hello" }] } }),
          { status: 200 },
        ),
      );
    };

    const result = await callHttp("https://api.example.com/mcp", "ns", "act", {});
    assertEquals(result, { content: [{ type: "text", text: "hello" }] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("callHttp: throws on missing env var in headers", async () => {
  Deno.env.delete("NONEXISTENT_HTTP_KEY_999");

  await assertRejects(
    () => callHttp(
      "https://api.example.com/mcp",
      "ns",
      "act",
      {},
      { "Authorization": "Bearer ${NONEXISTENT_HTTP_KEY_999}" },
    ),
    Error,
    "Missing env var NONEXISTENT_HTTP_KEY_999",
  );
});
