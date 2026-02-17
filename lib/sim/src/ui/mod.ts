/**
 * UI resource discovery and loading for lib/sim
 *
 * Auto-discovers viewer HTML bundles from dist/ folder.
 * Same pattern as lib/plm/src/ui/mod.ts.
 *
 * @module lib/sim/src/ui/mod
 */

export interface UIResourceMeta {
  name: string;
  description: string;
  tools: string[];
}

/**
 * Auto-discover UI resources from dist/ folder.
 * Each subdirectory with an index.html is a UI resource.
 */
function discoverUiResources(): Record<string, UIResourceMeta> {
  const resources: Record<string, UIResourceMeta> = {};

  try {
    const distPath = new URL("./dist", import.meta.url).pathname;

    for (const entry of Deno.readDirSync(distPath)) {
      if (entry.isDirectory) {
        const uiName = entry.name;
        const uri = `ui://mcp-sim/${uiName}`;
        const htmlPath = `${distPath}/${uiName}/index.html`;

        try {
          Deno.statSync(htmlPath);
          resources[uri] = {
            name: uiName
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
            description: `Sim UI: ${uiName}`,
            tools: [],
          };
        } catch {
          // No index.html in this directory — skip
        }
      }
    }
  } catch {
    // dist/ folder doesn't exist yet (UI not built) — no resources
  }

  return resources;
}

export const UI_RESOURCES: Record<string, UIResourceMeta> = discoverUiResources();

/**
 * Convert a ui:// URI to the local file path of its index.html.
 */
function uriToPath(uri: string): string | null {
  const prefix = "ui://mcp-sim/";
  if (!uri.startsWith(prefix)) return null;

  const viewerName = uri.slice(prefix.length);
  if (!viewerName || viewerName.includes("..")) return null;

  const distPath = new URL("./dist", import.meta.url).pathname;
  return `${distPath}/${viewerName}/index.html`;
}

/**
 * Load the HTML content of a UI resource.
 *
 * @param uri The ui:// URI (e.g., "ui://mcp-sim/validation-viewer")
 * @returns The full HTML content as a string
 */
export async function loadUiHtml(uri: string): Promise<string> {
  const uiPath = uriToPath(uri);
  if (uiPath) {
    try {
      return await Deno.readTextFile(uiPath);
    } catch (e) {
      console.error(`[mcp-sim] Failed to load UI: ${uiPath}`, e);
    }
  }
  throw new Error(`[mcp-sim] UI resource not found: ${uri}`);
}
