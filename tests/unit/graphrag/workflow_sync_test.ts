/**
 * Unit tests for WorkflowSyncService (Story 5.2)
 *
 * Tests cover:
 * - AC2: Sync creates DB entries with source='user'
 * - AC4: Checksum comparison triggers/skips sync
 * - AC6: Auto-bootstrap when graph empty
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import { PGliteClient } from "../../../src/db/client.ts";
import { MigrationRunner, getAllMigrations } from "../../../src/db/migrations.ts";
import { WorkflowSyncService } from "../../../src/graphrag/workflow-sync.ts";

/**
 * Create test database with schema
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  // Run all migrations
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

/**
 * Create temporary workflow YAML file
 */
async function createTempYaml(content: string): Promise<string> {
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(tempFile, content);
  return tempFile;
}

// ============================================
// AC2: Sync creates DB entries with source='user'
// ============================================

Deno.test("WorkflowSyncService - sync creates edges with source='user'", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: test_workflow
    steps: [tool_a, tool_b, tool_c]
`);

  const result = await syncService.sync(yamlPath, true);

  // Check sync succeeded
  assertEquals(result.success, true);
  assertEquals(result.workflowsProcessed, 1);
  assertEquals(result.edgesCreated, 2); // (a→b), (b→c)

  // Check edges were created with source='user'
  const edges = await db.query(
    `SELECT from_tool_id, to_tool_id, source, confidence_score
     FROM tool_dependency
     ORDER BY from_tool_id`,
  );

  assertEquals(edges.length, 2);
  assertEquals(edges[0].from_tool_id, "tool_a");
  assertEquals(edges[0].to_tool_id, "tool_b");
  assertEquals(edges[0].source, "user");
  assertEquals(edges[0].confidence_score, 0.9);

  assertEquals(edges[1].from_tool_id, "tool_b");
  assertEquals(edges[1].to_tool_id, "tool_c");
  assertEquals(edges[1].source, "user");

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - sync preserves observed_count on upsert", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  // Pre-create an edge with observed_count = 100
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score, source)
     VALUES ('tool_a', 'tool_b', 100, 0.5, 'learned')`,
  );

  const yamlPath = await createTempYaml(`
workflows:
  - name: test_workflow
    steps: [tool_a, tool_b]
`);

  const result = await syncService.sync(yamlPath, true);

  assertEquals(result.success, true);
  assertEquals(result.edgesUpdated, 1);
  assertEquals(result.edgesCreated, 0);

  // Check observed_count was preserved
  const edge = await db.queryOne(
    `SELECT observed_count, source, confidence_score
     FROM tool_dependency
     WHERE from_tool_id = 'tool_a' AND to_tool_id = 'tool_b'`,
  );

  assertExists(edge);
  assertEquals(edge.observed_count, 100); // Preserved
  assertEquals(edge.source, "user"); // Updated
  assertEquals(edge.confidence_score, 0.9); // Updated (GREATEST(0.5, 0.9))

  await Deno.remove(yamlPath);
  await db.close();
});

// ============================================
// AC4: Checksum comparison triggers/skips sync
// ============================================

Deno.test("WorkflowSyncService - needsSync returns true for new file", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml("workflows: []");

  const needsSync = await syncService.needsSync(yamlPath);

  assertEquals(needsSync, true);

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - needsSync returns false after sync", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: test
    steps: [a, b]
`);

  // First sync
  await syncService.sync(yamlPath, false);

  // Check if needs sync again
  const needsSync = await syncService.needsSync(yamlPath);

  assertEquals(needsSync, false);

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - needsSync returns true after file change", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: original
    steps: [a, b]
`);

  // First sync
  await syncService.sync(yamlPath, false);

  // Modify file
  await Deno.writeTextFile(
    yamlPath,
    `
workflows:
  - name: modified
    steps: [x, y, z]
`,
  );

  // Check if needs sync
  const needsSync = await syncService.needsSync(yamlPath);

  assertEquals(needsSync, true);

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - sync skips when unchanged (no --force)", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: test
    steps: [a, b]
