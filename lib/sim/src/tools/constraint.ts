/**
 * Constraint tools — extract, evaluate, validate
 *
 * Core MCP tools for SysML v2 constraint checking.
 * `sim_constraint_evaluate` works offline (pure TS).
 * `sim_constraint_extract` and `sim_validate` need SysON.
 *
 * @module lib/sim/tools/constraint
 */

import type { SimTool } from "./types.ts";
import type {
  ConstraintResult,
  ExtractedConstraint,
  SysonAstNode,
  ValidationReport,
  ValidationSummary,
} from "../data/constraint-types.ts";
import { evaluateAll, toValueMap } from "../evaluator/evaluator.ts";
import { parseAstNode } from "../evaluator/ast-parser.ts";
import { resolveValues } from "../evaluator/resolver.ts";



// ============================================================================
// SysON GraphQL (lazy import)
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
    throw new Error(`[lib/sim] AQL evaluation failed: ${result.message}`);
  }
  return result.result;
}

// ============================================================================
// Helpers
// ============================================================================

async function getChildren(ecId: string, elementId: string): Promise<GqlObj[]> {
  const result = await evalAql(ecId, elementId, "aql:self.ownedElement");
  if (result.__typename === "ObjectsExpressionResult") return result.objsValue;
  if (result.__typename === "ObjectExpressionResult") return [result.objValue];
  return [];
}

async function getElementName(ecId: string, elementId: string): Promise<string> {
  try {
    const result = await evalAql(ecId, elementId, "aql:self");
    if (result.__typename === "ObjectExpressionResult") return result.objValue.label;
  } catch { /* ignore */ }
  return "(unknown)";
}

/**
 * Normalize SysON kind URIs to short entity names.
 * SysON returns `siriusComponents://semantic?domain=sysml&entity=OperatorExpression`.
 */
function normalizeKind(kind: string): string {
  const entityMatch = kind.match(/[?&]entity=(\w+)/);
  if (entityMatch) return entityMatch[1];
  return kind;
}

/**
 * Recursively build a SysonAstNode tree from a SysON element.
 * Walks ownedElement to build children.
 */
async function buildAstTree(ecId: string, elementId: string, obj: GqlObj): Promise<SysonAstNode> {
  const children = await getChildren(ecId, elementId);
  const shortKind = normalizeKind(obj.kind);

  // Try to read operator property for OperatorExpression
  let props: Record<string, string | number | boolean> | undefined;
  if (shortKind.includes("OperatorExpression")) {
    try {
      const opResult = await evalAql(ecId, elementId, "aql:self.operator");
      if (opResult.__typename === "StringExpressionResult") {
        props = { operator: opResult.strValue };
      }
    } catch { /* no operator prop */ }
  }

  // Try to read value for literals
  if (shortKind.includes("Literal")) {
    try {
      const valResult = await evalAql(ecId, elementId, "aql:self.value");
      if (valResult.__typename === "IntExpressionResult") {
        props = { ...props, value: valResult.intValue };
      } else if (valResult.__typename === "StringExpressionResult") {
        const num = parseFloat(valResult.strValue);
        if (!isNaN(num)) props = { ...props, value: num };
      }
    } catch { /* no value prop */ }
  }

  // Try to read referent name for FeatureReferenceExpression
  if (shortKind.includes("FeatureReferenceExpression")) {
    try {
      const refResult = await evalAql(ecId, elementId, "aql:self.referent.declaredName");
      if (refResult.__typename === "StringExpressionResult") {
        props = { ...props, referentName: refResult.strValue };
      }
    } catch { /* no referent */ }
  }

  const childNodes: SysonAstNode[] = [];
  for (const child of children) {
    childNodes.push(await buildAstTree(ecId, child.id, child));
  }

  return {
    id: obj.id,
    kind: obj.kind,
    label: obj.label,
    children: childNodes.length > 0 ? childNodes : undefined,
    props,
  };
}

function buildSummary(results: ConstraintResult[]): ValidationSummary {
  return {
    total: results.length,
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    error: results.filter((r) => r.status === "error").length,
    unresolved: results.filter((r) => r.status === "unresolved").length,
  };
}

