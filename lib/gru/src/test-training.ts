#!/usr/bin/env -S deno run --allow-all
/**
 * GRU TransitionModel Training Test
 *
 * Loads data from PostgreSQL and tests the TransitionModel:
 * 1. Export traces as TransitionExamples
 * 2. Load tool embeddings
 * 3. Train the model
 * 4. Evaluate on test set
 *
 * Usage:
 *   deno run --allow-all lib/gru/src/test-training.ts
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 */

import { load } from "jsr:@std/dotenv@0.225.0";
import postgres from "npm:postgres@3.4.5";

import { initTensorFlow, logMemory } from "./tf/backend.ts";
import { TransitionModel } from "./transition/gru-model.ts";
import type { TransitionExample } from "./transition/types.ts";

/**
 * Parse embedding from PostgreSQL text format
 * Handles both JSON arrays and pgvector format
 */
function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) {
    return JSON.parse(embStr);
  }
  // pgvector format: remove brackets and split
  const cleaned = embStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Load environment
await load({ export: true });

const DATABASE_URL = Deno.env.get("DATABASE_URL") ||
  "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";

console.log("[GRU] TransitionModel Training Test\n");

// Initialize TensorFlow.js
console.log("[TF] Initializing TensorFlow.js...");
const backend = await initTensorFlow();
console.log(`     Backend: ${backend}`);
logMemory("     ");

// Connect to database
console.log("\n[DB] Connecting to database...");
const sql = postgres(DATABASE_URL);

// 1. Load tool embeddings
console.log("\n[1/7] Loading tool embeddings...");
const toolRows = await sql`
  SELECT tool_id, embedding::text
  FROM tool_embedding
  ORDER BY tool_id
`;

const toolEmbeddings = new Map<string, number[]>();
for (const row of toolRows) {
  const embedding = parseEmbedding(row.embedding);
  if (embedding && embedding.length > 0) {
    toolEmbeddings.set(row.tool_id, embedding);
  }
}
console.log(`      Loaded ${toolEmbeddings.size} tool embeddings`);

// Get embedding dimension
const firstEmb = toolEmbeddings.values().next().value;
const embeddingDim = firstEmb?.length || 1024;
console.log(`      Embedding dimension: ${embeddingDim}`);

// 2. Load execution traces with intent embeddings
console.log("\n[2/7] Loading execution traces...");
const traceRows = await sql`
  SELECT
    et.id,
    et.task_results,
    et.success,
    wp.intent_embedding::text as intent_embedding
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) > 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

console.log(`      Loaded ${traceRows.length} multi-tool traces with intent embeddings`);

// 3. Generate TransitionExamples from traces
console.log("\n[3/7] Generating TransitionExamples...");
const allExamples: TransitionExample[] = [];

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;

  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSequence = taskResults
    .map((t) => t.tool)
    .filter((t): t is string => !!t && toolEmbeddings.has(t));

  if (toolSequence.length < 2) continue;

  // Generate step-by-step examples
  for (let i = 0; i < toolSequence.length; i++) {
    allExamples.push({
      intentEmbedding,
      contextToolIds: toolSequence.slice(0, i),
      targetToolId: toolSequence[i],
      isTerminal: i === toolSequence.length - 1 ? 1 : 0,
    });
  }
}

console.log(`      Generated ${allExamples.length} transition examples`);

// Split train/test (80/20)
shuffle(allExamples);
const splitIdx = Math.floor(allExamples.length * 0.8);
const trainExamples = allExamples.slice(0, splitIdx);
const testExamples = allExamples.slice(splitIdx);

console.log(`      Train: ${trainExamples.length}, Test: ${testExamples.length}`);

// 4. Create and configure TransitionModel
console.log("\n[4/7] Creating TransitionModel...");
const model = new TransitionModel({
  embeddingDim,
  hiddenDim: 128,
  terminationThreshold: 0.7,
  maxPathLength: 10,
  dropout: 0.1,
  learningRate: 0.001,
});

model.setToolVocabulary(toolEmbeddings);
console.log(`      Vocabulary size: ${toolEmbeddings.size} tools`);

// 5. Training loop
console.log("\n[5/7] Training...");
const EPOCHS = 30;
const BATCH_SIZE = 32;

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const epochStart = performance.now();

  // Shuffle training data each epoch
  const shuffledTrain = shuffle([...trainExamples]);

  let epochLoss = 0;
  let epochNextAcc = 0;
  let epochTermAcc = 0;
  let batchCount = 0;

  for (let i = 0; i < shuffledTrain.length; i += BATCH_SIZE) {
    const batch = shuffledTrain.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;

    const metrics = await model.trainStep(batch);

    epochLoss += metrics.loss;
    epochNextAcc += metrics.nextToolAccuracy;
    epochTermAcc += metrics.terminationAccuracy;
    batchCount++;
  }

  const avgLoss = epochLoss / batchCount;
  const avgNextAcc = (epochNextAcc / batchCount) * 100;
  const avgTermAcc = (epochTermAcc / batchCount) * 100;
  const epochTime = (performance.now() - epochStart) / 1000;

  console.log(
    `      Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
    `loss=${avgLoss.toFixed(4)}, ` +
    `nextAcc=${avgNextAcc.toFixed(1)}%, ` +
    `termAcc=${avgTermAcc.toFixed(1)}%, ` +
    `time=${epochTime.toFixed(1)}s`
  );

  logMemory("      ");
}

// 6. Evaluation
console.log("\n[6/7] Evaluating on test set...");
let correctNext = 0;
let correctTerm = 0;

for (const ex of testExamples) {
  const pred = await model.predictNext(ex.intentEmbedding, ex.contextToolIds);

  if (pred.toolId === ex.targetToolId) correctNext++;
  if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
}

const testNextAcc = (correctNext / testExamples.length) * 100;
const testTermAcc = (correctTerm / testExamples.length) * 100;

console.log(`      Next tool accuracy: ${testNextAcc.toFixed(1)}%`);
console.log(`      Termination accuracy: ${testTermAcc.toFixed(1)}%`);

// 7. Test path building
console.log("\n[7/7] Testing path building...");
const sampleTrace = traceRows[0];
if (sampleTrace) {
  const sampleIntent = parseEmbedding(sampleTrace.intent_embedding);

  if (sampleIntent) {
    const taskResults = sampleTrace.task_results as Array<{ tool?: string }>;
    const actualPath = taskResults
      .map((t) => t.tool)
      .filter((t): t is string => !!t);

    if (actualPath.length > 0) {
      const predictedPath = await model.buildPath(sampleIntent, actualPath[0]);

      console.log(`      Actual path:    [${actualPath.join(" -> ")}]`);
      console.log(`      Predicted path: [${predictedPath.join(" -> ")}]`);
    }
  }
}

// Cleanup
console.log("\n[Done] Test complete!");
logMemory("Final ");
model.dispose();
await sql.end();
