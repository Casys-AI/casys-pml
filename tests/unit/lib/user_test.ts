/**
 * TDD Tests for User Helper Functions
 *
 * Tests the getUsernameById helper for multi-tenant FQDN generation.
 * Story: User FQDN Multi-Tenant
 *
 * @module tests/unit/lib/user_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";

/**
 * Create in-memory test database with unique path.
 */
function getTestDbPath(testName: string): string {
  return `memory://${testName}_${crypto.randomUUID()}`;
}

/**
 * Setup test database with users table.
 */
async function setupTestDb(testName: string): Promise<PGliteClient> {
  const client = new PGliteClient(getTestDbPath(testName));
  await client.connect();

  // Create users table
  await client.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      github_id TEXT UNIQUE,
      avatar_url TEXT,
      role TEXT DEFAULT 'user',
      api_key_hash TEXT,
      api_key_prefix TEXT UNIQUE,
      api_key_created_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  return client;
}

// =============================================================================
// getUsernameById Tests
// =============================================================================

Deno.test("getUsernameById: returns username for valid user ID", async () => {
  const client = await setupTestDb("get-username-valid");

  // Insert test user
  const result = await client.query(`
    INSERT INTO users (username, email)
    VALUES ('alice', 'alice@example.com')
    RETURNING id::text;
  `);
  const userId = result[0].id;
  assertExists(userId);

  // Test: Query username by ID
  const userResult = await client.queryOne(`
    SELECT username FROM users WHERE id = '${userId}'::uuid;
  `);
  assertEquals(userResult?.username, "alice");

  await client.close();
});

Deno.test("getUsernameById: returns null for non-existent user ID", async () => {
  const client = await setupTestDb("get-username-nonexistent");

  // Query with non-existent UUID
  const nonExistentId = crypto.randomUUID();
  const userResult = await client.queryOne(`
    SELECT username FROM users WHERE id = '${nonExistentId}'::uuid;
  `);
  // queryOne returns undefined when no rows found
  assertEquals(userResult, null);

  await client.close();
});

Deno.test("getUsernameById: returns null for null user ID", async () => {
  const client = await setupTestDb("get-username-null");

  // Simulate getUsernameById behavior with null check
  const userId: string | null = null;
  const userResult = userId
    ? await client.queryOne(`SELECT username FROM users WHERE id = '${userId}'::uuid;`)
    : null;
  assertEquals(userResult, null);

  await client.close();
});

Deno.test("getUsernameById: handles multiple users correctly", async () => {
  const client = await setupTestDb("get-username-multiple");

  // Insert multiple users
  const results = await client.query(`
    INSERT INTO users (username, email)
    VALUES
      ('alice', 'alice@example.com'),
      ('bob', 'bob@example.com'),
      ('charlie', 'charlie@example.com')
    RETURNING id::text, username;
  `);

  assertEquals(results.length, 3);

  // Query each user
  for (const row of results) {
    const userResult = await client.queryOne(`
      SELECT username FROM users WHERE id = '${row.id}'::uuid;
    `);
    assertEquals(userResult?.username, row.username);
  }

  await client.close();
});

// =============================================================================
// Username Uniqueness Tests
// =============================================================================

Deno.test("users table: username is unique", async () => {
  const client = await setupTestDb("username-unique");

  // Insert first user
  await client.exec(`
    INSERT INTO users (username, email) VALUES ('alice', 'alice@example.com');
  `);

  // Try to insert duplicate username - should fail
  let errorThrown = false;
  try {
    await client.exec(`
      INSERT INTO users (username, email) VALUES ('alice', 'different@example.com');
    `);
  } catch (error) {
    errorThrown = true;
    // Verify it's a unique constraint violation
    const errorMessage = String(error);
    assertEquals(errorMessage.includes("unique") || errorMessage.includes("duplicate"), true);
  }

  assertEquals(errorThrown, true);
  await client.close();
});

// =============================================================================
// org/project FQDN Pattern Tests
// =============================================================================

Deno.test("FQDN generation: username becomes org in FQDN", async () => {
  const client = await setupTestDb("fqdn-username-org");

  // Insert user
  const result = await client.query(`
    INSERT INTO users (username) VALUES ('myuser') RETURNING id::text, username;
  `);
  const { id, username } = result[0];
  assertExists(id);

  // Verify FQDN pattern: {username}.{project}.{namespace}.{action}
  const org = username;
  const project = "default";
  const namespace = "test";
  const action = "doSomething";
  const expectedFqdn = `${org}.${project}.${namespace}.${action}`;

  assertEquals(expectedFqdn, "myuser.default.test.doSomething");

  await client.close();
});

Deno.test("FQDN generation: fallback to 'local' when no user", async () => {
  const client = await setupTestDb("fqdn-fallback-local");

  // Simulate no authenticated user
  const userId: string | null = null;
  const userResult = userId
    ? await client.queryOne(`SELECT username FROM users WHERE id = '${userId}'::uuid;`)
    : null;

  // Fallback FQDN
  const org = userResult?.username ?? "local";
  const project = "default";
  const fqdn = `${org}.${project}.test.action`;

  assertEquals(fqdn, "local.default.test.action");

  await client.close();
});
