/**
 * Get Details Use Case Tests
 *
 * Tests for getting full capability/tool metadata (whois-style).
 *
 * @module tests/unit/application/use-cases/discover/get-details_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { GetDetailsUseCase } from "../../../../../src/application/use-cases/discover/get-details.ts";

// Mock CapabilityRegistry
function createMockRegistry(records: Map<string, unknown> = new Map()) {
  return {
    getById: async (id: string) => records.get(id) ?? null,
    getByFqdnComponents: async (org: string, project: string, ns: string, action: string, hash: string) => {
      const fqdn = `${org}.${project}.${ns}.${action}.${hash}`;
      return records.get(fqdn) ?? null;
    },
  };
}

// Mock ToolRepository
function createMockToolRepo(tools: Map<string, unknown> = new Map()) {
  return {
    findById: async (id: string) => tools.get(id) ?? null,
  };
}

// Mock DbClient
function createMockDb(patternRows: unknown[] = []) {
  return {
    query: async (_sql: string, _params: unknown[]) => patternRows,
  };
}

Deno.test("GetDetailsUseCase", async (t) => {
  await t.step("returns error for missing id", async () => {
    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry() as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_ID");
  });

  await t.step("returns capability details by UUID", async () => {
    const mockRecord = {
      id: "cap-uuid-123",
      org: "alice",
      project: "default",
      namespace: "auth",
      action: "login",
      hash: "abc123def",
      visibility: "private",
      usageCount: 100,
      successCount: 95,
      workflowPatternId: "pattern-123",
      userId: "user-1",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-06-01"),
      version: 3,
      versionTag: "v1.2.0",
      verified: true,
      signature: "sig123",
      tags: ["auth", "security"],
      routing: "server",
    };

    const records = new Map([["cap-uuid-123", mockRecord]]);
    const patternRows = [
      {
        description: "Login capability",
        parameters_schema: { type: "object", properties: { username: { type: "string" } } },
        tools_used: ["std:http", "std:json"],
      },
    ];

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry(records) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb(patternRows) as never,
    });

    const result = await useCase.execute({
      id: "cap-uuid-123",
      scope: { org: "alice", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");
    assertExists(result.data?.data);

    const capData = result.data!.data as unknown as Record<string, unknown>;
    assertEquals(capData.id, "cap-uuid-123");
    assertEquals(capData.displayName, "auth:login");
    assertEquals(capData.usageCount, 100);
    assertEquals(capData.successCount, 95);
    assertEquals(capData.verified, true);
    assertEquals(capData.description, "Login capability");
    assertEquals((capData.toolsUsed as string[]).length, 2);
  });

  await t.step("returns capability details by FQDN", async () => {
    const mockRecord = {
      id: "cap-uuid-456",
      org: "bob",
      project: "proj1",
      namespace: "fs",
      action: "read",
      hash: "xyz789",
      visibility: "public",
      usageCount: 50,
      successCount: 50,
      workflowPatternId: null,
      userId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: null,
      version: 1,
      versionTag: null,
      verified: false,
      signature: null,
      tags: [],
      routing: "client",
    };

    const records = new Map([["bob.proj1.fs.read.xyz789", mockRecord]]);

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry(records) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "bob.proj1.fs.read.xyz789",
      scope: { org: "bob", project: "proj1" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");
  });

  await t.step("returns tool details when capability not found", async () => {
    const mockTool = {
      toolId: "filesystem:read_file",
      serverId: "filesystem",
      description: "Read file contents from the filesystem",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
    };

    const tools = new Map([["filesystem:read_file", mockTool]]);

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry() as never,
      toolRepository: createMockToolRepo(tools) as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "filesystem:read_file",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "tool");

    const toolData = result.data!.data as unknown as Record<string, unknown>;
    assertEquals(toolData.id, "filesystem:read_file");
    assertEquals(toolData.serverId, "filesystem");
    assertExists(toolData.inputSchema);
  });

  await t.step("returns NOT_FOUND when neither capability nor tool exists", async () => {
    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry() as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "nonexistent-uuid",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("hides capability from unauthorized users (multi-tenant)", async () => {
    const mockRecord = {
      id: "cap-private",
      org: "secret-org",
      project: "secret-project",
      namespace: "secret",
      action: "action",
      hash: "abc",
      visibility: "private",
      usageCount: 10,
      successCount: 10,
      workflowPatternId: null,
      userId: "owner-user",
      createdAt: new Date(),
      updatedAt: null,
      version: 1,
      versionTag: null,
      verified: false,
      signature: null,
      tags: [],
      routing: "server",
    };

    const records = new Map([["cap-private", mockRecord]]);

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry(records) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "cap-private",
      scope: { org: "attacker", project: "default" }, // Different scope!
    });

    // Should return NOT_FOUND to avoid information leakage
    assertEquals(result.success, false);
    assertEquals(result.error?.code, "NOT_FOUND");
  });

  await t.step("allows access to public capabilities from any scope", async () => {
    const mockRecord = {
      id: "cap-public",
      org: "other-org",
      project: "other-project",
      namespace: "shared",
      action: "util",
      hash: "pub123",
      visibility: "public",
      usageCount: 1000,
      successCount: 990,
      workflowPatternId: "pattern-pub",
      userId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: null,
      version: 1,
      versionTag: null,
      verified: true,
      signature: null,
      tags: ["utility"],
      routing: "server",
    };

    const records = new Map([["cap-public", mockRecord]]);
    const patternRows = [{ description: "Public utility", parameters_schema: null, tools_used: null }];

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry(records) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb(patternRows) as never,
    });

    const result = await useCase.execute({
      id: "cap-public",
      scope: { org: "anyone", project: "anywhere" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");
  });

  await t.step("filters fields when details array is provided", async () => {
    const mockRecord = {
      id: "cap-filter-test",
      org: "test",
      project: "default",
      namespace: "test",
      action: "action",
      hash: "abc",
      visibility: "private",
      usageCount: 10,
      successCount: 8,
      workflowPatternId: null,
      userId: null,
      createdAt: new Date(),
      updatedAt: null,
      version: 1,
      versionTag: null,
      verified: false,
      signature: null,
      tags: ["tag1", "tag2"],
      routing: "server",
    };

    const records = new Map([["cap-filter-test", mockRecord]]);

    const useCase = new GetDetailsUseCase({
      capabilityRegistry: createMockRegistry(records) as never,
      toolRepository: createMockToolRepo() as never,
      db: createMockDb() as never,
    });

    const result = await useCase.execute({
      id: "cap-filter-test",
      scope: { org: "test", project: "default" },
      details: ["tags", "visibility"],
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.type, "capability");

    const capData = result.data!.data as unknown as Record<string, unknown>;
    // After M1 fix, only tags and visibility should be present
    assertEquals(capData.tags, ["tag1", "tag2"]);
    assertEquals(capData.visibility, "private");
    // These should NOT be present when filtering
    assertEquals(capData.usageCount, undefined);
    assertEquals(capData.successCount, undefined);
  });
});
