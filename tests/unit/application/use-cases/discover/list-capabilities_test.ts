/**
 * List Capabilities Use Case Tests
 *
 * Tests for capability listing with pattern filtering and pagination.
 *
 * @module tests/unit/application/use-cases/discover/list-capabilities_test
 */

import { assertEquals } from "@std/assert";
import {
  ListCapabilitiesUseCase,
  globToSqlLike,
} from "../../../../../src/application/use-cases/discover/list-capabilities.ts";

// Mock DbClient
function createMockDb(rows: unknown[]) {
  return {
    query: async (_sql: string, _params: unknown[]) => rows,
  };
}

Deno.test("globToSqlLike", async (t) => {
  await t.step("converts * to %", () => {
    assertEquals(globToSqlLike("auth:*"), "auth:%");
  });

  await t.step("converts ? to _", () => {
    assertEquals(globToSqlLike("read_?"), "read\\__");
  });

  await t.step("escapes existing % and _", () => {
    assertEquals(globToSqlLike("test%pattern"), "test\\%pattern");
    assertEquals(globToSqlLike("test_pattern"), "test\\_pattern");
  });

  await t.step("handles complex patterns", () => {
    assertEquals(globToSqlLike("fs:*_file?"), "fs:%\\_file_");
  });
});

Deno.test("ListCapabilitiesUseCase", async (t) => {
  await t.step("returns error for missing pattern", async () => {
    const db = createMockDb([]);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_PATTERN");
  });

  await t.step("returns error for whitespace-only pattern", async () => {
    const db = createMockDb([]);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "   ",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, false);
    assertEquals(result.error?.code, "MISSING_PATTERN");
  });

  await t.step("returns capabilities matching pattern", async () => {
    const mockRows = [
      {
        id: "cap-1",
        org: "alice",
        project: "default",
        namespace: "auth",
        action: "login",
        hash: "abc123",
        usage_count: 10,
        success_count: 8,
        description: "Login capability",
        total: "2",
      },
      {
        id: "cap-2",
        org: "alice",
        project: "default",
        namespace: "auth",
        action: "logout",
        hash: "def456",
        usage_count: 5,
        success_count: 5,
        description: "Logout capability",
        total: "2",
      },
    ];

    const db = createMockDb(mockRows);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "auth:*",
      scope: { org: "alice", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.items.length, 2);
    assertEquals(result.data?.total, 2);
    assertEquals(result.data?.items[0].name, "auth:login");
    assertEquals(result.data?.items[0].successRate, 0.8);
  });

  await t.step("respects limit parameter", async () => {
    const mockRows = [
      {
        id: "cap-1",
        org: "test",
        project: "default",
        namespace: "fs",
        action: "read",
        hash: "abc",
        usage_count: 10,
        success_count: 10,
        description: null,
        total: "1",
      },
    ];

    const db = createMockDb(mockRows);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "fs:*",
      scope: { org: "test", project: "default" },
      limit: 1,
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.limit, 1);
  });

  await t.step("caps limit at MAX_LIMIT (500)", async () => {
    const db = createMockDb([]);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "*",
      scope: { org: "test", project: "default" },
      limit: 1000,
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.limit, 500);
  });

  await t.step("handles empty results", async () => {
    const db = createMockDb([]);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "nonexistent:*",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.items.length, 0);
    assertEquals(result.data?.total, 0);
  });

  await t.step("calculates success rate correctly", async () => {
    const mockRows = [
      {
        id: "cap-1",
        org: "test",
        project: "default",
        namespace: "test",
        action: "action",
        hash: "abc",
        usage_count: 0,
        success_count: 0,
        description: null,
        total: "1",
      },
    ];

    const db = createMockDb(mockRows);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "test:*",
      scope: { org: "test", project: "default" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.items[0].successRate, 0); // Avoid division by zero
  });

  await t.step("builds correct FQDN", async () => {
    const mockRows = [
      {
        id: "cap-1",
        org: "myorg",
        project: "myproj",
        namespace: "ns",
        action: "act",
        hash: "hash123",
        usage_count: 1,
        success_count: 1,
        description: null,
        total: "1",
      },
    ];

    const db = createMockDb(mockRows);
    const useCase = new ListCapabilitiesUseCase({ db: db as never });

    const result = await useCase.execute({
      pattern: "ns:*",
      scope: { org: "myorg", project: "myproj" },
    });

    assertEquals(result.success, true);
    assertEquals(result.data?.items[0].fqdn, "myorg.myproj.ns.act.hash123");
  });
});
