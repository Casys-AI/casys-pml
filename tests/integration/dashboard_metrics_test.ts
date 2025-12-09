/**
 * Integration tests for /api/metrics endpoint - Story 6.3
 *
 * Tests the metrics API endpoint served by the Casys Intelligence gateway server.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { GraphRAGEngine } from "../../src/graphrag/graph-engine.ts";

const TEST_PORT_BASE = 3100; // Use different port range to avoid conflicts
let portCounter = 0;

function getNextPort(): number {
  return TEST_PORT_BASE + portCounter++;
}

interface MockGatewayConfig {
  graphEngine: GraphRAGEngine;
  port: number;
}

async function createMockGateway(db: PGliteClient): Promise<MockGatewayConfig> {
  const graphEngine = new GraphRAGEngine(db);
  await graphEngine.syncFromDatabase();

  const port = getNextPort();

  return { graphEngine, port };
}

async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

// =============================================================================
// /api/metrics Endpoint Tests
// =============================================================================

Deno.test("GET /api/metrics - GraphRAGEngine.getMetrics returns valid structure", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  // Test the engine directly (simulating what the endpoint does)
  const metrics = await graphEngine.getMetrics("24h");

  // Verify structure
  assertExists(metrics);
  assertExists(metrics.current);
  assertExists(metrics.timeseries);
  assertExists(metrics.period);

  // Verify current metrics types
  assertEquals(typeof metrics.current.node_count, "number");
  assertEquals(typeof metrics.current.edge_count, "number");
  assertEquals(typeof metrics.current.density, "number");
  assertEquals(typeof metrics.current.adaptive_alpha, "number");
  assertEquals(typeof metrics.current.communities_count, "number");
  assertEquals(Array.isArray(metrics.current.pagerank_top_10), true);

  // Verify timeseries arrays
  assertEquals(Array.isArray(metrics.timeseries.edge_count), true);
  assertEquals(Array.isArray(metrics.timeseries.avg_confidence), true);
  assertEquals(Array.isArray(metrics.timeseries.workflow_rate), true);

  // Verify period stats
  assertEquals(metrics.period.range, "24h");
  assertEquals(typeof metrics.period.workflows_executed, "number");
  assertEquals(typeof metrics.period.workflows_success_rate, "number");
  assertEquals(typeof metrics.period.new_edges_created, "number");
  assertEquals(typeof metrics.period.new_nodes_added, "number");

  await db.close();
});

Deno.test("GET /api/metrics - range parameter 1h", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  const metrics = await graphEngine.getMetrics("1h");

  assertEquals(metrics.period.range, "1h");

  await db.close();
});

Deno.test("GET /api/metrics - range parameter 7d", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  const metrics = await graphEngine.getMetrics("7d");

  assertEquals(metrics.period.range, "7d");

  await db.close();
});

Deno.test("GET /api/metrics - empty graph returns sensible defaults", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  const metrics = await graphEngine.getMetrics("24h");

  // Empty graph should have zero nodes/edges
  assertEquals(metrics.current.node_count, 0);
  assertEquals(metrics.current.edge_count, 0);
  assertEquals(metrics.current.density, 0);

  // Alpha should be 1.0 (pure semantic) for empty graph
  assertEquals(metrics.current.adaptive_alpha, 1.0);

  // No communities
  assertEquals(metrics.current.communities_count, 0);

  // Empty PageRank list
  assertEquals(metrics.current.pagerank_top_10.length, 0);

  // Empty timeseries (no historical data)
  assertEquals(metrics.timeseries.edge_count.length, 0);
  assertEquals(metrics.timeseries.avg_confidence.length, 0);
  assertEquals(metrics.timeseries.workflow_rate.length, 0);

  await db.close();
});

Deno.test("GET /api/metrics - with graph data", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  // Add graph data directly to the engine
  const engine = graphEngine as any;
  if (engine.graph) {
    engine.graph.addNode("tool1");
    engine.graph.addNode("tool2");
    engine.graph.addNode("tool3");
    engine.graph.addEdge("tool1", "tool2", { weight: 0.8, count: 1 });
    engine.graph.addEdge("tool2", "tool3", { weight: 0.7, count: 2 });
    engine.pageRanks = { "tool1": 0.4, "tool2": 0.35, "tool3": 0.25 };
    engine.communities = { "tool1": "a", "tool2": "a", "tool3": "b" };
  }

  const metrics = await graphEngine.getMetrics("24h");

  // Should reflect graph data
  assertEquals(metrics.current.node_count, 3);
  assertEquals(metrics.current.edge_count, 2);
  assert(metrics.current.density > 0, "Density should be > 0");
  assert(metrics.current.adaptive_alpha < 1.0, "Alpha should be < 1.0 for graph with edges");
  assertEquals(metrics.current.communities_count, 2);
  assertEquals(metrics.current.pagerank_top_10.length, 3);

  // Verify PageRank ordering (descending)
  assertEquals(metrics.current.pagerank_top_10[0].tool_id, "tool1");
  assertEquals(metrics.current.pagerank_top_10[0].score, 0.4);

  await db.close();
});

Deno.test("GET /api/metrics - pagerank_top_10 is sorted descending", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  // Add PageRank values
  const engine = graphEngine as any;
  engine.pageRanks = {
    "tool_low": 0.1,
    "tool_high": 0.9,
    "tool_medium": 0.5,
  };

  const metrics = await graphEngine.getMetrics("24h");
  const pageranks = metrics.current.pagerank_top_10;

  assertEquals(pageranks[0].tool_id, "tool_high");
  assertEquals(pageranks[1].tool_id, "tool_medium");
  assertEquals(pageranks[2].tool_id, "tool_low");

  await db.close();
});

Deno.test("GET /api/metrics - adaptive_alpha in valid range", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  // Test with various graph configurations
  const configs = [
    { nodes: 0, edges: 0 },
    { nodes: 1, edges: 0 },
    { nodes: 2, edges: 1 },
    { nodes: 5, edges: 10 },
  ];

  for (const config of configs) {
    const engine = graphEngine as any;
    engine.graph.clear();

    for (let i = 0; i < config.nodes; i++) {
      engine.graph.addNode(`tool${i}`);
    }

    let edgesAdded = 0;
    for (let i = 0; i < config.nodes && edgesAdded < config.edges; i++) {
      for (let j = 0; j < config.nodes && edgesAdded < config.edges; j++) {
        if (i !== j) {
          try {
            engine.graph.addEdge(`tool${i}`, `tool${j}`, { weight: 0.5, count: 1 });
            edgesAdded++;
          } catch {
            // Edge might already exist
          }
        }
      }
    }

    const metrics = await graphEngine.getMetrics("24h");

    assert(
      metrics.current.adaptive_alpha >= 0.5,
      `Alpha should be >= 0.5, got ${metrics.current.adaptive_alpha}`,
    );
    assert(
      metrics.current.adaptive_alpha <= 1.0,
      `Alpha should be <= 1.0, got ${metrics.current.adaptive_alpha}`,
    );
  }

  await db.close();
});

Deno.test("GET /api/metrics - success_rate is percentage (0-100)", async () => {
  const db = await createTestDb();
  const { graphEngine } = await createMockGateway(db);

  const metrics = await graphEngine.getMetrics("24h");

  assert(
    metrics.period.workflows_success_rate >= 0,
    "Success rate should be >= 0",
  );
  assert(
    metrics.period.workflows_success_rate <= 100,
    "Success rate should be <= 100",
  );

  await db.close();
});
