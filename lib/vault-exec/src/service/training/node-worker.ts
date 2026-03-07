import "@tensorflow/tfjs-node";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ImportedOpenClawToolCallRow } from "../../ingest/types.ts";
import { evaluateGruPredictions } from "../../gru/evaluation.ts";
import { trainGruDataset } from "../../gru/training-session.ts";
import { deserializeWeights } from "../../gru/weights.ts";
import type { GruTrainingLeafEmbeddingRow } from "../../training-data/gru-dataset.ts";
import {
  buildGruTrainingExamplesFromToolCalls,
  buildGruVocabularyFromLeafEmbeddings,
} from "../../training-data/gru-dataset.ts";

interface GruWeightsManifest {
  fileName: string;
  vocabSize: number;
  epoch: number;
  accuracy: number;
}

interface GruTrainingSnapshotManifest {
  version: 1;
  buildId: string;
  createdAt: string;
  vaultPath: string;
  paramsSource: "loaded" | "initialized";
  nodeRows: unknown[];
  toolCalls: ImportedOpenClawToolCallRow[];
  leafEmbeddings: GruTrainingLeafEmbeddingRow[];
  gruWeights?: GruWeightsManifest;
}

interface LiveTrainingMetrics {
  runId: string;
  buildId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  gruWeightsSource: "loaded" | "initialized";
  epochs: number;
  exampleCount: number;
  vocabSize: number;
  avgLoss: number;
  accuracy: number;
  top3Accuracy: number;
  mrr: number;
  majorityNextBaseline: number;
}

interface WorkerOptions {
  snapshotDir: string;
  resultDir: string;
  statusPath?: string;
  buildId?: string;
  runId?: string;
  maxEpochs: number;
}

interface WorkerStatus {
  runId: string;
  state: "running" | "completed" | "failed";
  phase:
    | "load_snapshot"
    | "build_dataset"
    | "train"
    | "evaluate"
    | "write_result"
    | "done";
  updatedAt: string;
  startedAt: string;
  heartbeatAt: string;
  buildId: string;
  pid: number;
  message?: string;
  epoch?: number;
  totalEpochs?: number;
  avgLoss?: number;
  accuracy?: number;
  lastError?: string;
}

function parseArgs(argv: string[]): WorkerOptions {
  let snapshotDir = "";
  let resultDir = "";
  let statusPath: string | undefined;
  let buildId: string | undefined;
  let runId: string | undefined;
  let maxEpochs = 1;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--snapshot") {
      snapshotDir = argv[++index] ?? "";
    } else if (arg === "--result") {
      resultDir = argv[++index] ?? "";
    } else if (arg === "--status") {
      statusPath = argv[++index] ?? "";
    } else if (arg === "--build-id") {
      buildId = argv[++index] ?? "";
    } else if (arg === "--run-id") {
      runId = argv[++index] ?? "";
    } else if (arg === "--max-epochs") {
      const parsed = Number.parseInt(argv[++index] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxEpochs = parsed;
      }
    }
  }

  if (!snapshotDir || !resultDir) {
    throw new Error(
      "Usage: node-worker.ts --snapshot <dir> --result <dir> [--status <path>] [--build-id <id>] [--run-id <id>] [--max-epochs <n>]",
    );
  }

  return { snapshotDir, resultDir, statusPath, buildId, runId, maxEpochs };
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

async function readSnapshot(
  snapshotDir: string,
): Promise<{
  manifest: GruTrainingSnapshotManifest;
  warmStartBlob?: Uint8Array;
}> {
  const manifest = JSON.parse(
    await readFile(joinPath(snapshotDir, "manifest.json"), "utf8"),
  ) as GruTrainingSnapshotManifest;

  const warmStartBlob = manifest.gruWeights
    ? new Uint8Array(
      await readFile(joinPath(snapshotDir, manifest.gruWeights.fileName)),
    )
    : undefined;

  return { manifest, warmStartBlob };
}

async function writeResult(
  resultDir: string,
  payload: {
    buildId: string;
    runId: string;
    createdAt: string;
    metrics: LiveTrainingMetrics;
    gruWeights: {
      bytes: Uint8Array;
      vocabSize: number;
      epoch: number;
      accuracy: number;
    };
  },
): Promise<void> {
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    joinPath(resultDir, "gru-weights.blob"),
    payload.gruWeights.bytes,
  );
  await writeFile(
    joinPath(resultDir, "metrics.json"),
    JSON.stringify(payload.metrics, null, 2),
  );
  await writeFile(
    joinPath(resultDir, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        buildId: payload.buildId,
        runId: payload.runId,
        createdAt: payload.createdAt,
        metrics: payload.metrics,
        gruWeights: {
          fileName: "gru-weights.blob",
          vocabSize: payload.gruWeights.vocabSize,
          epoch: payload.gruWeights.epoch,
          accuracy: payload.gruWeights.accuracy,
        },
      },
      null,
      2,
    ),
  );
}

