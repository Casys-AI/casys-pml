/**
 * Pure TypeScript constraint expression evaluator
 *
 * Evaluates ConstraintExpr AST nodes against a map of resolved values.
 * No SysON dependency — fully testable with fixtures.
 *
 * @module lib/sim/evaluator/evaluator
 */

import type {
  BinaryOp,
  ConstraintExpr,
  ConstraintResult,
  ConstraintStatus,
  ExtractedConstraint,
} from "../data/constraint-types.ts";

// ============================================================================
// Expression formatting
// ============================================================================

/** Unicode symbols for comparison operators */
const OP_SYMBOLS: Partial<Record<BinaryOp, string>> = {
  "<=": "\u2264",
  ">=": "\u2265",
  "!=": "\u2260",
};

/** Operator precedence for parenthesization */
const PRECEDENCE: Partial<Record<string, number>> = {
  "or": 1,
  "and": 2,
  "<": 3, "<=": 3, ">": 3, ">=": 3, "==": 3, "!=": 3,
  "+": 4, "-": 4,
  "*": 5, "/": 5,
};

/**
 * Convert a ConstraintExpr AST to a human-readable string.
 *
 * Examples:
 * - `totalMass \u2264 5.0`
 * - `operatingTemp \u2265 -10 and operatingTemp \u2264 80`
 */
export function exprToString(expr: ConstraintExpr): string {
  switch (expr.kind) {
    case "literal":
      return expr.unit ? `${expr.value} ${expr.unit}` : String(expr.value);
    case "ref":
      return expr.featurePath.join(".");
    case "binary": {
      const sym = OP_SYMBOLS[expr.op] ?? expr.op;
      const parentPrec = PRECEDENCE[expr.op] ?? 0;
      const l = maybeParen(expr.left, parentPrec);
      const r = maybeParen(expr.right, parentPrec);
      return `${l} ${sym} ${r}`;
    }
    case "unary":
      return expr.op === "not"
        ? `not(${exprToString(expr.operand)})`
        : `-${exprToString(expr.operand)}`;
    case "call":
      return `${expr.name}(${expr.args.map(exprToString).join(", ")})`;
  }
}

function maybeParen(expr: ConstraintExpr, parentPrec: number): string {
  const s = exprToString(expr);
  if (expr.kind === "binary") {
    const childPrec = PRECEDENCE[expr.op] ?? 0;
    if (childPrec < parentPrec) return `(${s})`;
  }
  return s;
}

// ============================================================================
// Value resolution
// ============================================================================

/** Map of feature path → resolved numeric value */
export type ValueMap = Map<string, number>;

/** Convert a Record to a ValueMap */
export function toValueMap(record: Record<string, number>): ValueMap {
  return new Map(Object.entries(record));
}

// ============================================================================
// Expression evaluation
// ============================================================================

/** Result of evaluating an expression: either a number or a boolean */
export type EvalValue = number | boolean;

/** Evaluation error with context */
export class EvalError extends Error {
  constructor(message: string, public readonly unresolvedRefs?: string[]) {
    super(message);
    this.name = "EvalError";
  }
}

/** Built-in functions available in constraint expressions */
const BUILTINS: Record<string, (...args: number[]) => number> = {
  abs: (x) => Math.abs(x),
  sqrt: (x) => {
    if (x < 0) throw new EvalError("sqrt of negative number");
    return Math.sqrt(x);
  },
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  pow: (base, exp) => Math.pow(base, exp),
  log: (x) => {
    if (x <= 0) throw new EvalError("log of non-positive number");
    return Math.log(x);
  },
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  round: (x) => Math.round(x),
};

/**
 * Evaluate a constraint expression against resolved values.
 *
 * @param expr The expression AST to evaluate
 * @param values Map of feature path → numeric value
 * @returns Numeric or boolean result
 * @throws EvalError if evaluation fails (division by zero, unresolved refs, etc.)
 */
export function evaluate(expr: ConstraintExpr, values: ValueMap): EvalValue {
  switch (expr.kind) {
    case "literal":
      return expr.value;

    case "ref": {
      const key = expr.featurePath.join(".");
      const val = values.get(key);
      if (val === undefined) {
        throw new EvalError(
          `Unresolved reference: ${key}`,
          [key],
        );
      }
      return val;
    }

    case "unary": {
      const operand = evaluate(expr.operand, values);
      if (expr.op === "not") {
        if (typeof operand !== "boolean") {
          throw new EvalError(`'not' requires boolean operand, got number`);
        }
        return !operand;
      }
      // Unary minus
      if (typeof operand !== "number") {
        throw new EvalError(`Unary '-' requires numeric operand, got boolean`);
      }
      return -operand;
    }

    case "binary":
      return evaluateBinary(expr.op, expr.left, expr.right, values);

    case "call": {
      const fn = BUILTINS[expr.name];
      if (!fn) {
        throw new EvalError(`Unknown function: ${expr.name}`);
      }
      const args = expr.args.map((a) => {
        const v = evaluate(a, values);
        if (typeof v !== "number") {
          throw new EvalError(`Function '${expr.name}' expects numeric arguments`);
        }
        return v;
      });
      return fn(...args);
    }
  }
}

