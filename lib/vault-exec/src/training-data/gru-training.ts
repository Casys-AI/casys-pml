import type { IVaultStore } from "../core/types.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import type { GNNConfig } from "../gnn/domain/types.ts";
import { trainGruDataset } from "../gru/training-session.ts";
import { DEFAULT_GRU_CONFIG, type GRUConfig } from "../gru/types.ts";
import type { ToolLeafEdgeNextRow, ToolLeafNodeRow } from "./rebuild.ts";
import {
  buildGruTrainingExamplesFromToolCalls,
  buildGruVocabularyFromEmbeddings,
  runLeafGnnForward,
} from "./model-inputs.ts";

export interface TrainGruFromOpenClawOptions {
  nodeRows: ToolLeafNodeRow[];
  edgeRows: ToolLeafEdgeNextRow[];
  toolCalls: ImportedOpenClawToolCallRow[];
  maxEpochs?: number;
  maxExamples?: number;
  minCalls?: number;
  includeSubagents?: boolean;
  gnnConfig?: GNNConfig;
  gruConfig?: GRUConfig;
  learningRate?: number;
  gamma?: number;
  intentEmbeddingsByCallKey?: ReadonlyMap<string, number[]>;
  onProgress?: (
    event: GruTrainingProgressEvent,
  ) => void | Promise<void>;
}

export interface TrainGruFromOpenClawResult {
  paramsSource: "loaded" | "initialized";
  exampleCount: number;
  vocabSize: number;
  epochs: number;
  avgLoss: number;
  accuracy: number;
  history: Array<{ epoch: number; avgLoss: number; accuracy: number }>;
}

export interface GruTrainingProgressEvent {
  kind: "stage" | "epoch";
  phase:
    | "gnn"
    | "vocab"
    | "examples"
    | "train"
    | "serialize"
    | "persist"
    | "done";
  current: number;
  total: number;
  message: string;
  exampleCount?: number;
  epoch?: number;
  avgLoss?: number;
  accuracy?: number;
}

async function reportProgress(
  onProgress: TrainGruFromOpenClawOptions["onProgress"],
  event: GruTrainingProgressEvent,
): Promise<void> {
  if (!onProgress) {
    return;
  }
  await onProgress(event);
}

export async function trainGruFromOpenClawData(
  store: IVaultStore,
  options: TrainGruFromOpenClawOptions,
): Promise<TrainGruFromOpenClawResult> {
  const gruConfig = options.gruConfig ?? DEFAULT_GRU_CONFIG;
  const gnnConfig = options.gnnConfig;
  const maxEpochs = Math.max(1, options.maxEpochs ?? 1);
  const learningRate = options.learningRate ?? 0.01;
  const gamma = options.gamma ?? 2.0;
  const onProgress = options.onProgress;
  const stageTotal = 6;

  if (gnnConfig && gnnConfig.embDim !== gruConfig.inputDim) {
    throw new Error(
      `[training-data/gru-training] GNN embDim (${gnnConfig.embDim}) must match GRU inputDim (${gruConfig.inputDim})`,
    );
  }

  await reportProgress(onProgress, {
    kind: "stage",
    phase: "gnn",
    current: 1,
    total: stageTotal,
    message: "Running GNN forward on DB-first leaf nodes",
  });
  const gnn = await runLeafGnnForward(
    store,
    options.nodeRows,
    options.edgeRows,
    gnnConfig,
  );
  await reportProgress(onProgress, {
    kind: "stage",
    phase: "vocab",
    current: 2,
    total: stageTotal,
    message: "Building GRU vocabulary from GNN embeddings",
  });
  const vocab = buildGruVocabularyFromEmbeddings(
    options.nodeRows,
    gnn.gnnEmbeddings,
  );
  await reportProgress(onProgress, {
    kind: "stage",
    phase: "examples",
    current: 3,
    total: stageTotal,
    message: "Deriving GRU training examples from imported tool calls",
  });
  const allExamples = buildGruTrainingExamplesFromToolCalls(
    options.toolCalls,
    vocab,
    {
      minCalls: options.minCalls,
      includeSubagents: options.includeSubagents,
      config: gruConfig,
      intentEmbeddingsByCallKey: options.intentEmbeddingsByCallKey,
    },
  );

  const examples = options.maxExamples && options.maxExamples > 0
    ? allExamples.slice(0, options.maxExamples)
    : allExamples;

  if (examples.length === 0) {
    throw new Error(
      "[training-data/gru-training] No training examples available from the imported tool-call rows.",
    );
  }

  await reportProgress(onProgress, {
    kind: "stage",
    phase: "train",
    current: 4,
    total: stageTotal,
    message:
      `Training GRU on ${examples.length} example(s) for ${maxEpochs} epoch(s)`,
    exampleCount: examples.length,
  });
  const latestWeights = await store.getLatestWeights();
  const training = await trainGruDataset({
    vocab,
    examples,
    config: gruConfig,
    maxEpochs,
    learningRate,
    gamma,
    warmStartBlob: latestWeights?.blob,
    onEpoch: async ({ epoch, totalEpochs, avgLoss, accuracy }) => {
      await reportProgress(onProgress, {
        kind: "epoch",
        phase: "train",
        current: epoch,
        total: totalEpochs,
        epoch,
        message: `Completed epoch ${epoch}/${totalEpochs}`,
        exampleCount: examples.length,
        avgLoss,
        accuracy,
      });
    },
  });

  await reportProgress(onProgress, {
    kind: "stage",
    phase: "serialize",
    current: 5,
    total: stageTotal,
    message: "Serializing GRU weights",
    exampleCount: examples.length,
  });
  await reportProgress(onProgress, {
    kind: "stage",
    phase: "persist",
    current: 6,
    total: stageTotal,
    message: "Persisting GRU weights in vault.kv",
    exampleCount: examples.length,
  });
  await store.saveGruWeights(
    training.weightsBlob,
    training.vocabSize,
    training.epochs,
    training.accuracy,
  );
  await reportProgress(onProgress, {
    kind: "stage",
    phase: "done",
    current: stageTotal,
    total: stageTotal,
    message: "GRU training completed",
    exampleCount: examples.length,
    avgLoss: training.avgLoss,
    accuracy: training.accuracy,
  });

  return {
    paramsSource: gnn.paramsSource,
    exampleCount: training.exampleCount,
    vocabSize: training.vocabSize,
    epochs: training.epochs,
    avgLoss: training.avgLoss,
    accuracy: training.accuracy,
    history: training.history,
  };
}
