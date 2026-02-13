/**
 * UI Resources API Route Handler
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * GET /api/ui/resource?uri=ui://std/docker_ps
 *
 * Fetches MCP Apps UI resources via the MCP protocol (resources/read)
 * and returns the HTML content for embedding in iframes.
 *
 * @module api/ui-resources
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { jsonResponse } from "../mcp/routing/types.ts";
import { ensureUiCacheReady } from "../services/ui-cache-service.ts";
import {
  createMcpResourceFetcher,
  parseResourceUri,
} from "../services/mcp-resource-fetcher.ts";
import { buildCspHeader } from "../../lib/server/src/security/csp.ts";

/** CSP header for MCP App iframes (deny-all baseline, allow inline + self) */
const MCP_APP_CSP = buildCspHeader({ allowInline: true });

/**
 * GET /api/ui/resource?uri=ui://std/docker_ps
 *
 * Query params:
 * - uri: The UI resource URI (required)
 * - fresh: If "true", bypass cache and fetch fresh (optional)
 *
 * Returns:
 * - 200: HTML content with appropriate MIME type
 * - 400: Missing or invalid URI
 * - 404: Resource not found
 * - 503: MCP server not connected and no cache available
 */
export async function handleUiResourceGet(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const resourceUri = url.searchParams.get("uri");
  const forceFresh = url.searchParams.get("fresh") === "true";

  if (!resourceUri) {
    return jsonResponse(
      { error: "Missing 'uri' query parameter" },
      400,
      corsHeaders,
    );
  }

  // Validate URI format
  const parsed = parseResourceUri(resourceUri);
  if (!parsed) {
    return jsonResponse(
      { error: `Invalid resource URI format: ${resourceUri}` },
      400,
      corsHeaders,
    );
  }

  const { serverId } = parsed;

  try {
    // Create resource fetcher using mcpClients from context
    const fetcher = createMcpResourceFetcher(
      (id) => ctx.mcpClients.get(id),
      (id) => ctx.mcpClients.has(id),
      () => Array.from(ctx.mcpClients.keys()),
    );

    // Get or initialize cache service
    const cacheService = await ensureUiCacheReady();

    let result: { content: string; mimeType: string } | null = null;

    if (forceFresh && fetcher.isConnected(serverId)) {
      // Bypass cache, fetch fresh
      result = await fetcher.fetch(resourceUri);
      if (result) {
        // Update cache with fresh content
        await cacheService.set(resourceUri, result.content, result.mimeType, serverId);
      }
    } else {
      // Use cache with TTL strategy
      result = await cacheService.getOrFetch(resourceUri, serverId, fetcher);
    }

    // Guard against oversized UI resources (5MB max)
    const MAX_UI_CONTENT_SIZE = 5 * 1024 * 1024;
    if (result && result.content.length > MAX_UI_CONTENT_SIZE) {
      log.warn(
        `[API /ui/resource] UI resource too large: ${resourceUri} (${result.content.length} bytes). ` +
        `Max allowed: ${MAX_UI_CONTENT_SIZE} bytes.`,
      );
      return jsonResponse(
        { error: "UI resource exceeds maximum allowed size (5MB)" },
        413,
        corsHeaders,
      );
    }

    if (!result) {
      // Check if server is connected for better error message
      const isConnected = fetcher.isConnected(serverId);
      if (!isConnected) {
        return jsonResponse(
          {
            error: `MCP server '${serverId}' not connected and no cached UI available`,
            serverId,
            resourceUri,
          },
          503,
          corsHeaders,
        );
      }

      return jsonResponse(
        {
          error: `UI resource not found: ${resourceUri}`,
          serverId,
        },
        404,
        corsHeaders,
      );
    }

    log.debug(`[API /ui/resource] Serving UI: ${resourceUri}`);

    // Return HTML content with security headers
    return new Response(result.content, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": result.mimeType,
        "X-Resource-Uri": resourceUri,
        "X-Server-Id": serverId,
        "Content-Security-Policy": MCP_APP_CSP,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    log.error(
      `[API /ui/resource] Error fetching ${resourceUri}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return jsonResponse(
      {
        error: "Failed to fetch UI resource",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
      corsHeaders,
    );
  }
}

/**
 * Route handler for UI resources
 */
export async function handleUiResourcesRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // GET /api/ui/resource?uri=...
  if (url.pathname === "/api/ui/resource" && req.method === "GET") {
    return handleUiResourceGet(req, url, ctx, corsHeaders);
  }

  return null;
}
