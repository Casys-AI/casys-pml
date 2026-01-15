/**
 * Rename Capability Use Case Tests
 *
 * Tests for capability renaming with validation and multi-tenant isolation.
 *
 * @module tests/unit/application/use-cases/admin/rename-capability_test
 */

import { assertEquals } from "@std/assert";
import { RenameCapabilityUseCase } from "../../../../../src/application/use-cases/admin/rename-capability.ts";

// Mock CapabilityRegistry
function createMockRegistry(record: unknown | null = null) {
  return {
    resolveByName: async (_name: string, _scope: unknown) => record,
    getById: async (_id: string) => record,
  };
}

// Mock DbClient
function createMockDb(queryResults: unknown[] = []) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return queryResults;
    },
    getQueries: () => queries,
  };
}

// Mock embedding model
function createMockEmbedding() {
  return {
    encode: async (_text: string) => new Array(768).fill(0.1),
  };
}

Deno.test("RenameCapabilityUseCase", async (t) => {
  await t.step("returns error for missing target", async () => {
    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_TARGET");
  });

  await t.step("returns error for invalid namespace (uppercase)", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "test",
      project: "default",
      namespace: "old",
      action: "action",
      hash: "abc",
      usageCount: 0,
      successCount: 0,
    };

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "old:action",
      scope: { org: "test", project: "default" },
      userId: null,
      namespace: "UPPERCASE", // Invalid!
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "INVALID_NAMESPACE");
  });

  await t.step("returns error for namespace with underscore", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "test",
      project: "default",
      namespace: "old",
      action: "action",
      hash: "abc",
      usageCount: 0,
      successCount: 0,
    };

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "old:action",
      scope: { org: "test", project: "default" },
      userId: null,
      namespace: "with_underscore", // Invalid!
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "INVALID_NAMESPACE");
  });

  await t.step("returns error for invalid action (auto-generated name)", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "test",
      project: "default",
      namespace: "ns",
      action: "oldaction",
      hash: "abc",
      usageCount: 0,
      successCount: 0,
    };

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "ns:oldaction",
      scope: { org: "test", project: "default" },
      userId: null,
      actionName: "exec_abc123", // Auto-generated names not allowed
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "INVALID_ACTION");
  });

  await t.step("returns NOT_FOUND when capability does not exist", async () => {
    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(null) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "nonexistent:cap",
      scope: { org: "test", project: "default" },
      userId: null,
      namespace: "newns",
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("denies rename for other user's capability (multi-tenant)", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "owner-org",
      project: "default",
      namespace: "secret",
      action: "action",
      hash: "abc",
      userId: "owner-user-id", // Owned by someone else
      usageCount: 10,
      successCount: 10,
    };

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "secret:action",
      scope: { org: "owner-org", project: "default" },
      userId: "attacker-user-id", // Different user!
      namespace: "stolen",
    });

    // Returns NOT_FOUND to avoid information leakage
    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("allows rename for own capability", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "alice",
      project: "default",
      namespace: "old",
      action: "action",
      hash: "abc123",
      userId: "alice-user-id",
      usageCount: 5,
      successCount: 5,
      workflowPatternId: null,
    };

    const db = createMockDb();
    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      target: "old:action",
      scope: { org: "alice", project: "default" },
      userId: "alice-user-id", // Same user
      namespace: "newns",
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.displayName, "newns:action");
  });

  await t.step("allows rename for legacy capabilities (null userId)", async () => {
    const mockRecord = {
      id: "cap-legacy",
      org: "local",
      project: "default",
      namespace: "legacy",
      action: "action",
      hash: "abc",
      userId: null, // Legacy - no owner
      usageCount: 100,
      successCount: 90,
      workflowPatternId: null,
    };

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      target: "legacy:action",
      scope: { org: "local", project: "default" },
      userId: "any-user", // Any user can rename legacy caps
      namespace: "updated",
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.displayName, "updated:action");
  });

  await t.step("updates tags and visibility", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "test",
      project: "default",
      namespace: "test",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 0,
      successCount: 0,
      workflowPatternId: null,
    };

    const db = createMockDb();
    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      target: "test:action",
      scope: { org: "test", project: "default" },
      userId: null,
      tags: ["new", "tags"],
      visibility: "public",
    });

    assertEquals(result.success, true);

    // Verify UPDATE query was called with tags and visibility
    const queries = db.getQueries();
    const updateQuery = queries.find((q) => q.sql.includes("UPDATE capability_records"));
    assertEquals(updateQuery !== undefined, true);
  });

  await t.step("regenerates embedding when name or description changes", async () => {
    const mockRecord = {
      id: "cap-1",
      org: "test",
      project: "default",
      namespace: "old",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 0,
      successCount: 0,
      workflowPatternId: "pattern-1",
    };

    const db = createMockDb([{ description: "Old description" }]);
    const embedding = createMockEmbedding();

    const useCase = new RenameCapabilityUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      db: db as never,
      embeddingModel: embedding as never,
    });

    const result = await useCase.execute({
      target: "old:action",
      scope: { org: "test", project: "default" },
      userId: null,
      namespace: "newns",
    });

    assertEquals(result.success, true);

    // Verify embedding update query was called
    const queries = db.getQueries();
    const embeddingQuery = queries.find(
      (q) => q.sql.includes("intent_embedding") && q.sql.includes("UPDATE workflow_pattern"),
    );
    assertEquals(embeddingQuery !== undefined, true);
  });
});
