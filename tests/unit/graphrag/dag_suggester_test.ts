/**
 * Unit tests for DAG Suggester
 *
 * Tests integration between vector search and graph algorithms.
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import { VectorSearch } from "../../../src/vector/search.ts";
import { EmbeddingModel } from "../../../src/vector/embeddings.ts";
import { PGliteClient } from "../../../src/db/client.ts";
import { createInitialMigration } from "../../../src/db/migrations.ts";

/**
 * Create test database with full schema
 */
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();

  const migration = createInitialMigration();
  await migration.up(db);

  const graphragMigration = await Deno.readTextFile(
    "src/db/migrations/003_graphrag_tables.sql",
  );
  await db.exec(graphragMigration);

  return db;
}

/**
 * Insert comprehensive test data
 */
async function insertTestData(db: PGliteClient, model: EmbeddingModel): Promise<void> {
  const tools = [
    { id: "filesystem:read", server: "filesystem", name: "read_file", desc: "Read file contents from filesystem" },
    { id: "json:parse", server: "json", name: "parse", desc: "Parse JSON data from text" },
    { id: "filesystem:write", server: "filesystem", name: "write_file", desc: "Write content to file" },
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

Deno.test("DAGSuggester - suggests DAG for high confidence intent", async () => {
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
});

Deno.test("DAGSuggester - returns null for low confidence intent", async () => {
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

  // Should return null due to low semantic similarity
  assertEquals(suggestion, null, "Should return null for very low confidence");

  await db.close();
});

Deno.test("DAGSuggester - includes dependency paths in suggestion", async () => {
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
});

Deno.test("DAGSuggester - generates rationale for suggestion", async () => {
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
    assert(
      suggestion.rationale.includes("semantic") || suggestion.rationale.includes("PageRank"),
      "Rationale should mention semantic or PageRank",
    );
  }

  await db.close();
});

Deno.test("DAGSuggester - finds alternative tools from same community", async () => {
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
});
