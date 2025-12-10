/**
 * Shared test helpers for E2E tests
 */

import { ControlledExecutor } from "../../src/dag/controlled-executor.ts";
import { createDefaultClient } from "../../src/db/client.ts";
import { getAllMigrations, MigrationRunner } from "../../src/db/migrations.ts";
import { VectorSearch } from "../../src/vector/search.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import type { PGliteClient } from "../../src/db/client.ts";

/**
 * Shared test context (initialized once)
 */
let sharedDb: PGliteClient;
let sharedEmbeddingModel: EmbeddingModel;

/**
 * Initialize shared resources once for all tests
 */
export async function initializeOnce() {
  if (!sharedDb) {
    sharedDb = createDefaultClient();
    await sharedDb.connect();

    const runner = new MigrationRunner(sharedDb);
    await runner.runUp(getAllMigrations());
  }

  if (!sharedEmbeddingModel) {
    sharedEmbeddingModel = new EmbeddingModel();
    await sharedEmbeddingModel.load();
  }
}

/**
 * Helper to create test executor with code execution support
 */
export async function createTestExecutor(toolExecutor: any) {
  await initializeOnce();

  const vectorSearch = new VectorSearch(sharedDb, sharedEmbeddingModel);

  const executor = new ControlledExecutor(toolExecutor, {
    verbose: true,
  });

  // Enable code execution support
  executor.setCodeExecutionSupport(vectorSearch, new Map());

  // Enable checkpointing
  executor.setCheckpointManager(sharedDb);

  return executor;
}
