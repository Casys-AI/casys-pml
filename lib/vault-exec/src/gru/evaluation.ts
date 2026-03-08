import { GRUInference } from "./inference.ts";
import type { GRUConfig, GRUVocabulary, GRUWeights } from "./types.ts";
import type { TrainingExample } from "./trainer.ts";

export interface GruEvaluationMetrics {
  accuracy: number;
  top3Accuracy: number;
  mrr: number;
  majorityNextBaseline: number;
}

export function evaluateGruPredictions(
  examples: TrainingExample[],
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
): GruEvaluationMetrics {
  const positiveExamples = examples.filter((example) => !example.negative);
  if (positiveExamples.length === 0) {
    return {
      accuracy: 0,
      top3Accuracy: 0,
      mrr: 0,
      majorityNextBaseline: 0,
    };
  }

  const inference = new GRUInference(weights, vocab, config);
  const targetCounts = new Map<number, number>();
  let top1Hits = 0;
  let top3Hits = 0;
  let reciprocalRankSum = 0;

  for (const example of positiveExamples) {
    targetCounts.set(
      example.targetIdx,
      (targetCounts.get(example.targetIdx) ?? 0) + 1,
    );
    const targetName = vocab.indexToName[example.targetIdx];
    const ranked = inference.predictNext(
      example.intentEmb,
      example.path.slice(0, -1),
    ).ranked;

    if (ranked[0]?.name === targetName) {
      top1Hits += 1;
    }
    if (ranked.slice(0, 3).some((candidate) => candidate.name === targetName)) {
      top3Hits += 1;
    }

    const rank = ranked.findIndex((candidate) => candidate.name === targetName);
    if (rank !== -1) {
      reciprocalRankSum += 1 / (rank + 1);
    }
  }

  const majorityCount = Math.max(...targetCounts.values());

  return {
    accuracy: top1Hits / positiveExamples.length,
    top3Accuracy: top3Hits / positiveExamples.length,
    mrr: reciprocalRankSum / positiveExamples.length,
    majorityNextBaseline: majorityCount / positiveExamples.length,
  };
}
