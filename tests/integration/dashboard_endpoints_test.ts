/**
 * Integration tests for dashboard HTTP endpoints - Story 6.2
 *
 * Tests the /dashboard and /api/graph/snapshot endpoints
 * served by the AgentCards gateway server.
 */

import { assertEquals, assertExists } from "@std/assert";
import { AgentCardsGatewayServer } from "../../src/mcp/gateway-server.ts";
import { PGliteClient } from "../../src/db/pglite-client.ts";

const TEST_PORT = 3001; // Use different port to avoid conflicts

Deno.test("GET /dashboard - serves HTML", async () => {
  const db = new PGliteClient(":memory:");
  await db.initialize();

  const gateway = new AgentCardsGatewayServer(db, {
    name: "test-gateway",
    version: "1.0.0",
    mcpServers: [],
  });

  // Start server in background
  const serverPromise = gateway.startHttp(TEST_PORT);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Make request to dashboard endpoint
    const response = await fetch(`http://localhost:${TEST_PORT}/dashboard`);

    // Verify response
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "text/html; charset=utf-8");

    const html = await response.text();

    // Verify HTML contains expected elements
    assertEquals(html.includes("<!DOCTYPE html>"), true);
    assertEquals(html.includes("AgentCards - Graph Dashboard"), true);
    assertEquals(html.includes("cytoscape"), true);
    assertEquals(html.includes("https://cdn.jsdelivr.net/npm/cytoscape"), true);
    assertEquals(html.includes("graph-container"), true);
    assertEquals(html.includes("legend"), true);
    assertEquals(html.includes("node-details"), true);
  } finally {
    // Cleanup
    gateway.stop();
    await serverPromise.catch(() => {}); // Ignore errors during shutdown
  }
});

Deno.test("GET /api/graph/snapshot - returns JSON", async () => {
  const db = new PGliteClient(":memory:");
  await db.initialize();

  const gateway = new AgentCardsGatewayServer(db, {
    name: "test-gateway",
    version: "1.0.0",
    mcpServers: [],
  });

  // Start server in background
  const serverPromise = gateway.startHttp(TEST_PORT + 1);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Make request to snapshot API endpoint
    const response = await fetch(`http://localhost:${TEST_PORT + 1}/api/graph/snapshot`);

    // Verify response
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/json");

    const snapshot = await response.json();

    // Verify structure
    assertExists(snapshot.nodes);
    assertExists(snapshot.edges);
    assertExists(snapshot.metadata);

    // Verify arrays
    assertEquals(Array.isArray(snapshot.nodes), true);
    assertEquals(Array.isArray(snapshot.edges), true);

    // Verify metadata
    assertEquals(typeof snapshot.metadata.total_nodes, "number");
    assertEquals(typeof snapshot.metadata.total_edges, "number");
    assertEquals(typeof snapshot.metadata.density, "number");
    assertExists(snapshot.metadata.last_updated);
  } finally {
    // Cleanup
    gateway.stop();
    await serverPromise.catch(() => {}); // Ignore errors during shutdown
  }
});

Deno.test("GET /api/graph/snapshot - with graph data", async () => {
  const db = new PGliteClient(":memory:");
  await db.initialize();

  const gateway = new AgentCardsGatewayServer(db, {
    name: "test-gateway",
    version: "1.0.0",
    mcpServers: [],
  });

  // Add some graph data before starting server
  const graphEngine = gateway["graphEngine"]; // Access private field for testing
  await graphEngine.syncFromWorkflowExecution([
    "mcp__filesystem__read_file",
    "mcp__postgres__query",
    "mcp__github__create_issue",
  ]);

  // Start server in background
  const serverPromise = gateway.startHttp(TEST_PORT + 2);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Make request to snapshot API endpoint
    const response = await fetch(`http://localhost:${TEST_PORT + 2}/api/graph/snapshot`);

    assertEquals(response.status, 200);

    const snapshot = await response.json();

    // Verify graph has data
    assertEquals(snapshot.nodes.length, 3);
    assertEquals(snapshot.edges.length, 2);
    assertEquals(snapshot.metadata.total_nodes, 3);
    assertEquals(snapshot.metadata.total_edges, 2);

    // Verify node structure
    const node = snapshot.nodes[0];
    assertExists(node.id);
    assertExists(node.label);
    assertExists(node.server);
    assertEquals(typeof node.pagerank, "number");
    assertEquals(typeof node.degree, "number");

    // Verify edge structure
    const edge = snapshot.edges[0];
    assertExists(edge.source);
    assertExists(edge.target);
    assertEquals(typeof edge.confidence, "number");
    assertEquals(typeof edge.observed_count, "number");

    // Verify confidence and pagerank are in valid ranges
    assertEquals(edge.confidence >= 0 && edge.confidence <= 1, true);
    assertEquals(node.pagerank >= 0 && node.pagerank <= 1, true);
  } finally {
    // Cleanup
    gateway.stop();
    await serverPromise.catch(() => {}); // Ignore errors during shutdown
  }
});

Deno.test("GET /dashboard - handles missing file gracefully", async () => {
  const db = new PGliteClient(":memory:");
  await db.initialize();

  const gateway = new AgentCardsGatewayServer(db, {
    name: "test-gateway",
    version: "1.0.0",
    mcpServers: [],
  });

  // Temporarily rename the dashboard file to simulate missing file
  const originalPath = "public/dashboard.html";
  const backupPath = "public/dashboard.html.bak";

  let fileRenamed = false;
  try {
    await Deno.rename(originalPath, backupPath);
    fileRenamed = true;
  } catch {
    // File might not exist or already renamed, skip this test
    return;
  }

  // Start server in background
  const serverPromise = gateway.startHttp(TEST_PORT + 3);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Make request to dashboard endpoint
    const response = await fetch(`http://localhost:${TEST_PORT + 3}/dashboard`);

    // Should return 404
    assertEquals(response.status, 404);

    const error = await response.json();
    assertExists(error.error);
  } finally {
    // Cleanup
    gateway.stop();
    await serverPromise.catch(() => {}); // Ignore errors during shutdown

    // Restore file if renamed
    if (fileRenamed) {
      try {
        await Deno.rename(backupPath, originalPath);
      } catch {
        // Ignore restore errors
      }
    }
  }
});
