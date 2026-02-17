/**
 * Tool aggregation for lib/sim
 *
 * @module lib/sim/tools/mod
 */

export type { SimTool, SimToolCategory, SimToolHandler } from "./types.ts";

// Tool categories
export { constraintTools } from "./constraint.ts";
export { valueTools } from "./value.ts";

// Imports for combined arrays
import { constraintTools } from "./constraint.ts";
import { valueTools } from "./value.ts";
import type { SimTool } from "./types.ts";

/** All sim tools combined */
export const allTools: SimTool[] = [
  ...constraintTools,
  ...valueTools,
];

/** Tools organized by category */
export const toolsByCategory: Record<string, SimTool[]> = {
  constraint: constraintTools,
  value: valueTools,
};

/** Get tools by category */
export function getToolsByCategory(category: string): SimTool[] {
  return toolsByCategory[category] || [];
}

/** Get a specific tool by name */
export function getToolByName(name: string): SimTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get all available categories */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}
