/**
 * GET /api/ui/resource?uri=ui://mcp-std/table-viewer
 * GET /api/ui/resource?uri=ui://mcp-std/table-viewer&preview=true
 *
 * Fetch UI HTML from Garage cache.
 * Story 16.6: MCP Apps UI Cache
 *
 * With ?preview=true, injects mock data for catalog preview.
 */

import { Handlers } from "$fresh/server.ts";
import { getUiCacheService } from "../../../../services/ui-cache-service.ts";
import { generateStandalonePreview } from "../../../data/ui-mock-data.ts";

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    const resourceUri = url.searchParams.get("uri");
    const isPreview = url.searchParams.get("preview") === "true";

    if (!resourceUri) {
      return new Response(JSON.stringify({ error: "Missing 'uri' parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const cacheService = getUiCacheService();
      await cacheService.init();

      const cached = await cacheService.get(resourceUri);

      if (!cached) {
        return new Response(JSON.stringify({ error: "UI not found", uri: resourceUri }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // In preview mode, return standalone HTML with mock data
      // This bypasses the MCP Apps framework which can't be mocked from outside
      if (isPreview) {
        const standaloneHtml = generateStandalonePreview(resourceUri);
        return new Response(standaloneHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "X-Resource-Uri": resourceUri,
            "X-Server-Id": cached.serverId,
            "X-Preview-Mode": "true",
            "Cache-Control": "no-cache",
          },
        });
      }

      const content = cached.content;

      // Return HTML content
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": cached.mimeType || "text/html",
          "X-Resource-Uri": resourceUri,
          "X-Server-Id": cached.serverId,
          "X-Cached-At": new Date(cached.cachedAt).toISOString(),
          "X-Preview-Mode": isPreview ? "true" : "false",
          "Cache-Control": isPreview ? "no-cache" : "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error(`[/api/ui/resource] Error fetching ${resourceUri}:`, error);
      return new Response(JSON.stringify({ error: "Failed to fetch UI" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
