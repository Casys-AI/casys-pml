/**
 * Value tools — read and write SysON attribute values
 *
 * `sim_set_value` modifies a numeric attribute value in the SysON model
 * via AQL eSet mutation on LiteralRational/LiteralInteger nodes.
 *
 * @module lib/sim/tools/value
 */

import type { SimTool } from "./types.ts";

// ============================================================================
// SysON GraphQL (lazy import, same pattern as constraint.ts)
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

interface GqlObj {
  id: string;
  kind: string;
  label: string;
}

interface EvalExprResult {
  evaluateExpression:
    | { __typename: "EvaluateExpressionSuccessPayload"; result: ExprResult }
    | { __typename: "ErrorPayload"; id: string; message: string };
}

type ExprResult =
  | { __typename: "ObjectExpressionResult"; objValue: GqlObj }
  | { __typename: "ObjectsExpressionResult"; objsValue: GqlObj[] }
  | { __typename: "StringExpressionResult"; strValue: string }
  | { __typename: "IntExpressionResult"; intValue: number }
  | { __typename: "BooleanExpressionResult"; boolValue: boolean }
  | { __typename: "VoidExpressionResult" };

async function getSysonClientLazy() {
  const mod = await import("@casys/mcp-syson");
  return mod.getSysonClient();
}

