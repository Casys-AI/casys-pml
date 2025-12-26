/**
 * Pure Operations Registry
 *
 * Classifies JavaScript operations as "pure" (no side effects).
 * Pure operations:
 * - Always produce same output for same input
 * - Have no side effects (no I/O, no mutations)
 * - Safe to execute without HIL validation
 *
 * @module capabilities/pure-operations
 */

/**
 * List of all pure operations that can bypass HIL validation
 */
export const PURE_OPERATIONS = [
  // Array operations
  "code:filter",
  "code:map",
  "code:reduce",
  "code:flatMap",
  "code:find",
  "code:findIndex",
  "code:some",
  "code:every",
  "code:sort",
  "code:reverse",
  "code:slice",
  "code:concat",
  "code:join",
  "code:includes",
  "code:indexOf",
  "code:lastIndexOf",

  // String operations
  "code:split",
  "code:replace",
  "code:replaceAll",
  "code:trim",
  "code:trimStart",
  "code:trimEnd",
  "code:toLowerCase",
  "code:toUpperCase",
  "code:substring",
  "code:substr",
  "code:match",
  "code:matchAll",

  // Object operations
  "code:Object.keys",
  "code:Object.values",
  "code:Object.entries",
  "code:Object.fromEntries",
  "code:Object.assign",

  // Math operations
  "code:Math.max",
  "code:Math.min",
  "code:Math.abs",
  "code:Math.floor",
  "code:Math.ceil",
  "code:Math.round",

  // JSON operations
  "code:JSON.parse",
  "code:JSON.stringify",

  // Binary operators (arithmetic)
  "code:add",
  "code:subtract",
  "code:multiply",
  "code:divide",
  "code:modulo",
  "code:power",

  // Binary operators (comparison)
  "code:equal",
  "code:strictEqual",
  "code:notEqual",
  "code:strictNotEqual",
  "code:lessThan",
  "code:lessThanOrEqual",
  "code:greaterThan",
  "code:greaterThanOrEqual",

  // Binary operators (logical)
  "code:and",
  "code:or",

  // Binary operators (bitwise)
  "code:bitwiseAnd",
  "code:bitwiseOr",
  "code:bitwiseXor",
  "code:leftShift",
  "code:rightShift",
  "code:unsignedRightShift",
] as const;

/**
 * Check if a tool ID represents a pure operation
 *
 * @param toolId Tool identifier (e.g., "code:filter", "filesystem:read")
 * @returns true if the operation is pure (no side effects)
 */
export function isPureOperation(toolId: string): boolean {
  return PURE_OPERATIONS.includes(toolId as typeof PURE_OPERATIONS[number]);
}

/**
 * Check if a tool ID is a code operation (starts with "code:")
 *
 * @param toolId Tool identifier
 * @returns true if this is a code operation
 */
export function isCodeOperation(toolId: string): boolean {
  return toolId.startsWith("code:");
}

/**
 * Get the operation name from a code operation tool ID
 *
 * @param toolId Tool identifier (e.g., "code:filter")
 * @returns Operation name (e.g., "filter"), or undefined if not a code operation
 */
export function getOperationName(toolId: string): string | undefined {
  if (!isCodeOperation(toolId)) {
    return undefined;
  }
  return toolId.replace("code:", "");
}
