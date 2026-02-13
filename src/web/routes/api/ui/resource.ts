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
import { ensureUiCacheReady } from "../../../../services/ui-cache-service.ts";
import { generateStandalonePreview } from "../../../data/ui-mock-data.ts";
import { buildCspHeader } from "../../../../../lib/server/src/security/csp.ts";

/** CSP header for MCP App iframes (deny-all baseline, allow inline + self) */
const MCP_APP_CSP = buildCspHeader({ allowInline: true });

/**
 * Script injected into all MCP App iframes to report their height to parent.
 * Uses ResizeObserver for efficient tracking of size changes.
 * Calculates actual content height by measuring children, not viewport.
 */
const AUTO_RESIZE_SCRIPT = `
<script data-mcp-auto-resize>
(function() {
  var lastHeight = 0;
  var debounceTimer = null;

  function getContentHeight() {
    // Calculate height from actual content, not viewport
    var height = 0;
    var children = document.body.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      // Skip our own script tag
      if (child.hasAttribute && child.hasAttribute('data-mcp-auto-resize')) continue;
      var rect = child.getBoundingClientRect();
      var bottom = rect.top + rect.height + window.scrollY;
      if (bottom > height) height = bottom;
    }
    // Add body padding/margin
    var bodyStyle = getComputedStyle(document.body);
    height += parseInt(bodyStyle.paddingBottom || '0', 10);
    height += parseInt(bodyStyle.marginBottom || '0', 10);
    // Ensure minimum reasonable height
    return Math.max(height, 50);
  }

  function reportHeight() {
    var height = getContentHeight();
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
    setTimeout(reportHeight, 100);
  } else {
    window.addEventListener('load', function() {
      setTimeout(reportHeight, 100);
    });
  }

  // Watch for size changes
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(debouncedReport).observe(document.body);
  }

  // Fallback: periodic check for dynamic content (less frequent)
  setInterval(reportHeight, 2000);
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
      const cacheService = await ensureUiCacheReady();

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
            "Content-Security-Policy": MCP_APP_CSP,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",
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

      // Return HTML content with auto-resize and security headers
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": cached.mimeType || "text/html",
          "X-Resource-Uri": resourceUri,
          "X-Server-Id": cached.serverId,
          "X-Cached-At": new Date(cached.cachedAt).toISOString(),
          "X-Preview-Mode": isPreview ? "true" : "false",
          "Cache-Control": cacheControl,
          "Content-Security-Policy": MCP_APP_CSP,
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
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
