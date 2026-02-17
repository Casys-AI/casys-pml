/**
 * SysON AST → ConstraintExpr parser
 *
 * Converts the raw SysON element tree (from AQL evaluateExpression)
 * into our simplified ConstraintExpr AST.
 *
 * SysML v2 KerML expression hierarchy:
 * - OperatorExpression (binary/unary ops: <=, +, -, *, /, and, or, not, etc.)
 * - FeatureReferenceExpression (references to model features)
 * - LiteralInteger, LiteralReal, LiteralBoolean (constants)
 * - InvocationExpression (function calls)
 *
 * @module lib/sim/evaluator/ast-parser
 */

import type {
  ConstraintExpr,
  SysonAstNode,
  BinaryOp,
  UnaryOp,
} from "../data/constraint-types.ts";

// ============================================================================
// SysON kind → expression type mapping
// ============================================================================

/** Known SysML v2 operator kinds */
const BINARY_OPS = new Set<string>([
  "+", "-", "*", "/",
  "<", "<=", ">", ">=", "==", "!=",
  "and", "or",
]);

const UNARY_OPS = new Set<string>(["not", "-"]);

/** SysON kind strings for literal types */
const LITERAL_KINDS = new Set([
  "LiteralInteger",
  "LiteralReal",
  "LiteralRational",
  "sysml::LiteralInteger",
  "sysml::LiteralReal",
  "sysml::LiteralRational",
  "kerml::LiteralInteger",
  "kerml::LiteralReal",
  "kerml::LiteralRational",
]);

/** SysON kind strings for feature references */
const REF_KINDS = new Set([
  "FeatureReferenceExpression",
  "sysml::FeatureReferenceExpression",
  "kerml::FeatureReferenceExpression",
]);

/** SysON kind strings for operator expressions */
const OPERATOR_KINDS = new Set([
  "OperatorExpression",
  "sysml::OperatorExpression",
  "kerml::OperatorExpression",
]);

/** SysON kind strings for invocation expressions */
const INVOCATION_KINDS = new Set([
  "InvocationExpression",
  "sysml::InvocationExpression",
  "kerml::InvocationExpression",
]);

/** SysON kind strings for feature chain expressions (nested paths like boiler.temperature) */
const CHAIN_KINDS = new Set([
  "FeatureChainExpression",
  "sysml::FeatureChainExpression",
  "kerml::FeatureChainExpression",
]);

// ============================================================================
// Parser
// ============================================================================

/**
 * Normalize SysON kind URIs to short entity names.
 * SysON may return `siriusComponents://semantic?domain=sysml&entity=OperatorExpression`
 * instead of just `OperatorExpression`.
 */
function normalizeKind(kind: string): string {
  const entityMatch = kind.match(/[?&]entity=(\w+)/);
  if (entityMatch) return entityMatch[1];
  return kind;
}

/**
 * Parse a SysON AST node tree into a ConstraintExpr.
 *
 * @param node Root AST node (typically a ConstraintUsage's body expression)
 * @returns Parsed constraint expression
 * @throws Error if the AST structure is unrecognized
 */
export function parseAstNode(node: SysonAstNode): ConstraintExpr {
  // Normalize the kind URI before matching
  const normalized = { ...node, kind: normalizeKind(node.kind) };

  // Literal values
  if (LITERAL_KINDS.has(normalized.kind)) {
    return parseLiteral(node);
  }

  // Feature references
  if (REF_KINDS.has(normalized.kind)) {
    return parseRef(node);
  }

  // Operator expressions (binary or unary)
  if (OPERATOR_KINDS.has(normalized.kind)) {
    return parseOperator(node);
  }

  // Invocation expressions (function calls)
  if (INVOCATION_KINDS.has(normalized.kind)) {
    return parseInvocation(node);
  }

  // Feature chain expressions (nested paths: boiler.temperature)
  if (CHAIN_KINDS.has(normalized.kind)) {
    return parseChain(node);
  }

  // Boolean literals
  if (normalized.kind === "LiteralBoolean") {
    const val = node.props?.value;
    return { kind: "literal", value: val === true || val === "true" ? 1 : 0 };
  }

  // Unknown node — try to interpret from children
  if (node.children && node.children.length === 1) {
    // Wrapper node — unwrap
    return parseAstNode(node.children[0]);
  }

  throw new Error(
    `[lib/sim] Unknown AST node kind: '${node.kind}' (normalized: '${normalized.kind}', label: '${node.label}'). ` +
    `Expected OperatorExpression, FeatureReferenceExpression, or Literal*.`,
  );
}

function parseLiteral(node: SysonAstNode): ConstraintExpr {
  // Value can be in props or parsed from label
  const value = node.props?.value !== undefined
    ? Number(node.props.value)
    : parseFloat(node.label);

  if (isNaN(value)) {
    throw new Error(`[lib/sim] Cannot parse literal value from '${node.label}'`);
  }

  const unit = node.props?.unit as string | undefined;
  const result: ConstraintExpr = { kind: "literal", value };
  if (unit) (result as any).unit = unit;
  return result;
}

