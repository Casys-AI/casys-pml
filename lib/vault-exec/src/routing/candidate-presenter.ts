import type { EvaluatedIntentCandidate } from "./candidate-policy.ts";

export function formatIntentCandidateLine(
  index: number,
  candidate: EvaluatedIntentCandidate,
): string {
  return `[${index}] target=${candidate.target} (${candidate.targetId}) confidence=${
    candidate.confidence.toFixed(2)
  } payload=${candidate.payloadStatus} path=${candidate.path.join(" → ")}`;
}
