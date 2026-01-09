/**
 * Lockfile Manager Tests (Story 14.7)
 *
 * Tests for client-side MCP integrity tracking.
 *
 * @module tests/lockfile_manager_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { LockfileManager } from "../src/lockfile/lockfile-manager.ts";
import type { IntegrityApprovalRequired } from "../src/lockfile/types.ts";

// Use temp directory for test lockfiles (cross-platform)
let TEST_DIR: string;

async function createTestManager(): Promise<LockfileManager> {
  const lockfilePath = `${TEST_DIR}/mcp-${crypto.randomUUID()}.lock`;
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
    // Ignore if doesn't exist
  }
}

// Setup: create temp directory (cross-platform)
Deno.test({
  name: "setup test directory",
  fn: async () => {
    TEST_DIR = await Deno.makeTempDir({ prefix: "pml-lockfile-tests-" });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test("LockfileManager - creates empty lockfile on first load", async () => {
  const manager = await createTestManager();
  const lockfile = await manager.load();

  assertEquals(lockfile.version, 1);
  assertEquals(Object.keys(lockfile.entries).length, 0);
  assertExists(lockfile.updatedAt);
});

Deno.test("LockfileManager - addEntry creates new entry", async () => {
  const manager = await createTestManager();

  const entry = await manager.addEntry({
    fqdn: "pml.std.filesystem.read_file.a7f3",
    integrity: "sha256-abc123",
    type: "deno",
  });

  assertEquals(entry.fqdn, "pml.std.filesystem.read_file.a7f3");
  assertEquals(entry.integrity, "sha256-abc123");
  assertEquals(entry.type, "deno");
  assertEquals(entry.approved, true);
});

Deno.test("LockfileManager - getEntry returns entry by 4-part base", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.filesystem.read_file.a7f3",
    integrity: "sha256-abc123",
    type: "deno",
  });

  // Get by full FQDN
  const entry1 = await manager.getEntry("pml.std.filesystem.read_file.a7f3");
  assertExists(entry1);
  assertEquals(entry1?.integrity, "sha256-abc123");

  // Get by 4-part base (without hash)
  const entry2 = await manager.getEntry("pml.std.filesystem.read_file");
  assertExists(entry2);
  assertEquals(entry2?.integrity, "sha256-abc123");
});

Deno.test("LockfileManager - hasEntry checks existence", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.mcp.serena.server.c5d6",
    integrity: "sha256-def456",
    type: "stdio",
  });

  assertEquals(await manager.hasEntry("pml.mcp.serena.server"), true);
  assertEquals(await manager.hasEntry("pml.mcp.nonexistent.server"), false);
});

Deno.test("LockfileManager - removeEntry deletes entry", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.mcp.tavily.server.d7e8",
    integrity: "sha256-ghi789",
    type: "stdio", // Note: http type not tracked in lockfile, use stdio for test
  });

  assertEquals(await manager.hasEntry("pml.mcp.tavily.server"), true);

  const removed = await manager.removeEntry("pml.mcp.tavily.server");
  assertEquals(removed, true);

  assertEquals(await manager.hasEntry("pml.mcp.tavily.server"), false);
});

Deno.test("LockfileManager - validateIntegrity returns valid for new entry", async () => {
  const manager = await createTestManager();

  const result = await manager.validateIntegrity(
    "pml.std.filesystem.write_file.b2c4",
    "sha256-newHash",
    "deno",
  );

  // Should be valid (new entry auto-approved)
  assertEquals("valid" in result && result.valid, true);
  assertEquals("isNew" in result && result.isNew, true);
});

Deno.test("LockfileManager - validateIntegrity returns valid for matching hash", async () => {
  const manager = await createTestManager();

  // Add entry first
  await manager.addEntry({
    fqdn: "pml.mcp.memory.server.e9f0",
    integrity: "sha256-existingHash",
    type: "stdio",
  });

  // Validate with same hash
  const result = await manager.validateIntegrity(
    "pml.mcp.memory.server.e9f0",
    "sha256-existingHash",
    "stdio",
  );

  assertEquals("valid" in result && result.valid, true);
  assertEquals("isNew" in result && result.isNew, false);
});

Deno.test("LockfileManager - validateIntegrity returns approval required for hash mismatch (AC14)", async () => {
  const manager = await createTestManager();

  // Add entry with old hash
  await manager.addEntry({
    fqdn: "pml.mcp.tavily.server.d7e8",
    integrity: "sha256-oldHash",
    type: "stdio", // Note: http type not tracked in lockfile, use stdio for test
  });

  // Validate with different hash
  const result = await manager.validateIntegrity(
    "pml.mcp.tavily.server.f9a0",
    "sha256-newHash",
    "stdio",
  );

  // Should require approval
  assertEquals("approvalRequired" in result && result.approvalRequired, true);

  const approval = result as IntegrityApprovalRequired;
  assertEquals(approval.approvalType, "integrity");
  assertEquals(approval.fqdnBase, "pml.mcp.tavily.server");
  assertEquals(approval.oldHash, "sha2"); // First 4 chars
  assertEquals(approval.newHash, "sha2"); // First 4 chars
  assertExists(approval.workflowId);
});

Deno.test("LockfileManager - approveIntegrityChange updates entry", async () => {
  const manager = await createTestManager();

  // Add entry with old hash
  await manager.addEntry({
    fqdn: "pml.std.git.status.abc1",
    integrity: "sha256-oldHash",
    type: "deno",
  });

  // Approve with new hash
  const updated = await manager.approveIntegrityChange(
    "pml.std.git.status.def2",
    "sha256-newHash",
    "deno",
  );

  assertEquals(updated.integrity, "sha256-newHash");
  assertEquals(updated.approved, true);
});

Deno.test("LockfileManager - getAllEntries returns all entries", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.fs.read.a1b2",
    integrity: "hash1",
    type: "deno",
  });
  await manager.addEntry({
    fqdn: "pml.mcp.test.server.c3d4",
    integrity: "hash2",
    type: "stdio",
  });

  const entries = await manager.getAllEntries();
  assertEquals(entries.length, 2);
});

Deno.test("LockfileManager - clear removes all entries", async () => {
  const manager = await createTestManager();

  await manager.addEntry({
    fqdn: "pml.std.fs.read.a1b2",
    integrity: "hash1",
    type: "deno",
  });
  await manager.addEntry({
    fqdn: "pml.mcp.test.server.c3d4",
    integrity: "hash2",
    type: "stdio",
  });

  await manager.clear();

  const entries = await manager.getAllEntries();
  assertEquals(entries.length, 0);
});

Deno.test("LockfileManager - persists across instances", async () => {
  const lockfilePath = `${TEST_DIR}/persist-test-${crypto.randomUUID()}.lock`;

  // First instance
  const manager1 = new LockfileManager({
    lockfilePath,
    autoCreate: true,
    autoApproveNew: true,
  });

  await manager1.addEntry({
    fqdn: "pml.std.persist.test.1234",
    integrity: "sha256-persist",
    type: "deno",
  });

  // Second instance with same path
  const manager2 = new LockfileManager({
    lockfilePath,
    autoCreate: false,
    autoApproveNew: false,
  });

  const entry = await manager2.getEntry("pml.std.persist.test");
  assertExists(entry);
  assertEquals(entry?.integrity, "sha256-persist");
});

// Cleanup after all tests
Deno.test({
  name: "cleanup test directory",
  fn: async () => {
    await cleanup();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
