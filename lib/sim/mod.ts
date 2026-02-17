/**
 * MCP Sim (Simulation & Constraint Checking) Library
 *
 * MCP tools for SysML v2 constraint extraction, evaluation, and validation.
 *
 * @module lib/sim
 */

// Re-export client and tools
export {
  defaultClient,
  SimToolsClient,
  SimToolsMCP,
  simToolsMCP,
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/client.ts";

// Re-export client types
export type {
  MCPClientBase,
  SimToolsClientOptions,
} from "./src/client.ts";

// Re-export tool types
export type {
  SimTool,
  SimToolCategory,
  SimToolHandler,
} from "./src/tools/types.ts";

// Re-export individual tool arrays
export { constraintTools } from "./src/tools/mod.ts";

// Re-export evaluator for direct use
export { evaluate, evaluateConstraint, evaluateAll, toValueMap } from "./src/evaluator/evaluator.ts";
export { parseAstNode } from "./src/evaluator/ast-parser.ts";
export { collectRefs, collectAllRefs } from "./src/evaluator/resolver.ts";

// Re-export data types
export type {
  ConstraintExpr,
  ExtractedConstraint,
  ConstraintResult,
  ConstraintStatus,
  ValidationReport,
  ValidationSummary,
  SysonAstNode,
} from "./src/data/constraint-types.ts";
