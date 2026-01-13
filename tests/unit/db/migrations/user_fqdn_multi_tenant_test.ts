/**
 * TDD Tests for User FQDN Multi-Tenant Migration
 *
 * Tests the migration from TEXT user_id/created_by columns to UUID FK to users table.
 * Story: User FQDN Multi-Tenant
 *
 * @module tests/unit/db/migrations/user_fqdn_multi_tenant_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../../src/db/client.ts";
import { MigrationRunner, createInitialMigration } from "../../../../src/db/migrations.ts";

/**
 * Create in-memory test database with unique path.
 */
function getTestDbPath(testName: string): string {
  return `memory://${testName}_${crypto.randomUUID()}`;
}

/**
 * Helper to setup a test database with base schema.
 */
async function setupTestDb(testName: string): Promise<PGliteClient> {
  const client = new PGliteClient(getTestDbPath(testName));
  await client.connect();

  const runner = new MigrationRunner(client);
  await runner.init();

  // Apply initial migration for base tables
  const initialMigration = createInitialMigration();
  await runner.runUp([initialMigration]);

  // Create users table (needed for FK references)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  return client;
}

// =============================================================================
// AC1: capability_records.user_id FK to users
// =============================================================================

Deno.test("Migration 039: capability_records - add user_id UUID FK column", async () => {
  const client = await setupTestDb("cap-records-user-id");

  // Setup: Create capability_records with old schema (TEXT created_by)
  await client.exec(`
    CREATE TABLE IF NOT EXISTS capability_records (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      org TEXT NOT NULL,
      project TEXT NOT NULL,
      namespace TEXT NOT NULL,
      action TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'local',
      updated_by TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Insert test user
  const userResult = await client.query(`
    INSERT INTO users (username, email)
    VALUES ('testuser', 'test@example.com')
    RETURNING id::text;
  `);
  const userId = userResult[0].id;

  // Insert test capability with old schema
  await client.exec(`
    INSERT INTO capability_records (id, display_name, org, project, namespace, action, hash, created_by)
    VALUES ('local.default.test.action.abc1', 'Test Cap', 'local', 'default', 'test', 'action', 'abc1', 'local');
  `);

  // Apply migration: Add user_id column and FK
  await client.exec(`
    ALTER TABLE capability_records
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_capability_records_user ON capability_records(user_id);
  `);

  // Verify column exists
  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'capability_records' AND column_name = 'user_id';
  `);
  assertEquals(columns.length, 1);
  assertEquals(columns[0].data_type, "uuid");

  // Verify index exists
  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'capability_records' AND indexname = 'idx_capability_records_user';
  `);
  assertEquals(indexes.length, 1);

  // Verify FK works: Update with valid user_id
  await client.exec(`
    UPDATE capability_records SET user_id = '${userId}'
    WHERE id = 'local.default.test.action.abc1';
  `);

  const cap = await client.queryOne(`
    SELECT user_id::text FROM capability_records WHERE id = 'local.default.test.action.abc1';
  `);
  assertEquals(cap?.user_id, userId);

  await client.close();
});

Deno.test("Migration 039: capability_records - drop created_by and updated_by columns", async () => {
  const client = await setupTestDb("cap-drop-created-by");

  // Setup with old schema
  await client.exec(`
    CREATE TABLE IF NOT EXISTS capability_records (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      org TEXT NOT NULL,
      project TEXT NOT NULL,
      namespace TEXT NOT NULL,
      action TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'local',
      updated_by TEXT,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Drop old columns
  await client.exec(`
    ALTER TABLE capability_records DROP COLUMN IF EXISTS created_by;
    ALTER TABLE capability_records DROP COLUMN IF EXISTS updated_by;
  `);

  // Verify columns are gone
  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'capability_records'
    AND column_name IN ('created_by', 'updated_by');
  `);
  assertEquals(columns.length, 0);

  await client.close();
});

// =============================================================================
// AC2: execution_trace.user_id TEXT → UUID FK
// =============================================================================

Deno.test("Migration 039: execution_trace - convert user_id TEXT to UUID FK", async () => {
  const client = await setupTestDb("exec-trace-user-id");

  // Setup users table
  const userResult = await client.query(`
    INSERT INTO users (username) VALUES ('testuser') RETURNING id::text;
  `);
  const userId = userResult[0].id;

  // Setup execution_trace with old TEXT user_id
  await client.exec(`
    CREATE TABLE IF NOT EXISTS execution_trace (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT DEFAULT 'local',
      created_by TEXT DEFAULT 'local',
      updated_by TEXT,
      success BOOLEAN NOT NULL DEFAULT true,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Insert test data with UUID as text
  await client.exec(`
    INSERT INTO execution_trace (user_id, success, duration_ms)
    VALUES ('${userId}', true, 100);

    INSERT INTO execution_trace (user_id, success, duration_ms)
    VALUES ('local', true, 50);

    INSERT INTO execution_trace (user_id, success, duration_ms)
    VALUES (NULL, true, 25);
  `);

  // Migration: Convert TEXT to UUID
  await client.exec(`
    -- Drop old columns
    ALTER TABLE execution_trace DROP COLUMN IF EXISTS created_by;
    ALTER TABLE execution_trace DROP COLUMN IF EXISTS updated_by;

    -- Add new UUID column
    ALTER TABLE execution_trace ADD COLUMN user_id_new UUID;

    -- Migrate valid UUIDs
    UPDATE execution_trace
    SET user_id_new = user_id::uuid
    WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    -- Drop old and rename
    ALTER TABLE execution_trace DROP COLUMN user_id;
    ALTER TABLE execution_trace RENAME COLUMN user_id_new TO user_id;

    -- Add FK
    ALTER TABLE execution_trace
    ADD CONSTRAINT fk_execution_trace_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_execution_trace_user ON execution_trace(user_id);
  `);

  // Verify UUID column type
  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'execution_trace' AND column_name = 'user_id';
  `);
  assertEquals(columns.length, 1);
  assertEquals(columns[0].data_type, "uuid");

  // Verify data migration: valid UUID preserved, 'local' and NULL became NULL
  const traces = await client.query(`
    SELECT id, user_id::text FROM execution_trace ORDER BY duration_ms DESC;
  `);
  assertEquals(traces.length, 3);
  assertEquals(traces[0].user_id, userId); // UUID preserved
  assertEquals(traces[1].user_id, null);   // 'local' → NULL
  assertEquals(traces[2].user_id, null);   // NULL → NULL

  await client.close();
});

// =============================================================================
// AC3: shgat_params - remove user_id (global model, not per-user)
// =============================================================================

Deno.test("Migration 039: shgat_params - remove user_id column (global model)", async () => {
  const client = await setupTestDb("shgat-remove-user-id");

  // Setup shgat_params with old TEXT user_id
  await client.exec(`
    CREATE TABLE IF NOT EXISTS shgat_params (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE DEFAULT 'local',
      params JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Insert test data - multiple rows (will be deduplicated)
  await client.exec(`
    INSERT INTO shgat_params (user_id, params, updated_at)
    VALUES ('local', '{"weights": [1, 2, 3]}', NOW() - INTERVAL '1 day');

    INSERT INTO shgat_params (user_id, params, updated_at)
    VALUES ('other', '{"weights": [4, 5, 6]}', NOW());
  `);

  // Migration: Remove user_id column, keep only most recent row
  await client.exec(`
    ALTER TABLE shgat_params DROP CONSTRAINT IF EXISTS shgat_params_user_id_key;
    DROP INDEX IF EXISTS idx_shgat_params_user_id;

    DELETE FROM shgat_params
    WHERE id NOT IN (
      SELECT id FROM shgat_params ORDER BY updated_at DESC LIMIT 1
    );

    ALTER TABLE shgat_params DROP COLUMN user_id;
  `);

  // Verify user_id column is gone
  const columns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'shgat_params' AND column_name = 'user_id';
  `);
  assertEquals(columns.length, 0);

  // Verify only one row remains (the most recent)
  const rows = await client.query(`SELECT params FROM shgat_params;`);
  assertEquals(rows.length, 1);
  // params is already parsed as JSONB object
  const params = rows[0].params as { weights: number[] };
  assertEquals(params.weights, [4, 5, 6]);

  await client.close();
});

// =============================================================================
// AC4: Cleanup orphaned UUIDs before FK creation
// =============================================================================

Deno.test("Migration 039: cleanup orphaned UUIDs that reference deleted users", async () => {
  const client = await setupTestDb("cleanup-orphans");

  // Setup users table with one user
  const userResult = await client.query(`
    INSERT INTO users (username) VALUES ('validuser') RETURNING id::text;
  `);
  const validUserId = userResult[0].id;

  // Generate an orphaned UUID (user that doesn't exist)
  const orphanedUserId = crypto.randomUUID();

  // Setup entropy_history with mixed user_id values
  await client.exec(`
    CREATE TABLE IF NOT EXISTS entropy_history (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      von_neumann_entropy REAL NOT NULL DEFAULT 0.5,
      structural_entropy REAL NOT NULL DEFAULT 0.5,
      normalized_entropy REAL NOT NULL DEFAULT 0.5,
      health_status TEXT NOT NULL DEFAULT 'healthy',
      threshold_low REAL NOT NULL DEFAULT 0.3,
      threshold_high REAL NOT NULL DEFAULT 0.7,
      node_count INTEGER NOT NULL DEFAULT 10,
      edge_count INTEGER NOT NULL DEFAULT 5,
      hyperedge_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Insert test data: valid UUID, orphaned UUID, 'local', NULL
  await client.exec(`
    INSERT INTO entropy_history (user_id) VALUES ('${validUserId}');
    INSERT INTO entropy_history (user_id) VALUES ('${orphanedUserId}');
    INSERT INTO entropy_history (user_id) VALUES ('local');
    INSERT INTO entropy_history (user_id) VALUES (NULL);
  `);

  // Cleanup: NULL out orphaned UUIDs
  await client.exec(`
    UPDATE entropy_history SET user_id = NULL
    WHERE user_id ~ '^[0-9a-f]{8}-'
    AND user_id::uuid NOT IN (SELECT id FROM users);
  `);

  // Verify orphaned UUID was set to NULL
  const afterCleanup = await client.query(`
    SELECT id, user_id FROM entropy_history ORDER BY id;
  `);
  assertEquals(afterCleanup.length, 4);
  assertEquals(afterCleanup[0].user_id, validUserId);  // Valid UUID preserved
  assertEquals(afterCleanup[1].user_id, null);          // Orphaned → NULL
  assertEquals(afterCleanup[2].user_id, "local");       // 'local' unchanged (not UUID pattern)
  assertEquals(afterCleanup[3].user_id, null);          // NULL → NULL

  await client.close();
});

// =============================================================================
// AC5: FK ON DELETE SET NULL behavior
// =============================================================================

Deno.test("Migration 039: ON DELETE SET NULL preserves records when user deleted", async () => {
  const client = await setupTestDb("on-delete-set-null");

  // Setup users
  const userResult = await client.query(`
    INSERT INTO users (username) VALUES ('tobeDeleted') RETURNING id::text;
  `);
  const userId = userResult[0].id;

  // Setup capability_records with user_id FK
  await client.exec(`
    CREATE TABLE IF NOT EXISTS capability_records (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      org TEXT NOT NULL,
      project TEXT NOT NULL,
      namespace TEXT NOT NULL,
      action TEXT NOT NULL,
      hash TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Create capability owned by user
  await client.exec(`
    INSERT INTO capability_records (id, display_name, org, project, namespace, action, hash, user_id)
    VALUES ('test.default.ns.act.abcd', 'Test', 'test', 'default', 'ns', 'act', 'abcd', '${userId}');
  `);

  // Verify capability has user_id
  const before = await client.queryOne(`
    SELECT user_id::text FROM capability_records WHERE id = 'test.default.ns.act.abcd';
  `);
  assertEquals(before?.user_id, userId);

  // Delete user
  await client.exec(`DELETE FROM users WHERE id = '${userId}'`);

  // Verify capability still exists but user_id is NULL
  const after = await client.queryOne(`
    SELECT user_id FROM capability_records WHERE id = 'test.default.ns.act.abcd';
  `);
  assertExists(after);
  assertEquals(after.user_id, null);

  await client.close();
});

// =============================================================================
// AC6: workflow_pattern.user_id FK
// =============================================================================

Deno.test("Migration 039: workflow_pattern - convert created_by to user_id FK", async () => {
  const client = await setupTestDb("workflow-pattern-user-id");

  // Setup users
  const userResult = await client.query(`
    INSERT INTO users (username) VALUES ('testuser') RETURNING id::text;
  `);
  const userId = userResult[0].id;

  // Setup workflow_pattern with old created_by TEXT
  await client.exec(`
    CREATE TABLE IF NOT EXISTS workflow_pattern (
      pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code_hash TEXT NOT NULL,
      created_by TEXT DEFAULT 'local'
    );
  `);

  // Insert test data
  await client.exec(`
    INSERT INTO workflow_pattern (code_hash, created_by)
    VALUES ('hash123', '${userId}');
  `);

  // Migration: Add user_id, migrate, drop created_by
  await client.exec(`
    ALTER TABLE workflow_pattern
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

    UPDATE workflow_pattern
    SET user_id = created_by::uuid
    WHERE created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS created_by;

    CREATE INDEX IF NOT EXISTS idx_workflow_pattern_user ON workflow_pattern(user_id);
  `);

  // Verify user_id column
  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'workflow_pattern' AND column_name = 'user_id';
  `);
  assertEquals(columns.length, 1);
  assertEquals(columns[0].data_type, "uuid");

  // Verify data migrated
  const pattern = await client.queryOne(`
    SELECT user_id::text FROM workflow_pattern WHERE code_hash = 'hash123';
  `);
  assertEquals(pattern?.user_id, userId);

  await client.close();
});