function parseRef(node: SysonAstNode): ConstraintExpr {
  // SysON sometimes wraps an expression inside a FeatureReferenceExpression
  // (e.g., the right operand of `and` references an OperatorExpression).
  // If the child is itself an expression node, recurse into it instead of
  // treating the label as a feature name.
  const firstChild = node.children?.[0];
  if (firstChild && !node.props?.referentName) {
    const childKind = normalizeKind(firstChild.kind);
    if (
      OPERATOR_KINDS.has(childKind) ||
      INVOCATION_KINDS.has(childKind) ||
      LITERAL_KINDS.has(childKind)
    ) {
      return parseAstNode(firstChild);
    }
  }

  // The referent name is typically in the first child (the referenced feature)
  // or in the node's label/props
  const refName = node.props?.referentName as string
    ?? firstChild?.label
    ?? node.label;

  if (!refName) {
    throw new Error(`[lib/sim] FeatureReferenceExpression has no referent name`);
  }

  // Split dotted path (e.g., "propulsion.thrust" → ["propulsion", "thrust"])
  const featurePath = refName.split(".");
  const elementId = node.props?.referentId as string | undefined
    ?? firstChild?.id;

  const result: ConstraintExpr = { kind: "ref", featurePath };
  if (elementId) (result as any).elementId = elementId;
  return result;
}

function parseOperator(node: SysonAstNode): ConstraintExpr {
  // Operator name is typically in the label or props.operator
  const operator = (node.props?.operator as string) ?? node.label;

  if (!operator) {
    throw new Error(`[lib/sim] OperatorExpression has no operator`);
  }

  const children = node.children ?? [];

  // Unary operator
  if (UNARY_OPS.has(operator) && children.length === 1) {
    return {
      kind: "unary",
      op: operator as UnaryOp,
      operand: parseAstNode(children[0]),
    };
  }

  // Binary operator
  if (BINARY_OPS.has(operator) && children.length === 2) {
    return {
      kind: "binary",
      op: operator as BinaryOp,
      left: parseAstNode(children[0]),
      right: parseAstNode(children[1]),
    };
  }

  // Unary minus with 1 child
  if (operator === "-" && children.length === 1) {
    return {
      kind: "unary",
      op: "-",
      operand: parseAstNode(children[0]),
    };
  }

  throw new Error(
    `[lib/sim] Unexpected OperatorExpression: operator='${operator}', ` +
    `children=${children.length}. Expected binary (2 children) or unary (1 child).`,
  );
}

function parseInvocation(node: SysonAstNode): ConstraintExpr {
  const name = (node.props?.functionName as string) ?? node.label;
  const children = node.children ?? [];

  return {
    kind: "call",
    name,
    args: children.map(parseAstNode),
  };
}

/**
 * Parse a FeatureChainExpression into a ref with a multi-segment featurePath.
 *
 * SysML v2 represents `boiler.temperature` as:
 *   FeatureChainExpression
 *   ├── FeatureReferenceExpression (boiler)
 *   └── FeatureReferenceExpression (temperature)
 *
 * We collect all segments into a single ["boiler", "temperature"] path.
 */
function parseChain(node: SysonAstNode): ConstraintExpr {
  const children = node.children ?? [];

  if (children.length === 0) {
    throw new Error(`[lib/sim] FeatureChainExpression has no children`);
  }

  // Collect feature names from each child FeatureReferenceExpression
  const segments: string[] = [];
  let lastElementId: string | undefined;

  for (const child of children) {
    const childKind = normalizeKind(child.kind);
    if (REF_KINDS.has(childKind)) {
      const refName = (child.props?.referentName as string)
        ?? child.children?.[0]?.label
        ?? child.label;
      if (refName) segments.push(refName);
      lastElementId = (child.props?.referentId as string)
        ?? child.children?.[0]?.id
        ?? child.id;
    } else {
      // Non-ref child in a chain — recurse (could be an expression)
      return parseAstNode(child);
    }
  }

  if (segments.length === 0) {
    throw new Error(`[lib/sim] FeatureChainExpression could not extract any path segments`);
  }

  const result: ConstraintExpr = { kind: "ref", featurePath: segments };
  if (lastElementId) (result as any).elementId = lastElementId;
  return result;
}

// ============================================================================
// Batch parsing
// ============================================================================

/**
 * Parse multiple SysON AST nodes into constraint expressions.
 * Returns successfully parsed constraints and logs errors for failures.
 */
export function parseConstraintNodes(
  nodes: Array<{ id: string; name: string; elementId: string; bodyNode: SysonAstNode }>,
): Array<{ constraint: import("../data/constraint-types.ts").ExtractedConstraint; error?: string }> {
  return nodes.map(({ id, name, elementId, bodyNode }) => {
    try {
      const expression = parseAstNode(bodyNode);
      return {
        constraint: { id, name, elementId, expression },
      };
    } catch (e) {
      return {
        constraint: { id, name, elementId, expression: { kind: "literal" as const, value: 0 } },
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
