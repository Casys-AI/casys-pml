import type { Level, PredictionStep, Trace, TrainingExample, VocabNode } from "./types.ts";

// Seeded shuffle (mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert traces to step-by-step prediction examples.
 *
 * From a trace [A, B, C, D] of length N, we get N-1 examples:
 *   history=[A]       → target=B
 *   history=[A,B]     → target=C
 *   history=[A,B,C]   → target=D
 */
export function tracesToExamples(
  traces: Trace[],
  nodes: Map<string, VocabNode>,
): TrainingExample[] {
  return traces.map(trace => {
    const steps: PredictionStep[] = trace.sequence.slice(0, -1).map((_, i) => {
      const target = trace.sequence[i + 1];
      const targetNode = nodes.get(target);
      return {
        history: trace.sequence.slice(0, i + 1),
        target,
        targetLevel: (targetNode?.level ?? 0) as Level,
      };
    });

    return {
      intent: trace.intentText,
      intentNodeId: trace.intentNodeId,
      intentLevel: trace.intentLevel,
      sequence: trace.sequence,
      steps,
    };
  });
}

/**
 * Random split by trace (baseline — same paraphrases can appear in both sets).
 */
export function trainTestSplit(
  traces: Trace[],
  testRatio = 0.2,
  seed = 42,
): { train: Trace[]; test: Trace[] } {
  const rng = mulberry32(seed);
  const shuffled = [...traces].sort(() => rng() - 0.5);
  const splitIdx = Math.floor(shuffled.length * (1 - testRatio));
  return {
    train: shuffled.slice(0, splitIdx),
    test: shuffled.slice(splitIdx),
  };
}

/**
 * Paraphrase-aware split — harder generalization benchmark.
 *
 * Train receives paraphrase indices 0, 1, 2.
 * Test  receives paraphrase indices 3, 4.
 *
 * A model that scores well on this split has learned the STRUCTURE of the
 * sequences, not just the surface form of the intents — because the test
 * intent phrasings were never seen during training.
 *
 * Traces with idx=-1 (no paraphrase list) go to train only.
 */
export function paraphraseAwareSplit(
  traces: Trace[],
  trainIndices: number[] = [0, 1, 2],
  testIndices: number[]  = [3, 4],
): { train: Trace[]; test: Trace[] } {
  const trainSet = new Set(trainIndices);
  const testSet  = new Set(testIndices);
  return {
    train: traces.filter(t => t.intentParaphraseIdx === -1 || trainSet.has(t.intentParaphraseIdx)),
    test:  traces.filter(t => testSet.has(t.intentParaphraseIdx)),
  };
}

/** Statistics about a trace set */
export function datasetStats(traces: Trace[], nodes: Map<string, VocabNode>) {
  const seqLengths = traces.map(t => t.sequence.length);
  const levelCounts: Record<number, number> = {};
  const intentLevelCounts: Record<number, number> = {};

  for (const trace of traces) {
    intentLevelCounts[trace.intentLevel] = (intentLevelCounts[trace.intentLevel] ?? 0) + 1;
    for (const nodeId of trace.sequence) {
      const node = nodes.get(nodeId);
      if (node) levelCounts[node.level] = (levelCounts[node.level] ?? 0) + 1;
    }
  }

  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;

  return {
    traces: traces.length,
    seqLength: {
      min: Math.min(...seqLengths),
      max: Math.max(...seqLengths),
      avg: +avg(seqLengths).toFixed(2),
    },
    nodesByLevel: levelCounts,
    intentsByLevel: intentLevelCounts,
  };
}
