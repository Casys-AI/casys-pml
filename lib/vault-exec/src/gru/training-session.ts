import { initWeights } from "./cell.ts";
import { trainEpoch } from "./trainer.ts";
import { DEFAULT_GRU_CONFIG, type GRUConfig, type GRUVocabulary } from "./types.ts";
import { deserializeWeights, serializeWeights } from "./weights.ts";
import type { TrainingExample } from "./trainer.ts";

export interface TrainGruDatasetOptions {
  vocab: GRUVocabulary;
  examples: TrainingExample[];
  warmStartBlob?: Uint8Array;
  config?: GRUConfig;
  maxEpochs?: number;
  learningRate?: number;
  gamma?: number;
  onEpoch?: (
    event: {
      epoch: number;
      totalEpochs: number;
      avgLoss: number;
      accuracy: number;
    },
  ) => void | Promise<void>;
}

export interface TrainGruDatasetResult {
  weightsSource: "loaded" | "initialized";
  weightsBlob: Uint8Array;
  epochs: number;
  exampleCount: number;
  vocabSize: number;
  avgLoss: number;
  accuracy: number;
  history: Array<{ epoch: number; avgLoss: number; accuracy: number }>;
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

async function loadOrInitWeights(
  vocab: GRUVocabulary,
  config: GRUConfig,
  warmStartBlob?: Uint8Array,
) {
  if (warmStartBlob) {
    try {
      const decoded = await deserializeWeights(warmStartBlob);
      const compatibleConfig = decoded.config.inputDim === config.inputDim &&
        decoded.config.hiddenDim === config.hiddenDim &&
        decoded.config.projectionDim === config.projectionDim &&
        decoded.config.intentDim === config.intentDim &&
        decoded.config.fusionDim === config.fusionDim &&
        decoded.config.outputDim === config.outputDim;
      const compatibleVocab = sameArray(
        decoded.vocab.indexToName,
        vocab.indexToName,
      );
      if (compatibleConfig && compatibleVocab) {
        return {
          weights: decoded.weights,
          source: "loaded" as const,
        };
      }
    } catch {
      // fall back to init
    }
  }

  return {
    weights: initWeights(config),
    source: "initialized" as const,
  };
}

export async function trainGruDataset(
  options: TrainGruDatasetOptions,
): Promise<TrainGruDatasetResult> {
  const config = options.config ?? DEFAULT_GRU_CONFIG;
  const maxEpochs = Math.max(1, options.maxEpochs ?? 1);
  const learningRate = options.learningRate ?? 0.01;
  const gamma = options.gamma ?? 2.0;

  const { weights, source } = await loadOrInitWeights(
    options.vocab,
    config,
    options.warmStartBlob,
  );

  if (options.examples.length === 0) {
    const weightsBlob = await serializeWeights(weights, options.vocab, config);
    return {
      weightsSource: source,
      weightsBlob,
      epochs: 0,
      exampleCount: 0,
      vocabSize: options.vocab.nodes.length,
      avgLoss: 0,
      accuracy: 0,
      history: [],
    };
  }

  let avgLoss = 0;
  let accuracy = 0;
  const history: Array<{ epoch: number; avgLoss: number; accuracy: number }> =
    [];

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    const metrics = trainEpoch(
      options.examples,
      weights,
      options.vocab,
      config,
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
    await options.onEpoch?.({
      epoch: epoch + 1,
      totalEpochs: maxEpochs,
      avgLoss,
      accuracy,
    });
  }

  const weightsBlob = await serializeWeights(weights, options.vocab, config);
  return {
    weightsSource: source,
    weightsBlob,
    epochs: maxEpochs,
    exampleCount: options.examples.length,
    vocabSize: options.vocab.nodes.length,
    avgLoss,
    accuracy,
    history,
  };
}
