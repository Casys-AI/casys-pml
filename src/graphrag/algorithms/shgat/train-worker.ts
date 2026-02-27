/**
 * SHGAT Training Worker
 *
 * Runs in a subprocess to avoid blocking the main event loop.
 * Receives training data via stdin, outputs results via stdout.
 * Saves params directly to DB to avoid V8 string length limits (~150MB JSON).
 *
 * Used for both:
 * - Startup batch training (epochs=3-5, many traces)
 * - Live/PER training (epochs=1, few traces)
 *
 * Usage:
 * ```typescript
 * const result = await spawnSHGATTraining({
 *   capabilities,
 *   examples,
 *   epochs: 3,      // 3 for live (PER curriculum), 5+ for batch
 *   batchSize: 16,
 *   databaseUrl: process.env.DATABASE_URL,
 * });
 * ```
 *
 * @module graphrag/algorithms/shgat/train-worker
 */

import { createSHGATFromCapabilities, generateDefaultToolEmbedding, type TrainingExample } from "../shgat.ts";
import type { SHGATConfig } from "./types.ts";
import { DEFAULT_SHGAT_CONFIG, NUM_NEGATIVES } from "./types.ts";
import { initBlasAcceleration } from "./utils/math.ts";
import { PERBuffer, annealBeta, annealTemperature } from "./training/per-buffer.ts";
import { getLogger, setupLogger } from "../../../telemetry/logger.ts";
import { createMLflowClient, type MLflowClient } from "../../../../lib/mlflow/client.ts";
import postgres from "postgres";
import pako from "pako";
import { encode as msgpackEncode } from "npm:@msgpack/msgpack@3.0.0-beta2";

// Logger initialized in main() after setupLogger()
let log: ReturnType<typeof getLogger>;

// Dual logging: both logger and console.error for subprocess visibility
const logInfo = (msg: string) => {
  console.error(msg);
  log?.info(msg);
};
const logWarn = (msg: string) => {
  console.error(msg);
  log?.warn(msg);
};
// Debug logs only go to logger, not console (reduces noise)
const logDebug = (msg: string) => {
  log?.debug(msg);
};

interface WorkerInput {
  capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
    /** Parent capability IDs (for multi-level hierarchy) */
    parents?: string[];
    /** Child capability IDs (for multi-level hierarchy) */
    children?: string[];
  }>;
  examples: TrainingExample[];
  config: {
    epochs: number;
    batchSize: number;
    temperature?: number;    // Fixed τ (undefined = use annealing)
    usePER?: boolean;        // Use PER sampling (default: true)
    useCurriculum?: boolean; // Use curriculum learning (default: true)
    learningRate?: number;   // Learning rate (default: 0.05)
    useProjectionHead?: boolean; // Enable projection head (default: false)
  };
  /** Optional: import existing params before training (for live updates) */
  existingParams?: Record<string, unknown>;
  /** Database URL for saving params directly (avoids stdout size limits) */
  databaseUrl?: string;
  /** Real tool embeddings keyed by tool_id (short format). Used by createSHGATFromCapabilities
   *  so all tools get real BGE-M3 embeddings instead of random defaults. */
  toolEmbeddings?: Record<string, number[]>;
}

interface WorkerOutput {
  success: boolean;
  finalLoss?: number;
  finalAccuracy?: number;
  /** TD errors for PER priority updates */
  tdErrors?: number[];
  error?: string;
  /** Whether params were saved to DB */
  savedToDb?: boolean;
  /** Health check results per epoch */
  healthCheck?: {
    bestAccuracy: number;
    bestEpoch: number;
    finalAccuracy: number;
    degradationDetected: boolean;
    earlyStopEpoch?: number;
  };
}

/**
 * Encode bytes to base64 in chunks to avoid string limits
 * IMPORTANT: Chunk size must be multiple of 3 to avoid base64 padding in middle of string
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 32766; // Must be multiple of 3 to avoid padding issues
  let base64 = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    base64 += btoa(String.fromCharCode(...chunk));
  }
  return base64;
}

/**
 * Save SHGAT params directly to PostgreSQL database.
 * Compresses params with gzip to avoid V8 string limits (~500MB).
 */
