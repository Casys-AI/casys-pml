import { extractSubgraph } from "../core/graph.ts";
import type { VaultGraph } from "../core/contracts.ts";
import type { RuntimeValidationStatus } from "./runtime-inputs.ts";
import {
  resolveTargetIdentifierDetailed,
  type TargetIdentifierIndex,
} from "./target-identifiers.ts";
import {
  defaultRuntimeInputValidator,
  type RuntimeInputValidator,
} from "./runtime-validator.ts";

export interface IntentCandidate {
  target: string;
  confidence: number;
  path: string[];
}

export interface EvaluatedIntentCandidate extends IntentCandidate {
  candidateId: string;
  targetId: string;
  targetAlias: string;
  targetResolution: "index" | "fallback";
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
  return [
    ...new Set(
      issues
        .filter((issue) => issue.kind === kind)
        .map((issue) => issue.path.split("/").pop() ?? issue.path)
        .filter((key) => key.length > 0),
    ),
  ].sort();
}

function resolveCandidateTarget(
  targetName: string,
  targetIndex?: TargetIdentifierIndex,
): {
  targetId: string;
  targetAlias: string;
  targetResolution: "index" | "fallback";
} {
  if (!targetIndex) {
    return {
      targetId: targetName,
      targetAlias: targetName,
      targetResolution: "fallback",
    };
  }

  const resolved = resolveTargetIdentifierDetailed(targetName, targetIndex);
  if (!resolved.target) {
    return {
      targetId: targetName,
      targetAlias: targetName,
      targetResolution: "fallback",
    };
  }

  return {
    targetId: resolved.target.id,
    targetAlias: resolved.target.alias,
    targetResolution: "index",
  };
}

export function evaluateIntentCandidates(
  fullGraph: VaultGraph,
  candidates: IntentCandidate[],
  payload: Record<string, unknown>,
  targetIndex?: TargetIdentifierIndex,
  validator: RuntimeInputValidator = defaultRuntimeInputValidator,
): EvaluatedIntentCandidate[] {
  return candidates.map((candidate) => {
    const candidateGraph = extractSubgraph(fullGraph, candidate.target);
    const validation = validator.validate(candidateGraph, payload);
    const resolvedTarget = resolveCandidateTarget(
      candidate.target,
      targetIndex,
    );

    return {
      ...candidate,
      candidateId: makeCandidateId(resolvedTarget.targetId),
      targetId: resolvedTarget.targetId,
      targetAlias: resolvedTarget.targetAlias,
      targetResolution: resolvedTarget.targetResolution,
      payloadStatus: validator.summarize(validation),
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
