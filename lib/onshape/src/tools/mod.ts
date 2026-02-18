/**
 * Onshape Tools Registry
 *
 * Central registry for all Onshape MCP tools.
 * Exports tools by category and provides lookup utilities.
 *
 * @module lib/onshape/tools/mod
 */

import { documentTools } from "./documents.ts";
import { versionTools } from "./versions.ts";
import { partstudioTools } from "./partstudios.ts";
import { partTools } from "./parts.ts";
import { assemblyTools } from "./assemblies.ts";
import { drawingTools } from "./drawings.ts";
import { exportTools } from "./exports.ts";
import { configurationTools } from "./configurations.ts";
import { metadataTools } from "./metadata.ts";
import { releaseTools } from "./releases.ts";
import { thumbnailTools } from "./thumbnails.ts";
import { commentTools } from "./comments.ts";
import { userTools } from "./users.ts";
import { webhookTools } from "./webhooks.ts";
import type { OnshapeTool, OnshapeToolCategory } from "./types.ts";

export {
  documentTools,
  versionTools,
  partstudioTools,
  partTools,
  assemblyTools,
  drawingTools,
  exportTools,
  configurationTools,
  metadataTools,
  releaseTools,
  thumbnailTools,
  commentTools,
  userTools,
  webhookTools,
};
export type { OnshapeTool, OnshapeToolCategory };

/** All tools grouped by category */
export const toolsByCategory: Record<string, OnshapeTool[]> = {
  documents: documentTools,
  versions: versionTools,
  partstudios: partstudioTools,
  parts: partTools,
  assemblies: assemblyTools,
  drawings: drawingTools,
  export: exportTools,
  configurations: configurationTools,
  metadata: metadataTools,
  releases: releaseTools,
  thumbnails: thumbnailTools,
  comments: commentTools,
  users: userTools,
  webhooks: webhookTools,
};

/** Flat array of all tools */
export const allTools: OnshapeTool[] = [
  ...documentTools,
  ...versionTools,
  ...partstudioTools,
  ...partTools,
  ...assemblyTools,
  ...drawingTools,
  ...exportTools,
  ...configurationTools,
  ...metadataTools,
  ...releaseTools,
  ...thumbnailTools,
  ...commentTools,
  ...userTools,
  ...webhookTools,
];

/** Get tools for a specific category */
export function getToolsByCategory(category: string): OnshapeTool[] {
  return toolsByCategory[category as OnshapeToolCategory] ?? [];
}

/** Find a tool by its unique name */
export function getToolByName(name: string): OnshapeTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get list of available categories */
export function getCategories(): OnshapeToolCategory[] {
  return Object.keys(toolsByCategory) as OnshapeToolCategory[];
}
