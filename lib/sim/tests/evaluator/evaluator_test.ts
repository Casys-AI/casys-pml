/**
 * Tests for the constraint expression evaluator
 *
 * Pure unit tests — no SysON dependency.
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  evaluate,
  evaluateAll,
  evaluateConstraint,
  EvalError,
  toValueMap,
} from "../../src/evaluator/evaluator.ts";
import type {
  ConstraintExpr,
  ExtractedConstraint,
} from "../../src/data/constraint-types.ts";

// ============================================================================
// Helpers
// ============================================================================

const EMPTY = toValueMap({});

function lit(value: number, unit?: string): ConstraintExpr {
  return { kind: "literal", value, unit };
}

function ref(...path: string[]): ConstraintExpr {
  return { kind: "ref", featurePath: path };
}

function bin(op: ConstraintExpr["kind"] extends "binary" ? never : string, left: ConstraintExpr, right: ConstraintExpr): ConstraintExpr {
  return { kind: "binary", op: op as any, left, right };
}

function unary(op: string, operand: ConstraintExpr): ConstraintExpr {
  return { kind: "unary", op: op as any, operand };
}

function call(name: string, ...args: ConstraintExpr[]): ConstraintExpr {
  return { kind: "call", name, args };
}

function makeConstraint(name: string, expr: ConstraintExpr): ExtractedConstraint {
  return { id: `C-${name}`, name, elementId: `el-${name}`, expression: expr };
}

// ============================================================================
// Literal evaluation
// ============================================================================

Deno.test("evaluate - literal returns value", () => {
  assertEquals(evaluate(lit(42), EMPTY), 42);
});

Deno.test("evaluate - literal with unit returns value", () => {
  assertEquals(evaluate(lit(9.81, "m/s²"), EMPTY), 9.81);
});

// ============================================================================
// Reference evaluation
// ============================================================================

Deno.test("evaluate - ref resolves from value map", () => {
  const values = toValueMap({ totalMass: 450 });
  assertEquals(evaluate(ref("totalMass"), values), 450);
});

Deno.test("evaluate - ref with dotted path", () => {
  const values = toValueMap({ "propulsion.thrust": 120 });
  assertEquals(evaluate(ref("propulsion", "thrust"), values), 120);
});

Deno.test("evaluate - ref throws on unresolved", () => {
  assertThrows(
    () => evaluate(ref("unknownFeature"), EMPTY),
    EvalError,
    "Unresolved reference: unknownFeature",
  );
});

// ============================================================================
// Arithmetic
// ============================================================================

Deno.test("evaluate - addition", () => {
  assertEquals(evaluate(bin("+", lit(5), lit(3)), EMPTY), 8);
});

Deno.test("evaluate - subtraction", () => {
  assertEquals(evaluate(bin("-", lit(10), lit(4)), EMPTY), 6);
});

Deno.test("evaluate - multiplication", () => {
  assertEquals(evaluate(bin("*", lit(7), lit(6)), EMPTY), 42);
});

Deno.test("evaluate - division", () => {
  assertEquals(evaluate(bin("/", lit(15), lit(3)), EMPTY), 5);
});

Deno.test("evaluate - division by zero throws", () => {
  assertThrows(
    () => evaluate(bin("/", lit(10), lit(0)), EMPTY),
    EvalError,
    "Division by zero",
  );
});

Deno.test("evaluate - complex arithmetic: (a + b) * c", () => {
  const values = toValueMap({ a: 2, b: 3, c: 4 });
  const expr = bin("*", bin("+", ref("a"), ref("b")), ref("c"));
  assertEquals(evaluate(expr, values), 20);
});

// ============================================================================
// Comparison (returns boolean)
// ============================================================================

Deno.test("evaluate - less than (true)", () => {
  assertEquals(evaluate(bin("<", lit(3), lit(5)), EMPTY), true);
});

Deno.test("evaluate - less than (false)", () => {
  assertEquals(evaluate(bin("<", lit(5), lit(3)), EMPTY), false);
});

Deno.test("evaluate - less than or equal", () => {
  assertEquals(evaluate(bin("<=", lit(5), lit(5)), EMPTY), true);
  assertEquals(evaluate(bin("<=", lit(6), lit(5)), EMPTY), false);
});

Deno.test("evaluate - greater than", () => {
  assertEquals(evaluate(bin(">", lit(5), lit(3)), EMPTY), true);
  assertEquals(evaluate(bin(">", lit(3), lit(5)), EMPTY), false);
});

Deno.test("evaluate - greater than or equal", () => {
  assertEquals(evaluate(bin(">=", lit(5), lit(5)), EMPTY), true);
});

Deno.test("evaluate - equals", () => {
  assertEquals(evaluate(bin("==", lit(42), lit(42)), EMPTY), true);
  assertEquals(evaluate(bin("==", lit(42), lit(43)), EMPTY), false);
});

Deno.test("evaluate - not equals", () => {
  assertEquals(evaluate(bin("!=", lit(1), lit(2)), EMPTY), true);
  assertEquals(evaluate(bin("!=", lit(1), lit(1)), EMPTY), false);
});

// ============================================================================
// Constraint: totalMass <= 500
// ============================================================================

Deno.test("evaluate - totalMass <= 500 (pass)", () => {
  const values = toValueMap({ totalMass: 450 });
  const expr = bin("<=", ref("totalMass"), lit(500));
  assertEquals(evaluate(expr, values), true);
});

Deno.test("evaluate - totalMass <= 500 (fail)", () => {
  const values = toValueMap({ totalMass: 600 });
  const expr = bin("<=", ref("totalMass"), lit(500));
  assertEquals(evaluate(expr, values), false);
});

Deno.test("evaluate - totalMass <= 500 (boundary)", () => {
  const values = toValueMap({ totalMass: 500 });
  const expr = bin("<=", ref("totalMass"), lit(500));
  assertEquals(evaluate(expr, values), true);
});

// ============================================================================
// Unary operators
// ============================================================================

Deno.test("evaluate - unary minus", () => {
  assertEquals(evaluate(unary("-", lit(5)), EMPTY), -5);
});

Deno.test("evaluate - not (true → false)", () => {
  const expr = unary("not", bin("<", lit(5), lit(3))); // not (5 < 3) = not false = true
  assertEquals(evaluate(expr, EMPTY), true);
});

// ============================================================================
// Logical operators
// ============================================================================

Deno.test("evaluate - and (both true)", () => {
  const expr = bin("and", bin("<", lit(1), lit(2)), bin("<", lit(3), lit(4)));
  assertEquals(evaluate(expr, EMPTY), true);
});

Deno.test("evaluate - and (one false)", () => {
  const expr = bin("and", bin("<", lit(1), lit(2)), bin(">", lit(3), lit(4)));
  assertEquals(evaluate(expr, EMPTY), false);
});

Deno.test("evaluate - or (one true)", () => {
  const expr = bin("or", bin("<", lit(5), lit(3)), bin("<", lit(1), lit(2)));
  assertEquals(evaluate(expr, EMPTY), true);
});

Deno.test("evaluate - or (both false)", () => {
  const expr = bin("or", bin(">", lit(1), lit(2)), bin(">", lit(3), lit(4)));
  assertEquals(evaluate(expr, EMPTY), false);
});

// ============================================================================
// Function calls
// ============================================================================

Deno.test("evaluate - abs(-5) = 5", () => {
  assertEquals(evaluate(call("abs", unary("-", lit(5))), EMPTY), 5);
});

Deno.test("evaluate - sqrt(25) = 5", () => {
  assertEquals(evaluate(call("sqrt", lit(25)), EMPTY), 5);
});

Deno.test("evaluate - min(3, 7, 1) = 1", () => {
  assertEquals(evaluate(call("min", lit(3), lit(7), lit(1)), EMPTY), 1);
});

Deno.test("evaluate - max(3, 7, 1) = 7", () => {
  assertEquals(evaluate(call("max", lit(3), lit(7), lit(1)), EMPTY), 7);
});

Deno.test("evaluate - unknown function throws", () => {
  assertThrows(
    () => evaluate(call("foobar", lit(1)), EMPTY),
    EvalError,
    "Unknown function: foobar",
  );
});

Deno.test("evaluate - sqrt of negative throws", () => {
  assertThrows(
    () => evaluate(call("sqrt", unary("-", lit(4))), EMPTY),
    EvalError,
    "sqrt of negative",
  );
});

// ============================================================================
// evaluateConstraint — high level
// ============================================================================

Deno.test("evaluateConstraint - pass with margin", () => {
  const c = makeConstraint("mass-budget", bin("<=", ref("totalMass"), lit(500)));
  const values = toValueMap({ totalMass: 450 });
  const result = evaluateConstraint(c, values);

  assertEquals(result.status, "pass");
  assertEquals(result.computedValue, 450);
  assertEquals(result.threshold, 500);
  assertEquals(result.margin, 50);
  assertEquals(result.marginPercent, 10);
});

Deno.test("evaluateConstraint - fail with negative margin", () => {
  const c = makeConstraint("mass-budget", bin("<=", ref("totalMass"), lit(500)));
  const values = toValueMap({ totalMass: 600 });
  const result = evaluateConstraint(c, values);

  assertEquals(result.status, "fail");
  assertEquals(result.computedValue, 600);
  assertEquals(result.threshold, 500);
  assertEquals(result.margin, -100);
  assertEquals(result.marginPercent, -20);
});

Deno.test("evaluateConstraint - unresolved reference", () => {
  const c = makeConstraint("mass-budget", bin("<=", ref("totalMass"), lit(500)));
  const result = evaluateConstraint(c, EMPTY);

  assertEquals(result.status, "unresolved");
  assertEquals(result.unresolvedRefs, ["totalMass"]);
});

Deno.test("evaluateConstraint - division by zero → error", () => {
  const c = makeConstraint("ratio", bin("/", ref("a"), lit(0)));
  const values = toValueMap({ a: 10 });
  const result = evaluateConstraint(c, values);

  assertEquals(result.status, "error");
  assertEquals(result.error, "Division by zero");
});

Deno.test("evaluateConstraint - non-boolean expression → error", () => {
  // Expression resolves to a number, not a boolean
  const c = makeConstraint("just-a-value", bin("+", lit(1), lit(2)));
  const result = evaluateConstraint(c, EMPTY);

  assertEquals(result.status, "error");
  assertEquals(result.error, "Constraint expression did not resolve to a boolean");
});

// ============================================================================
// evaluateConstraint — margin for > operator
// ============================================================================

Deno.test("evaluateConstraint - greater than with margin", () => {
  const c = makeConstraint("min-thrust", bin(">=", ref("thrust"), lit(100)));
  const values = toValueMap({ thrust: 120 });
  const result = evaluateConstraint(c, values);

  assertEquals(result.status, "pass");
  assertEquals(result.computedValue, 120);
  assertEquals(result.threshold, 100);
  assertEquals(result.margin, 20);
  assertEquals(result.marginPercent, 20);
});

// ============================================================================
// evaluateAll — batch
// ============================================================================

Deno.test("evaluateAll - multiple constraints", () => {
  const constraints = [
    makeConstraint("mass", bin("<=", ref("totalMass"), lit(500))),
    makeConstraint("cost", bin("<=", ref("totalCost"), lit(1000))),
    makeConstraint("thrust", bin(">=", ref("thrust"), lit(100))),
  ];
  const values = toValueMap({ totalMass: 450, totalCost: 1200, thrust: 120 });
  const results = evaluateAll(constraints, values);

  assertEquals(results.length, 3);
  assertEquals(results[0].status, "pass"); // mass OK
  assertEquals(results[1].status, "fail"); // cost over budget
  assertEquals(results[2].status, "pass"); // thrust OK
});