function evaluateBinary(
  op: BinaryOp,
  left: ConstraintExpr,
  right: ConstraintExpr,
  values: ValueMap,
): EvalValue {
  // Logical operators: short-circuit
  if (op === "and") {
    const l = evaluate(left, values);
    if (typeof l !== "boolean") throw new EvalError(`'and' requires boolean operands`);
    if (!l) return false;
    const r = evaluate(right, values);
    if (typeof r !== "boolean") throw new EvalError(`'and' requires boolean operands`);
    return r;
  }
  if (op === "or") {
    const l = evaluate(left, values);
    if (typeof l !== "boolean") throw new EvalError(`'or' requires boolean operands`);
    if (l) return true;
    const r = evaluate(right, values);
    if (typeof r !== "boolean") throw new EvalError(`'or' requires boolean operands`);
    return r;
  }

  const l = evaluate(left, values);
  const r = evaluate(right, values);

  if (typeof l !== "number" || typeof r !== "number") {
    throw new EvalError(`Operator '${op}' requires numeric operands`);
  }

  // Arithmetic
  switch (op) {
    case "+": return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/": {
      if (r === 0) throw new EvalError("Division by zero");
      return l / r;
    }
    // Comparison → boolean
    case "<": return l < r;
    case "<=": return l <= r;
    case ">": return l > r;
    case ">=": return l >= r;
    case "==": return l === r;
    case "!=": return l !== r;
  }
}

// ============================================================================
// Constraint evaluation (high-level)
// ============================================================================

/**
 * Extract margin info from a comparison constraint.
 * For `value op threshold`, returns { computedValue, threshold, margin, marginPercent }.
 */
function extractMargin(
  expr: ConstraintExpr,
  values: ValueMap,
): { computedValue?: number; threshold?: number; margin?: number; marginPercent?: number } {
  if (expr.kind !== "binary") return {};

  const comparisonOps = new Set(["<", "<=", ">", ">=", "==", "!="]);
  if (!comparisonOps.has(expr.op)) return {};

  try {
    const leftVal = evaluate(expr.left, values);
    const rightVal = evaluate(expr.right, values);
    if (typeof leftVal !== "number" || typeof rightVal !== "number") return {};

    let computedValue: number;
    let threshold: number;

    // Convention: left is the computed value, right is the threshold
    // For > and >=, margin = computed - threshold (positive = pass)
    // For < and <=, margin = threshold - computed (positive = pass)
    if (expr.op === "<" || expr.op === "<=") {
      computedValue = leftVal;
      threshold = rightVal;
      const margin = threshold - computedValue;
      const marginPercent = threshold !== 0
        ? Math.round((margin / Math.abs(threshold)) * 10000) / 100
        : undefined;
      return { computedValue, threshold, margin, marginPercent };
    }

    if (expr.op === ">" || expr.op === ">=") {
      computedValue = leftVal;
      threshold = rightVal;
      const margin = computedValue - threshold;
      const marginPercent = threshold !== 0
        ? Math.round((margin / Math.abs(threshold)) * 10000) / 100
        : undefined;
      return { computedValue, threshold, margin, marginPercent };
    }

    if (expr.op === "==" || expr.op === "!=") {
      computedValue = leftVal;
      threshold = rightVal;
      const margin = Math.abs(computedValue - threshold);
      return { computedValue, threshold, margin };
    }
  } catch {
    // If we can't extract margin info, that's fine
  }

  return {};
}

/**
 * Evaluate a single extracted constraint.
 *
 * @param constraint The constraint to evaluate
 * @param values Map of feature path → resolved value
 * @returns ConstraintResult with status, margin info, etc.
 */
export function evaluateConstraint(
  constraint: ExtractedConstraint,
  values: ValueMap,
): ConstraintResult {
  const expressionStr = exprToString(constraint.expression);
  const base = {
    constraintId: constraint.id,
    constraintName: constraint.name,
    expression: expressionStr,
  };

  try {
    const result = evaluate(constraint.expression, values);
    const marginInfo = extractMargin(constraint.expression, values);

    if (typeof result === "boolean") {
      const status: ConstraintStatus = result ? "pass" : "fail";
      return { ...base, status, ...marginInfo };
    }

    // Non-boolean result — constraint didn't resolve to a pass/fail
    return {
      ...base,
      status: "error",
      computedValue: result,
      error: "Constraint expression did not resolve to a boolean",
    };
  } catch (e) {
    if (e instanceof EvalError && e.unresolvedRefs) {
      return {
        ...base,
        status: "unresolved",
        unresolvedRefs: e.unresolvedRefs,
      };
    }
    return {
      ...base,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Evaluate multiple constraints and produce summary.
 *
 * @param constraints Array of constraints to evaluate
 * @param values Map of feature path → resolved value
 * @returns Array of results
 */
export function evaluateAll(
  constraints: ExtractedConstraint[],
  values: ValueMap,
): ConstraintResult[] {
  return constraints.map((c) => evaluateConstraint(c, values));
}
