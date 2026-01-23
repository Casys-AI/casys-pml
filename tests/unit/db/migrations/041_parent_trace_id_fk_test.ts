/**
 * TDD Tests for Migration 041: Parent Trace ID FK Constraint
 *
 * ADR-041/065: Tests DEFERRABLE INITIALLY DEFERRED FK constraint for batch inserts
 * where children may be inserted before parents within the same transaction.
 *
 * @module tests/unit/db/migrations/041_parent_trace_id_fk_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { PGliteClient } from "../../../../src/db/client.ts";
import { MigrationRunner } from "../../../../src/db/migrations.ts";
import { createParentTraceIdFkMigration } from "../../../../src/db/migrations/041_parent_trace_id_fk.ts";

/**
 * Create in-memory test database with unique path.
 */
function getTestDbPath(testName: string): string {
  return `memory://${testName}_${crypto.randomUUID()}`;
}

/**
 * Setup test database with execution_trace table (minimal schema for FK tests).
 */
async function setupTestDb(testName: string): Promise<PGliteClient> {
  const client = new PGliteClient(getTestDbPath(testName));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.init();

  // Create execution_trace table with parent_trace_id column (no FK yet)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS execution_trace (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      capability_id TEXT,
      parent_trace_id UUID,
      success BOOLEAN DEFAULT true,
      duration_ms INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  return client;
}

// =============================================================================
// AC1: DEFERRABLE Constraint Allows Batch Insert (Child Before Parent)
// =============================================================================

Deno.test("Migration 041: DEFERRABLE FK allows batch insert - child before parent in same transaction", async () => {
  const client = await setupTestDb("deferrable-batch-insert");

  // Apply migration 041 (creates DEFERRABLE INITIALLY DEFERRED FK)
  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);
  await runner.runUp([migration]);

  // Generate UUIDs for parent and child
  const parentId = crypto.randomUUID();
  const childId = crypto.randomUUID();

  // This MUST work with DEFERRABLE: insert child BEFORE parent in same transaction
  // Without DEFERRABLE, this would fail at the first INSERT
  await client.exec(`
    BEGIN;
      INSERT INTO execution_trace (id, parent_trace_id, capability_id)
      VALUES ('${childId}', '${parentId}', 'test:child');

      INSERT INTO execution_trace (id, capability_id)
      VALUES ('${parentId}', 'test:parent');
    COMMIT;
  `);

  // Verify both traces exist with correct relationship
  const child = await client.queryOne(`
    SELECT id::text, parent_trace_id::text FROM execution_trace WHERE id = '${childId}'
  `);
  assertExists(child);
  assertEquals(child.parent_trace_id, parentId);

  const parent = await client.queryOne(`
    SELECT id::text FROM execution_trace WHERE id = '${parentId}'
  `);
  assertExists(parent);

  await client.close();
});

Deno.test("Migration 041: DEFERRABLE FK allows deep nesting - grandchild → child → parent", async () => {
  const client = await setupTestDb("deferrable-deep-nesting");

  // Apply migration 041
  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);
  await runner.runUp([migration]);

  // Generate UUIDs for 3-level hierarchy
  const grandparentId = crypto.randomUUID();
  const parentId = crypto.randomUUID();
  const childId = crypto.randomUUID();

  // Insert in reverse order (child first, grandparent last)
  await client.exec(`
    BEGIN;
      INSERT INTO execution_trace (id, parent_trace_id, capability_id)
      VALUES ('${childId}', '${parentId}', 'test:grandchild');

      INSERT INTO execution_trace (id, parent_trace_id, capability_id)
      VALUES ('${parentId}', '${grandparentId}', 'test:child');

      INSERT INTO execution_trace (id, capability_id)
      VALUES ('${grandparentId}', 'test:parent');
    COMMIT;
  `);

  // Verify hierarchy
  const child = await client.queryOne(`SELECT parent_trace_id::text FROM execution_trace WHERE id = '${childId}'`);
  assertEquals(child?.parent_trace_id, parentId);

  const parent = await client.queryOne(`SELECT parent_trace_id::text FROM execution_trace WHERE id = '${parentId}'`);
  assertEquals(parent?.parent_trace_id, grandparentId);

  await client.close();
});

// =============================================================================
// AC2: Orphan Cleanup Before FK Creation
// =============================================================================

Deno.test("Migration 041: cleans up orphan parent_trace_id references", async () => {
  const client = await setupTestDb("orphan-cleanup");

  // Create orphan data BEFORE migration: parent_trace_id points to non-existent trace
  const orphanParentId = crypto.randomUUID();
  const traceWithOrphan = crypto.randomUUID();
  const validParentId = crypto.randomUUID();
  const traceWithValidParent = crypto.randomUUID();

  // Insert valid parent
  await client.exec(`
    INSERT INTO execution_trace (id, capability_id)
    VALUES ('${validParentId}', 'test:valid-parent');
  `);

  // Insert trace with valid parent_trace_id
  await client.exec(`
    INSERT INTO execution_trace (id, parent_trace_id, capability_id)
    VALUES ('${traceWithValidParent}', '${validParentId}', 'test:valid-child');
  `);

  // Insert trace with orphan parent_trace_id (parent doesn't exist)
  await client.exec(`
    INSERT INTO execution_trace (id, parent_trace_id, capability_id)
    VALUES ('${traceWithOrphan}', '${orphanParentId}', 'test:orphan-child');
  `);

  // Verify orphan exists before migration
  const beforeMigration = await client.queryOne(`
    SELECT parent_trace_id::text FROM execution_trace WHERE id = '${traceWithOrphan}'
  `);
  assertEquals(beforeMigration?.parent_trace_id, orphanParentId);

  // Apply migration 041 (should clean up orphans)
  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);
  await runner.runUp([migration]);

  // Verify orphan was cleaned up (parent_trace_id set to NULL)
  const afterMigration = await client.queryOne(`
    SELECT parent_trace_id FROM execution_trace WHERE id = '${traceWithOrphan}'
  `);
  assertEquals(afterMigration?.parent_trace_id, null);

  // Verify valid parent_trace_id was NOT affected
  const validChild = await client.queryOne(`
    SELECT parent_trace_id::text FROM execution_trace WHERE id = '${traceWithValidParent}'
  `);
  assertEquals(validChild?.parent_trace_id, validParentId);

  await client.close();
});

