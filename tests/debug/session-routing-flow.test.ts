/**
 * Debug Test: Session → Routing Flow
 *
 * Tests the complete flow from session registration to isPackageClient check.
 * Run with: deno test -A tests/debug/session-routing-flow.test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { getSessionStore, resetSessionStore } from "../../src/mcp/sessions/mod.ts";
import { getToolRouting, resolveRouting, normalizeToolId } from "../../src/capabilities/routing-resolver.ts";

Deno.test({ name: "Session registration creates valid session", sanitizeOps: false, sanitizeResources: false }, () => {
  resetSessionStore();
  const store = getSessionStore();

  const response = store.register(
    {
      clientId: "test-client-" + crypto.randomUUID().slice(0, 8),
      version: "0.1.0",
      capabilities: {
        sandbox: true,
        clientTools: true,
        hybridRouting: true,
      },
    },
    "test-user-id",
  );

  assertExists(response.sessionId);
  assertEquals(response.features.hybridRouting, true);
  console.log(`✓ Session created: ${response.sessionId.slice(0, 8)}`);

  // Check isPackageClient
  const isPackage = store.isPackageClient(response.sessionId);
  assertEquals(isPackage, true, "Session should be recognized as package client");
  console.log(`✓ isPackageClient: ${isPackage}`);

  // Cleanup
  store.unregister(response.sessionId);
});

Deno.test({ name: "Singleton returns same instance", sanitizeOps: false, sanitizeResources: false }, () => {
  resetSessionStore();
  const store1 = getSessionStore();
  const store2 = getSessionStore();

  // Register in store1
  const response = store1.register(
    {
      clientId: "singleton-test",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-1",
  );

  // Check in store2
  const isPackage = store2.isPackageClient(response.sessionId);
  assertEquals(isPackage, true, "Should find session in second reference");
  console.log(`✓ Singleton works: both references see same session`);

  store1.unregister(response.sessionId);
});

Deno.test("Routing config for fetch:* is server", () => {
  const routing = getToolRouting("fetch:fetch");
  console.log(`fetch:fetch routing: ${routing}`);
  assertEquals(routing, "server", "fetch:fetch should be server-routed");
});

Deno.test("Routing config for filesystem:* is client", () => {
  const routing = getToolRouting("filesystem:read_file");
  console.log(`filesystem:read_file routing: ${routing}`);
  assertEquals(routing, "client", "filesystem:read_file should be client-routed");
});

Deno.test("resolveRouting with fetch:fetch returns server", () => {
  const routing = resolveRouting(["fetch:fetch"]);
  console.log(`resolveRouting(["fetch:fetch"]): ${routing}`);
  assertEquals(routing, "server", "fetch:fetch alone should be server");
});

Deno.test("resolveRouting with mixed tools returns client", () => {
  const routing = resolveRouting(["fetch:fetch", "filesystem:read_file"]);
  console.log(`resolveRouting(["fetch:fetch", "filesystem:read_file"]): ${routing}`);
  assertEquals(routing, "client", "Mixed client+server should be client");
});

Deno.test("normalizeToolId converts JS format to canonical format", () => {
  // mcp.server.action → server:action
  assertEquals(normalizeToolId("mcp.std.fetch_url"), "std:fetch_url");
  assertEquals(normalizeToolId("mcp.filesystem.read_file"), "filesystem:read_file");
  assertEquals(normalizeToolId("mcp.memory.create_entities"), "memory:create_entities");
  assertEquals(normalizeToolId("mcp.startup.fullProfile"), "startup:fullProfile");

  // mcp__server__action → server:action
  assertEquals(normalizeToolId("mcp__std__fetch_url"), "std:fetch_url");
  assertEquals(normalizeToolId("mcp__filesystem__read_file"), "filesystem:read_file");

  // Already canonical format → unchanged
  assertEquals(normalizeToolId("std:fetch_url"), "std:fetch_url");
  assertEquals(normalizeToolId("fetch:fetch"), "fetch:fetch");

  // FQDN format → unchanged
  assertEquals(normalizeToolId("alice.default.startup.fullProfile"), "alice.default.startup.fullProfile");

  console.log("✓ normalizeToolId works correctly for all formats");
});

Deno.test({ name: "Full simulation: register → check isPackageClient → route", sanitizeOps: false, sanitizeResources: false }, async () => {
  resetSessionStore();
  const store = getSessionStore();

  console.log("\n=== FULL FLOW SIMULATION ===\n");

  // Step 1: Register (like /pml/register endpoint)
  console.log("1. Registering session...");
  const sessionResponse = store.register(
    {
      clientId: "full-test-" + Date.now(),
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "test-user-uuid",
  );
  console.log(`   Session ID: ${sessionResponse.sessionId}`);
  console.log(`   Scope: ${JSON.stringify(sessionResponse.scope)}`);

  // Step 2: Simulate request arriving (like app.ts /mcp endpoint)
  console.log("\n2. Simulating /mcp request with X-PML-Session header...");
  const incomingSessionId = sessionResponse.sessionId; // This would come from header
  console.log(`   Incoming header X-PML-Session: ${incomingSessionId.slice(0, 8)}...`);

  // Step 3: Check isPackageClient (like app.ts line 289)
  const isPackageClient = store.isPackageClient(incomingSessionId);
  console.log(`   isPackageClient: ${isPackageClient}`);

  // Step 4: Determine routing for tools
  console.log("\n3. Checking routing for tools...");
  const toolsFromCode = ["mcp.fetch.fetch"]; // Tool from user's code (JS format) - fetch:* is server-routed
  const normalizedTools = toolsFromCode.map(normalizeToolId); // Normalize to canonical format
  const routing = resolveRouting(normalizedTools);
  console.log(`   Tools from code: ${toolsFromCode.join(", ")}`);
  console.log(`   Normalized: ${normalizedTools.join(", ")}`);
  console.log(`   Routing: ${routing}`);

  // Step 5: Decision
  console.log("\n4. Decision...");
  if (routing === "client") {
    if (isPackageClient) {
      console.log("   → Would return: execute_locally");
    } else {
      console.log("   → Would return: CLIENT_TOOLS_REQUIRE_PACKAGE ❌");
    }
  } else {
    console.log("   → Would execute on server ✓");
  }

  // Assertions
  assertEquals(isPackageClient, true, "Should be package client");
  assertEquals(routing, "server", "fetch:fetch should route to server after normalization");

  // Cleanup
  store.unregister(sessionResponse.sessionId);
  console.log("\n=== END ===\n");
});