async function writeWorkerStatus(
  statusPath: string | undefined,
  status: WorkerStatus,
): Promise<void> {
  if (!statusPath) return;
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, JSON.stringify(status, null, 2));
}

export async function runNodeGruWorker(
  options: WorkerOptions,
): Promise<void> {
  const startedAt = new Date();
  const runId = options.runId || crypto.randomUUID();
  const startedAtIso = startedAt.toISOString();
  let buildIdForStatus = options.buildId || "unknown";

  const writeStatus = async (
    patch:
      & Omit<
        WorkerStatus,
        "runId" | "updatedAt" | "startedAt" | "heartbeatAt" | "buildId" | "pid"
      >
      & Partial<Pick<WorkerStatus, "buildId">>,
  ): Promise<void> => {
    if (patch.buildId) {
      buildIdForStatus = patch.buildId;
    }
    const nowIso = new Date().toISOString();
    await writeWorkerStatus(options.statusPath, {
      runId,
      state: patch.state,
      phase: patch.phase,
      updatedAt: nowIso,
      startedAt: startedAtIso,
      heartbeatAt: nowIso,
      buildId: patch.buildId ?? buildIdForStatus,
      pid: process.pid,
      message: patch.message,
      epoch: patch.epoch,
      totalEpochs: patch.totalEpochs,
      avgLoss: patch.avgLoss,
      accuracy: patch.accuracy,
      lastError: patch.lastError,
    });
  };

  try {
    await writeStatus({
      state: "running",
      phase: "load_snapshot",
      message: "Loading training snapshot",
    });
    const { manifest, warmStartBlob } = await readSnapshot(options.snapshotDir);
    const buildId = options.buildId || manifest.buildId;
    buildIdForStatus = buildId;

    await writeStatus({
      state: "running",
      phase: "build_dataset",
      buildId,
      message: "Building GRU vocab/examples",
    });
    const vocab = buildGruVocabularyFromLeafEmbeddings(manifest.leafEmbeddings);
    const examples = buildGruTrainingExamplesFromToolCalls(
      manifest.toolCalls,
      vocab,
      { minCalls: 3 },
    );

    await writeStatus({
      state: "running",
      phase: "train",
      buildId,
      message: "Training GRU",
      epoch: 0,
      totalEpochs: options.maxEpochs,
    });
    const training = await trainGruDataset({
      vocab,
      examples,
      warmStartBlob,
      maxEpochs: options.maxEpochs,
      onEpoch: async (event) => {
        await writeStatus({
          state: "running",
          phase: "train",
          buildId,
          message: "Training GRU",
          epoch: event.epoch,
          totalEpochs: event.totalEpochs,
          avgLoss: event.avgLoss,
          accuracy: event.accuracy,
        });
      },
    });

    await writeStatus({
      state: "running",
      phase: "evaluate",
      buildId,
      message: "Evaluating predictions",
    });
    const decoded = await deserializeWeights(training.weightsBlob);
    const evaluation = evaluateGruPredictions(
      examples,
      decoded.weights,
      vocab,
      decoded.config,
    );

    await writeStatus({
      state: "running",
      phase: "write_result",
      buildId,
      message: "Writing result artifacts",
    });
    const finishedAt = new Date();
    await writeResult(options.resultDir, {
      buildId,
      runId,
      createdAt: finishedAt.toISOString(),
      metrics: {
        runId,
        buildId,
        startedAt: startedAtIso,
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        gruWeightsSource: training.weightsSource,
        epochs: training.epochs,
        exampleCount: training.exampleCount,
        vocabSize: training.vocabSize,
        avgLoss: training.avgLoss,
        accuracy: evaluation.accuracy,
        top3Accuracy: evaluation.top3Accuracy,
        mrr: evaluation.mrr,
        majorityNextBaseline: evaluation.majorityNextBaseline,
      },
      gruWeights: {
        bytes: training.weightsBlob,
        vocabSize: training.vocabSize,
        epoch: training.epochs,
        accuracy: evaluation.accuracy,
      },
    });

    await writeStatus({
      state: "completed",
      phase: "done",
      buildId,
      message: "Worker completed",
      epoch: training.epochs,
      totalEpochs: Math.max(1, options.maxEpochs),
      avgLoss: training.avgLoss,
      accuracy: evaluation.accuracy,
    });
  } catch (error) {
    await writeStatus({
      state: "failed",
      phase: "done",
      buildId: buildIdForStatus,
      message: "Worker failed",
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

if (import.meta.main) {
  await runNodeGruWorker(parseArgs(process.argv.slice(2)));
}