async function evalAql(
  ecId: string,
  elementId: string,
  expression: string,
): Promise<ExprResult> {
  const client = await getSysonClientLazy();
  const data = await client.mutate<EvalExprResult>(EVALUATE_EXPRESSION, {
    input: {
      id: crypto.randomUUID(),
      editingContextId: ecId,
      expression,
      selectedObjectIds: [elementId],
    },
  });

  const result = data.evaluateExpression;
  if (result.__typename === "ErrorPayload") {
    throw new Error(`[sim_set_value] AQL evaluation failed: ${result.message}`);
  }
  return result.result;
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeKind(kind: string): string {
  const entityMatch = kind.match(/[?&]entity=(\w+)/);
  if (entityMatch) return entityMatch[1];
  return kind;
}

/**
 * Read the current numeric value of an AttributeUsage element.
 * Handles both positive (LiteralRational) and negative (OperatorExpression('-') wrapping).
 */
async function readCurrentValue(
  ecId: string,
  attributeId: string,
): Promise<{ value: number; literalId: string; literalKind: string; negated: boolean } | undefined> {
  // Step 1: Check for OperatorExpression('-')
  let negated = false;
  const findOpAql =
    "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::OperatorExpression))->first()";

  const opResult = await evalAql(ecId, attributeId, findOpAql);
  if (opResult.__typename === "ObjectExpressionResult") {
    const opId = opResult.objValue.id;
    const opCheck = await evalAql(ecId, opId,
      "aql:self.oclAsType(sysml::OperatorExpression).operator");
    if (opCheck.__typename === "StringExpressionResult" && opCheck.strValue === "-") {
      negated = true;
    }
  }

  // Step 2: Find the LiteralRational or LiteralInteger
  const findLiteralAql = [
    "aql:self.eAllContents()->select(e |",
    "  e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger)",
    ")->first()",
  ].join(" ");

  const literalResult = await evalAql(ecId, attributeId, findLiteralAql);
  if (literalResult.__typename !== "ObjectExpressionResult") return undefined;

  const literalId = literalResult.objValue.id;
  const kind = normalizeKind(literalResult.objValue.kind);

  // Step 3: Read the value
  const typeExpr = kind.includes("LiteralRational")
    ? "aql:self.oclAsType(sysml::LiteralRational).value.toString()"
    : "aql:self.oclAsType(sysml::LiteralInteger).value.toString()";

  const valueResult = await evalAql(ecId, literalId, typeExpr);

  let num: number | undefined;
  if (valueResult.__typename === "StringExpressionResult") {
    num = parseFloat(valueResult.strValue);
    if (isNaN(num)) return undefined;
  } else if (valueResult.__typename === "IntExpressionResult") {
    num = valueResult.intValue;
  }

  if (num === undefined) return undefined;
  if (negated) num = -num;

  return { value: num, literalId, literalKind: kind, negated };
}

// ============================================================================
// Sign change helpers
// ============================================================================

/**
 * Attempt to remove the OperatorExpression('-') wrapping a literal,
 * making a negative value positive. Uses EMF eDelete() via AQL.
 * Returns true if successful.
 */
async function tryRemoveNegation(ecId: string, attributeId: string): Promise<boolean> {
  // Find the OperatorExpression
  const findOpAql =
    "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::OperatorExpression))->first()";
  const opResult = await evalAql(ecId, attributeId, findOpAql);
  if (opResult.__typename !== "ObjectExpressionResult") return false;

  const opId = opResult.objValue.id;

  // Get the literal inside the OperatorExpression
  const findLiteralInOp = [
    "aql:self.eAllContents()->select(e |",
    "  e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger)",
    ")->first()",
  ].join(" ");
  const litResult = await evalAql(ecId, opId, findLiteralInOp);
  if (litResult.__typename !== "ObjectExpressionResult") return false;

  const literalId = litResult.objValue.id;

  // Strategy: find the OwningMembership that contains the OperatorExpression,
  // then find the membership that contains the literal inside the op.
  // We need to reparent the literal's membership to the FeatureValue level.

  // Get the OperatorExpression's containing membership
  const getOpMembership = "aql:self.eContainer()";
  const opMemberResult = await evalAql(ecId, opId, getOpMembership);
  if (opMemberResult.__typename !== "ObjectExpressionResult") return false;
  const opMembershipId = opMemberResult.objValue.id;

  // Get the literal's containing membership
  const getLitMembership = "aql:self.eContainer()";
  const litMemberResult = await evalAql(ecId, literalId, getLitMembership);
  if (litMemberResult.__typename !== "ObjectExpressionResult") return false;
  const litMembershipId = litMemberResult.objValue.id;

  // Get the FeatureValue (grandparent of the OperatorExpression)
  const getFeatureValue = "aql:self.eContainer()";
  const fvResult = await evalAql(ecId, opMembershipId, getFeatureValue);
  if (fvResult.__typename !== "ObjectExpressionResult") return false;
  const featureValueId = fvResult.objValue.id;

  try {
    // Reparent: move literal's membership to the FeatureValue
    const reparentAql = [
      "aql:self.eGet(self.eClass().getEStructuralFeature('ownedRelationship'))",
      `.oclAsType(ecore::EObject)->including(self.eAllContents()->select(e | e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger))->first().eContainer())`,
    ].join("");

    // Simpler approach: try eDelete on the OperatorExpression's membership
    // This should cascade-delete the OperatorExpression but we need the literal first
    // Actually, the safest approach: delete the whole op membership, then re-insert the value
    const deleteOpMembershipAql =
      "aql:self.eGet(self.eClass().getEStructuralFeature('ownedRelationship'))" +
      ".oclAsType(ecore::EList).clear()";

    // This is too destructive. Let's try a targeted approach:
    // Move the literal membership into the FeatureValue, then delete the op membership
    const moveAql =
      `aql:self.eGet(self.eClass().getEStructuralFeature('ownedRelationship')).add(` +
      `self.eResource().getEObject('${litMembershipId}'))`;

    await evalAql(ecId, featureValueId, moveAql);

    // Now remove the OperatorExpression membership from the FeatureValue
    const removeAql =
      `aql:self.eGet(self.eClass().getEStructuralFeature('ownedRelationship')).remove(` +
      `self.eResource().getEObject('${opMembershipId}'))`;

    await evalAql(ecId, featureValueId, removeAql);

    return true;
  } catch {
    // Sign change via AST manipulation failed — not fatal
    return false;
  }
}

// ============================================================================
// Tool definitions
// ============================================================================

export const valueTools: SimTool[] = [
  // ── sim_read_value ──────────────────────────────────────────────
  {
    name: "sim_read_value",
    description:
      "Read the current numeric value of an attribute. " +
      "Returns the value, handling positive and negative numbers. " +
      "Use before sim_set_value to see the current state.",
    category: "value",
    _meta: { ui: { resourceUri: "ui://mcp-sim/value-change-viewer" } },
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        element_id: {
          type: "string",
          description:
            "UUID of the AttributeUsage element to read (e.g., 'totalMass'). " +
            "Obtain via syson_element_children or syson_query_aql.",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const elementId = args.element_id as string;

      const current = await readCurrentValue(ecId, elementId);
      if (!current) {
        throw new Error(
          `[sim_read_value] No numeric literal found under element ${elementId}. ` +
          "Ensure element_id points to an AttributeUsage with a LiteralRational or LiteralInteger.",
        );
      }

      const result = {
        element_id: elementId,
        value: current.value,
        literal_id: current.literalId,
        literal_kind: current.literalKind,
        negated: current.negated,
      };
      return result;
    },
  },

  // ── sim_set_value ───────────────────────────────────────────────
  {
    name: "sim_set_value",
    description:
      "Change the numeric value of an attribute in the model. " +
      "Returns old value, new value, and verification. " +
      "Use before sim_validate to test what-if scenarios " +
      "(e.g., change mass to 6.5 then re-validate constraints).",
    category: "value",
    _meta: { ui: { resourceUri: "ui://mcp-sim/value-change-viewer" } },
    inputSchema: {
      type: "object",
      properties: {
        editing_context_id: {
          type: "string",
          description: "SysON project UUID. Obtain via syson_project_list.",
        },
        element_id: {
          type: "string",
          description:
            "UUID of the AttributeUsage element to modify (e.g., 'totalMass'). " +
            "Obtain via syson_element_children or syson_query_aql. " +
            "Must point to an attribute with a numeric literal, not a part or package.",
        },
        value: {
          type: "number",
          description:
            "New numeric value (positive or negative). " +
            "Example: 6.5 for mass, -40 for min temperature.",
        },
      },
      required: ["editing_context_id", "element_id", "value"],
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const elementId = args.element_id as string;
      const newValue = args.value as number;

      // Step 1: Read current value
      const current = await readCurrentValue(ecId, elementId);
      if (!current) {
        throw new Error(
          `[sim_set_value] No LiteralRational or LiteralInteger found under element ${elementId}. ` +
          "Ensure element_id points to an AttributeUsage with a numeric value.",
        );
      }

      const oldValue = current.value;
      const absNewValue = Math.abs(newValue);
      const needsNegation = newValue < 0;

      // Step 2: Set the absolute value on the literal node via eSet
      const isRational = current.literalKind.includes("LiteralRational");

      let valueStr: string;
      if (isRational) {
        valueStr = Number.isInteger(absNewValue) ? `${absNewValue}.0` : absNewValue.toString();
      } else {
        valueStr = Math.round(absNewValue).toString();
      }

      const eSetAql = `aql:self.eSet(self.eClass().getEStructuralFeature('value'), ${valueStr})`;
      await evalAql(ecId, current.literalId, eSetAql);

      // Step 3: Handle sign change if needed
      let signChangeAttempted = false;
      let signChangeSuccess = false;

      if (needsNegation !== current.negated) {
        signChangeAttempted = true;

        if (!needsNegation && current.negated) {
          // Negative → Positive: try to remove the OperatorExpression('-')
          signChangeSuccess = await tryRemoveNegation(ecId, elementId);
        }
        // Positive → Negative: would need to CREATE an OperatorExpression('-')
        // This requires insertTextualSysMLv2 or similar — not yet supported
      }

      // Step 4: Read back to verify
      const verified = await readCurrentValue(ecId, elementId);
      const verifiedValue = verified?.value;

      // Build result
      let warning: string | undefined;
      if (signChangeAttempted && !signChangeSuccess) {
        warning =
          `Sign change from ${current.negated ? "negative" : "positive"} to ` +
          `${needsNegation ? "negative" : "positive"} could not be applied. ` +
          "The absolute value was set. To change the sign, modify the model in SysON UI " +
          "or use sim_validate with a 'values' override for what-if evaluation.";
      }

      const result = {
        element_id: elementId,
        old_value: oldValue,
        new_value: newValue,
        verified_value: verifiedValue,
        literal_id: current.literalId,
        literal_kind: current.literalKind,
        success: verifiedValue !== undefined && Math.abs(verifiedValue - newValue) < 1e-9,
        ...(warning && { warning }),
      };
      return result;
    },
  },
];
