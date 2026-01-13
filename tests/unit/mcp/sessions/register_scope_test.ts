/**
 * TDD Tests for Register Response Scope
 *
 * Tests that /pml/register returns scope (org/project) for client FQDN generation.
 * Story: User FQDN Multi-Tenant
 *
 * @module tests/unit/mcp/sessions/register_scope_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  SessionStore,
  resetSessionStore,
} from "../../../../src/mcp/sessions/mod.ts";

// Setup and teardown
function setupSessionStore(): SessionStore {
  resetSessionStore();
  return new SessionStore();
}

// =============================================================================
// AC1: RegisterResponse includes scope
// =============================================================================

Deno.test("RegisterResponse: contains sessionId, expiresAt, heartbeatIntervalMs, features", () => {
  const store = setupSessionStore();

  const response = store.register(
    {
      clientId: "test-client-123",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-abc-123",
  );

  // Existing fields
  assertExists(response.sessionId);
  assertExists(response.expiresAt);
  assertExists(response.heartbeatIntervalMs);
  assertExists(response.features);
  assertEquals(response.features.hybridRouting, true);
  assertEquals(response.features.tracing, true);

  store.shutdown();
});

// =============================================================================
// AC2: Extended RegisterResponse with scope
// =============================================================================

Deno.test("RegisterResponse: includes scope with org and project", () => {
  const store = setupSessionStore();

  // Register with custom scope
  const response = store.register(
    {
      clientId: "test-client-123",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-abc-123",
    { org: "testuser", project: "default" },
  );

  // Verify scope field exists
  assertExists(response.scope);
  assertEquals(response.scope.org, "testuser");
  assertEquals(response.scope.project, "default");

  store.shutdown();
});

Deno.test("RegisterResponse: uses default scope when not provided", () => {
  const store = setupSessionStore();

  // Register without scope (should default to local.default)
  const response = store.register(
    {
      clientId: "test-client-456",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-xyz-789",
  );

  // Verify default scope
  assertExists(response.scope);
  assertEquals(response.scope.org, "local");
  assertEquals(response.scope.project, "default");

  store.shutdown();
});

// =============================================================================
// SessionStore Tests for User Context
// =============================================================================

Deno.test("SessionStore: stores userId from registration", () => {
  const store = setupSessionStore();

  const response = store.register(
    {
      clientId: "client-001",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-uuid-123",
  );

  // Verify session has userId
  const session = store.get(response.sessionId);
  assertExists(session);
  assertEquals(session.userId, "user-uuid-123");

  store.shutdown();
});

Deno.test("SessionStore: getByUser returns sessions for user", () => {
  const store = setupSessionStore();

  // Register two sessions for same user
  const response1 = store.register(
    { clientId: "client-001", version: "0.1.0", capabilities: { sandbox: true, clientTools: true, hybridRouting: true } },
    "user-a",
  );
  const response2 = store.register(
    { clientId: "client-002", version: "0.1.0", capabilities: { sandbox: true, clientTools: true, hybridRouting: true } },
    "user-a",
  );

  // Register one session for different user
  store.register(
    { clientId: "client-003", version: "0.1.0", capabilities: { sandbox: true, clientTools: true, hybridRouting: true } },
    "user-b",
  );

  // Verify getByUser
  const userASessions = store.getByUser("user-a");
  assertEquals(userASessions.length, 2);
  assertEquals(userASessions.map(s => s.sessionId).sort(), [response1.sessionId, response2.sessionId].sort());

  const userBSessions = store.getByUser("user-b");
  assertEquals(userBSessions.length, 1);

  store.shutdown();
});

Deno.test("SessionStore: verifyOwnership returns true for correct user", () => {
  const store = setupSessionStore();

  const response = store.register(
    { clientId: "client-001", version: "0.1.0", capabilities: { sandbox: true, clientTools: true, hybridRouting: true } },
    "user-a",
  );

  assertEquals(store.verifyOwnership(response.sessionId, "user-a"), true);
  assertEquals(store.verifyOwnership(response.sessionId, "user-b"), false);
  assertEquals(store.verifyOwnership("non-existent-session", "user-a"), false);

  store.shutdown();
});
