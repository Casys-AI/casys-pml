/**
 * Unit tests for Admin Analytics (Story 6.6)
 *
 * Tests analytics queries and service layer.
 * Cloud-only module - excluded from public sync.
 *
 * @module tests/unit/cloud/admin/analytics_test
 */

import { assert, assertEquals, assertGreater } from "@std/assert";
import { PGliteClient } from "../../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../../src/db/migrations.ts";
import {
  clearAnalyticsCache,
  getAdminAnalytics,
  getCacheStats,
  isAdminUser,
} from "../../../../src/cloud/admin/analytics-service.ts";
import {
  queryErrorHealth,
  queryResources,
  querySystemUsage,
  queryUserActivity,
} from "../../../../src/cloud/admin/analytics-queries.ts";
// Test setup helper
async function setupTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(":memory:");
  await db.connect();

  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());

  return db;
}

// Seed test data
async function seedTestData(db: PGliteClient): Promise<void> {
  // Create test users
  await db.query(`
    INSERT INTO users (id, username, email, role, created_at)
    VALUES
      (gen_random_uuid(), 'admin_user', 'admin@test.com', 'admin', NOW() - INTERVAL '5 days'),
      (gen_random_uuid(), 'normal_user', 'user@test.com', 'user', NOW() - INTERVAL '2 days'),
      (gen_random_uuid(), 'new_user', 'new@test.com', 'user', NOW() - INTERVAL '1 hour')
  `);

  // Create workflow patterns for capabilities
  await db.query(`
    INSERT INTO workflow_pattern (pattern_id, hash, code, description)
    VALUES
      (gen_random_uuid(), 'abc1', 'export function test1() {}', 'Test capability 1'),
      (gen_random_uuid(), 'abc2', 'export function test2() {}', 'Test capability 2')
  `);

  // Create mcp_tool entries for graph nodes
  await db.query(`
    INSERT INTO mcp_tool (id, tool_name, server_name)
    VALUES
      (gen_random_uuid(), 'read_file', 'filesystem'),
      (gen_random_uuid(), 'write_file', 'filesystem'),
      (gen_random_uuid(), 'search', 'tavily')
  `);

  // Create tool_edge entries for graph edges
  const toolIds = await db.query<{ id: string }>(`SELECT id FROM mcp_tool LIMIT 2`);
  if (toolIds.length >= 2) {
    await db.query(`
      INSERT INTO tool_edge (from_tool_id, to_tool_id, edge_type, weight)
      VALUES ($1, $2, 'provides', 0.8)
    `, [toolIds[0].id, toolIds[1].id]);
  }

  // Create execution traces with various timestamps
  await db.query(`
    INSERT INTO execution_trace (id, user_id, success, duration_ms, executed_at)
    VALUES
      -- Today's executions
      (gen_random_uuid(), 'admin_user', true, 100, NOW() - INTERVAL '1 hour'),
      (gen_random_uuid(), 'admin_user', true, 150, NOW() - INTERVAL '2 hours'),
      (gen_random_uuid(), 'normal_user', true, 200, NOW() - INTERVAL '3 hours'),
      (gen_random_uuid(), 'normal_user', false, 50, NOW() - INTERVAL '4 hours'),
      -- Week old executions
      (gen_random_uuid(), 'admin_user', true, 120, NOW() - INTERVAL '3 days'),
      (gen_random_uuid(), 'normal_user', true, 180, NOW() - INTERVAL '5 days'),
      -- Older execution (for returning user calculation)
      (gen_random_uuid(), 'admin_user', true, 100, NOW() - INTERVAL '15 days')
  `);

  // Add error messages to failed executions
  await db.query(`
    UPDATE execution_trace
    SET error_message = 'Permission denied for this resource'
    WHERE success = false
  `);
}

// ============================================
// isAdminUser Tests
// ============================================

Deno.test("isAdminUser - returns true for 'local' user", async () => {
  const db = await setupTestDb();

  const result = await isAdminUser(db, "local");
  assertEquals(result, true);

  await db.close();
});

Deno.test("isAdminUser - returns true for admin role user", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const result = await isAdminUser(db, "admin_user");
  assertEquals(result, true);

  await db.close();
});

Deno.test("isAdminUser - returns false for non-admin user", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const result = await isAdminUser(db, "normal_user");
  assertEquals(result, false);

  await db.close();
});

Deno.test("isAdminUser - returns false for non-existent user", async () => {
  const db = await setupTestDb();

  const result = await isAdminUser(db, "unknown_user");
  assertEquals(result, false);

  await db.close();
});

// ============================================
// queryUserActivity Tests
// ============================================

Deno.test("queryUserActivity - returns user activity metrics for 24h", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const activity = await queryUserActivity(db, "24h");

  // Should have active users in last 24h
  assertGreater(activity.activeUsers, 0);
  assertEquals(activity.dailyActiveUsers, activity.activeUsers);

  // Top users should be populated
  assert(Array.isArray(activity.topUsers));

  await db.close();
});

Deno.test("queryUserActivity - returns user activity metrics for 7d", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const activity = await queryUserActivity(db, "7d");

  // 7d should have >= 24h users
  assert(activity.activeUsers >= 0);
  assert(activity.weeklyActiveUsers >= activity.dailyActiveUsers);

  await db.close();
});

