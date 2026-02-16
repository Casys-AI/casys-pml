/**
 * PLM tools - aggregated exports
 *
 * @module lib/plm/src/tools/mod
 */

export type { PlmTool, PlmToolCategory, PlmToolHandler } from "./types.ts";

// Tool categories
export { bomTools } from "./bom.ts";
export { agentTools, createAgenticSamplingClient, setSamplingClient } from "./agent.ts";

// Imports for combined arrays
import { bomTools } from "./bom.ts";
import { agentTools } from "./agent.ts";
import type { PlmTool } from "./types.ts";

/** All PLM tools combined */
export const allTools: PlmTool[] = [
  ...bomTools,
  ...agentTools,
];

/** Tools organized by category */
export const toolsByCategory: Record<string, PlmTool[]> = {
  bom: bomTools,
  agent: agentTools,
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
