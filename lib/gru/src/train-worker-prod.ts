/**
 * GRU Training Worker (Node.js subprocess)
 *
 * Invoked by Deno via `npx tsx train-worker-prod.ts <tempFile>`.
 * Reads training data from temp file, trains the CompactInformedGRU,
 * writes weights to a temp file, and outputs JSON status to stdout.
 *
 * Same IPC pattern as SHGAT train-worker.ts.
 *
 * @module gru/train-worker-prod
 */

import * as fs from "node:fs";
import { CompactInformedGRU } from "./transition/gru-model.ts";
import { initTensorFlow } from "./tf/mod.ts";
import type { TransitionExample, ToolCapabilityMap, VocabNode } from "./transition/types.ts";

interface CapabilityDataEntry {
  id: string;
  embedding: number[];
  toolChildren: string[];
  level: number;  // 1, 2, 3...
}

interface ExampleInput {
  intentEmbedding: number[];
  contextToolIds: string[];
  targetToolId: string;
  isTerminal: number;
  isSingleTool: boolean;
  compositeFeatures?: number[];
}

interface TrainingInput {
  examples: ExampleInput[];
  testExamples?: ExampleInput[];
  evalEvery?: number;
  toolEmbeddings: Record<string, number[]>;
  capabilityData?: CapabilityDataEntry[];
  existingWeightsPath?: string;
  config: {
    epochs: number;
    learningRate: number;
  };
}

/** Evaluate model on a set of examples — returns Hit@1 and termination accuracy */
function evaluate(
  model: CompactInformedGRU,
  examples: ExampleInput[],
  nodeToIndex: Map<string, number>,
): { hit1: number; termAcc: number; total: number } {
  let hit1 = 0;
  let termCorrect = 0;
  let total = 0;

  for (const ex of examples) {
    if (!nodeToIndex.has(ex.targetToolId)) continue;
    total++;

    const pred = model.predictNext(ex.intentEmbedding, ex.contextToolIds);
    if (pred.toolId === ex.targetToolId) hit1++;
    const predTerm = pred.shouldTerminate ? 1 : 0;
    if (predTerm === ex.isTerminal) termCorrect++;
  }

  return { hit1, termAcc: termCorrect, total };
}