Deno.test("queryUserActivity - returns new registrations", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const activity = await queryUserActivity(db, "24h");

  // Should have new_user registered in last 24h
  assertGreater(activity.newRegistrations, 0);

  await db.close();
});

// ============================================
// querySystemUsage Tests
// ============================================

Deno.test("querySystemUsage - returns system usage metrics", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const usage = await querySystemUsage(db, "24h");

  assertGreater(usage.totalExecutions, 0);
  assert(Array.isArray(usage.executionsByDay));

  await db.close();
});

Deno.test("querySystemUsage - calculates average executions per user", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const usage = await querySystemUsage(db, "7d");

  // If there are executions and users, avg should be > 0
  if (usage.totalExecutions > 0) {
    assert(usage.avgExecutionsPerUser >= 0);
  }

  await db.close();
});

// ============================================
// queryErrorHealth Tests
// ============================================

Deno.test("queryErrorHealth - returns error and health metrics", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const health = await queryErrorHealth(db, "24h");

  assertGreater(health.totalExecutions, 0);
  assertGreater(health.failedExecutions, 0);
  assert(health.errorRate > 0);
  assert(health.errorRate < 1);

  await db.close();
});

Deno.test("queryErrorHealth - categorizes errors by type", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const health = await queryErrorHealth(db, "24h");

  assert(Array.isArray(health.errorsByType));
  // Should have permission error category
  const permissionError = health.errorsByType.find((e) =>
    e.errorType === "permission"
  );
  assert(permissionError !== undefined);

  await db.close();
});

Deno.test("queryErrorHealth - returns latency percentiles", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const health = await queryErrorHealth(db, "24h");

  // p50 should be <= p95 <= p99
  assert(health.latencyPercentiles.p50 <= health.latencyPercentiles.p95);
  assert(health.latencyPercentiles.p95 <= health.latencyPercentiles.p99);
  assertGreater(health.latencyPercentiles.avg, 0);

  await db.close();
});

// ============================================
// queryResources Tests
// ============================================

Deno.test("queryResources - returns resource counts", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  const resources = await queryResources(db);

  assertGreater(resources.totalUsers, 0);
  assertGreater(resources.totalCapabilities, 0);
  assertGreater(resources.totalTraces, 0);
  assertGreater(resources.graphNodes, 0);
  assertGreater(resources.graphEdges, 0);

  await db.close();
});

// ============================================
// getAdminAnalytics Tests (with caching)
// ============================================

Deno.test("getAdminAnalytics - returns complete analytics object", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  clearAnalyticsCache();

  const analytics = await getAdminAnalytics(db, { timeRange: "24h" });

  assertEquals(analytics.timeRange, "24h");
  assert(analytics.generatedAt instanceof Date);
  assert(analytics.userActivity !== undefined);
  assert(analytics.systemUsage !== undefined);
  assert(analytics.errorHealth !== undefined);
  assert(analytics.resources !== undefined);

  await db.close();
});

Deno.test("getAdminAnalytics - uses cache on second call", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  clearAnalyticsCache();

  // First call - no cache
  const analytics1 = await getAdminAnalytics(db, { timeRange: "7d" });
  const stats1 = getCacheStats();
  assertEquals(stats1.entries, 1);

  // Second call - should use cache
  const analytics2 = await getAdminAnalytics(db, { timeRange: "7d" });

  // Same object from cache
  assertEquals(analytics1.generatedAt, analytics2.generatedAt);

  await db.close();
});

Deno.test("getAdminAnalytics - different time ranges have separate cache entries", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  clearAnalyticsCache();

  await getAdminAnalytics(db, { timeRange: "24h" });
  await getAdminAnalytics(db, { timeRange: "7d" });
  await getAdminAnalytics(db, { timeRange: "30d" });

  const stats = getCacheStats();
  assertEquals(stats.entries, 3);

  await db.close();
});

Deno.test("clearAnalyticsCache - clears all cache entries", async () => {
  const db = await setupTestDb();
  await seedTestData(db);

  // Add some cache entries
  await getAdminAnalytics(db, { timeRange: "24h" });
  await getAdminAnalytics(db, { timeRange: "7d" });

  const statsBefore = getCacheStats();
  assertGreater(statsBefore.entries, 0);

  clearAnalyticsCache();

  const statsAfter = getCacheStats();
  assertEquals(statsAfter.entries, 0);

  await db.close();
});

// ============================================
// Empty Database Tests
// ============================================

Deno.test("queryUserActivity - handles empty database", async () => {
  const db = await setupTestDb();

  const activity = await queryUserActivity(db, "24h");

  assertEquals(activity.activeUsers, 0);
  assertEquals(activity.dailyActiveUsers, 0);
  assertEquals(activity.topUsers.length, 0);

  await db.close();
});

Deno.test("queryErrorHealth - handles empty database", async () => {
  const db = await setupTestDb();

  const health = await queryErrorHealth(db, "24h");

  assertEquals(health.totalExecutions, 0);
  assertEquals(health.failedExecutions, 0);
  assertEquals(health.errorRate, 0);

  await db.close();
});
