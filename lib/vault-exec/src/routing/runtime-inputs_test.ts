import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { extractSubgraph } from "../core/graph.ts";
import type { CompiledNode, VaultGraph } from "../core/contracts.ts";
import {
  parseRuntimePayloadMode,
  prepareRuntimeInputsForGraph,
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
  assertEquals(followUp.schemaSource, "declared");
  assertEquals(report.status, "MISSING");
  assertEquals(report.schemaSource, "declared");

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
  assertEquals(result.schemaSource, "declared");
});

Deno.test("runtime validation exposes inferred schema source when using runtime refs only", () => {
  const nodes = new Map<string, CompiledNode>([
    [
      "Inferred Input Node",
      makeNode("Inferred Input Node", {
        inputs: { accountId: "{{inputs.account_id}}" },
        inputSchema: undefined,
      }),
    ],
  ]);
  const edges = new Map<string, string[]>([["Inferred Input Node", []]]);
  const graph: VaultGraph = { nodes, edges };

  const result = validateRuntimeInputsForGraph(graph, {});
  assertEquals(result.ok, false);
  assertEquals(result.status, "MISSING");
  assertEquals(result.schemaSource, "inferred");
});

Deno.test("payload mode strict keeps existing EXTRA validation behavior", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");
  const payload = { deal_id: "D-100", unexpected: true };

  const prepared = prepareRuntimeInputsForGraph(
    followUpGraph,
    payload,
    "strict",
  );

  assertEquals(prepared.mode, "strict");
  assertEquals(prepared.projected, false);
  assertEquals(prepared.droppedKeys, []);
  assertEquals(prepared.payload, payload);
  assertEquals(prepared.validation.ok, false);
  assertEquals(prepared.validation.status, "EXTRA");
});

Deno.test("payload mode project drops unknown keys deterministically", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");

  const prepared = prepareRuntimeInputsForGraph(
    followUpGraph,
    { deal_id: "D-200", zeta: true, alpha: "x" },
    "project",
  );

  assertEquals(prepared.mode, "project");
  assertEquals(prepared.projected, true);
  assertEquals(prepared.droppedKeys, ["alpha", "zeta"]);
  assertEquals(prepared.payload, { deal_id: "D-200" });
  assertEquals(prepared.validation.ok, true);
  assertEquals(prepared.validation.status, "OK");
});

Deno.test("payload mode project keeps unknown keys when schema allows additional properties", () => {
  const nodes = new Map<string, CompiledNode>([
    [
      "Flexible Input Node",
      makeNode("Flexible Input Node", {
        inputs: { accountId: "{{inputs.account_id}}" },
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
          },
          required: ["account_id"],
          additionalProperties: true,
        },
      }),
    ],
  ]);
  const edges = new Map<string, string[]>([["Flexible Input Node", []]]);
  const graph: VaultGraph = { nodes, edges };

  const payload = { account_id: "acct-1", extra_flag: true };
  const prepared = prepareRuntimeInputsForGraph(graph, payload, "project");

  assertEquals(prepared.projected, false);
  assertEquals(prepared.droppedKeys, []);
  assertEquals(prepared.payload, payload);
  assertEquals(prepared.validation.ok, true);
  assertEquals(prepared.validation.status, "OK");
});

Deno.test("payload mode project preserves inferred runtime keys in mixed declared schema graphs", () => {
  const nodes = new Map<string, CompiledNode>([
    [
      "Declared Node",
      makeNode("Declared Node", {
        inputs: { accountId: "{{inputs.account_id}}" },
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
          },
          required: ["account_id"],
          additionalProperties: false,
        },
      }),
    ],
    [
      "Inferred Node",
      makeNode("Inferred Node", {
        inputs: { region: "{{inputs.region}}" },
      }),
    ],
  ]);
  const edges = new Map<string, string[]>([
    ["Declared Node", []],
    ["Inferred Node", []],
  ]);
  const graph: VaultGraph = { nodes, edges };

  const prepared = prepareRuntimeInputsForGraph(
    graph,
    { account_id: "acct-10", region: "eu-west-1", noise: true },
    "project",
  );

  assertEquals(prepared.projected, true);
  assertEquals(prepared.droppedKeys, ["noise"]);
  assertEquals(prepared.payload, {
    account_id: "acct-10",
    region: "eu-west-1",
  });
  assertEquals(prepared.validation.ok, true);
  assertEquals(prepared.validation.status, "OK");
});

Deno.test("payload mode project does not hide missing required fields", () => {
  const graph = makeIntentCandidateGraph();
  const followUpGraph = extractSubgraph(graph, "Follow Up Deal");

  const prepared = prepareRuntimeInputsForGraph(
    followUpGraph,
    { unexpected: true },
    "project",
  );

  assertEquals(prepared.projected, true);
  assertEquals(prepared.droppedKeys, ["unexpected"]);
  assertEquals(prepared.payload, {});
  assertEquals(prepared.validation.ok, false);
  assertEquals(prepared.validation.status, "MISSING");
});

Deno.test("payload mode project keeps payload unchanged when no schema exists", () => {
  const nodes = new Map<string, CompiledNode>([
    [
      "No Runtime Inputs",
      makeNode("No Runtime Inputs", {
        inputs: {},
        inputSchema: undefined,
      }),
    ],
  ]);
  const edges = new Map<string, string[]>([["No Runtime Inputs", []]]);
  const graph: VaultGraph = { nodes, edges };
  const payload = { free_form: "ok" };

  const prepared = prepareRuntimeInputsForGraph(graph, payload, "project");

  assertEquals(prepared.projected, false);
  assertEquals(prepared.droppedKeys, []);
  assertEquals(prepared.payload, payload);
  assertEquals(prepared.validation.ok, true);
  assertEquals(prepared.validation.status, "OK");
  assertEquals(prepared.validation.schemaSource, "none");
});

Deno.test("parseRuntimePayloadMode accepts strict/project and defaults to strict", () => {
  assertEquals(parseRuntimePayloadMode(undefined), {
    ok: true,
    mode: "strict",
    received: "strict",
    allowedModes: ["strict", "project"],
  });
  assertEquals(parseRuntimePayloadMode("project"), {
    ok: true,
    mode: "project",
    received: "project",
    allowedModes: ["strict", "project"],
  });
  assertEquals(parseRuntimePayloadMode("  STRICT "), {
    ok: true,
    mode: "strict",
    received: "strict",
    allowedModes: ["strict", "project"],
  });
});

Deno.test("parseRuntimePayloadMode rejects unknown modes deterministically", () => {
  assertEquals(parseRuntimePayloadMode("drop"), {
    ok: false,
    received: "drop",
    allowedModes: ["strict", "project"],
  });
});
