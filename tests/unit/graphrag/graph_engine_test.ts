/**
 * Unit tests for GraphRAG Engine
 *
 * Tests cover all Core GraphRAG acceptance criteria:
 * - AC1: Graphology dependencies integration
 * - AC2: Graph sync from PGlite
 * - AC3: PageRank computation
 * - AC4: Community detection (Louvain)
 * - AC5: Shortest path finding
 * - AC6: DAG builder using graph topology
 * - AC7: Performance targets (<50ms sync, <100ms PageRank)
 * - AC8: Unit tests for graph operations
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { createInitialMigration } from "../../../src/db/migrations.ts";

/**
 * Create test database with schema
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  // Run initial migration
  const migration = createInitialMigration();
  await migration.up(db);

  // Run GraphRAG migration
  const graphragMigration = await Deno.readTextFile(
    "src/db/migrations/003_graphrag_tables.sql",
  );
  await db.exec(graphragMigration);

  return db;
}

/**
 * Insert test tools into database
 */
async function insertTestTools(db: PGliteClient): Promise<void> {
  // Create test tools with embeddings
  const tools = [
    { id: "filesystem:read", server: "filesystem", name: "read_file" },
    { id: "json:parse", server: "json", name: "parse" },
    { id: "filesystem:write", server: "filesystem", name: "write_file" },
    { id: "http:get", server: "http", name: "get" },
    { id: "json:stringify", server: "json", name: "stringify" },
  ];

  for (const tool of tools) {
    // Insert tool schema
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `Test tool ${tool.name}`, "{}"],
    );

    // Insert tool embedding (dummy 1024-dim vector)
    const embedding = new Array(1024).fill(0).map(() => Math.random());
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `[${embedding.join(",")}]`, "{}"],
    );
  }
}

/**
 * Insert test dependencies into database
 */
async function insertTestDependencies(db: PGliteClient): Promise<void> {
  const dependencies = [
    { from: "http:get", to: "json:parse", count: 10, confidence: 0.9 },
    { from: "json:parse", to: "filesystem:write", count: 5, confidence: 0.7 },
    { from: "filesystem:read", to: "json:parse", count: 8, confidence: 0.85 },
    { from: "json:stringify", to: "filesystem:write", count: 6, confidence: 0.75 },
  ];

  for (const dep of dependencies) {
    await db.query(
      `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
       VALUES ($1, $2, $3, $4)`,
      [dep.from, dep.to, dep.count, dep.confidence],
    );
  }
}

// ============================================
// AC1: Graphology dependencies integration
// ============================================

Deno.test("GraphRAGEngine - can import Graphology dependencies", () => {
  // Test that Graphology modules are accessible
  const engine = new GraphRAGEngine(new PGliteClient("memory://"));
  assertExists(engine);
});

// ============================================
// AC2: Graph sync from PGlite
// ============================================

Deno.test("GraphRAGEngine - sync from database loads nodes and edges", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const stats = engine.getStats();
  assertEquals(stats.nodeCount, 5, "Should load 5 tool nodes");
  assertEquals(stats.edgeCount, 4, "Should load 4 dependency edges");

  await db.close();
});

Deno.test("GraphRAGEngine - sync handles empty database gracefully", async () => {
  const db = await createTestDb();

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const stats = engine.getStats();
  assertEquals(stats.nodeCount, 0);
  assertEquals(stats.edgeCount, 0);

  await db.close();
});

// ============================================
// AC3: PageRank computation
// ============================================

Deno.test("GraphRAGEngine - PageRank scores between 0 and 1", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const rank1 = engine.getPageRank("filesystem:read");
  const rank2 = engine.getPageRank("json:parse");

  assert(rank1 >= 0 && rank1 <= 1, `PageRank ${rank1} should be between 0 and 1`);
  assert(rank2 >= 0 && rank2 <= 1, `PageRank ${rank2} should be between 0 and 1`);

  await db.close();
});

Deno.test("GraphRAGEngine - PageRank ranks frequently used tools higher", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // json:parse is a hub (2 incoming edges)
  const parseRank = engine.getPageRank("json:parse");
  // filesystem:write is a sink (2 incoming edges)
  const writeRank = engine.getPageRank("filesystem:write");
  // http:get is a source (0 incoming edges)
  const getRank = engine.getPageRank("http:get");

  // json:parse and filesystem:write should have higher PageRank than http:get
  assert(
    parseRank > getRank || writeRank > getRank,
    `Hub/sink tools should have higher PageRank than source tools`,
  );

  await db.close();
});

// ============================================
// AC4: Community detection (Louvain)
// ============================================

