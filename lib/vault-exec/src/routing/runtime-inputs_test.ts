import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { extractSubgraph } from "../core/graph.ts";
import type { CompiledNode, VaultGraph } from "../core/types.ts";
import {
  summarizeRuntimeInputCompatibility,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";

function makeNode(
  name: string,
  overrides: Partial<CompiledNode> = {},
): CompiledNode {
  return {
    name,
    type: "code",
    inputs: {},
    outputs: ["output"],
    ...overrides,
  };
}

function makeIntentCandidateGraph(): VaultGraph {
  const nodes = new Map<string, CompiledNode>([
    [
      "Follow Up Deal",
      makeNode("Follow Up Deal", {
        inputs: { dealId: "{{inputs.deal_id}}" },
        inputSchema: {
          type: "object",
          properties: {
            deal_id: { type: "string" },
          },
          required: ["deal_id"],
          additionalProperties: false,
        },
      }),
    ],
    [
      "Stale Deals Report",
      makeNode("Stale Deals Report", {
        inputs: { days: "{{inputs.days_threshold}}" },
        inputSchema: {
          type: "object",
          properties: {
            days_threshold: { type: "integer" },
          },
          required: ["days_threshold"],
          additionalProperties: false,
        },
      }),
    ],
    [
      "Load Deals",
      makeNode("Load Deals", { type: "value", value: [], outputs: ["deals"] }),
    ],
  ]);

  const edges = new Map<string, string[]>([
    ["Follow Up Deal", ["Load Deals"]],
    ["Stale Deals Report", ["Load Deals"]],
    ["Load Deals", []],
  ]);

  return { nodes, edges };
}

Deno.test("intent candidates expose compatibility status (payload visible before choice)", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");
  const reportGraph = extractSubgraph(graph, "Stale Deals Report");

  const payload = { deal_id: "D-42" };
  const followUp = validateRuntimeInputsForGraph(followUpGraph, payload);
  const report = validateRuntimeInputsForGraph(reportGraph, payload);

  assertEquals(followUp.status, "OK");
  assertEquals(report.status, "MISSING");

  const followUpSummary = summarizeRuntimeInputCompatibility(followUp);
  const reportSummary = summarizeRuntimeInputCompatibility(report);

  assertStringIncludes(followUpSummary, "OK");
  assertStringIncludes(reportSummary, "MISSING");
  assertStringIncludes(reportSummary, "missing=[days_threshold]");
  assertStringIncludes(reportSummary, "extra=[deal_id]");
});

Deno.test("candidate validation differentiates invalid vs valid payload per target", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");
  const reportGraph = extractSubgraph(graph, "Stale Deals Report");

  const payloadForReport = { days_threshold: 10 };
  const followUp = validateRuntimeInputsForGraph(
    followUpGraph,
    payloadForReport,
  );
  const report = validateRuntimeInputsForGraph(reportGraph, payloadForReport);

  assertEquals(followUp.ok, false);
  assertEquals(followUp.status, "MISSING");
  assertEquals(report.ok, true);
  assertEquals(report.status, "OK");
});

Deno.test("strict target schema behavior remains unchanged for extra fields", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");

  const payload = { deal_id: "D-99", unexpected: true };
  const result = validateRuntimeInputsForGraph(followUpGraph, payload);

  assertEquals(result.ok, false);
  assertEquals(result.status, "EXTRA");
  assert(
    result.issues.some((issue) =>
      issue.kind === "extra" && issue.path.endsWith("/unexpected")
    ),
    "expected additionalProperties violation for /unexpected",
  );
});

Deno.test("runtime validation enforces enum constraints from input_schema", () => {
  const nodes = new Map<string, CompiledNode>([
    [
      "Mode Gate",
      makeNode("Mode Gate", {
        inputs: { mode: "{{inputs.mode}}" },
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["fast", "safe"] },
          },
          required: ["mode"],
          additionalProperties: false,
        },
      }),
    ],
  ]);
  const edges = new Map<string, string[]>([["Mode Gate", []]]);
  const graph: VaultGraph = { nodes, edges };

  const result = validateRuntimeInputsForGraph(graph, { mode: "turbo" });
  assertEquals(result.ok, false);
  assertEquals(result.status, "INVALID");
});
