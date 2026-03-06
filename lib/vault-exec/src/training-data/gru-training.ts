import type { IVaultStore } from "../core/types.ts";
import type { ImportedOpenClawToolCallRow } from "../ingest/types.ts";
import type { GNNConfig } from "../gnn/domain/types.ts";
import { initWeights } from "../gru/cell.ts";
import { trainEpoch } from "../gru/trainer.ts";
import { DEFAULT_GRU_CONFIG, type GRUConfig } from "../gru/types.ts";
import { serializeWeights } from "../gru/weights.ts";
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

export async function trainGruFromOpenClawData(
  store: IVaultStore,
  options: TrainGruFromOpenClawOptions,
): Promise<TrainGruFromOpenClawResult> {
  const gruConfig = options.gruConfig ?? DEFAULT_GRU_CONFIG;
  const gnnConfig = options.gnnConfig;
  const maxEpochs = Math.max(1, options.maxEpochs ?? 1);
  const learningRate = options.learningRate ?? 0.01;
  const gamma = options.gamma ?? 2.0;

  if (gnnConfig && gnnConfig.embDim !== gruConfig.inputDim) {
    throw new Error(
      `[training-data/gru-training] GNN embDim (${gnnConfig.embDim}) must match GRU inputDim (${gruConfig.inputDim})`,
    );
  }

  const gnn = await runLeafGnnForward(
    store,
    options.nodeRows,
    options.edgeRows,
    gnnConfig,
  );
  const vocab = buildGruVocabularyFromEmbeddings(
    options.nodeRows,
    gnn.gnnEmbeddings,
  );
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

  const weights = initWeights(gruConfig);
  let avgLoss = 0;
  let accuracy = 0;
  const history: Array<{ epoch: number; avgLoss: number; accuracy: number }> =
    [];

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    const metrics = trainEpoch(
      examples,
      weights,
      vocab,
      gruConfig,
      learningRate,
      gamma,
    );
    avgLoss = metrics.avgLoss;
    accuracy = metrics.accuracy;
    history.push({
      epoch: epoch + 1,
      avgLoss,
      accuracy,
    });
  }

  const blob = await serializeWeights(weights, vocab, gruConfig);
  await store.saveGruWeights(blob, vocab.nodes.length, maxEpochs, accuracy);

  return {
    paramsSource: gnn.paramsSource,
    exampleCount: examples.length,
    vocabSize: vocab.nodes.length,
    epochs: maxEpochs,
    avgLoss,
    accuracy,
    history,
  };
}
