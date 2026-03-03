/**
 * Data-prep: per-cap frequency capping.
 *
 * Limits the number of training examples per target to avoid
 * dominant caps (e.g. db:postgresQuery at 44% of all data)
 * from drowning out rare caps in the loss.
 *
 * Pure function — no DB, no runtime-specific imports.
 *
 * @module gru/data-prep/cap-frequency-cap
 */

/**
 * Minimal example interface — only needs targetToolId and intentEmbedding.
 * Compatible with TransitionExample.
 */
export interface CappableExample {
  targetToolId: string;
  intentEmbedding: number[];
}

/**
 * Cap the number of examples per unique targetToolId.
 *
 * When a target has more than `maxPerTarget` examples, we keep the most
 * diverse intents using greedy farthest-point sampling on intent embeddings.
 * This preserves intent diversity instead of random dropping.
 *
 * @param examples    Full example array (not mutated)
 * @param maxPerTarget  Maximum examples per unique targetToolId
 * @param rng         Optional seeded RNG for the first pivot (default: Math.random)
 * @returns           Capped array + stats
 */
export function capExamplesPerTarget<T extends CappableExample>(
  examples: T[],
  maxPerTarget: number,
  rng: () => number = Math.random,
): { capped: T[]; stats: CapStats } {
  // Group by target
  const groups = new Map<string, T[]>();
  for (const ex of examples) {
    const group = groups.get(ex.targetToolId);
    if (group) group.push(ex);
    else groups.set(ex.targetToolId, [ex]);
  }

  const capped: T[] = [];
  let totalDropped = 0;
  let cappedTargets = 0;
  const droppedPerTarget: Array<{ target: string; had: number; kept: number }> = [];

  for (const [target, group] of Array.from(groups.entries())) {
    if (group.length <= maxPerTarget) {
      capped.push(...group);
      continue;
    }

    // Greedy farthest-point sampling for intent diversity
    const selected = farthestPointSample<T>(group, maxPerTarget, rng);
    capped.push(...selected);

    const dropped = group.length - selected.length;
    totalDropped += dropped;
    cappedTargets++;
    droppedPerTarget.push({ target, had: group.length, kept: selected.length });
  }

  // Sort by most dropped for logging
  droppedPerTarget.sort((a, b) => (b.had - b.kept) - (a.had - a.kept));

  return {
    capped,
    stats: {
      before: examples.length,
      after: capped.length,
      dropped: totalDropped,
      cappedTargets,
      maxPerTarget,
      topDropped: droppedPerTarget.slice(0, 5),
    },
  };
}

export interface CapStats {
  before: number;
  after: number;
  dropped: number;
  cappedTargets: number;
  maxPerTarget: number;
  topDropped: Array<{ target: string; had: number; kept: number }>;
}

/**
 * Greedy farthest-point sampling on intent embeddings.
 *
 * 1. Pick a random first pivot
 * 2. Greedily pick the point farthest from all already-selected points
 * 3. Repeat until we have `k` points
 *
 * O(n*k) — fine for n < 1000.
 */
function farthestPointSample<T extends CappableExample>(
  examples: T[],
  k: number,
  rng: () => number,
): T[] {
  const n = examples.length;
  if (n <= k) return [...examples];

  const selected: number[] = [];
  // Min distance from each point to the selected set
  const minDist = new Float64Array(n).fill(Infinity);

  // First pivot: random
  const first = Math.floor(rng() * n);
  selected.push(first);

  // Update distances from first pivot
  for (let i = 0; i < n; i++) {
    if (i === first) { minDist[i] = 0; continue; }
    minDist[i] = intentDistance(examples[first].intentEmbedding, examples[i].intentEmbedding);
  }

  // Greedily pick farthest point
  for (let s = 1; s < k; s++) {
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = 0; i < n; i++) {
      if (minDist[i] > bestDist) {
        bestDist = minDist[i];
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    selected.push(bestIdx);
    minDist[bestIdx] = 0;

    // Update min distances
    const newEmb = examples[bestIdx].intentEmbedding;
    for (let i = 0; i < n; i++) {
      if (minDist[i] === 0) continue;
      const d = intentDistance(newEmb, examples[i].intentEmbedding);
      if (d < minDist[i]) minDist[i] = d;
    }
  }

  return selected.map((i) => examples[i]);
}

/** Squared L2 distance between two embeddings (faster than cosine for relative ordering). */
function intentDistance(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}