Deno.test("GraphRAGEngine - community detection groups related tools", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const community1 = engine.getCommunity("json:parse");
  const community2 = engine.getCommunity("filesystem:write");

  assertExists(community1, "json:parse should belong to a community");
  assertExists(community2, "filesystem:write should belong to a community");

  await db.close();
});

Deno.test("GraphRAGEngine - findCommunityMembers returns tools in same cluster", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const members = engine.findCommunityMembers("json:parse");

  // Should return other tools in same community (at least 1)
  assert(Array.isArray(members), "Should return array of community members");
  // Should not include the tool itself
  assert(!members.includes("json:parse"), "Should not include the tool itself");

  await db.close();
});

// ============================================
// AC5: Shortest path finding
// ============================================

Deno.test("GraphRAGEngine - findShortestPath returns correct path", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const path = engine.findShortestPath("http:get", "filesystem:write");

  assertExists(path, "Should find path from http:get to filesystem:write");
  assertEquals(path![0], "http:get", "Path should start with http:get");
  assertEquals(path![path!.length - 1], "filesystem:write", "Path should end with filesystem:write");
  assert(path!.length >= 2, "Path should have at least 2 nodes");

  await db.close();
});

Deno.test("GraphRAGEngine - findShortestPath returns null for disconnected tools", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  // No dependencies - tools are disconnected

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const path = engine.findShortestPath("http:get", "filesystem:write");

  assertEquals(path, null, "Should return null for disconnected tools");

  await db.close();
});

// ============================================
// AC6: DAG builder using graph topology
// ============================================

Deno.test("GraphRAGEngine - buildDAG creates dependencies based on graph topology", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const dag = engine.buildDAG(["http:get", "json:parse", "filesystem:write"]);

  assertEquals(dag.tasks.length, 3, "Should create 3 tasks");
  assertEquals(dag.tasks[0].tool, "http:get");
  assertEquals(dag.tasks[1].tool, "json:parse");
  assertEquals(dag.tasks[2].tool, "filesystem:write");

  // json:parse should depend on http:get (path exists)
  assert(
    dag.tasks[1].depends_on.length > 0,
    "json:parse should have dependencies",
  );

  await db.close();
});

Deno.test("GraphRAGEngine - buildDAG handles tools with no dependencies", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  // No dependencies inserted

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const dag = engine.buildDAG(["filesystem:read", "http:get"]);

  assertEquals(dag.tasks.length, 2);
  assertEquals(dag.tasks[0].depends_on.length, 0, "First task should have no dependencies");
  assertEquals(dag.tasks[1].depends_on.length, 0, "Second task should have no dependencies (no path)");

  await db.close();
});

// ============================================
// AC7: Performance targets
// ============================================

Deno.test("GraphRAGEngine - graph sync completes within 50ms", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);

  const startTime = performance.now();
  await engine.syncFromDatabase();
  const syncTime = performance.now() - startTime;

  assert(syncTime < 50, `Graph sync took ${syncTime.toFixed(2)}ms, should be <50ms`);

  await db.close();
});

// ============================================
// AC8: Unit tests for graph operations
// ============================================

Deno.test("GraphRAGEngine - getStats returns accurate graph statistics", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  const stats = engine.getStats();

  assertExists(stats);
  assertEquals(stats.nodeCount, 5);
  assertEquals(stats.edgeCount, 4);
  assert(stats.communities >= 1, "Should have at least 1 community");
  assert(stats.avgPageRank > 0 && stats.avgPageRank <= 1, "avgPageRank should be between 0 and 1");

  await db.close();
});

Deno.test("GraphRAGEngine - updateFromExecution strengthens edges", async () => {
  const db = await createTestDb();
  await insertTestTools(db);
  await insertTestDependencies(db);

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Simulate workflow execution
  const execution = {
    execution_id: crypto.randomUUID(),
    executed_at: new Date(),
    intent_text: "test workflow",
    dag_structure: {
      tasks: [
        { id: "task_0", tool: "http:get", arguments: {}, depends_on: [] },
        { id: "task_1", tool: "json:parse", arguments: {}, depends_on: ["task_0"] },
      ],
    },
    success: true,
    execution_time_ms: 100,
  };

  await engine.updateFromExecution(execution);

  // Verify edge was updated in database
  const result = await db.queryOne(
    `SELECT observed_count, confidence_score FROM tool_dependency
     WHERE from_tool_id = $1 AND to_tool_id = $2`,
    ["http:get", "json:parse"],
  );

  assertExists(result);
  assert((result.observed_count as number) > 10, "observed_count should have increased");

  await db.close();
});