// ============================================================================
// Tool definitions
// ============================================================================

export const constraintTools: SimTool[] = [
  // --------------------------------------------------------------------------
  // sim_constraint_extract
  // --------------------------------------------------------------------------
  {
    name: "sim_constraint_extract",
    description:
      "Extract constraint definitions from a SysML element. " +
      "Returns structured constraints (operator, operands, thresholds). " +
      "Pass the result to sim_constraint_evaluate to check pass/fail. " +
      "For a one-shot extract+evaluate, use sim_validate instead.",
    category: "constraint",
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
            "UUID of the SysML element to scan for constraints (e.g., a package or part). " +
            "Obtain via syson_element_children.",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const elementId = args.element_id as string;

      // Find all ConstraintUsage elements under the root
      const aql =
        "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::ConstraintUsage))";
      const result = await evalAql(ecId, elementId, aql);

      const constraintObjs: GqlObj[] = [];
      if (result.__typename === "ObjectsExpressionResult") {
        constraintObjs.push(...result.objsValue);
      } else if (result.__typename === "ObjectExpressionResult") {
        constraintObjs.push(result.objValue);
      }

      if (constraintObjs.length === 0) {
        return { constraints: [], message: "No ConstraintUsage found under this element" };
      }

      // For each constraint, build the AST tree and parse it
      const constraints: ExtractedConstraint[] = [];
      const errors: Array<{ id: string; name: string; error: string }> = [];

      for (const obj of constraintObjs) {
        try {
          // Get the constraint's body expression (first owned element that is an Expression)
          const bodyChildren = await getChildren(ecId, obj.id);
          const bodyExpr = bodyChildren.find((c) => {
            const k = normalizeKind(c.kind);
            return k.includes("Expression") || k.includes("Literal");
          });

          if (!bodyExpr) {
            errors.push({
              id: obj.id,
              name: obj.label,
              error: "No body expression found",
            });
            continue;
          }

          const astTree = await buildAstTree(ecId, bodyExpr.id, bodyExpr);
          const expression = parseAstNode(astTree);

          constraints.push({
            id: obj.id,
            name: obj.label,
            elementId: obj.id,
            expression,
          });
        } catch (e) {
          errors.push({
            id: obj.id,
            name: obj.label,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return { constraints, errors: errors.length > 0 ? errors : undefined };
    },
  },

  // --------------------------------------------------------------------------
  // sim_constraint_evaluate
  // --------------------------------------------------------------------------
  {
    name: "sim_constraint_evaluate",
    description:
      "Evaluate constraints and return pass/fail with margins. " +
      "Pass 'values' directly for offline evaluation, " +
      "or provide editing_context_id + element_id to auto-resolve values from the model. " +
      "For a one-shot workflow, use sim_validate instead.",
    category: "constraint",
    inputSchema: {
      type: "object",
      properties: {
        constraints: {
          type: "array",
          items: { type: "object" },
          description:
            "Array of ExtractedConstraint objects. Obtain from sim_constraint_extract.",
        },
        values: {
          type: "object",
          description:
            "Feature name → numeric value map for offline evaluation. " +
            "Example: {\"totalMass\": 2.86, \"maxAllowedMass\": 5}. " +
            "Omit to auto-resolve values from SysON model (requires editing_context_id + element_id).",
        },
        editing_context_id: {
          type: "string",
          description:
            "SysON project UUID for online value resolution. " +
            "Required if 'values' is omitted. Obtain via syson_project_list.",
        },
        element_id: {
          type: "string",
          description:
            "UUID of the SysML element for online value resolution. " +
            "Required if 'values' is omitted. Obtain via syson_element_children.",
        },
      },
      required: ["constraints"],
    },
    handler: async (args) => {
      const constraints = args.constraints as ExtractedConstraint[];
      const providedValues = args.values as Record<string, number> | undefined;
      const ecId = args.editing_context_id as string | undefined;
      const elementId = args.element_id as string | undefined;

      let values: Map<string, number>;

      if (providedValues) {
        // Offline evaluation — use provided values
        values = toValueMap(providedValues);
      } else if (ecId && elementId) {
        // Online evaluation — resolve from SysON
        values = await resolveValues(ecId, elementId, constraints);
      } else {
        throw new Error(
          "[lib/sim] Either 'values' or both 'editing_context_id' and 'element_id' " +
          "must be provided for constraint evaluation.",
        );
      }

      const results = evaluateAll(constraints, values);
      const summary = buildSummary(results);

      return {
        results,
        summary,
        resolvedValues: Object.fromEntries(values),
      };
    },
  },

  // --------------------------------------------------------------------------
  // sim_validate
  // --------------------------------------------------------------------------
  {
    name: "sim_validate",
    description:
      "Validate a model element against all its constraints in one call. " +
      "Extracts constraints, resolves values from the model, evaluates pass/fail, " +
      "and returns a report with margins. Broadcasts to the live feed. " +
      "Pass 'values' to override specific parameters for what-if scenarios " +
      "(e.g., {\"totalMass\": 6.5} to test over-budget mass).",
    category: "constraint",
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
            "UUID of the SysML element to validate (e.g., a system or package with ConstraintUsages). " +
            "Obtain via syson_element_children.",
        },
        values: {
          type: "object",
          description:
            "Optional overrides for value resolution. " +
            "Example: {\"totalMass\": 6.5} to test a what-if scenario. " +
            "Missing keys are auto-resolved from the SysON model.",
        },
      },
      required: ["editing_context_id", "element_id"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-sim/validation-viewer",
      },
    },
    handler: async (args) => {
      const ecId = args.editing_context_id as string;
      const elementId = args.element_id as string;
      const providedValues = args.values as Record<string, number> | undefined;

      // Step 1: Get element name
      const elementName = await getElementName(ecId, elementId);

      // Step 2: Extract constraints
      const extractAql =
        "aql:self.eAllContents()->select(e | e.oclIsKindOf(sysml::ConstraintUsage))";
      const extractResult = await evalAql(ecId, elementId, extractAql);

      const constraintObjs: GqlObj[] = [];
      if (extractResult.__typename === "ObjectsExpressionResult") {
        constraintObjs.push(...extractResult.objsValue);
      } else if (extractResult.__typename === "ObjectExpressionResult") {
        constraintObjs.push(extractResult.objValue);
      }

      if (constraintObjs.length === 0) {
        const report: ValidationReport = {
          editingContextId: ecId,
          elementId,
          elementName,
          constraints: [],
          summary: { total: 0, pass: 0, fail: 0, error: 0, unresolved: 0 },
          validatedAt: new Date().toISOString(),
        };
        return report;
      }

      // Step 3: Parse constraint ASTs
      const constraints: ExtractedConstraint[] = [];
      const parseErrors: ConstraintResult[] = [];

      for (const obj of constraintObjs) {
        try {
          const bodyChildren = await getChildren(ecId, obj.id);
          const bodyExpr = bodyChildren.find((c) => {
            const k = normalizeKind(c.kind);
            return k.includes("Expression") || k.includes("Literal");
          });

          if (!bodyExpr) {
            parseErrors.push({
              constraintId: obj.id,
              constraintName: obj.label,
              status: "error",
              error: "No body expression found in ConstraintUsage",
            });
            continue;
          }

          const astTree = await buildAstTree(ecId, bodyExpr.id, bodyExpr);
          const expression = parseAstNode(astTree);

          constraints.push({
            id: obj.id,
            name: obj.label,
            elementId: obj.id,
            expression,
          });
        } catch (e) {
          parseErrors.push({
            constraintId: obj.id,
            constraintName: obj.label,
            status: "error",
            error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      // Step 4: Resolve values
      const values = await resolveValues(ecId, elementId, constraints, providedValues);

      // Step 5: Evaluate
      const evalResults = evaluateAll(constraints, values);
      const allResults = [...evalResults, ...parseErrors];
      const summary = buildSummary(allResults);

      const report: ValidationReport = {
        editingContextId: ecId,
        elementId,
        elementName,
        constraints: allResults,
        summary,
        resolvedValues: Object.fromEntries(values),
        validatedAt: new Date().toISOString(),
      };

      return report;
    },
  },
];
