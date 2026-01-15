/**
 * Merge Capabilities Use Case Tests
 *
 * Tests for capability merging with validation and multi-tenant isolation.
 *
 * @module tests/unit/application/use-cases/admin/merge-capabilities_test
 */

import { assertEquals } from "@std/assert";
import { MergeCapabilitiesUseCase } from "../../../../../src/application/use-cases/admin/merge-capabilities.ts";

// Mock CapabilityRegistry with separate source/target resolution
function createMockRegistry(
  sourceRecord: unknown | null = null,
  targetRecord: unknown | null = null,
) {
  let callCount = 0;
  return {
    resolveByName: async (_name: string, _scope: unknown) => {
      callCount++;
      return callCount === 1 ? sourceRecord : targetRecord;
    },
    getById: async (id: string) => {
      if (id === "source-id") return sourceRecord;
      if (id === "target-id") return targetRecord;
      return null;
    },
  };
}

// Mock DbClient with transaction support
function createMockDb(capRows: unknown[] = []) {
  const execCalls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    query: async (_sql: string, _params: unknown[]) => capRows,
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        exec: async (sql: string, params: unknown[]) => {
          execCalls.push({ sql, params });
        },
      };
      await fn(tx);
    },
    getExecCalls: () => execCalls,
  };
}

Deno.test("MergeCapabilitiesUseCase", async (t) => {
  await t.step("returns error for missing source", async () => {
    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "",
      target: "target:cap",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "INVALID_REQUEST");
  });

  await t.step("returns error for missing target", async () => {
    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "source:cap",
      target: "",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "INVALID_REQUEST");
  });

  await t.step("returns error for self-merge", async () => {
    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "same:cap",
      target: "same:cap",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "SELF_MERGE");
  });

  await t.step("returns error when source not found", async () => {
    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(null, { id: "target" }) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "nonexistent:source",
      target: "existing:target",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "SOURCE_NOT_FOUND");
  });

  await t.step("returns error when target not found", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "p1",
      createdAt: new Date(),
    };

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, null) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "nonexistent:target",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "TARGET_NOT_FOUND");
  });

  await t.step("returns error when tools_used mismatch", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "p1",
      createdAt: new Date(),
      totalLatencyMs: 1000,
    };

    const targetRecord = {
      id: "target-id",
      org: "test",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: null,
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date(),
      totalLatencyMs: 500,
    };

    // Simulates different tools_used
    const capRows = [
      { tools_used: ["std:http", "std:json"], code_snippet: "code1", updated_at: null },
      { tools_used: ["std:fs"], code_snippet: "code2", updated_at: null }, // Different!
    ];

    let queryCount = 0;
    const db = {
      query: async () => {
        return [capRows[queryCount++ % 2]];
      },
      transaction: async () => {},
    };

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "TOOLS_MISMATCH");
  });

  await t.step("denies merge for other user's source capability", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "other",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: "other-user", // Different owner
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "p1",
      createdAt: new Date(),
    };

    const targetRecord = {
      id: "target-id",
      org: "test",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: "my-user",
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date(),
    };

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: "my-user", // Trying to merge someone else's cap
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "SOURCE_NOT_FOUND");
  });

  await t.step("denies merge for other user's target capability", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: "my-user",
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "p1",
      createdAt: new Date(),
    };

    const targetRecord = {
      id: "target-id",
      org: "other",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: "other-user", // Different owner
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date(),
    };

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: "my-user",
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "TARGET_NOT_FOUND");
  });

  await t.step("successfully merges capabilities with same tools", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "p1",
      createdAt: new Date("2024-01-01"),
      totalLatencyMs: 1000,
    };

    const targetRecord = {
      id: "target-id",
      org: "test",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: null,
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date("2024-06-01"),
      totalLatencyMs: 500,
    };

    // Both have same tools
    const capRows = [
      { tools_used: ["std:http"], code_snippet: "source_code", updated_at: new Date("2024-06-15") },
    ];

    const db = createMockDb(capRows);

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.targetId, "target-id");
    assertEquals(result.data?.deletedSourceId, "source-id");
    assertEquals(result.data?.mergedStats.usageCount, 15); // 10 + 5
    assertEquals(result.data?.mergedStats.successCount, 13); // 8 + 5
    assertEquals(result.data?.mergedStats.totalLatencyMs, 1500); // 1000 + 500
  });

  await t.step("uses source code when preferSourceCode is true", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 10,
      successCount: 10,
      workflowPatternId: "p1",
      createdAt: new Date("2024-01-01"),
      totalLatencyMs: 100,
    };

    const targetRecord = {
      id: "target-id",
      org: "test",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: null,
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date("2024-06-01"),
      totalLatencyMs: 50,
    };

    const db = createMockDb([
      { tools_used: ["std:http"], code_snippet: "old_source_code", updated_at: new Date("2024-01-01") },
    ]);

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: null,
      preferSourceCode: true,
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.codeSource, "source");
  });

  await t.step("calls onMergedCallback when provided", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "test",
      project: "default",
      namespace: "src",
      action: "action",
      hash: "abc",
      userId: null,
      usageCount: 10,
      successCount: 10,
      workflowPatternId: "p1",
      createdAt: new Date(),
      totalLatencyMs: 100,
    };

    const targetRecord = {
      id: "target-id",
      org: "test",
      project: "default",
      namespace: "tgt",
      action: "action",
      hash: "def",
      userId: null,
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "p2",
      createdAt: new Date(),
      totalLatencyMs: 50,
    };

    const db = createMockDb([
      { tools_used: ["std:http"], code_snippet: "code", updated_at: null },
    ]);

    let callbackCalled = false;
    let callbackResult: unknown = null;

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: db as never,
      onMergedCallback: (result) => {
        callbackCalled = true;
        callbackResult = result;
      },
    });

    await useCase.execute({
      source: "src:action",
      target: "tgt:action",
      scope: { org: "test", project: "default" },
      userId: null,
    });

    assertEquals(callbackCalled, true);
    assertEquals((callbackResult as Record<string, unknown>).deletedSourceId, "source-id");
  });

  await t.step("allows merge for legacy capabilities (null userId)", async () => {
    const sourceRecord = {
      id: "source-id",
      org: "local",
      project: "default",
      namespace: "legacy",
      action: "old",
      hash: "abc",
      userId: null, // Legacy
      usageCount: 100,
      successCount: 90,
      workflowPatternId: "p1",
      createdAt: new Date("2023-01-01"),
      totalLatencyMs: 5000,
    };

    const targetRecord = {
      id: "target-id",
      org: "local",
      project: "default",
      namespace: "legacy",
      action: "new",
      hash: "def",
      userId: null, // Legacy
      usageCount: 50,
      successCount: 50,
      workflowPatternId: "p2",
      createdAt: new Date("2024-01-01"),
      totalLatencyMs: 2000,
    };

    const db = createMockDb([
      { tools_used: [], code_snippet: "code", updated_at: null },
    ]);

    const useCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: createMockRegistry(sourceRecord, targetRecord) as never,
      db: db as never,
    });

    const result = await useCase.execute({
      source: "legacy:old",
      target: "legacy:new",
      scope: { org: "local", project: "default" },
      userId: "any-user", // Any user can merge legacy caps
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.mergedStats.usageCount, 150);
  });
});