// =============================================================================
// AC3: Down Migration Recreates Non-Deferrable FK
// =============================================================================

Deno.test("Migration 041: down rollback recreates non-deferrable FK", async () => {
  const client = await setupTestDb("down-rollback");

  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);

  // Apply migration 041 (creates DEFERRABLE FK)
  await runner.runUp([migration]);

  // Verify we can do batch insert with DEFERRABLE
  const parentId1 = crypto.randomUUID();
  const childId1 = crypto.randomUUID();
  await client.exec(`
    BEGIN;
      INSERT INTO execution_trace (id, parent_trace_id) VALUES ('${childId1}', '${parentId1}');
      INSERT INTO execution_trace (id) VALUES ('${parentId1}');
    COMMIT;
  `);

  // Rollback migration (should recreate non-deferrable FK)
  await runner.rollbackTo(0, [migration]);

  // After rollback, batch insert should FAIL because FK is no longer deferrable
  const parentId2 = crypto.randomUUID();
  const childId2 = crypto.randomUUID();

  // This should fail: child insert references non-existent parent with non-deferrable FK
  await assertRejects(
    async () => {
      await client.exec(`
        BEGIN;
          INSERT INTO execution_trace (id, parent_trace_id) VALUES ('${childId2}', '${parentId2}');
          INSERT INTO execution_trace (id) VALUES ('${parentId2}');
        COMMIT;
      `);
    },
    Error,
    // PGlite error message for FK violation
  );

  await client.close();
});

// =============================================================================
// AC4: FK Constraint Enforces Referential Integrity at Commit
// =============================================================================

Deno.test("Migration 041: DEFERRABLE FK still enforces integrity at commit", async () => {
  const client = await setupTestDb("integrity-at-commit");

  // Apply migration 041
  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);
  await runner.runUp([migration]);

  // Insert child with non-existent parent - should fail at COMMIT
  const orphanParentId = crypto.randomUUID();
  const childId = crypto.randomUUID();

  await assertRejects(
    async () => {
      await client.exec(`
        BEGIN;
          INSERT INTO execution_trace (id, parent_trace_id, capability_id)
          VALUES ('${childId}', '${orphanParentId}', 'test:orphan');
        COMMIT;
      `);
    },
    Error,
    // FK violation at commit time
  );

  // Verify nothing was inserted
  const count = await client.queryOne(`SELECT COUNT(*) as cnt FROM execution_trace WHERE id = '${childId}'`);
  assertEquals(Number(count?.cnt), 0);

  await client.close();
});

// =============================================================================
// AC5: Migration Idempotency
// =============================================================================

Deno.test("Migration 041: idempotent - can run multiple times", async () => {
  const client = await setupTestDb("idempotent");

  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);

  // Run migration twice
  await runner.runUp([migration]);
  // MigrationRunner should skip already-applied migrations
  await runner.runUp([migration]);

  // Verify FK exists and works
  const parentId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  await client.exec(`
    BEGIN;
      INSERT INTO execution_trace (id, parent_trace_id) VALUES ('${childId}', '${parentId}');
      INSERT INTO execution_trace (id) VALUES ('${parentId}');
    COMMIT;
  `);

  const child = await client.queryOne(`SELECT parent_trace_id::text FROM execution_trace WHERE id = '${childId}'`);
  assertEquals(child?.parent_trace_id, parentId);

  await client.close();
});

// =============================================================================
// AC6: FK ON DELETE SET NULL Behavior
// =============================================================================

Deno.test("Migration 041: ON DELETE SET NULL - deleting parent nullifies child reference", async () => {
  const client = await setupTestDb("on-delete-set-null");

  // Apply migration 041
  const migration = createParentTraceIdFkMigration();
  const runner = new MigrationRunner(client);
  await runner.runUp([migration]);

  // Create parent and child
  const parentId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  await client.exec(`
    INSERT INTO execution_trace (id, capability_id) VALUES ('${parentId}', 'test:parent');
    INSERT INTO execution_trace (id, parent_trace_id, capability_id) VALUES ('${childId}', '${parentId}', 'test:child');
  `);

  // Verify relationship
  let child = await client.queryOne(`SELECT parent_trace_id::text FROM execution_trace WHERE id = '${childId}'`);
  assertEquals(child?.parent_trace_id, parentId);

  // Delete parent
  await client.exec(`DELETE FROM execution_trace WHERE id = '${parentId}'`);

  // Verify child's parent_trace_id is now NULL (not deleted)
  child = await client.queryOne(`SELECT parent_trace_id FROM execution_trace WHERE id = '${childId}'`);
  assertExists(child); // Child still exists
  assertEquals(child.parent_trace_id, null); // But parent reference is NULL

  await client.close();
});
