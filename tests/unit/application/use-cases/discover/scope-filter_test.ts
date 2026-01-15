/**
 * Scope Filter Helper Tests
 *
 * Tests for multi-tenant scope filtering of capability IDs.
 *
 * @module tests/unit/application/use-cases/discover/scope-filter_test
 */

import { assertEquals } from "@std/assert";
import {
  filterCapabilityIdsByScope,
  filterCapabilityRecordIdsByScope,
  canUserMutateCapability,
} from "../../../../../src/application/use-cases/discover/scope-filter.ts";

// Mock DbClient
function createMockDb(queryResponses: Map<string, unknown[]>) {
  return {
    query: async (sql: string, _params: unknown[]) => {
      // Match based on query pattern
      if (sql.includes("workflow_pattern wp")) {
        return queryResponses.get("filterByPatternId") ?? [];
      }
      if (sql.includes("FROM capability_records") && sql.includes("visibility")) {
        return queryResponses.get("filterByRecordId") ?? [];
      }
      if (sql.includes("SELECT org FROM capability_records")) {
        return queryResponses.get("checkLocalOrg") ?? [];
      }
      if (sql.includes("SELECT user_id FROM capability_records")) {
        return queryResponses.get("checkUserId") ?? [];
      }
      return [];
    },
  };
}

Deno.test("filterCapabilityIdsByScope", async (t) => {
  await t.step("returns empty set for empty input", async () => {
    const db = createMockDb(new Map());
    const result = await filterCapabilityIdsByScope(db as never, [], { org: "test", project: "default" });
    assertEquals(result.size, 0);
  });

  await t.step("returns matching IDs in user scope", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("filterByPatternId", [
      { pattern_id: "uuid-1" },
      { pattern_id: "uuid-2" },
    ]);

    const db = createMockDb(responses);
    const result = await filterCapabilityIdsByScope(
      db as never,
      ["uuid-1", "uuid-2", "uuid-3"],
      { org: "alice", project: "default" },
    );

    assertEquals(result.size, 2);
    assertEquals(result.has("uuid-1"), true);
    assertEquals(result.has("uuid-2"), true);
    assertEquals(result.has("uuid-3"), false);
  });

  await t.step("includes public capabilities from other orgs", async () => {
    const responses = new Map<string, unknown[]>();
    // Simulates: uuid-1 is in scope, uuid-2 is public from another org
    responses.set("filterByPatternId", [
      { pattern_id: "uuid-1" },
      { pattern_id: "uuid-2" },
    ]);

    const db = createMockDb(responses);
    const result = await filterCapabilityIdsByScope(
      db as never,
      ["uuid-1", "uuid-2"],
      { org: "alice", project: "default" },
    );

    assertEquals(result.size, 2);
  });
});

Deno.test("filterCapabilityRecordIdsByScope", async (t) => {
  await t.step("returns empty set for empty input", async () => {
    const db = createMockDb(new Map());
    const result = await filterCapabilityRecordIdsByScope(db as never, [], { org: "test", project: "default" });
    assertEquals(result.size, 0);
  });

  await t.step("filters capability record IDs by scope", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("filterByRecordId", [{ id: "rec-1" }, { id: "rec-3" }]);

    const db = createMockDb(responses);
    const result = await filterCapabilityRecordIdsByScope(
      db as never,
      ["rec-1", "rec-2", "rec-3"],
      { org: "bob", project: "proj1" },
    );

    assertEquals(result.size, 2);
    assertEquals(result.has("rec-1"), true);
    assertEquals(result.has("rec-3"), true);
  });
});

Deno.test("canUserMutateCapability", async (t) => {
  await t.step("allows mutation in local mode for local org", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkLocalOrg", [{ org: "local" }]);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "cap-id", null);

    assertEquals(result, true);
  });

  await t.step("denies mutation in local mode for non-local org", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkLocalOrg", [{ org: "alice" }]);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "cap-id", null);

    assertEquals(result, false);
  });

  await t.step("allows mutation when user owns capability", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkUserId", [{ user_id: "user-123" }]);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "cap-id", "user-123");

    assertEquals(result, true);
  });

  await t.step("allows mutation for legacy records (null user_id)", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkUserId", [{ user_id: null }]);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "cap-id", "any-user");

    assertEquals(result, true);
  });

  await t.step("denies mutation for other user's capability", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkUserId", [{ user_id: "owner-456" }]);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "cap-id", "user-123");

    assertEquals(result, false);
  });

  await t.step("denies mutation when capability not found", async () => {
    const responses = new Map<string, unknown[]>();
    responses.set("checkUserId", []);

    const db = createMockDb(responses);
    const result = await canUserMutateCapability(db as never, "nonexistent", "user-123");

    assertEquals(result, false);
  });
});
