/**
 * Lockfile Auto-Cleanup Tests (Story 14.7 AC13)
 *
 * Tests for automatic lockfile entry cleanup based on permissions.
 *
 * @module tests/lockfile_auto_cleanup_test
 */

import { assertEquals } from "@std/assert";
import { LockfileManager } from "../src/lockfile/lockfile-manager.ts";
import {
  cleanupLockfile,
  cleanupStaleEntries,
  syncWithPermissions,
} from "../src/lockfile/auto-cleanup.ts";

// Use temp directory for test lockfiles (cross-platform)
let TEST_DIR: string;

async function createTestManager(): Promise<LockfileManager> {
  const lockfilePath = `${TEST_DIR}/cleanup-${crypto.randomUUID()}.lock`;
  return new LockfileManager({
    lockfilePath,
    autoCreate: true,
    autoApproveNew: true,
  });
}

async function cleanup(): Promise<void> {
  try {
    if (TEST_DIR) {
      await Deno.remove(TEST_DIR, { recursive: true });
    }
  } catch {
    // Ignore
  }
}

// Setup: create temp directory (cross-platform)
Deno.test({
  name: "setup cleanup test directory",
  fn: async () => {
    TEST_DIR = await Deno.makeTempDir({ prefix: "pml-cleanup-tests-" });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test("syncWithPermissions - removes entries not in permissions", async () => {
  const manager = await createTestManager();

  // Add entries
  await manager.addEntry({
    fqdn: "pml.std.allowed.tool.1234",
    integrity: "hash1",
    type: "deno",
  });
  await manager.addEntry({
    fqdn: "pml.mcp.removed.server.5678",
    integrity: "hash2",
    type: "stdio",
  });

  // Sync with permissions that only include the first (exact 4-part match)
  const result = await syncWithPermissions(manager, [
    "pml.std.allowed.tool",
  ]);

  assertEquals(result.removed.length, 1);
  assertEquals(result.removed[0], "pml.mcp.removed.server");
  assertEquals(result.kept.length, 1);
});

Deno.test("syncWithPermissions - keeps entries matching exact FQDNs", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.filesystem.read.a1b2",
    integrity: "hash1",
    type: "deno",
  });
  await manager.addEntry({
    fqdn: "pml.std.filesystem.write.c3d4",
    integrity: "hash2",
    type: "deno",
  });

  // Exact FQDNs to keep both
  const result = await syncWithPermissions(manager, [
    "pml.std.filesystem.read",
    "pml.std.filesystem.write",
  ]);

  assertEquals(result.removed.length, 0);
  assertEquals(result.kept.length, 2);
});

Deno.test("syncWithPermissions - handles exact FQDN matches", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.mcp.serena.server.abcd",
    integrity: "hash1",
    type: "stdio",
  });

  const result = await syncWithPermissions(manager, [
    "pml.mcp.serena.server",
  ]);

  assertEquals(result.removed.length, 0);
  assertEquals(result.kept.length, 1);
});

Deno.test("cleanupStaleEntries - keeps fresh entries", async () => {
  const manager = await createTestManager();

  // Add entry (will have current timestamp)
  await manager.addEntry({
    fqdn: "pml.std.new.tool.1234",
    integrity: "hash1",
    type: "deno",
  });

  // With 1 day threshold, today's entries should be kept
  const result = await cleanupStaleEntries(manager, 1);
  // Entries added just now should be kept
  assertEquals(result.removed.length, 0);
  assertEquals(result.kept.length, 1);
});

Deno.test("cleanupLockfile - removes entries not in keepFqdns", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.allowed.tool.1111",
    integrity: "hash1",
    type: "deno",
  });
  await manager.addEntry({
    fqdn: "pml.mcp.disallowed.server.2222",
    integrity: "hash2",
    type: "stdio",
  });

  const result = await cleanupLockfile(manager, {
    keepFqdns: ["pml.std.allowed.tool"],
    execute: true,
  });

  assertEquals(result.removed.length, 1);
  assertEquals(result.removed[0], "pml.mcp.disallowed.server");
  assertEquals(result.executed, true);
});

Deno.test("cleanupLockfile - dry run mode does not delete", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.any.tool.1234",
    integrity: "hash1",
    type: "deno",
  });

  // Dry run (execute = false)
  const result = await cleanupLockfile(manager, {
    keepFqdns: [],
    execute: false,
  });

  assertEquals(result.removed.length, 1);
  assertEquals(result.executed, false);

  // Entry should still exist
  assertEquals(await manager.hasEntry("pml.std.any.tool"), true);
});

Deno.test({
  name: "cleanup test directory for auto-cleanup",
  fn: async () => {
    await cleanup();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