async function main() {
  const tempFile = process.argv[2];
  if (!tempFile) {
    console.log(JSON.stringify({ success: false, error: "No temp file path provided" }));
    process.exit(1);
  }

  try {
    console.error("[GRU Worker] Reading input data...");
    const raw = fs.readFileSync(tempFile, "utf-8");
    const input: TrainingInput = JSON.parse(raw);

    console.error(`[GRU Worker] Initializing TensorFlow...`);
    await initTensorFlow();

    console.error(`[GRU Worker] ${input.examples.length} train examples, ${input.testExamples?.length ?? 0} test examples`);

    // Build tool vocabulary from embeddings
    const toolIds = Object.keys(input.toolEmbeddings);
    const embeddingDim = Object.values(input.toolEmbeddings)[0]?.length ?? 1024;

    // Create L0 tool embeddings map (Map<toolId, embedding>)
    const toolIdSet = new Set(toolIds);
    const toolsMap = new Map<string, number[]>();
    for (const id of toolIds) {
      toolsMap.set(id, input.toolEmbeddings[id]);
    }

    // Build capability hierarchy (higherLevelNodes) from capabilityData
    // Sort by level ascending so L1 nodes are registered before L2 (which may reference L1 children)
    const higherLevelNodes: VocabNode[] = [];
    const caps = [...(input.capabilityData ?? [])].sort((a, b) => a.level - b.level);

    if (caps.length > 0) {
      for (const cap of caps) {
        // Filter children to only those in our tool vocabulary
        const validChildren = cap.toolChildren.filter(t => toolIdSet.has(t));
        if (validChildren.length === 0) continue;

        higherLevelNodes.push({
          id: cap.id,
          level: cap.level,
          embedding: cap.embedding,
          children: validChildren,
        });
      }
      console.error(`[GRU Worker] ${higherLevelNodes.length} capability nodes (from ${caps.length} input caps)`);
    }

    // Build toolCapMap (binary tools × caps matrix)
    let toolCapMap: ToolCapabilityMap;
    if (higherLevelNodes.length > 0) {
      const numTools = toolIds.length;
      const numCaps = higherLevelNodes.length;
      const matrix = new Float32Array(numTools * numCaps);

      const toolToIdx = new Map<string, number>();
      for (let i = 0; i < toolIds.length; i++) {
        toolToIdx.set(toolIds[i], i);
      }

      for (let capIdx = 0; capIdx < higherLevelNodes.length; capIdx++) {
        const node = higherLevelNodes[capIdx];
        for (const child of node.children ?? []) {
          const toolIdx = toolToIdx.get(child);
          if (toolIdx !== undefined) {
            matrix[toolIdx * numCaps + capIdx] = 1;
          }
        }
      }

      toolCapMap = { matrix, numTools, numCapabilities: numCaps };
      console.error(`[GRU Worker] toolCapMap: ${numTools}×${numCaps}`);
    } else {
      // Fallback: minimal (no caps available)
      toolCapMap = {
        matrix: new Float32Array(toolIds.length * 1),
        numTools: toolIds.length,
        numCapabilities: 1,
      };
    }

    // Create model
    const model = new CompactInformedGRU({
      embeddingDim,
      learningRate: input.config.learningRate,
    });
    model.setToolVocabulary(toolsMap, toolCapMap, higherLevelNodes);

    // Build nodeToIndex for eval — full vocab (tools + registered caps)
    const nodeToIndex = new Map<string, number>();
    for (let i = 0; i < toolIds.length; i++) {
      nodeToIndex.set(toolIds[i], i);
    }
    // Add caps by level: L1 first (children=tools), then L2 (children=tools+L1 caps), etc.
    // Iterate until no new caps are added (handles arbitrary nesting depth).
    let capIdx = toolIds.length;
    const pending = higherLevelNodes.filter(n => n.level > 0);
    let prevSize = -1;
    while (nodeToIndex.size !== prevSize) {
      prevSize = nodeToIndex.size;
      for (const node of pending) {
        if (nodeToIndex.has(node.id)) continue;
        const allKnown = (node.children ?? []).every(c => nodeToIndex.has(c));
        if (allKnown) nodeToIndex.set(node.id, capIdx++);
      }
    }
    console.error(`[GRU Worker] nodeToIndex: ${nodeToIndex.size} entries (${toolIds.length} tools + ${nodeToIndex.size - toolIds.length} caps)`);

    // Load existing weights if available
    if (input.existingWeightsPath) {
      try {
        const weightsRaw = fs.readFileSync(input.existingWeightsPath, "utf-8");
        const weightsJson = JSON.parse(weightsRaw);
        // Support both formats: { names, weights, vocab? } (DB/new) and { weights: { names, weights } } (old file)
        const weightsData = (weightsJson.names && weightsJson.weights)
          ? weightsJson                       // DB format: { names, weights, vocab }
          : weightsJson.weights ?? weightsJson; // Old file format: nested under .weights
        model.loadWeights(weightsData);
        console.error("[GRU Worker] Loaded existing weights (warm start)");
      } catch (e) {
        console.error(`[GRU Worker] Could not load existing weights: ${e}`);
      }
    }

    // Convert examples to TransitionExample format.
    // IMPORTANT: Filter out examples whose targetToolId is not in the vocab.
    // This happens when:
    //   - A capability was renamed after the trace was recorded (old name fossilized in task_results)
    //   - Dynamic code:exec_xxx tools that don't persist in tool_embedding
    //   - Tools removed from the MCP server since the trace was captured
    // Without this filter, unknown targets silently map to index 0 (the first tool),
    // which poisons training with ~15% wrong labels. See no-silent-fallbacks.md.
    const allExamples: TransitionExample[] = input.examples.map((ex) => ({
      intentEmbedding: ex.intentEmbedding,
      contextToolIds: ex.contextToolIds,
      targetToolId: ex.targetToolId,
      isTerminal: ex.isTerminal,
      isSingleTool: ex.isSingleTool,
      compositeFeatures: ex.compositeFeatures,
    }));
    const transitionExamples = allExamples.filter(ex => nodeToIndex.has(ex.targetToolId));
    const skippedTrain = allExamples.length - transitionExamples.length;
    if (skippedTrain > 0) {
      console.error(`[GRU Worker] Filtered ${skippedTrain}/${allExamples.length} train examples with unknown targetToolId (not in vocab)`);
    }

    // Train (epoch × batch loop — trainStep is the only training API)
    const { epochs, learningRate: _lr } = input.config;
    const batchSize = 32;
    const evalEvery = input.evalEvery ?? 0;
    const hasTest = input.testExamples && input.testExamples.length > 0;

    console.error(`[GRU Worker] Training for ${epochs} epochs, batch=${batchSize}${hasTest ? `, eval every ${evalEvery} epochs` : ""}...`);

    let lastLoss = 0;
    let lastAcc = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle examples each epoch
      for (let i = transitionExamples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [transitionExamples[i], transitionExamples[j]] = [transitionExamples[j], transitionExamples[i]];
      }

      let epochLoss = 0;
      let epochAcc = 0;
      let batchCount = 0;

      for (let i = 0; i < transitionExamples.length; i += batchSize) {
        const batch = transitionExamples.slice(i, i + batchSize);
        if (batch.length === 0) continue;

        const metrics = model.trainStep(batch);
        epochLoss += metrics.loss;
        epochAcc += metrics.nextToolAccuracy;
        batchCount++;
      }

      lastLoss = epochLoss / batchCount;
      lastAcc = (epochAcc / batchCount) * 100;

      // Periodic eval on test set
      const isEvalEpoch = hasTest && evalEvery > 0 && ((epoch + 1) % evalEvery === 0 || epoch === epochs - 1);
      if (isEvalEpoch) {
        const testResult = evaluate(model, input.testExamples!, nodeToIndex);
        const testHit1 = (testResult.hit1 / testResult.total * 100).toFixed(1);
        const testTerm = (testResult.termAcc / testResult.total * 100).toFixed(1);
        console.error(
          `[GRU Worker] Epoch ${epoch + 1}/${epochs}: train_loss=${lastLoss.toFixed(4)}, train_acc=${lastAcc.toFixed(1)}% | test_hit1=${testHit1}%, test_term=${testTerm}% (${testResult.total} ex)`,
        );
      } else {
        console.error(`[GRU Worker] Epoch ${epoch + 1}/${epochs}: loss=${lastLoss.toFixed(4)}, acc=${lastAcc.toFixed(1)}%`);
      }
    }

    // Final eval
    if (hasTest) {
      const finalTest = evaluate(model, input.testExamples!, nodeToIndex);
      console.error(
        `[GRU Worker] Final test: hit1=${(finalTest.hit1 / finalTest.total * 100).toFixed(1)}%, term_acc=${(finalTest.termAcc / finalTest.total * 100).toFixed(1)}% (${finalTest.total}/${input.testExamples!.length} ex)`,
      );
    }

    console.error(`[GRU Worker] Final train: loss=${lastLoss.toFixed(4)}, accuracy=${lastAcc.toFixed(1)}%`);

    // Export weights + vocab metadata to temp file
    const exported = model.exportWeights();
    const vocabMeta = {
      toolIds,
      vocabNodes: higherLevelNodes.map(n => ({ id: n.id, level: n.level, children: n.children })),
    };
    const weightsFile = tempFile.replace(/\.json$/, "-weights.json");
    fs.writeFileSync(weightsFile, JSON.stringify({ ...exported, vocab: vocabMeta }));
    console.error(`[GRU Worker] Weights written to ${weightsFile}`);

    // Cleanup
    model.dispose();

    // Output lightweight result (caller reads weightsFile for DB save)
    console.log(JSON.stringify({
      success: true,
      finalLoss: lastLoss,
      finalAccuracy: lastAcc / 100,
      weightsFile,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  }
}

main();