`);

  // First sync
  const firstResult = await syncService.sync(yamlPath, false);
  assertEquals(firstResult.edgesCreated, 1);

  // Second sync without force
  const secondResult = await syncService.sync(yamlPath, false);
  assertEquals(secondResult.edgesCreated, 0);
  assertEquals(secondResult.edgesUpdated, 0);

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - sync runs with --force even when unchanged", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: test
    steps: [a, b]
`);

  // First sync
  await syncService.sync(yamlPath, true);

  // Second sync with force
  const result = await syncService.sync(yamlPath, true);

  // Should run and update existing edge
  assertEquals(result.edgesUpdated, 1);
  assertEquals(result.workflowsProcessed, 1);

  await Deno.remove(yamlPath);
  await db.close();
});

// ============================================
// AC6: Auto-bootstrap when graph empty
// ============================================

Deno.test("WorkflowSyncService - isGraphEmpty returns true for empty graph", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const isEmpty = await syncService.isGraphEmpty();

  assertEquals(isEmpty, true);

  await db.close();
});

Deno.test("WorkflowSyncService - isGraphEmpty returns false when edges exist", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  // Add an edge
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id)
     VALUES ('tool_a', 'tool_b')`,
  );

  const isEmpty = await syncService.isGraphEmpty();

  assertEquals(isEmpty, false);

  await db.close();
});

Deno.test("WorkflowSyncService - bootstrapIfEmpty syncs when graph empty", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const yamlPath = await createTempYaml(`
workflows:
  - name: bootstrap_workflow
    steps: [start, middle, end]
`);

  const bootstrapped = await syncService.bootstrapIfEmpty(yamlPath);

  assertEquals(bootstrapped, true);

  // Check edges were created
  const edges = await db.query(`SELECT * FROM tool_dependency`);
  assertEquals(edges.length, 2);

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - bootstrapIfEmpty skips when graph not empty", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  // Pre-populate graph
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id)
     VALUES ('existing_a', 'existing_b')`,
  );

  const yamlPath = await createTempYaml(`
workflows:
  - name: new_workflow
    steps: [a, b, c]
`);

  const bootstrapped = await syncService.bootstrapIfEmpty(yamlPath);

  assertEquals(bootstrapped, false);

  // Check only original edge exists
  const edges = await db.query(`SELECT * FROM tool_dependency`);
  assertEquals(edges.length, 1);
  assertEquals(edges[0].from_tool_id, "existing_a");

  await Deno.remove(yamlPath);
  await db.close();
});

Deno.test("WorkflowSyncService - bootstrapIfEmpty skips when file missing", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  const bootstrapped = await syncService.bootstrapIfEmpty("/nonexistent/file.yaml");

  assertEquals(bootstrapped, false);

  await db.close();
});

// ============================================
// Edge statistics
// ============================================

Deno.test("WorkflowSyncService - getEdgeStats returns correct counts", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  // Add user edges
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, source)
     VALUES ('user_a', 'user_b', 'user'), ('user_b', 'user_c', 'user')`,
  );

  // Add learned edges
  await db.query(
    `INSERT INTO tool_dependency (from_tool_id, to_tool_id, source)
     VALUES ('learned_a', 'learned_b', 'learned')`,
  );

  const stats = await syncService.getEdgeStats();

  assertEquals(stats.user, 2);
  assertEquals(stats.learned, 1);
  assertEquals(stats.total, 3);

  await db.close();
});

// ============================================
// Error handling
// ============================================

Deno.test("WorkflowSyncService - sync returns error result on failure", async () => {
  const db = await createTestDb();
  const syncService = new WorkflowSyncService(db);

  // Use invalid YAML (not an object with workflows)
  const yamlPath = await createTempYaml("invalid: not workflows");

  const result = await syncService.sync(yamlPath, true);

  assertEquals(result.success, false);
  assertExists(result.error);
  assert(result.error.includes("Invalid YAML"));

  await Deno.remove(yamlPath);
  await db.close();
});
