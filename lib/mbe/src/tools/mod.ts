/**
 * MBE tools - aggregated exports
 *
 * @module lib/mbe/src/tools/mod
 */

export { type MbeTool, runCommand } from "./common.ts";
export type { MbeToolCategory, MbeToolHandler } from "./types.ts";

// Tool categories
export { geometryTools } from "./geometry.ts";
export { toleranceTools } from "./tolerance.ts";
export { materialTools } from "./material.ts";
export { modelTools } from "./model.ts";

// Imports for combined arrays
import { geometryTools } from "./geometry.ts";
import { toleranceTools } from "./tolerance.ts";
import { materialTools } from "./material.ts";
import { modelTools } from "./model.ts";
import type { MbeTool } from "./types.ts";

/** All MBE tools combined */
export const allTools: MbeTool[] = [
  ...geometryTools,
  ...toleranceTools,
  ...materialTools,
  ...modelTools,
];

/** Tools organized by category */
export const toolsByCategory: Record<string, MbeTool[]> = {
  geometry: geometryTools,
  tolerance: toleranceTools,
  material: materialTools,
  model: modelTools,
};

/** Get tools by category */
export function getToolsByCategory(category: string): MbeTool[] {
  return toolsByCategory[category] || [];
}

/** Get a specific tool by name */
export function getToolByName(name: string): MbeTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get all available categories */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}
