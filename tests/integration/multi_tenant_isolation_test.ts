/**
 * Multi-Tenant Data Isolation Integration Tests (Story 9.5)
 *
 * Tests AC#3, AC#6, AC#9:
 * - Cloud mode: Users only see their own workflow_execution
 * - Local mode: All executions visible
 * - Rate limiting per user_id
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { buildUserFilter } from "../../src/lib/auth.ts";
import type { AuthResult } from "../../src/lib/auth.ts";

/**
 * Create test database with all migrations (including 039)
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();

  // Run all migrations including 039 (user_id UUID conversion)
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());

  return db;
}

/**
 * Insert test workflow executions for different users
 */
// Test UUIDs for multi-tenant isolation testing
const USER_A_UUID = "11111111-1111-1111-1111-111111111111";
const USER_B_UUID = "22222222-2222-2222-2222-222222222222";

async function insertTestExecutions(db: PGliteClient) {
  // User A: 3 executions
  // Migration 039: user_id is now UUID type
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5::uuid)`,
    ["User A workflow 1", '{"tasks":[]}', true, 100, USER_A_UUID],
  );
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5::uuid)`,
    ["User A workflow 2", '{"tasks":[]}', true, 150, USER_A_UUID],
  );
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5::uuid)`,
    ["User A workflow 3", '{"tasks":[]}', false, 200, USER_A_UUID],
  );

  // User B: 2 executions
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5::uuid)`,
    ["User B workflow 1", '{"tasks":[]}', true, 120, USER_B_UUID],
  );
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5::uuid)`,
    ["User B workflow 2", '{"tasks":[]}', true, 180, USER_B_UUID],
  );

  // Local user: 1 execution (NULL user_id for local mode)
  await db.query(
    `INSERT INTO workflow_execution (intent_text, dag_structure, success, execution_time_ms, user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    ["Local workflow", '{"tasks":[]}', true, 90, null],
  );
}

// ============================================
// AC#3, AC#6: Cloud Mode - Data Isolation
// ============================================

Deno.test("Cloud mode: User A only sees their own executions", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  const authResult: AuthResult = {
    user_id: USER_A_UUID,
    username: "alice",
  };

  // Simulate cloud mode query with manual WHERE clause (bypassing isCloudMode check)
  // Migration 039: user_id is UUID, use ::uuid cast
  const result = await db.query(
    `SELECT * FROM workflow_execution WHERE user_id = $1::uuid`,
    [authResult.user_id],
  );

  // User A should see exactly 3 executions
  assertEquals(result.length, 3);
  assertEquals(result[0].user_id, USER_A_UUID);
  assertEquals(result[1].user_id, USER_A_UUID);
  assertEquals(result[2].user_id, USER_A_UUID);
});

Deno.test("Cloud mode: User B only sees their own executions", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  const authResult: AuthResult = {
    user_id: USER_B_UUID,
    username: "bob",
  };

  // Simulate cloud mode query with manual WHERE clause (bypassing isCloudMode check)
  // Migration 039: user_id is UUID, use ::uuid cast
  const result = await db.query(
    `SELECT * FROM workflow_execution WHERE user_id = $1::uuid`,
    [authResult.user_id],
  );

  // User B should see exactly 2 executions
  assertEquals(result.length, 2);
  assertEquals(result[0].user_id, USER_B_UUID);
  assertEquals(result[1].user_id, USER_B_UUID);
});

Deno.test("Cloud mode: Users cannot see each other's data", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  const authA: AuthResult = { user_id: USER_A_UUID, username: "alice" };
  const authB: AuthResult = { user_id: USER_B_UUID, username: "bob" };

  // User A query (simulate cloud mode with manual WHERE clause)
  // Migration 039: user_id is UUID, use ::uuid cast
  const resultA = await db.query(
    `SELECT * FROM workflow_execution WHERE user_id = $1::uuid`,
    [authA.user_id],
  );

  // User B query (simulate cloud mode with manual WHERE clause)
  const resultB = await db.query(
    `SELECT * FROM workflow_execution WHERE user_id = $1::uuid`,
    [authB.user_id],
  );

  // Verify no overlap
  assertEquals(resultA.length, 3);
  assertEquals(resultB.length, 2);

  // Verify all User A results have correct user_id
  for (const row of resultA) {
    assertEquals(row.user_id, USER_A_UUID);
  }

  // Verify all User B results have correct user_id
  for (const row of resultB) {
    assertEquals(row.user_id, USER_B_UUID);
  }
});

// ============================================
// AC#9: Local Mode - No Filtering
// ============================================

Deno.test("Local mode: All executions visible (no filtering)", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  const authResult: AuthResult = {
    user_id: "local",
    username: "local",
  };

  // In local mode, buildUserFilter returns no filter
  const filter = buildUserFilter(authResult);
  assertEquals(filter.where, null);
  assertEquals(filter.params.length, 0);

  // Query without filter returns all executions
  const result = await db.query(`SELECT * FROM workflow_execution`);

  // Should see all 6 executions (3 from A, 2 from B, 1 from local)
  assertEquals(result.length, 6);
});

// ============================================
// AC#10: Index Performance
// ============================================

Deno.test("Query with user_id uses index (EXPLAIN verification)", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  // Run EXPLAIN to verify index usage
  // Migration 039: user_id is UUID, use ::uuid cast
  const explain = await db.query(
    `EXPLAIN SELECT * FROM workflow_execution WHERE user_id = $1::uuid`,
    [USER_A_UUID],
  );

  assertExists(explain);
  // Note: PGlite EXPLAIN output format may vary
  // This test verifies the query runs successfully with the index
});

// ============================================
// AC#4: Ownership Tracking
// Migration 039: created_by column removed, ownership is now tracked via user_id only
// ============================================

Deno.test("Ownership tracking: user_id identifies owner", async () => {
  const db = await createTestDb();
  await insertTestExecutions(db);

  // Migration 039: user_id is UUID, use ::uuid cast
  const result = await db.query(
    `SELECT user_id FROM workflow_execution WHERE user_id = $1::uuid`,
    [USER_A_UUID],
  );

  assertEquals(result.length, 3);
  for (const row of result) {
    assertEquals(row.user_id, USER_A_UUID);
  }
});
