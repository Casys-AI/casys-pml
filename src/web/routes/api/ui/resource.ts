/**
 * GET /api/ui/resource?uri=ui://mcp-std/table-viewer
 * GET /api/ui/resource?uri=ui://mcp-std/table-viewer&preview=true
 *
 * Fetch UI HTML from Garage cache.
 * Story 16.6: MCP Apps UI Cache
 *
 * With ?preview=true, injects mock data for catalog preview.
 *
 * Auto-resize: Injects a script that reports iframe height to parent
 * via postMessage, enabling dynamic sizing for all MCP Apps.
 */

import { Handlers } from "$fresh/server.ts";
import { getUiCacheService } from "../../../../services/ui-cache-service.ts";
import { generateStandalonePreview } from "../../../data/ui-mock-data.ts";

/**
 * Script injected into all MCP App iframes to report their height to parent.
 * Uses ResizeObserver for efficient tracking of size changes.
 */
const AUTO_RESIZE_SCRIPT = `
<script data-mcp-auto-resize>
(function() {
  var lastHeight = 0;
  var debounceTimer = null;

  function reportHeight() {
    var height = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    if (height !== lastHeight && height > 0) {
      lastHeight = height;
      window.parent.postMessage({
        type: 'mcp-app-resize',
        height: height,
        uri: location.href
      }, '*');
    }
  }

  function debouncedReport() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reportHeight, 50);
  }

  // Initial report after DOM ready
  if (document.readyState === 'complete') {
    reportHeight();
  } else {
    window.addEventListener('load', reportHeight);
  }

  // Watch for size changes
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(debouncedReport).observe(document.body);
  }

  // Fallback: periodic check for dynamic content
  setInterval(reportHeight, 1000);
})();
</script>
`;

/**
 * Inject auto-resize script into HTML content
 */
function injectAutoResize(html: string): string {
  // Inject before </body> or </html>, or at the end
  if (html.includes('</body>')) {
    return html.replace('</body>', AUTO_RESIZE_SCRIPT + '</body>');
  } else if (html.includes('</html>')) {
    return html.replace('</html>', AUTO_RESIZE_SCRIPT + '</html>');
  }
  return html + AUTO_RESIZE_SCRIPT;
}

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

      // Inject auto-resize script for dynamic iframe sizing
      const content = injectAutoResize(cached.content);

      // Determine cache policy: no-cache in dev or preview mode
      const isDev = Deno.env.get("DENO_ENV") !== "production";
      const cacheControl = (isDev || isPreview)
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=3600";

      // Return HTML content with auto-resize
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": cached.mimeType || "text/html",
          "X-Resource-Uri": resourceUri,
          "X-Server-Id": cached.serverId,
          "X-Cached-At": new Date(cached.cachedAt).toISOString(),
          "X-Preview-Mode": isPreview ? "true" : "false",
          "Cache-Control": cacheControl,
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
