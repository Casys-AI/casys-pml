/**
 * Feature value resolver — queries SysON to resolve feature references
 *
 * Resolves FeatureReferenceExpression paths to actual numeric values
 * by querying the SysON model via AQL.
 *
 * @module lib/sim/evaluator/resolver
 */

import type { ConstraintExpr, ExtractedConstraint } from "../data/constraint-types.ts";
import type { ValueMap } from "./evaluator.ts";

// ============================================================================
// SysON GraphQL (lazy import, same pattern as lib/plm)
// ============================================================================

const EVALUATE_EXPRESSION = `
  mutation EvaluateExpression($input: EvaluateExpressionInput!) {
    evaluateExpression(input: $input) {
      ... on EvaluateExpressionSuccessPayload {
        __typename
        result {
          ... on ObjectExpressionResult { __typename objValue: value { id kind label } }
          ... on ObjectsExpressionResult { __typename objsValue: value { id kind label } }
          ... on StringExpressionResult { __typename strValue: value }
          ... on BooleanExpressionResult { __typename boolValue: value }
          ... on IntExpressionResult { __typename intValue: value }
          ... on VoidExpressionResult { __typename }
        }
      }
      ... on ErrorPayload { __typename id message }
    }
  }
`;

interface EvalExprResult {
  evaluateExpression:
    | {
      __typename: "EvaluateExpressionSuccessPayload";
      result:
        | { __typename: "StringExpressionResult"; strValue: string }
        | { __typename: "IntExpressionResult"; intValue: number }
        | { __typename: "BooleanExpressionResult"; boolValue: boolean }
        | { __typename: "ObjectExpressionResult"; objValue: { id: string; kind: string; label: string } }
        | { __typename: "ObjectsExpressionResult"; objsValue: Array<{ id: string; kind: string; label: string }> }
        | { __typename: "VoidExpressionResult" };
    }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

async function getSysonClientLazy() {
  const mod = await import("@casys/mcp-syson");
  return mod.getSysonClient();
}

async function evalAql(
  ecId: string,
  elementId: string,
  expression: string,
): Promise<EvalExprResult["evaluateExpression"]> {
  const client = await getSysonClientLazy();
  const data = await client.mutate<EvalExprResult>(EVALUATE_EXPRESSION, {
    input: {
      id: crypto.randomUUID(),
      editingContextId: ecId,
      expression,
      selectedObjectIds: [elementId],
    },
  });
  return data.evaluateExpression;
}

// ============================================================================
// Feature reference collection
// ============================================================================

/**
 * Collect all feature reference paths from a constraint expression.
 * Returns unique dotted paths (e.g., ["totalMass", "propulsion.thrust"]).
 */
export function collectRefs(expr: ConstraintExpr): string[] {
  const refs = new Set<string>();

  function walk(e: ConstraintExpr): void {
    switch (e.kind) {
      case "ref":
        refs.add(e.featurePath.join("."));
        break;
      case "binary":
        walk(e.left);
        walk(e.right);
        break;
      case "unary":
        walk(e.operand);
        break;
      case "call":
        for (const arg of e.args) walk(arg);
        break;
      case "literal":
        break;
    }
  }

  walk(expr);
  return [...refs];
}

/**
 * Collect all feature references from multiple constraints.
 */
export function collectAllRefs(constraints: ExtractedConstraint[]): string[] {
  const allRefs = new Set<string>();
  for (const c of constraints) {
    for (const ref of collectRefs(c.expression)) {
      allRefs.add(ref);
    }
  }
  return [...allRefs];
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolve a single feature reference to a numeric value via AQL.
 *
 * Strategy:
 * 1. Search for AttributeUsage with matching declaredName under the element
 * 2. Read its value (typically a LiteralInteger or LiteralReal)
 *
 * @returns The numeric value, or undefined if not found/not numeric
 */
async function resolveFeature(
  ecId: string,
  contextElementId: string,
  featurePath: string[],
): Promise<number | undefined> {
  // For now, handle single-level references (most common case)
  // Multi-level paths like "propulsion.thrust" need recursive resolution
  const featureName = featurePath[featurePath.length - 1];

  // Find the attribute by name
  const aql = featurePath.length === 1
    ? `aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage))->select(e | e.declaredName = '${featureName}')`
    : buildNestedAql(featurePath);

  try {
    const result = await evalAql(ecId, contextElementId, aql);

    if (result.__typename === "ErrorPayload") {
      return undefined;
    }

    const exprResult = result.result;

    // Direct numeric result
    if (exprResult.__typename === "IntExpressionResult") {
      return exprResult.intValue;
    }

    // Object result — need to read the value from the attribute
    if (exprResult.__typename === "ObjectExpressionResult") {
      const attrId = exprResult.objValue.id;
      return await readAttributeValue(ecId, attrId);
    }

    // Multiple objects — take the first
    if (exprResult.__typename === "ObjectsExpressionResult" && exprResult.objsValue.length > 0) {
      const attrId = exprResult.objsValue[0].id;
      return await readAttributeValue(ecId, attrId);
    }

    // String that might be numeric
    if (exprResult.__typename === "StringExpressionResult") {
      const num = parseFloat(exprResult.strValue);
      return isNaN(num) ? undefined : num;
    }
  } catch {
    // AQL failure → unresolvable
    return undefined;
  }

  return undefined;
}

/**
 * Build AQL for nested feature paths like ["propulsion", "thrust"].
 * Navigates: self → find "propulsion" child → find "thrust" attribute
 */
function buildNestedAql(featurePath: string[]): string {
  let aql = "aql:self";

  // Navigate all intermediate path segments
  for (let i = 0; i < featurePath.length - 1; i++) {
    aql += `.ownedElement->select(e | e.declaredName = '${featurePath[i]}')->first()`;
  }

  // Final segment: look for AttributeUsage
  const last = featurePath[featurePath.length - 1];
  aql += `.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage))->select(e | e.declaredName = '${last}')`;

  return aql;
}

/**
 * Read the numeric value of an AttributeUsage element.
 *
 * SysON stores attribute values as:
 *   AttributeUsage → FeatureValue → LiteralRational | LiteralInteger
 *   AttributeUsage → FeatureValue → OperatorExpression('-') → LiteralRational  (negative values)
 *
 * The `.value` property returns a Java primitive (double/int), not an EMF object,
 * so we must use `.value.toString()` to avoid GraphQL "non-null id" crashes.
 */
async function readAttributeValue(
  ecId: string,
  attributeId: string,
): Promise<number | undefined> {
  try {
    // Step 1: Check for unary minus OperatorExpression('-') wrapping the literal
    // SysML v2 stores -40 as OperatorExpression('-', LiteralRational(40))
    let negated = false;
    const findOpAql = [
      "aql:self.eAllContents()->select(e |",
      "  e.oclIsKindOf(sysml::OperatorExpression)",
      ")->first()",
    ].join(" ");

    const opResult = await evalAql(ecId, attributeId, findOpAql);
    if (opResult.__typename !== "ErrorPayload" &&
        opResult.result.__typename === "ObjectExpressionResult") {
      const opId = opResult.result.objValue.id;
      const opCheck = await evalAql(ecId, opId,
        "aql:self.oclAsType(sysml::OperatorExpression).operator");
      if (opCheck.__typename !== "ErrorPayload" &&
          opCheck.result.__typename === "StringExpressionResult" &&
          opCheck.result.strValue === "-") {
        negated = true;
      }
    }

    // Step 2: Find the literal node (LiteralRational or LiteralInteger)
    const findLiteralAql = [
      "aql:self.eAllContents()->select(e |",
      "  e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger)",
      ")->first()",
    ].join(" ");

    const literalResult = await evalAql(ecId, attributeId, findLiteralAql);
    if (literalResult.__typename === "ErrorPayload") return undefined;
    if (literalResult.result.__typename !== "ObjectExpressionResult") return undefined;

    const literalId = literalResult.result.objValue.id;
    const kind = literalResult.result.objValue.kind;

    // Step 3: Read the value via .value.toString()
    const typeExpr = kind.includes("LiteralRational")
      ? "aql:self.oclAsType(sysml::LiteralRational).value.toString()"
      : "aql:self.oclAsType(sysml::LiteralInteger).value.toString()";

    const valueResult = await evalAql(ecId, literalId, typeExpr);
    if (valueResult.__typename === "ErrorPayload") return undefined;

    let num: number | undefined;
    if (valueResult.result.__typename === "StringExpressionResult") {
      num = parseFloat(valueResult.result.strValue);
      if (isNaN(num)) return undefined;
    } else if (valueResult.result.__typename === "IntExpressionResult") {
      num = valueResult.result.intValue;
    }

    if (num !== undefined && negated) num = -num;
    return num;
  } catch {
    return undefined;
  }

  return undefined;
}

// ============================================================================
// Batch resolution
// ============================================================================

/**
 * Resolve all feature references needed by constraints from a SysON model.
 *
 * @param ecId Editing context ID
 * @param contextElementId Root element ID (scope for feature resolution)
 * @param constraints Constraints whose references need resolving
 * @param existingValues Pre-resolved values (won't be re-queried)
 * @returns ValueMap with all resolved values
 */
export async function resolveValues(
  ecId: string,
  contextElementId: string,
  constraints: ExtractedConstraint[],
  existingValues?: Record<string, number>,
): Promise<ValueMap> {
  const values: ValueMap = new Map();

  // Add pre-resolved values
  if (existingValues) {
    for (const [k, v] of Object.entries(existingValues)) {
      values.set(k, v);
    }
  }

  // Collect refs that still need resolution
  const allRefs = collectAllRefs(constraints);
  const unresolvedRefs = allRefs.filter((ref) => !values.has(ref));

  // Resolve in parallel
  const results = await Promise.all(
    unresolvedRefs.map(async (ref) => {
      const featurePath = ref.split(".");
      const value = await resolveFeature(ecId, contextElementId, featurePath);
      return { ref, value };
    }),
  );

  for (const { ref, value } of results) {
    if (value !== undefined) {
      values.set(ref, value);
    }
  }

  return values;
}
