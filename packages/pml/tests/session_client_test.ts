/**
 * Session Client Unit Tests
 *
 * Tests for package-side session management.
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { SessionClient } from "../src/session/mod.ts";

Deno.test("SessionClient: getHeaders without registration", () => {
  const client = new SessionClient({
    cloudUrl: "https://test.example.com",
    apiKey: "test-api-key",
    version: "0.1.0",
  });

  // Not registered yet - should not be registered
  assertEquals(client.isRegistered, false);
  assertEquals(client.sessionId, null);
});

Deno.test("SessionClient: getHeaders includes api key", () => {
  const client = new SessionClient({
    cloudUrl: "https://test.example.com",
    apiKey: "my-secret-key",
    version: "0.1.0",
  });

  const headers = client.getHeaders();

  assertEquals(headers["Content-Type"], "application/json");
  assertEquals(headers["x-api-key"], "my-secret-key");
  // No session header before registration
  assertEquals(headers["X-PML-Session"], undefined);
});

Deno.test("SessionClient: initial state", () => {
  const client = new SessionClient({
    cloudUrl: "https://pml.casys.ai",
    apiKey: "api-key-123",
    version: "0.2.0",
    workspace: "/tmp/workspace",
  });

  assertEquals(client.isRegistered, false);
  assertEquals(client.sessionId, null);
});

// Integration test with mock server would require more setup
// These unit tests verify the client's state management

Deno.test("SessionClient: can be created with minimal options", () => {
  const client = new SessionClient({
    cloudUrl: "https://localhost:3003",
    apiKey: "key",
    version: "1.0.0",
  });

  assertExists(client);
  assertEquals(client.isRegistered, false);
});

console.log("\n🧪 Session Client Tests - Package Side\n");