async function saveParamsToDb(
  databaseUrl: string,
  params: Record<string, unknown>,
): Promise<boolean> {
  const sql = postgres(databaseUrl, {
    max: 1, // Single connection for worker
    idle_timeout: 30,
    connect_timeout: 30,
  });

  try {
    // Serialize params using MessagePack (efficient binary format, handles large objects)
    logDebug(`[SHGAT Worker] Serializing params with MessagePack...`);
    const msgpackBytes = msgpackEncode(params);
    logDebug(`[SHGAT Worker] MessagePack size: ${(msgpackBytes.length / 1024 / 1024).toFixed(2)} MB`);

    // Compress with pako (gzip level 6 for good compression/speed tradeoff)
    const compressed = pako.gzip(msgpackBytes, { level: 6 });
    logDebug(`[SHGAT Worker] Compressed size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);

    // Convert to base64 for storage in JSONB
    const base64 = bytesToBase64(compressed);

    // Store as wrapper object with format info
    // deno-lint-ignore no-explicit-any
    const wrapper: any = {
      compressed: true,
      format: "msgpack+gzip+base64",
      size: msgpackBytes.length,
      compressedSize: compressed.length,
      data: base64,
    };

    // Global model - only one row, insert if empty then update
    await sql`
      INSERT INTO shgat_params (params, updated_at)
      SELECT ${wrapper}::jsonb, NOW()
      WHERE NOT EXISTS (SELECT 1 FROM shgat_params)
    `;
    await sql`
      UPDATE shgat_params SET params = ${wrapper}::jsonb, updated_at = NOW()
    `;

    logDebug(`[SHGAT Worker] Params saved (${(compressed.length / 1024 / 1024).toFixed(2)} MB compressed)`);
    return true;
  } finally {
    await sql.end();
  }
}

async function main() {
  // Initialize logger for subprocess (required for Prometheus/file output)
  try {
    await setupLogger({ level: "INFO" });
  } catch (e) {
    // Fallback to console.error if logger setup fails (e.g., file permission issues)
    console.error(`[SHGAT Worker] Logger setup failed: ${e}, using console fallback`);
  }
  // Get logger AFTER setup so handlers are configured
  log = getLogger("default");

  // Initialize BLAS acceleration for training (ADR-058)
  const blasAvailable = await initBlasAcceleration();
  logInfo(`[SHGAT Worker] BLAS: ${blasAvailable ? "enabled (OpenBLAS)" : "disabled (JS fallback)"}`);

  // Read input from temp file (path passed as CLI arg)
  const inputFile = Deno.args[0];
  if (!inputFile) {
    throw new Error("Input file path required as first argument");
  }

  logDebug(`[SHGAT Worker] Reading from ${inputFile}`);
  const inputJson = await Deno.readTextFile(inputFile);
  logDebug(`[SHGAT Worker] Read ${(inputJson.length / 1024 / 1024).toFixed(2)} MB`);

  // Cleanup temp file
  try {
    await Deno.remove(inputFile);
  } catch {
    // Ignore
  }

  const input: WorkerInput = JSON.parse(inputJson);
  logDebug(`[SHGAT Worker] Loaded: ${input.capabilities?.length} caps, ${input.examples?.length} examples`);

  // MLflow tracking (no-op if MLFLOW_TRACKING_URI not set)
  const mlflowMode = input.config.usePER !== false ? "PER" : "uniform";
  const mlflow: MLflowClient | null = createMLflowClient(
    Deno.env.get("MLFLOW_TRACKING_URI"),
    "shgat-training",
    `shgat-${mlflowMode}-${new Date().toISOString().slice(0, 16)}`,
    { model: "shgat", mode: mlflowMode },
  );

  try {
    // Validate input
    if (!input.capabilities || input.capabilities.length === 0) {
      throw new Error("No capabilities provided for training");
    }
    if (!input.examples || input.examples.length === 0) {
      throw new Error("No examples provided for training");
    }

    // Build tool embeddings Map from input
    const toolEmbeddingsMap = new Map<string, number[]>();
    if (input.toolEmbeddings) {
      for (const [id, emb] of Object.entries(input.toolEmbeddings)) {
        toolEmbeddingsMap.set(id, emb);
      }
      logDebug(`[SHGAT Worker] Received ${toolEmbeddingsMap.size} real tool embeddings`);
    }

    // Create SHGAT from capabilities with real tool embeddings
    logDebug(`[SHGAT Worker] Creating SHGAT graph...`);
    const startCreate = Date.now();
    const shgatPartialConfig: Partial<SHGATConfig> = {};
    if (input.config.useProjectionHead) {
      shgatPartialConfig.useProjectionHead = true;
      shgatPartialConfig.projectionHiddenDim = 256;
      shgatPartialConfig.projectionOutputDim = 256;
      shgatPartialConfig.projectionBlendAlpha = 0.5;
      shgatPartialConfig.projectionTemperature = 0.07;
    }
    // Pass toolEmbeddingsMap so createSHGATFromCapabilities uses real BGE-M3 embeddings
    // instead of generateDefaultToolEmbedding() for tools referenced by capabilities
    const shgat = toolEmbeddingsMap.size > 0
      ? createSHGATFromCapabilities(input.capabilities, toolEmbeddingsMap, shgatPartialConfig)
      : createSHGATFromCapabilities(input.capabilities, shgatPartialConfig);
    logDebug(`[SHGAT Worker] SHGAT created in ${Date.now() - startCreate}ms`);

    // Register any remaining tools from examples that aren't yet in the graph
    {
      const embeddingDim = input.capabilities[0]?.embedding.length || 1024;
      let added = 0;
      for (const ex of input.examples) {
        for (const toolId of (ex.contextTools ?? [])) {
          if (toolId && !shgat.hasToolNode(toolId)) {
            const embedding = toolEmbeddingsMap.get(toolId) ?? generateDefaultToolEmbedding(toolId, embeddingDim);
            shgat.registerTool({ id: toolId, embedding });
            added++;
          }
        }
      }
      if (added > 0) logDebug(`[SHGAT Worker] Registered ${added} tools from examples`);
    }

    // Import existing params for incremental training (live/PER mode)
    if (input.existingParams) {
      shgat.importParams(input.existingParams);
    }

    // Initialize V→E residual params if not already set (from DB or existing params)
    // NB14 grid search: a=-1.0, b=0.5 gives γ from 0.45 (1 child) to 0.07 (20 children)
    {
      const currentParams = shgat.exportParams();
      if (currentParams.veResidualA === undefined) {
        shgat.importParams({ ...currentParams, veResidualA: -1.0, veResidualB: 0.5 });
        logInfo("[SHGAT Worker] Initialized V→E residual params: a=-1.0, b=0.5");
      }
    }

    // Extract config with defaults
    const {
      epochs,
      batchSize,
      temperature: fixedTemperature,      // undefined = use annealing
      usePER = true,
      useCurriculum = true,
      learningRate = 0.05,
      useProjectionHead = false,
    } = input.config;

    const mode = usePER ? "PER" : "uniform";
    logInfo(
      `[SHGAT Worker] Starting ${mode} training: ${input.examples.length} examples, ${epochs} epochs, ` +
      `batch_size=${batchSize}, ${input.capabilities.length} caps, ` +
      `τ=${fixedTemperature ?? "anneal"}, curriculum=${useCurriculum}, lr=${learningRate}, projHead=${useProjectionHead}`
    );

    // Apply custom learning rate
    shgat.setLearningRate(learningRate);

    // MLflow: start run with hyperparameters
    if (mlflow) {
      await mlflow.startRun({
        epochs: String(epochs),
        batch_size: String(batchSize),
        temperature: String(fixedTemperature ?? "anneal"),
        use_per: String(usePER),
        use_curriculum: String(useCurriculum),
        learning_rate: String(learningRate),
        use_projection_head: String(useProjectionHead),
        num_examples: String(input.examples.length),
        num_capabilities: String(input.capabilities.length),
        preserveDimResidual: String(DEFAULT_SHGAT_CONFIG.preserveDimResidual),
      });
    }

    // Split examples: 80% train, 20% held-out test set for health check
    const shuffled = [...input.examples].sort(() => Math.random() - 0.5);
    const testSetSize = Math.max(1, Math.floor(shuffled.length * 0.2));
    const testSet = shuffled.slice(0, testSetSize);
    const trainSet = shuffled.slice(testSetSize);

    logDebug(`[SHGAT Worker] Health check: ${testSet.length} test examples, ${trainSet.length} train examples`);

    const numBatchesPerEpoch = Math.ceil(trainSet.length / batchSize);

    // Initialize PER buffer only if usePER is true
    // α=0.6 optimal per benchmark (per-analysis-2026-01-12: +3.5% vs uniform)
    // maxPriority=25 to match margin-based TD error range [0.05, 20]
    const perBuffer = usePER ? new PERBuffer(trainSet, {
      alpha: 0.6,       // Priority exponent (0.6 optimal, 0.4 too uniform, 0.8 too aggressive)
      beta: 0.4,        // IS weight exponent (annealed to 1.0)
      epsilon: 0.01,    // Minimum priority floor (prevents starvation of easy examples)
      maxPriority: 25,  // Match margin-based TD error range exp(3) ≈ 20
    }) : null;

    let finalLoss = 0;
    let finalAccuracy = 0;
    let lastEpochTdErrors: number[] = [];

    // Health check tracking — uses full-vocab Hit@1 (not contrastive accuracy)
    let bestHit1 = 0;
    let bestHit1Epoch = 0;
    let lastHit1 = 0;
    let lastMrr = 0;
    let lastContrastiveAcc = 0; // contrastive accuracy (Rank@1 among 8 negs) for reference
    let degradationDetected = false;
    let earlyStopEpoch: number | undefined;
    const DEGRADATION_THRESHOLD = 0.10; // 10% drop from BEST Hit@1 = degradation
    const PATIENCE = 3; // epochs without improvement before early stop
    let epochsSinceBest = 0;

    // Best checkpoint — serialized params at best Hit@1
    let bestParams: ReturnType<typeof shgat.exportParams> | null = null;

    logDebug(`[SHGAT Worker] Starting ${epochs} epochs training with ${trainSet.length} train / ${testSet.length} test examples...`);

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Anneal beta from 0.4 to 1.0 over training (reduces bias correction over time)
      const beta = usePER ? annealBeta(epoch, epochs, 0.4) : 1.0;

      // Temperature: use fixed value or cosine annealing (0.10 → 0.06)
      const temperature = fixedTemperature ?? annealTemperature(epoch, epochs);

      // Curriculum learning on negatives (only if enabled)
      // allNegativesSorted is sorted descending by similarity (hard → easy)
      // accuracy < 0.60: easy negatives (last third)
      // accuracy > 0.75: hard negatives (first third)
      // else: medium negatives (middle third)
      const prevAccuracy = epoch === 0 ? 0.55 : finalAccuracy;
      const difficulty = useCurriculum
        ? (prevAccuracy < 0.60 ? "easy" : (prevAccuracy > 0.75 ? "hard" : "medium"))
        : "random"; // No curriculum = random tier

      // Fisher-Yates shuffle helper
      const shuffle = <T>(arr: T[]): T[] => {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      };

      // Update negativeCapIds for examples that have allNegativesSorted
      let curriculumUpdated = 0;
      let totalNegs = 0;
      let tierSize = 0;
      for (const ex of trainSet) {
        if (ex.allNegativesSorted && ex.allNegativesSorted.length >= NUM_NEGATIVES * 3) {
          const total = ex.allNegativesSorted.length;
          tierSize = Math.floor(total / 3);
          totalNegs = total;

          if (useCurriculum) {
            // Select tier based on accuracy (thresholds match curriculum config)
            let tierStart: number;
            if (prevAccuracy < 0.60) {
              tierStart = tierSize * 2; // Easy: last third
            } else if (prevAccuracy > 0.75) {
              tierStart = 0; // Hard: first third
            } else {
              tierStart = tierSize; // Medium: middle third
            }
            // Extract tier and shuffle-sample NUM_NEGATIVES from it
            const tier = ex.allNegativesSorted.slice(tierStart, tierStart + tierSize);
            ex.negativeCapIds = shuffle(tier).slice(0, NUM_NEGATIVES);
          } else {
            // No curriculum: random sample from all negatives
            ex.negativeCapIds = shuffle(ex.allNegativesSorted).slice(0, NUM_NEGATIVES);
          }
          curriculumUpdated++;
        }
      }
      if (curriculumUpdated > 0 && useCurriculum) {
        logDebug(
          `[SHGAT Worker] Curriculum epoch ${epoch}: ${difficulty} tier (${tierSize}/${totalNegs} negs), ` +
          `sampled ${NUM_NEGATIVES}, updated ${curriculumUpdated}/${trainSet.length}, prevAcc=${prevAccuracy.toFixed(2)}`
        );
      }

      let epochLoss = 0;
      let epochAccuracy = 0;
      let epochBatches = 0;
      const epochTdErrors: number[] = [];
      const allIndices: number[] = [];
      const allTdErrors: number[] = [];

      const epochStartTime = Date.now();
      for (let b = 0; b < numBatchesPerEpoch; b++) {
        if (epoch === 0 && b === 0) {
          logDebug(`[SHGAT Worker] Processing batch 1/${numBatchesPerEpoch}...`);
        }
        let batch: TrainingExample[];
        let isWeights: number[];

        if (perBuffer) {
          // PER: sample batch prioritized by TD error magnitude
          const sample = perBuffer.sample(batchSize, beta);
          batch = sample.items;
          isWeights = sample.weights;
          allIndices.push(...sample.indices);
        } else {
          // Uniform: random batch with equal weights
          const startIdx = b * batchSize;
          batch = trainSet.slice(startIdx, startIdx + batchSize);
          isWeights = batch.map(() => 1.0);
        }

        // Train on batch (with IS weight correction if PER)
        const batchStart = Date.now();
        const result = shgat.trainBatchV1KHeadBatched(batch, isWeights, false, temperature);
        if (epoch === 0 && b === 0) {
          logDebug(`[SHGAT Worker] First batch took ${Date.now() - batchStart}ms`);
        }
        epochLoss += result.loss;
        epochAccuracy += result.accuracy;
        epochTdErrors.push(...result.tdErrors);
        epochBatches++;

        // Collect TD errors for priority update (PER only)
        if (perBuffer) {
          allTdErrors.push(...result.tdErrors);
        }
      }

      // Update priorities based on TD errors from this epoch (PER only)
      if (perBuffer) {
        perBuffer.updatePriorities(allIndices, allTdErrors);
        perBuffer.decayPriorities(0.95);
      }

      finalLoss = epochLoss / epochBatches;
      finalAccuracy = epochAccuracy / epochBatches;
      lastEpochTdErrors = epochTdErrors;

      const epochDuration = Date.now() - epochStartTime;

      // Log epoch results
      if (perBuffer) {
        const stats = perBuffer.getStats();
        logInfo(
          `[SHGAT Worker] Epoch ${epoch}: loss=${finalLoss.toFixed(4)}, acc=${finalAccuracy.toFixed(2)}, ` +
          `priority=[${stats.min.toFixed(3)}-${stats.max.toFixed(3)}], β=${beta.toFixed(2)}, τ=${temperature.toFixed(3)}, ${epochDuration}ms`
        );
      } else {
        logInfo(
          `[SHGAT Worker] Epoch ${epoch}: loss=${finalLoss.toFixed(4)}, acc=${finalAccuracy.toFixed(2)}, τ=${temperature.toFixed(3)}`
        );
      }

      // Health check: full-vocab Hit@1 + contrastive accuracy on held-out test set
      if (testSet.length > 0) {
        // Contrastive accuracy (Rank@1 among NUM_NEGATIVES=8) — fast but unreliable
        const testResult = shgat.trainBatchV1KHeadBatched(testSet, testSet.map(() => 1.0), true, temperature);
        lastContrastiveAcc = testResult.accuracy;

        // Full-vocab Recall@1 (Hit@1 against ALL ~333 caps) — the real metric
        const fullVocab = shgat.evaluateFullVocabRecall(testSet);
        const hit1 = fullVocab.hit1;
        const mrr = fullVocab.mrr;

        // Track best checkpoint on Hit@1 (NOT contrastive accuracy)
        if (hit1 > bestHit1) {
          bestHit1 = hit1;
          bestHit1Epoch = epoch;
          epochsSinceBest = 0;
          try { bestParams = shgat.exportParams(); } catch { /* non-blocking */ }
          logInfo(`[SHGAT Worker] New best: hit1=${(hit1 * 100).toFixed(1)}% mrr=${mrr.toFixed(3)} at epoch ${epoch}`);
        } else {
          epochsSinceBest++;
        }

        const dropFromBest = bestHit1 - hit1;
        logInfo(
          `[SHGAT Worker] Health check epoch ${epoch}: hit1=${(hit1 * 100).toFixed(1)}%, mrr=${mrr.toFixed(3)}, ` +
          `contrastive=${lastContrastiveAcc.toFixed(2)}, best_hit1=${(bestHit1 * 100).toFixed(1)}% (ep${bestHit1Epoch}), ` +
          `Δbest=${(-dropFromBest * 100).toFixed(1)}%, patience=${epochsSinceBest}/${PATIENCE} (${fullVocab.total} caps evaluated)`
        );

        // Early stop: >10% drop from best Hit@1 OR patience exhausted
        if (dropFromBest > DEGRADATION_THRESHOLD || epochsSinceBest >= PATIENCE) {
          const reason = dropFromBest > DEGRADATION_THRESHOLD
            ? `hit1 dropped ${(dropFromBest * 100).toFixed(1)}% from best`
            : `no improvement for ${PATIENCE} epochs`;
          logWarn(`[SHGAT Worker] EARLY STOP: ${reason}. Restoring best params (ep${bestHit1Epoch}).`);
          degradationDetected = true;
          earlyStopEpoch = epoch;
        }

        lastHit1 = hit1;
        lastMrr = mrr;
      }

      // MLflow: log epoch metrics
      if (mlflow) {
        const m: Record<string, number> = {
          loss: finalLoss,
          train_accuracy: finalAccuracy,
          temperature,
          epoch_duration_ms: epochDuration,
        };
        if (lastHit1 > 0) m.test_hit1 = lastHit1;
        if (lastMrr > 0) m.test_mrr = lastMrr;
        if (lastContrastiveAcc > 0) m.test_contrastive_acc = lastContrastiveAcc;
        if (perBuffer) {
          const s = perBuffer.getStats();
          m.per_priority_min = s.min;
          m.per_priority_max = s.max;
          m.beta = beta;
        }
        // V→E residual params tracking
        const p = shgat.exportParams();
        if (typeof p.veResidualA === "number") m.ve_residual_a = p.veResidualA;
        if (typeof p.veResidualB === "number") m.ve_residual_b = p.veResidualB;
        await mlflow.logMetrics(m, epoch);
      }

      if (degradationDetected) break;
    }

    // Restore best checkpoint if early stopping triggered and we have a snapshot
    if (degradationDetected && bestParams) {
      logInfo(`[SHGAT Worker] Restoring best params from epoch ${bestHit1Epoch} (hit1=${(bestHit1 * 100).toFixed(1)}%)`);
      shgat.importParams(bestParams);
      lastHit1 = bestHit1;
    }

    // Save params directly to DB if URL provided
    let savedToDb = false;
    logDebug(`[SHGAT Worker] DB save check: databaseUrl=${input.databaseUrl ? "provided" : "MISSING"}`);
    if (input.databaseUrl) {
      try {
        logDebug(`[SHGAT Worker] Exporting params...`);
        const params = degradationDetected && bestParams ? bestParams : shgat.exportParams();
        logDebug(`[SHGAT Worker] Params exported, keys: ${Object.keys(params).join(", ")}`);
        savedToDb = await saveParamsToDb(input.databaseUrl, params);
        logInfo(`[SHGAT Worker] Params saved to DB`);
      } catch (e) {
        const errMsg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        logWarn(`[SHGAT Worker] Failed to save params to DB: ${errMsg}`);
        console.error(`[SHGAT Worker] DB SAVE ERROR: ${errMsg}`);
        // Continue - training still succeeded, params just couldn't be saved
      }
    } else {
      logDebug(`[SHGAT Worker] No databaseUrl provided, skipping DB save`);
    }

    // Output lightweight status to stdout (no params - they're in the DB)
    const output: WorkerOutput = {
      success: true,
      finalLoss,
      finalAccuracy,
      tdErrors: lastEpochTdErrors,
      savedToDb,
      healthCheck: {
        bestAccuracy: bestHit1,
        bestEpoch: bestHit1Epoch,
        finalAccuracy: lastHit1,
        degradationDetected,
        earlyStopEpoch,
      },
    };

    if (mlflow) {
      // Upload SHGAT params as artifact for run comparison
      try {
        const params = shgat.exportParams();
        await mlflow.uploadArtifact("shgat-params.json", JSON.stringify(params));
      } catch { /* non-blocking */ }

      // Upload model signature (input/output schema)
      const signature = {
        inputs: [
          { name: "context_tools", type: "string[]", description: "FQDN tool IDs in execution context" },
          { name: "capability_embedding", type: "float64[1024]", description: "BGE-M3 capability intent embedding" },
        ],
        outputs: [
          { name: "enriched_tool_embeddings", type: "float64[N][1024]", description: "SHGAT-enriched tool embeddings" },
          { name: "enriched_cap_embeddings", type: "float64[M][1024]", description: "SHGAT-enriched capability embeddings" },
          { name: "attention_scores", type: "float64[N][M]", description: "K-head attention scores (tools × caps)" },
        ],
        config: {
          embeddingDim: 1024,
          numHeads: DEFAULT_SHGAT_CONFIG.numHeads,
          numLayers: DEFAULT_SHGAT_CONFIG.numLayers,
          preserveDim: DEFAULT_SHGAT_CONFIG.preserveDim,
          preserveDimResidual: DEFAULT_SHGAT_CONFIG.preserveDimResidual,
        },
      };
      await mlflow.uploadArtifact("model-signature.json", JSON.stringify(signature, null, 2));

      await mlflow.endRun("FINISHED");
      await mlflow.publishModelVersion("shgat", {
        finalLoss,
        finalAccuracy,
        bestHit1,
        bestHit1Epoch,
        finalHit1: lastHit1,
        finalMrr: lastMrr,
        finalContrastiveAcc: lastContrastiveAcc,
        degradationDetected,
        earlyStopEpoch,
        restoredBestCheckpoint: degradationDetected && bestParams !== null,
        epochs,
        batchSize,
        learningRate,
        numExamples: input.examples.length,
        numCapabilities: input.capabilities.length,
        trainSize: trainSet.length,
        testSize: testSet.length,
        savedToDb,
        preserveDimResidual: DEFAULT_SHGAT_CONFIG.preserveDimResidual,
      });
    }

    console.log(JSON.stringify(output));
  } catch (error) {
    if (mlflow) await mlflow.endRun("FAILED").catch(() => {});

    const output: WorkerOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    console.log(JSON.stringify(output));
    Deno.exit(1);
  }
}

main();
