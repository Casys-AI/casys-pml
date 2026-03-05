import type { GRUConfig, GRUVocabulary, GRUWeights } from "./types.ts";
import { gruStep } from "./cell.ts";
import { dotProduct, softmax } from "../gnn/domain/attention.ts";

interface PredictResult {
  name: string;
  score: number;
  ranked: Array<{ name: string; score: number }>;
}

interface BeamCandidate {
  path: string[];
  score: number;
  hidden: number[];
}

function norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

export class GRUInference {
  constructor(
    private weights: GRUWeights,
    private vocab: GRUVocabulary,
    private config: GRUConfig,
  ) {}

  /** Predict next node given intent and context sequence */
  predictNext(intent: number[], context: string[]): PredictResult {
    let hidden = new Array(this.config.hiddenDim).fill(0);

    // Feed context through GRU
    for (const name of context) {
      const idx = this.vocab.nameToIndex.get(name);
      if (idx === undefined) continue;
      const emb = this.vocab.nodes[idx].embedding;
      const step = gruStep(emb, hidden, intent, this.weights, this.config);
      hidden = step.hNew;
    }

    // Get logits for next step
    const startEmb = context.length > 0
      ? this.vocab.nodes[
        this.vocab.nameToIndex.get(context[context.length - 1])!
      ].embedding
      : new Array(this.config.inputDim).fill(0);

    const { logits } = gruStep(
      startEmb,
      hidden,
      intent,
      this.weights,
      this.config,
    );

    // Score each vocab node by cosine similarity with logits
    const logitsNorm = norm(logits);
    const scores = this.vocab.nodes.map((node) => {
      const sim = dotProduct(logits, node.embedding) /
        (logitsNorm * norm(node.embedding) + 1e-8);
      return sim;
    });

    const probs = softmax(scores.map((s) => s / 0.05)); // temperature

    // DAG constraint: exclude nodes already in context (acyclicity)
    const visited = new Set(context);
    const ranked = this.vocab.indexToName
      .map((name, i) => ({ name, score: probs[i] }))
      .filter(({ name }) => !visited.has(name))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      return { name: "", score: 0, ranked: [] };
    }

    return { name: ranked[0].name, score: ranked[0].score, ranked };
  }

  /** Build greedy path from intent */
  buildPath(intent: number[], maxLen: number): string[] {
    const path: string[] = [];
    let hidden = new Array(this.config.hiddenDim).fill(0);
    let input = new Array(this.config.inputDim).fill(0);

    for (let t = 0; t < maxLen; t++) {
      const { hNew, logits } = gruStep(
        input,
        hidden,
        intent,
        this.weights,
        this.config,
      );
      hidden = hNew;

      const logitsNorm = norm(logits);
      const scores = this.vocab.nodes.map((node) => {
        const sim = dotProduct(logits, node.embedding) /
          (logitsNorm * norm(node.embedding) + 1e-8);
        return sim;
      });

      const probs = softmax(scores.map((s) => s / 0.05));
      let bestIdx = 0;
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[bestIdx]) bestIdx = i;
      }

      const bestName = this.vocab.indexToName[bestIdx];

      // DAG constraint: no revisiting nodes (acyclicity)
      if (path.includes(bestName)) break;

      path.push(bestName);
      input = this.vocab.nodes[bestIdx].embedding;

      // Termination: if highest prob < 0.1 and not first step
      if (probs[bestIdx] < 0.1 && t > 0) break;
    }

    return path;
  }

  /** Build paths using beam search with length normalization */
  buildPathBeam(
    intent: number[],
    beamWidth: number,
    maxLen: number,
  ): Array<{ path: string[]; score: number }> {
    let beams: BeamCandidate[] = [
      {
        path: [],
        score: 0,
        hidden: new Array(this.config.hiddenDim).fill(0),
      },
    ];

    const completed: BeamCandidate[] = [];

    for (let t = 0; t < maxLen; t++) {
      const candidates: BeamCandidate[] = [];

      for (const beam of beams) {
        const input = beam.path.length > 0
          ? this.vocab.nodes[
            this.vocab.nameToIndex.get(
              beam.path[beam.path.length - 1],
            )!
          ].embedding
          : new Array(this.config.inputDim).fill(0);

        const { hNew, logits } = gruStep(
          input,
          beam.hidden,
          intent,
          this.weights,
          this.config,
        );

        const logitsNorm = norm(logits);
        const scores = this.vocab.nodes.map((node) => {
          const sim = dotProduct(logits, node.embedding) /
            (logitsNorm * norm(node.embedding) + 1e-8);
          return sim;
        });

        const probs = softmax(scores.map((s) => s / 0.05));

        // Top-K candidates
        const topK = probs
          .map((p, i) => ({ idx: i, prob: p }))
          .sort((a, b) => b.prob - a.prob)
          .slice(0, beamWidth);

        for (const { idx, prob } of topK) {
          const name = this.vocab.indexToName[idx];

          // DAG constraint: no revisiting nodes (acyclicity)
          if (beam.path.includes(name)) continue;

          const newPath = [...beam.path, name];
          const logProb = beam.score + Math.log(prob + 1e-10);

          candidates.push({
            path: newPath,
            // Length normalization: divide accumulated log-prob by len^0.7
            score: logProb / Math.pow(newPath.length, 0.7),
            hidden: hNew,
          });
        }

        // Terminate beam if long enough
        if (beam.path.length >= 2) {
          completed.push(beam);
        }
      }

      // Keep top beamWidth candidates
      candidates.sort((a, b) => b.score - a.score);
      beams = candidates.slice(0, beamWidth);

      if (beams.length === 0) break;
    }

    completed.push(...beams);
    completed.sort((a, b) => b.score - a.score);

    return completed
      .slice(0, beamWidth * 2)
      .map(({ path, score }) => ({ path, score }));
  }
}
