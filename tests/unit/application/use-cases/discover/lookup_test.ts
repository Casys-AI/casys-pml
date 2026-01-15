/**
 * Lookup Use Case Tests
 *
 * Tests for unified capability and tool lookup by exact name.
 *
 * @module tests/unit/application/use-cases/discover/lookup_test
 */

import { assertEquals } from "@std/assert";
import { LookupUseCase } from "../../../../../src/application/use-cases/discover/lookup.ts";

// Mock CapabilityRegistry
function createMockRegistry(record: unknown | null = null) {
  return {
    resolveByName: async (_name: string, _scope: unknown) => record,
    getById: async (_id: string) => record,
  };
}

// Mock ToolRepository
function createMockToolRepo(tool: unknown | null = null) {
  return {
    findById: async (_id: string) => tool,
  };
}

// Mock DbClient
function createMockDb(patternRows: unknown[] = []) {
  return {
    query: async (_sql: string, _params: unknown[]) => patternRows,
  };
}

Deno.test("LookupUseCase", async (t) => {
  await t.step("returns error for missing name", async () => {
    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry() as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_NAME");
  });

  await t.step("returns error for whitespace-only name", async () => {
    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry() as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "   ",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_NAME");
  });

  await t.step("returns capability when found by name", async () => {
    const mockRecord = {
      id: "cap-uuid-1",
      org: "alice",
      project: "default",
      namespace: "auth",
      action: "login",
      hash: "abc123",
      visibility: "private",
      usageCount: 10,
      successCount: 8,
      workflowPatternId: "pattern-1",
    };

    const patternRows = [{ description: "Login capability", tools_used: ["std:http"] }];

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb(patternRows) as never,
    });

    const result = await useCase.execute({
      name: "auth:login",
      scope: { org: "alice", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");
    assertEquals(result.data?.name, "auth:login");
    assertEquals(result.data?.usageCount, 10);
  });

  await t.step("returns tool when capability not found", async () => {
    const mockTool = {
      toolId: "filesystem:read_file",
      serverId: "filesystem",
      description: "Read file contents",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    };

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(null) as never,
      toolRepository: createMockToolRepo(mockTool) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "filesystem:read_file",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "tool");
    assertEquals(result.data?.name, "filesystem:read_file");
    assertEquals(result.data?.serverId, "filesystem");
  });

  await t.step("returns NOT_FOUND when neither capability nor tool exists", async () => {
    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(null) as never,
      toolRepository: createMockToolRepo(null) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "nonexistent:thing",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("filters out capabilities not in scope and not public", async () => {
    const mockRecord = {
      id: "cap-uuid-1",
      org: "other-org",
      project: "other-project",
      namespace: "secret",
      action: "action",
      hash: "abc",
      visibility: "private", // Not public
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "pattern-1",
    };

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      toolRepository: createMockToolRepo(null) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "secret:action",
      scope: { org: "alice", project: "default" }, // Different scope
    });

    // Should return NOT_FOUND because capability is not in scope and not public
    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("allows access to public capabilities from other orgs", async () => {
    const mockRecord = {
      id: "cap-uuid-1",
      org: "other-org",
      project: "other-project",
      namespace: "public",
      action: "action",
      hash: "abc",
      visibility: "public", // Public!
      usageCount: 5,
      successCount: 5,
      workflowPatternId: "pattern-1",
    };

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      toolRepository: createMockToolRepo(null) as never,
      db: createMockDb([{ description: "Public cap", tools_used: null }]) as never,
    });

    const result = await useCase.execute({
      name: "public:action",
      scope: { org: "alice", project: "default" }, // Different scope
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");
  });

  await t.step("calculates success rate correctly", async () => {
    const mockRecord = {
      id: "cap-uuid-1",
      org: "test",
      project: "default",
      namespace: "test",
      action: "action",
      hash: "abc",
      visibility: "private",
      usageCount: 100,
      successCount: 75,
      workflowPatternId: "pattern-1",
    };

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      toolRepository: createMockToolRepo(null) as never,
      db: createMockDb([{ description: null, tools_used: null }]) as never,
    });

    const result = await useCase.execute({
      name: "test:action",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.successRate, 0.75);
  });

  await t.step("handles zero usage count without division error", async () => {
    const mockRecord = {
      id: "cap-uuid-1",
      org: "test",
      project: "default",
      namespace: "test",
      action: "action",
      hash: "abc",
      visibility: "private",
      usageCount: 0,
      successCount: 0,
      workflowPatternId: null,
    };

    const useCase = new LookupUseCase({
      capabilityRegistry: createMockRegistry(mockRecord) as never,
      toolRepository: createMockToolRepo(null) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      name: "test:action",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.successRate, 0);
  });
});
