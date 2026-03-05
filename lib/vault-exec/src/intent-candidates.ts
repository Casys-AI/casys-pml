import { extractSubgraph } from "./graph.ts";
import {
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";
import type { VaultGraph } from "./types.ts";

export interface IntentCandidate {
  target: string;
  confidence: number;
  path: string[];
}

export interface EvaluatedIntentCandidate extends IntentCandidate {
  payloadStatus: string;
  payloadOk: boolean;
}

export function evaluateIntentCandidates(
  fullGraph: VaultGraph,
  candidates: IntentCandidate[],
  payload: Record<string, unknown>,
): EvaluatedIntentCandidate[] {
  return candidates.map((candidate) => {
    const candidateGraph = extractSubgraph(fullGraph, candidate.target);
    const validation = validateRuntimeInputsForGraph(candidateGraph, payload);
    return {
      ...candidate,
      payloadStatus: summarizeRuntimeInputCompatibility(validation),
      payloadOk: validation.ok,
    };
  });
}

export function formatIntentCandidateLine(index: number, candidate: EvaluatedIntentCandidate): string {
  return `[${index}] target=${candidate.target} confidence=${candidate.confidence.toFixed(2)} payload=${candidate.payloadStatus} path=${candidate.path.join(" → ")}`;
}
