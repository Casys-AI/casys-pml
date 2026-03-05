import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import type { CompiledNode, VaultGraph } from "./types.ts";
import {
  evaluateIntentCandidates,
  formatIntentCandidateLine,
} from "./intent-candidates.ts";
import { buildTargetIdentifierIndex } from "./target-identifiers.ts";

function makeNode(name: string, overrides: Partial<CompiledNode> = {}): CompiledNode {
  return {
    name,
    type: "code",
    inputs: {},
    outputs: ["output"],
    ...overrides,
  };
}

function makeGraph(): VaultGraph {
  const nodes = new Map<string, CompiledNode>([
    [
      "Candidate A",
      makeNode("Candidate A", {
        inputSchema: {
          type: "object",
          properties: { account_id: { type: "string" } },
          required: ["account_id"],
          additionalProperties: false,
        },
      }),
    ],
    [
      "Candidate B",
      makeNode("Candidate B", {
        inputSchema: {
          type: "object",
          properties: { days: { type: "integer" } },
          required: ["days"],
          additionalProperties: false,
        },
      }),
    ],
  ]);

  const edges = new Map<string, string[]>([
    ["Candidate A", []],
    ["Candidate B", []],
  ]);

  return { nodes, edges };
}

Deno.test("intent candidate formatter includes payload compatibility status", () => {
  const graph = makeGraph();
  const candidates = evaluateIntentCandidates(
    graph,
    [
      { target: "Candidate A", confidence: 0.87, path: ["Candidate A"] },
      { target: "Candidate B", confidence: 0.13, path: ["Candidate B"] },
    ],
    { account_id: "acct-42" },
    buildTargetIdentifierIndex(["Candidate A", "Candidate B"]),
  );

  assertEquals(candidates[0].payloadOk, true);
  assertEquals(candidates[1].payloadOk, false);
  assertEquals(candidates[0].targetId, "candidate-a");
  assertEquals(candidates[0].targetAlias, "c-a");
  assertEquals(candidates[0].candidateId, "cand_candidate-a");
  assertEquals(candidates[0].validation.status, "OK");
  assertEquals(candidates[1].validation.status, "MISSING");
  assertEquals(candidates[1].validation.missing, ["days"]);
  assertEquals(candidates[1].validation.extra, ["account_id"]);

  const line1 = formatIntentCandidateLine(1, candidates[0]);
  const line2 = formatIntentCandidateLine(2, candidates[1]);

  assertStringIncludes(line1, "payload=OK");
  assertStringIncludes(line2, "payload=MISSING");
  assertStringIncludes(line2, "missing=[days]");
});
