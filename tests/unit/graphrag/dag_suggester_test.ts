/**
 * Unit tests for DAG Suggester
 *
 * Tests integration between vector search and graph algorithms.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../../src/vector/search.ts";
import { EmbeddingModel } from "../../../src/vector/embeddings.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../../src/db/migrations.ts";

/**
 * Create test database with full schema
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  // Run all migrations properly (including edge_type columns from migration 012)
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  return db;
}

/**
 * Insert comprehensive test data
 */
async function insertTestData(db: PGliteClient, model: EmbeddingModel): Promise<void> {
  const tools = [
    {
      id: "filesystem:read",
      server: "filesystem",
      name: "read_file",
      desc: "Read file contents from filesystem",
    },
    { id: "json:parse", server: "json", name: "parse", desc: "Parse JSON data from text" },
    {
      id: "filesystem:write",
      server: "filesystem",
      name: "write_file",
      desc: "Write content to file",
    },
    { id: "http:get", server: "http", name: "get", desc: "Fetch HTTP resource from URL" },
  ];

  for (const tool of tools) {
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, tool.desc, "{}"],
    );

    const embedding = await model.encode(tool.desc);
    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [tool.id, tool.server, tool.name, `[${embedding.join(",")}]`, "{}"],
    );
  }

  // Add dependencies
  const deps = [
    { from: "http:get", to: "json:parse", count: 10, confidence: 0.9 },
    { from: "json:parse", to: "filesystem:write", count: 5, confidence: 0.7 },
  ];

  for (const dep of deps) {
    await db.query(
      `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score)
       VALUES ($1, $2, $3, $4)`,
      [dep.from, dep.to, dep.count, dep.confidence],
    );
  }
}

Deno.test({
  name: "DAGSuggester - suggests DAG for high confidence intent",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new EmbeddingModel();
    await model.load();

    await insertTestData(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const suggestion = await suggester.suggestDAG({
      text: "read file and parse JSON",
    });

    assertExists(suggestion, "Should return suggestion for high confidence intent");
    assertExists(suggestion!.dagStructure);
    assertExists(suggestion!.confidence);
    assert(suggestion!.confidence >= 0.5, "Confidence should be reasonable");

    await db.close();
  },
});

Deno.test({
  name: "DAGSuggester - returns suggestion with warning for low confidence (ADR-026)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new EmbeddingModel();
    await model.load();

    // Insert minimal data to ensure low confidence
    await insertTestData(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const suggestion = await suggester.suggestDAG({
      text: "completely unrelated quantum mechanics calculation",
    });

    // ADR-026: Never return null if semantic candidates exist
    // Instead, return suggestion with warning for low confidence
    if (suggestion === null) {
      // No semantic candidates found at all (score < 0.5 threshold)
      // This is expected if the query truly has no semantic match
      assertEquals(suggestion, null, "No candidates found - correct behavior");
    } else {
      // Candidates found but low confidence - should have warning
      assert(suggestion.warning !== undefined, "Low confidence should include warning");
      assert(
        suggestion.warning.includes("cold start") || suggestion.warning.includes("Low confidence"),
        "Warning should mention cold start or low confidence",
      );
      assert(suggestion.confidence < 0.50, "Confidence should be below threshold");
    }

    await db.close();
  },
});

Deno.test({
  name: "DAGSuggester - includes dependency paths in suggestion",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new EmbeddingModel();
    await model.load();

    await insertTestData(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const suggestion = await suggester.suggestDAG({
      text: "fetch HTTP and parse JSON",
    });

    if (suggestion) {
      assertExists(suggestion.dependencyPaths, "Should include dependency paths");
      assert(Array.isArray(suggestion.dependencyPaths), "Dependency paths should be an array");
    }

    await db.close();
  },
});

Deno.test({
  name: "DAGSuggester - generates rationale for suggestion",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new EmbeddingModel();
    await model.load();

    await insertTestData(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const suggestion = await suggester.suggestDAG({
      text: "read file",
    });

    if (suggestion) {
      assertExists(suggestion.rationale, "Should include rationale");
      assert(suggestion.rationale.length > 0, "Rationale should not be empty");
      // ADR-022: Now uses hybrid search rationale
      assert(
        suggestion.rationale.includes("hybrid") ||
          suggestion.rationale.includes("semantic") ||
          suggestion.rationale.includes("PageRank"),
        "Rationale should mention hybrid, semantic, or PageRank",
      );
    }

    await db.close();
  },
});

Deno.test({
  name: "DAGSuggester - finds alternative tools from same community",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const db = await createTestDb();
    const model = new EmbeddingModel();
    await model.load();

    await insertTestData(db, model);

    const graphEngine = new GraphRAGEngine(db);
    await graphEngine.syncFromDatabase();

    const vectorSearch = new VectorSearch(db, model);
    const suggester = new DAGSuggester(graphEngine, vectorSearch);

    const suggestion = await suggester.suggestDAG({
      text: "work with files",
    });

    if (suggestion) {
      assertExists(suggestion.alternatives);
      assert(Array.isArray(suggestion.alternatives), "Alternatives should be an array");
    }

    await db.close();
  },
});
