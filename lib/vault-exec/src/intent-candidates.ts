import { extractSubgraph } from "./graph.ts";
import {
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";
import type { VaultGraph } from "./types.ts";
import type { TargetIdentifierIndex } from "./target-identifiers.ts";

export interface IntentCandidate {
  target: string;
  confidence: number;
  path: string[];
}

export interface EvaluatedIntentCandidate extends IntentCandidate {
  targetId: string;
  targetAlias: string;
  payloadStatus: string;
  payloadOk: boolean;
}

export function evaluateIntentCandidates(
  fullGraph: VaultGraph,
  candidates: IntentCandidate[],
  payload: Record<string, unknown>,
  targetIndex?: TargetIdentifierIndex,
): EvaluatedIntentCandidate[] {
  return candidates.map((candidate) => {
    const candidateGraph = extractSubgraph(fullGraph, candidate.target);
    const validation = validateRuntimeInputsForGraph(candidateGraph, payload);
    const targetId = targetIndex?.byName.get(candidate.target)?.id ?? candidate.target;
    const targetAlias = targetIndex?.byName.get(candidate.target)?.alias ?? candidate.target;
    return {
      ...candidate,
      targetId,
      targetAlias,
      payloadStatus: summarizeRuntimeInputCompatibility(validation),
      payloadOk: validation.ok,
    };
  });
}

export function formatIntentCandidateLine(index: number, candidate: EvaluatedIntentCandidate): string {
  return `[${index}] target=${candidate.target} (${candidate.targetId}) confidence=${candidate.confidence.toFixed(2)} payload=${candidate.payloadStatus} path=${candidate.path.join(" → ")}`;
}
