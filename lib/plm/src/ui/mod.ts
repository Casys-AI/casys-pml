/**
 * MCP Apps UI Module for lib/plm
 *
 * Provides infrastructure for serving UI components (tree-viewer, table-viewer,
 * chart-viewer, diff-viewer) for PLM BOM tools via MCP Apps.
 *
 * @module lib/plm/src/ui
 */

import { MCP_APP_MIME_TYPE } from "@casys/mcp-server";

export { MCP_APP_MIME_TYPE };

/**
 * Metadata for UI resources
 */
export interface UIResourceMeta {
  name: string;
  description: string;
  tools: string[];
}

/**
 * Auto-discover UI resources from dist/ folder
 */
function discoverUiResources(): Record<string, UIResourceMeta> {
  const resources: Record<string, UIResourceMeta> = {};
  const distPath = new URL("./dist", import.meta.url).pathname;

  try {
    for (const entry of Deno.readDirSync(distPath)) {
      if (entry.isDirectory) {
        const uiName = entry.name;
        const uri = `ui://mcp-plm/${uiName}`;

        try {
          Deno.statSync(`${distPath}/${uiName}/index.html`);
          resources[uri] = {
            name: uiName.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            description: `PLM UI: ${uiName}`,
            tools: [],
          };
        } catch {
          // No index.html, skip
        }
      }
    }
  } catch (e) {
    console.error(`[mcp-plm/ui] Failed to discover UIs from ${distPath}:`, e);
  }

  return resources;
}

/** Registry of available UI resources */
export const UI_RESOURCES: Record<string, UIResourceMeta> = discoverUiResources();

/** Embedded UI HTML bundles (populated at build time) */
const UI_BUNDLES: Record<string, string> = {};

/**
 * Load UI HTML for a given resource URI
 *
 * @param uri - The ui://mcp-plm/... resource URI
 * @returns The HTML content to serve
 * @throws Error if UI resource not found
 */
export async function loadUiHtml(uri: string): Promise<string> {
  if (UI_BUNDLES[uri]) {
    return UI_BUNDLES[uri];
  }

  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      return await Deno.readTextFile(uiPath);
    } catch (e) {
      console.error(`[mcp-plm/ui] Failed to load UI from ${uiPath}:`, e);
    }
  }

  throw new Error(
    `[mcp-plm/ui] UI resource not found: ${uri}. ` +
      `Ensure dist/ folder contains the UI HTML bundles.`,
  );
}

/** Register a UI bundle */
export function registerUiBundle(uri: string, html: string): void {
  UI_BUNDLES[uri] = html;
}

/** Convert ui:// URI to file path */
function uriToPath(uri: string): string | null {
  const match = uri.match(/^ui:\/\/mcp-plm\/(.+)$/);
  if (match) {
    const uiName = match[1];
    const distPath = new URL(`./dist/${uiName}/index.html`, import.meta.url).pathname;
    try {
      Deno.statSync(distPath);
      return distPath;
    } catch {
      return null;
    }
  }
  return null;
}

/** List all available UI resources */
export function listUiResources(): Array<{ uri: string; meta: UIResourceMeta }> {
  return Object.entries(UI_RESOURCES).map(([uri, meta]) => ({ uri, meta }));
}
