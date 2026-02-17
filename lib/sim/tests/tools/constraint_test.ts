/**
 * Tests for constraint tools
 *
 * Uses pure data fixtures — no SysON dependency.
 * Only sim_constraint_evaluate is testable offline.
 * sim_constraint_extract and sim_validate require SysON (integration tests).
 */

import { assertEquals, assertRejects } from "@std/assert";
import { constraintTools } from "../../src/tools/constraint.ts";
import type {
  ConstraintResult,
  ExtractedConstraint,
  ValidationSummary,
} from "../../src/data/constraint-types.ts";

function getHandler(name: string) {
  const tool = constraintTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler;
}

// ============================================================================
// Tool registration
// ============================================================================

Deno.test("constraintTools - exports 3 tools", () => {
  assertEquals(constraintTools.length, 3);
});

Deno.test("constraintTools - all have category 'constraint'", () => {
  for (const tool of constraintTools) {
    assertEquals(tool.category, "constraint");
  }
});

Deno.test("constraintTools - correct names", () => {
  const names = constraintTools.map((t) => t.name);
  assertEquals(names, [
    "sim_constraint_extract",
    "sim_constraint_evaluate",
    "sim_validate",
  ]);
});

Deno.test("constraintTools - sim_validate has UI meta", () => {
  const tool = constraintTools.find((t) => t.name === "sim_validate");
  assertEquals(tool?._meta?.ui?.resourceUri, "ui://mcp-sim/validation-viewer");
});

// ============================================================================
// sim_constraint_evaluate — offline mode
// ============================================================================

function makeTestConstraints(): ExtractedConstraint[] {
  return [
    {
      id: "C-mass",
      name: "Mass budget",
      elementId: "el-mass",
      expression: {
        kind: "binary",
        op: "<=",
        left: { kind: "ref", featurePath: ["totalMass"] },
        right: { kind: "literal", value: 500 },
      },
    },
    {
      id: "C-cost",
      name: "Cost limit",
      elementId: "el-cost",
      expression: {
        kind: "binary",
        op: "<=",
        left: { kind: "ref", featurePath: ["totalCost"] },
        right: { kind: "literal", value: 1000 },
      },
    },
    {
      id: "C-thrust",
      name: "Min thrust",
      elementId: "el-thrust",
      expression: {
        kind: "binary",
        op: ">=",
        left: { kind: "ref", featurePath: ["thrust"] },
        right: { kind: "literal", value: 100 },
      },
    },
  ];
}

Deno.test("sim_constraint_evaluate - all pass", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: makeTestConstraints(),
    values: { totalMass: 450, totalCost: 800, thrust: 120 },
  }) as { results: ConstraintResult[]; summary: ValidationSummary };

  assertEquals(result.summary.total, 3);
  assertEquals(result.summary.pass, 3);
  assertEquals(result.summary.fail, 0);
});

Deno.test("sim_constraint_evaluate - mixed results", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: makeTestConstraints(),
    values: { totalMass: 600, totalCost: 800, thrust: 80 },
  }) as { results: ConstraintResult[]; summary: ValidationSummary };

  assertEquals(result.summary.total, 3);
  assertEquals(result.summary.pass, 1);  // cost OK
  assertEquals(result.summary.fail, 2);  // mass over, thrust under
});

Deno.test("sim_constraint_evaluate - unresolved values", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: makeTestConstraints(),
    values: { totalMass: 450 }, // missing totalCost and thrust
  }) as { results: ConstraintResult[]; summary: ValidationSummary };

  assertEquals(result.summary.total, 3);
  assertEquals(result.summary.pass, 1);      // mass OK
  assertEquals(result.summary.unresolved, 2); // cost and thrust missing
});

Deno.test("sim_constraint_evaluate - margin calculation", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: [makeTestConstraints()[0]], // mass <= 500
    values: { totalMass: 450 },
  }) as { results: ConstraintResult[]; summary: ValidationSummary };

  const mass = result.results[0];
  assertEquals(mass.status, "pass");
  assertEquals(mass.computedValue, 450);
  assertEquals(mass.threshold, 500);
  assertEquals(mass.margin, 50);
  assertEquals(mass.marginPercent, 10);
});

Deno.test("sim_constraint_evaluate - returns resolved values", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: makeTestConstraints(),
    values: { totalMass: 450, totalCost: 800, thrust: 120 },
  }) as { resolvedValues: Record<string, number> };

  assertEquals(result.resolvedValues.totalMass, 450);
  assertEquals(result.resolvedValues.totalCost, 800);
  assertEquals(result.resolvedValues.thrust, 120);
});

Deno.test("sim_constraint_evaluate - rejects without values or editing_context", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  // Neither values nor editing_context_id provided — handler is async, throws inside
  await assertRejects(
    () => handler({ constraints: makeTestConstraints() }) as Promise<unknown>,
    Error,
    "Either 'values' or both",
  );
});

// ============================================================================
// Empty constraints
// ============================================================================

Deno.test("sim_constraint_evaluate - empty constraints → empty results", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const result = await handler({
    constraints: [],
    values: {},
  }) as { results: ConstraintResult[]; summary: ValidationSummary };

  assertEquals(result.results.length, 0);
  assertEquals(result.summary.total, 0);
});

// ============================================================================
// Complex expression: (structMass + payloadMass) <= 500
// ============================================================================

Deno.test("sim_constraint_evaluate - complex expression", async () => {
  const handler = getHandler("sim_constraint_evaluate");
  const constraints: ExtractedConstraint[] = [{
    id: "C-combined",
    name: "Combined mass",
    elementId: "el-combined",
    expression: {
      kind: "binary",
      op: "<=",
      left: {
        kind: "binary",
        op: "+",
        left: { kind: "ref", featurePath: ["structMass"] },
        right: { kind: "ref", featurePath: ["payloadMass"] },
      },
      right: { kind: "literal", value: 500 },
    },
  }];

  const pass = await handler({
    constraints,
    values: { structMass: 200, payloadMass: 250 },
  }) as { results: ConstraintResult[] };
  assertEquals(pass.results[0].status, "pass");

  const fail = await handler({
    constraints,
    values: { structMass: 300, payloadMass: 250 },
  }) as { results: ConstraintResult[] };
  assertEquals(fail.results[0].status, "fail");
});
