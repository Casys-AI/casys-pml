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
// MLflow client loaded dynamically — handles environments where tsx
// can't resolve .ts files outside lib/gru (plain Node.js ESM limitation)
// deno-lint-ignore no-explicit-any
type MLflowClient = any;

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

/** Evaluate model on a set of examples — returns Hit@1 and termination accuracy, split by tool vs cap */
function evaluate(
  model: CompactInformedGRU,
  examples: ExampleInput[],
  nodeToIndex: Map<string, number>,
  toolIdSet: Set<string>,
  toolToCapLookup?: Map<string, Set<string>>,
  capToChildrenLookup?: Map<string, Set<string>>,
): { hit1: number; termAcc: number; total: number; toolHit1: number; toolTotal: number; capHit1: number; capTotal: number; sameCluster: number; diffCluster: number; bothOrphan: number; wrongTotal: number; capPredChild: number; capWrongTotal: number } {
  let hit1 = 0;
  let termCorrect = 0;
  let total = 0;
  let toolHit1 = 0;
  let toolTotal = 0;
  let capHit1 = 0;
  let capTotal = 0;
  let sameCluster = 0;
  let diffCluster = 0;
  let bothOrphan = 0;
  let wrongTotal = 0;
  let capPredChild = 0;  // target=cap, predicted=child of that cap
  let capWrongTotal = 0; // total wrong cap predictions

  for (const ex of examples) {
    if (!nodeToIndex.has(ex.targetToolId)) continue;
    total++;

    const pred = model.predictNext(ex.intentEmbedding, ex.contextToolIds);
    // Use nodeId (raw vocab ID) for comparison — toolId resolves caps to first child
    const isCorrect = pred.nodeId === ex.targetToolId || pred.toolId === ex.targetToolId;
    if (isCorrect) hit1++;
    const predTerm = pred.shouldTerminate ? 1 : 0;
    if (predTerm === ex.isTerminal) termCorrect++;

    // Split by target type
    if (toolIdSet.has(ex.targetToolId)) {
      toolTotal++;
      if (isCorrect) toolHit1++;
    } else {
      capTotal++;
      if (isCorrect) capHit1++;
    }

    // Same-cluster confusion (only for wrong tool predictions)
    if (!isCorrect && toolIdSet.has(ex.targetToolId) && toolToCapLookup) {
      wrongTotal++;
      const targetCaps = toolToCapLookup.get(ex.targetToolId);
      const predId = pred.nodeId ?? pred.toolId;
      const predCaps = toolToCapLookup.get(predId);

      if (!targetCaps?.size && !predCaps?.size) {
        bothOrphan++;
      } else if (targetCaps && predCaps) {
        const shared = [...targetCaps].some(c => predCaps.has(c));
        if (shared) sameCluster++;
        else diffCluster++;
      } else {
        diffCluster++;
      }
    }

    // Cap confusion: target=cap, predicted=child of that cap
    if (!isCorrect && !toolIdSet.has(ex.targetToolId) && capToChildrenLookup) {
      capWrongTotal++;
      const predId = pred.nodeId ?? pred.toolId;
      const children = capToChildrenLookup.get(ex.targetToolId);
      if (children?.has(predId)) capPredChild++;
    }
  }

  return { hit1, termAcc: termCorrect, total, toolHit1, toolTotal, capHit1, capTotal, sameCluster, diffCluster, bothOrphan, wrongTotal, capPredChild, capWrongTotal };
}

