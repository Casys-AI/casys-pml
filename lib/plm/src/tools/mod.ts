/**
 * PLM tools - aggregated exports
 *
 * @module lib/plm/src/tools/mod
 */

export { type PlmTool, runCommand } from "./common.ts";
export type { PlmToolCategory, PlmToolHandler } from "./types.ts";

// Tool categories
export { bomTools } from "./bom.ts";
export { changeTools } from "./change.ts";
export { qualityTools } from "./quality.ts";
export { planningTools } from "./planning.ts";

// Imports for combined arrays
import { bomTools } from "./bom.ts";
import { changeTools } from "./change.ts";
import { qualityTools } from "./quality.ts";
import { planningTools } from "./planning.ts";
import type { PlmTool } from "./types.ts";

/** All PLM tools combined */
export const allTools: PlmTool[] = [
  ...bomTools,
  ...changeTools,
  ...qualityTools,
  ...planningTools,
];

/** Tools organized by category */
export const toolsByCategory: Record<string, PlmTool[]> = {
  bom: bomTools,
  change: changeTools,
  quality: qualityTools,
  planning: planningTools,
};

/** Get tools by category */
export function getToolsByCategory(category: string): PlmTool[] {
  return toolsByCategory[category] || [];
}

/** Get a specific tool by name */
export function getToolByName(name: string): PlmTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get all available categories */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}
