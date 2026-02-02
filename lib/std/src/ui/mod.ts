/**
 * MCP Apps UI Module for lib/std
 *
 * Provides infrastructure for bundling and serving UI components
 * for MiniTools via the MCP Apps extension (SEP-1865).
 *
 * @module lib/std/src/ui
 */

import { MCP_APP_MIME_TYPE } from "@casys/mcp-server";

// Re-export for convenience
export { MCP_APP_MIME_TYPE };

/**
 * Metadata for UI resources
 */
export interface UIResourceMeta {
  /** Human-readable name */
  name: string;
  /** Description of the UI */
  description: string;
  /** Tools that use this UI */
  tools: string[];
}

/**
 * Registry of available UI resources
 * Maps uri -> metadata
 */
export const UI_RESOURCES: Record<string, UIResourceMeta> = {
  "ui://mcp-std/table-viewer": {
    name: "Interactive Table Viewer",
    description: "Display data in a sortable, filterable table with row selection",
    tools: ["psql_query", "pglite_query", "collections_table"],
  },
};

/**
 * Embedded UI HTML bundles
 * Populated at build time by Vite or manually for development
 */
const UI_BUNDLES: Record<string, string> = {};

/**
 * Load UI HTML for a given resource URI
 *
 * In production: Returns embedded HTML bundle
 * In development: Loads from file system
 *
 * @param uri - The ui:// resource URI
 * @returns The HTML content to serve
 * @throws Error if UI resource not found
 */
export async function loadUiHtml(uri: string): Promise<string> {
  // Check embedded bundles first
  if (UI_BUNDLES[uri]) {
    return UI_BUNDLES[uri];
  }

  // Development: Try to load from file
  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      const content = await Deno.readTextFile(uiPath);
      return content;
    } catch (e) {
      // Fall through to error
      console.error(`[mcp-std/ui] Failed to load UI from ${uiPath}:`, e);
    }
  }

  throw new Error(`[mcp-std/ui] UI resource not found: ${uri}. ` +
    `Run 'deno task build:ui' to generate bundled UIs.`);
}

/**
 * Register a UI bundle (called by build script)
 *
 * @param uri - The ui:// resource URI
 * @param html - The HTML content
 */
export function registerUiBundle(uri: string, html: string): void {
  UI_BUNDLES[uri] = html;
}

/**
 * Convert ui:// URI to file path for development loading
 */
function uriToPath(uri: string): string | null {
  // ui://mcp-std/table-viewer -> src/ui/dist/table-viewer/index.html
  const match = uri.match(/^ui:\/\/mcp-std\/(.+)$/);
  if (match) {
    const uiName = match[1];
    // Try dist first (built), then src (development)
    const distPath = new URL(`./dist/${uiName}/index.html`, import.meta.url).pathname;
    const srcPath = new URL(`./${uiName}/index.html`, import.meta.url).pathname;
    try {
      Deno.statSync(distPath);
      return distPath;
    } catch {
      return srcPath;
    }
  }
  return null;
}

/**
 * List all available UI resources
 */
export function listUiResources(): Array<{ uri: string; meta: UIResourceMeta }> {
  return Object.entries(UI_RESOURCES).map(([uri, meta]) => ({ uri, meta }));
}