async function main() {
  const tempFile = process.argv[2];
  if (!tempFile) {
    console.log(JSON.stringify({ success: false, error: "No temp file path provided" }));
    process.exit(1);
  }

  // MLflow tracking (no-op if MLFLOW_TRACKING_URI not set)
  let mlflow: MLflowClient | null = null;

  try {
    console.error("[GRU Worker] Reading input data...");
    const raw = fs.readFileSync(tempFile, "utf-8");
    const input: TrainingInput = JSON.parse(raw);

    // Dynamic import — tsx wraps cross-project .ts exports under `default`
    try {
      const mod = await import("../../mlflow/client.ts");
      const createMLflowClient = mod.createMLflowClient ?? mod.default?.createMLflowClient;
      if (createMLflowClient) {
        mlflow = createMLflowClient(
          process.env.MLFLOW_TRACKING_URI,
          "gru-training",
          `gru-${new Date().toISOString().slice(0, 16)}`,
          { model: "gru" },
        );
      }
    } catch {
      console.error("[GRU Worker] MLflow client not available — continuing without tracking");
    }

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
      // Build cap name set for accepting cap-children (natural hierarchy: L2→L1→L0)
      const capNameSet = new Set(caps.map(c => c.id));
      for (const cap of caps) {
        // Accept L0 tools AND known cap names as children (setToolVocabulary handles bottom-up)
        const validChildren = cap.toolChildren.filter(t => toolIdSet.has(t) || capNameSet.has(t));
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

      // Build cap children lookup for transitive walk (L2→L1→L0)
      const capChildrenLookup = new Map<string, string[]>();
      for (const node of higherLevelNodes) {
        capChildrenLookup.set(node.id, node.children ?? []);
      }
      for (let capIdx = 0; capIdx < higherLevelNodes.length; capIdx++) {
        const node = higherLevelNodes[capIdx];
        // BFS to reach L0 tools through cap-children
        const queue = [...(node.children ?? [])];
        const visited = new Set<string>();
        while (queue.length > 0) {
          const child = queue.shift()!;
          if (visited.has(child)) continue;
          visited.add(child);
          const toolIdx = toolToIdx.get(child);
          if (toolIdx !== undefined) {
            matrix[toolIdx * numCaps + capIdx] = 1;
          } else {
            const grandChildren = capChildrenLookup.get(child);
            if (grandChildren) queue.push(...grandChildren);
          }
        }
      }

      toolCapMap = { matrix, numTools, numCapabilities: numCaps };
      console.error(`[GRU Worker] toolCapMap: ${numTools}×${numCaps}`);
    }

    // Build toolToCapLookup (same-cluster metric) + capToChildrenSet (cap-child metric)
    // Uses BFS to resolve L2+ caps transitively to L0 tools
    const capIdToChildren = new Map<string, string[]>();
    for (const node of higherLevelNodes) {
      capIdToChildren.set(node.id, node.children ?? []);
    }
    const toolToCapLookup = new Map<string, Set<string>>();
    const capToChildrenSet = new Map<string, Set<string>>();
    for (const node of higherLevelNodes) {
      const childSet = new Set<string>();
      // BFS to resolve all transitive L0 children
      const queue = [...(node.children ?? [])];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const child = queue.shift()!;
        if (visited.has(child)) continue;
        visited.add(child);
        if (toolIdSet.has(child)) {
          childSet.add(child);
        } else {
          const grandchildren = capIdToChildren.get(child);
          if (grandchildren) queue.push(...grandchildren);
        }
      }
      for (const tool of childSet) {
        if (!toolToCapLookup.has(tool)) toolToCapLookup.set(tool, new Set());
        toolToCapLookup.get(tool)!.add(node.id);
      }
      if (childSet.size > 0) capToChildrenSet.set(node.id, childSet);
    }

    if (higherLevelNodes.length === 0) {
      // Fallback: minimal (no caps available)
      toolCapMap = {
        matrix: new Float32Array(toolIds.length * 1),
        numTools: toolIds.length,
        numCapabilities: 1,
      };
    }

    // Create model — hierarchy alphas use DEFAULT_CONFIG unless env vars override
    const alphaOverrides: Record<string, number> = {};
    if (process.env["HIERARCHY_ALPHA_UP"]) {
      alphaOverrides.hierarchyAlphaUp = parseFloat(process.env["HIERARCHY_ALPHA_UP"]);
    }
    if (process.env["HIERARCHY_ALPHA_DOWN"]) {
      alphaOverrides.hierarchyAlphaDown = parseFloat(process.env["HIERARCHY_ALPHA_DOWN"]);
    }
    const model = new CompactInformedGRU({
      embeddingDim,
      learningRate: input.config.learningRate,
      ...alphaOverrides,
    } as any);
    console.error(`[GRU Worker] Hierarchy soft labels: alphaUp=${model.config.hierarchyAlphaUp}, alphaDown=${model.config.hierarchyAlphaDown}`);
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
      // Log which targetToolIds are missing so we can diagnose
      const missingTargets = new Map<string, number>();
      for (const ex of allExamples) {
        if (!nodeToIndex.has(ex.targetToolId)) {
          missingTargets.set(ex.targetToolId, (missingTargets.get(ex.targetToolId) ?? 0) + 1);
        }
      }
      const topMissing = [...missingTargets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, cnt]) => `${id}(${cnt})`)
        .join(", ");
      console.error(`[GRU Worker] Filtered ${skippedTrain}/${allExamples.length} train examples with unknown targetToolId (not in vocab)`);
      console.error(`[GRU Worker] Top missing targets: ${topMissing}`);
    }

    // Train (epoch × batch loop — trainStep is the only training API)
    const { epochs, learningRate: _lr } = input.config;
    const batchSize = 32;
    const evalEvery = input.evalEvery ?? 0;
    const hasTest = input.testExamples && input.testExamples.length > 0;

    // Class weights removed: focal loss (gamma=2) already provides adaptive rebalancing.
    // All 5 CW variants degraded cap Hit@1 from 40.5% → 10-13% (NB23/NB24 analysis).

    console.error(`[GRU Worker] Training for ${epochs} epochs, batch=${batchSize}${hasTest ? `, eval every ${evalEvery} epochs` : ""}...`);

    // MLflow: log hyperparameters
    if (mlflow) {
      await mlflow.startRun({
        epochs: String(epochs),
        learning_rate: String(input.config.learningRate),
        batch_size: String(batchSize),
        embedding_dim: String(embeddingDim),
        vocab_size: String(toolIds.length),
        num_caps: String(higherLevelNodes.length),
        train_examples: String(transitionExamples.length),
        test_examples: String(input.testExamples?.length ?? 0),
        eval_every: String(evalEvery),
        warm_start: String(!!input.existingWeightsPath),
        max_per_cap: process.env.MAX_PER_CAP ?? "none",
        class_weights: "none",
      });
    }

    let lastLoss = 0;
    let lastAcc = 0;

    // Early stopping: track best test Hit@1 and restore best weights
    const PATIENCE = parseInt(process.env["GRU_PATIENCE"] || "5");
    let bestHit1 = 0;
    let bestHit1Epoch = 0;
    let epochsSinceBest = 0;
    let bestWeights: { names: string[]; weights: number[][] } | null = null;
    let earlyStopEpoch: number | undefined;

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
      let testHit1Pct: number | undefined;
      let testTermPct: number | undefined;
      let testToolHit1Pct: number | undefined;
      let testCapHit1Pct: number | undefined;
      let testSameClusterPct: number | undefined;
      const isEvalEpoch = hasTest && evalEvery > 0 && ((epoch + 1) % evalEvery === 0 || epoch === epochs - 1);
      if (isEvalEpoch) {
        const testResult = evaluate(model, input.testExamples!, nodeToIndex, toolIdSet, toolToCapLookup, capToChildrenSet);
        testHit1Pct = testResult.hit1 / testResult.total * 100;
        testTermPct = testResult.termAcc / testResult.total * 100;
        testToolHit1Pct = testResult.toolTotal > 0 ? testResult.toolHit1 / testResult.toolTotal * 100 : undefined;
        testCapHit1Pct = testResult.capTotal > 0 ? testResult.capHit1 / testResult.capTotal * 100 : undefined;

        const toolCapDetail = [
          testToolHit1Pct !== undefined ? `tool=${testToolHit1Pct.toFixed(1)}%(${testResult.toolTotal})` : null,
          testCapHit1Pct !== undefined ? `cap=${testCapHit1Pct.toFixed(1)}%(${testResult.capTotal})` : null,
        ].filter(Boolean).join(", ");

        // Same-cluster confusion detail
        testSameClusterPct = testResult.wrongTotal > 0
          ? testResult.sameCluster / testResult.wrongTotal * 100
          : undefined;
        const scDetail = testSameClusterPct !== undefined
          ? `, sc=${testSameClusterPct.toFixed(0)}%(${testResult.sameCluster}/${testResult.wrongTotal})`
          : "";
        // Cap→child confusion: target=cap, predicted=L0 child of that cap
        const ccDetail = testResult.capWrongTotal > 0
          ? `, cc=${(testResult.capPredChild / testResult.capWrongTotal * 100).toFixed(0)}%(${testResult.capPredChild}/${testResult.capWrongTotal})`
          : "";

        console.error(
          `[GRU Worker] Epoch ${epoch + 1}/${epochs}: train_loss=${lastLoss.toFixed(4)}, train_acc=${lastAcc.toFixed(1)}% | test_hit1=${testHit1Pct.toFixed(1)}% [${toolCapDetail}${scDetail}${ccDetail}], test_term=${testTermPct.toFixed(1)}% (${testResult.total} ex)`,
        );

        // Early stopping: track best Hit@1 and save checkpoint
        if (testHit1Pct > bestHit1) {
          bestHit1 = testHit1Pct;
          bestHit1Epoch = epoch + 1;
          epochsSinceBest = 0;
          try { bestWeights = model.exportWeights(); } catch { /* non-blocking */ }
        } else {
          epochsSinceBest++;
          if (epochsSinceBest >= PATIENCE) {
            earlyStopEpoch = epoch + 1;
            console.error(`[GRU Worker] Early stop at epoch ${earlyStopEpoch} — best Hit@1=${bestHit1.toFixed(1)}% at epoch ${bestHit1Epoch} (patience=${PATIENCE})`);
            break;
          }
        }
      } else {
        console.error(`[GRU Worker] Epoch ${epoch + 1}/${epochs}: loss=${lastLoss.toFixed(4)}, acc=${lastAcc.toFixed(1)}%`);
      }

      // MLflow: log epoch metrics
      if (mlflow) {
        const m: Record<string, number> = {
          train_loss: lastLoss,
          train_accuracy: lastAcc / 100,
        };
        if (testHit1Pct !== undefined) m.test_hit1 = testHit1Pct / 100;
        if (testTermPct !== undefined) m.test_term_accuracy = testTermPct / 100;
        if (testToolHit1Pct !== undefined) m.test_tool_hit1 = testToolHit1Pct / 100;
        if (testCapHit1Pct !== undefined) m.test_cap_hit1 = testCapHit1Pct / 100;
        if (testSameClusterPct !== undefined) m.test_same_cluster_pct = testSameClusterPct / 100;
        await mlflow.logMetrics(m, epoch);
      }
    }

    // Restore best weights if we have a checkpoint
    if (bestWeights) {
      try {
        model.loadWeights(bestWeights);
        console.error(`[GRU Worker] Restored best weights from epoch ${bestHit1Epoch} (Hit@1=${bestHit1.toFixed(1)}%)`);
      } catch (e) {
        console.error(`[GRU Worker] Could not restore best weights: ${e}`);
      }
    }

    // Final eval with restored weights
    if (hasTest) {
      const finalTest = evaluate(model, input.testExamples!, nodeToIndex, toolIdSet, toolToCapLookup);
      const toolDetail = finalTest.toolTotal > 0 ? `, tool=${(finalTest.toolHit1 / finalTest.toolTotal * 100).toFixed(1)}%` : "";
      const capDetail = finalTest.capTotal > 0 ? `, cap=${(finalTest.capHit1 / finalTest.capTotal * 100).toFixed(1)}%` : "";
      const scFinal = finalTest.wrongTotal > 0
        ? `, same_cluster=${(finalTest.sameCluster / finalTest.wrongTotal * 100).toFixed(1)}% (${finalTest.sameCluster}/${finalTest.wrongTotal} wrong)`
        : "";
      const ccFinal = finalTest.capWrongTotal > 0
        ? `, cap→child=${(finalTest.capPredChild / finalTest.capWrongTotal * 100).toFixed(1)}% (${finalTest.capPredChild}/${finalTest.capWrongTotal} cap wrong)`
        : "";
      console.error(
        `[GRU Worker] Final test: hit1=${(finalTest.hit1 / finalTest.total * 100).toFixed(1)}%${toolDetail}${capDetail}${scFinal}${ccFinal}, term_acc=${(finalTest.termAcc / finalTest.total * 100).toFixed(1)}% (${finalTest.total}/${input.testExamples!.length} ex)`,
      );
    }

    console.error(`[GRU Worker] Final train: loss=${lastLoss.toFixed(4)}, accuracy=${lastAcc.toFixed(1)}%${earlyStopEpoch ? ` (early stop at ep${earlyStopEpoch}, best ep${bestHit1Epoch})` : ""}`);

    // Export weights + vocab metadata to temp file (uses restored best weights)
    const exported = model.exportWeights();
    const vocabMeta = {
      toolIds,
      vocabNodes: higherLevelNodes.map(n => ({ id: n.id, level: n.level, children: n.children })),
    };
    const weightsFile = tempFile.replace(/\.json$/, "-weights.json");
    fs.writeFileSync(weightsFile, JSON.stringify({ ...exported, vocab: vocabMeta }));
    console.error(`[GRU Worker] Weights written to ${weightsFile}`);

    // MLflow: end run + publish model version with weights artifact
    if (mlflow) {
      // Upload weights as artifact (typically ~25MB)
      const weightsContent = fs.readFileSync(weightsFile, "utf-8");
      await mlflow.uploadArtifact("gru-weights.json", weightsContent);

      // Upload model signature (input/output schema)
      const signature = {
        inputs: [
          { name: "context_tools", type: "string[]", description: "FQDN tool IDs in execution context (max 5)" },
          { name: "tool_embeddings", type: `float64[${toolIds.length}][${embeddingDim}]`, description: "SHGAT-enriched tool embeddings" },
        ],
        outputs: [
          { name: "next_tool_probabilities", type: `float64[${toolIds.length}]`, description: "Softmax probability distribution over tool vocab" },
          { name: "is_terminal", type: "float64", description: "Probability that sequence should terminate" },
        ],
        config: {
          embeddingDim,
          gruHiddenDim: 64,
          vocabSize: toolIds.length,
          numCaps: higherLevelNodes.length,
        },
      };
      await mlflow.uploadArtifact("model-signature.json", JSON.stringify(signature, null, 2));

      await mlflow.endRun("FINISHED");
      await mlflow.publishModelVersion("gru", {
        finalLoss: lastLoss,
        finalAccuracy: lastAcc / 100,
        epochs,
        learningRate: input.config.learningRate,
        batchSize,
        vocabSize: toolIds.length,
        numCaps: higherLevelNodes.length,
        trainExamples: transitionExamples.length,
        testExamples: input.testExamples?.length ?? 0,
        warmStart: !!input.existingWeightsPath,
      });
    }

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
    if (mlflow) await mlflow.endRun("FAILED").catch(() => {});

    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  }
}

main();
