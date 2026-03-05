import type { JsonObject, ToolFamily } from "./types.ts";
import { classifyToolFamily as classifyWithPolicy } from "./policy.ts";

/**
 * Backward-compatible wrapper around the rule-driven L2 policy engine.
 */
export function classifyToolFamily(
  toolName: string,
  args: JsonObject,
): ToolFamily | null {
  return classifyWithPolicy(toolName, args);
}
