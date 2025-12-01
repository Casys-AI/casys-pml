/**
 * Smoke test pour Story 6.2 - Dashboard et API Snapshot
 *
 * Teste simplement que le code ne plante pas et retourne la bonne structure
 */

import { assertEquals, assertExists } from "@std/assert";
import { PGliteClient } from "../../src/db/client.ts";
import { MigrationRunner, getAllMigrations } from "../../src/db/migrations.ts";
import { GraphRAGEngine } from "../../src/graphrag/graph-engine.ts";

// TEST CRITIQUE: getGraphSnapshot() ne plante pas et retourne une structure valide
Deno.test("Smoke test - getGraphSnapshot retourne structure JSON valide", async () => {
  const db = new PGliteClient("memory://");
  await db.connect();

  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runUp(getAllMigrations());

  const engine = new GraphRAGEngine(db);
  await engine.syncFromDatabase();

  // Appeler getGraphSnapshot
  const snapshot = engine.getGraphSnapshot();

  // Vérifier structure minimale requise pour le dashboard
  assertExists(snapshot);
  assertExists(snapshot.nodes);
  assertExists(snapshot.edges);
  assertExists(snapshot.metadata);

  assertEquals(Array.isArray(snapshot.nodes), true);
  assertEquals(Array.isArray(snapshot.edges), true);

  assertExists(snapshot.metadata.total_nodes);
  assertExists(snapshot.metadata.total_edges);
  assertExists(snapshot.metadata.density);
  assertExists(snapshot.metadata.last_updated);

  // Vérifier que c'est du JSON sérialisable (pas de fonctions, etc.)
  const json = JSON.stringify(snapshot);
  const parsed = JSON.parse(json);

  assertEquals(parsed.metadata.total_nodes, snapshot.metadata.total_nodes);
  assertEquals(parsed.metadata.total_edges, snapshot.metadata.total_edges);

  await db.close();
});

// TEST CRITIQUE: Le fichier dashboard.html existe et contient Cytoscape.js
Deno.test("Smoke test - dashboard.html existe et contient Cytoscape", async () => {
  const html = await Deno.readTextFile("public/dashboard.html");

  // Vérifier contenu essentiel
  assertEquals(html.includes("<!DOCTYPE html>"), true, "Doit être du HTML valide");
  assertEquals(html.includes("cytoscape"), true, "Doit inclure Cytoscape.js");
  assertEquals(html.includes("graph-container"), true, "Doit avoir le container du graph");
  assertEquals(html.includes("/api/graph/snapshot"), true, "Doit appeler l'API snapshot");
  assertEquals(html.includes("/events/stream"), true, "Doit se connecter au SSE");
  assertEquals(html.includes("EventSource"), true, "Doit utiliser EventSource pour SSE");
});
