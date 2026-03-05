import { extractSubgraph } from "./graph.ts";
import {
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";
import type { RuntimeValidationStatus } from "./runtime-inputs.ts";
import type { VaultGraph } from "./types.ts";
import type { TargetIdentifierIndex } from "./target-identifiers.ts";

export interface IntentCandidate {
  target: string;
  confidence: number;
  path: string[];
}

export interface EvaluatedIntentCandidate extends IntentCandidate {
  candidateId: string;
  targetId: string;
  targetAlias: string;
  payloadStatus: string;
  payloadOk: boolean;
  validation: {
    ok: boolean;
    status: RuntimeValidationStatus;
    missing: string[];
    extra: string[];
    invalid: string[];
  };
}

function makeCandidateId(targetId: string): string {
  const normalized = targetId.toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cand_${normalized || "unknown"}`;
}

function issueKeys(
  issues: Array<{ kind: "missing" | "extra" | "invalid"; path: string }>,
  kind: "missing" | "extra" | "invalid",
): string[] {
  return [...new Set(
    issues
      .filter((issue) => issue.kind === kind)
      .map((issue) => issue.path.split("/").pop() ?? issue.path)
      .filter((key) => key.length > 0),
  )].sort();
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
      candidateId: makeCandidateId(targetId),
      targetId,
      targetAlias,
      payloadStatus: summarizeRuntimeInputCompatibility(validation),
      payloadOk: validation.ok,
      validation: {
        ok: validation.ok,
        status: validation.status,
        missing: issueKeys(validation.issues, "missing"),
        extra: issueKeys(validation.issues, "extra"),
        invalid: issueKeys(validation.issues, "invalid"),
      },
    };
  });
}

export function formatIntentCandidateLine(index: number, candidate: EvaluatedIntentCandidate): string {
  return `[${index}] target=${candidate.target} (${candidate.targetId}) confidence=${candidate.confidence.toFixed(2)} payload=${candidate.payloadStatus} path=${candidate.path.join(" → ")}`;
}
