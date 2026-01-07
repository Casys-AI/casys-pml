/**
 * MCP Catalog Route Handler (Story 14.7)
 *
 * GET /mcp - List available MCPs with filtering
 *
 * AC8: Returns paginated list of MCPs
 * AC9: Supports type filter query param
 *
 * @module web/routes/mcp/index
 */

import type { FreshContext } from "fresh";
import { McpRegistryService } from "../../../mcp/registry/mcp-registry.service.ts";
import type { McpListOptions, McpRouting, McpType } from "../../../mcp/registry/types.ts";
import { getDb } from "../../../db/mod.ts";

export const handler = {
  /**
   * List MCPs with optional filtering
   *
   * Query params:
   * - type: "deno" | "stdio" | "http"
   * - routing: "client" | "server"
   * - page: number (default 1)
   * - limit: number (default 50, max 100)
   * - search: string (search in name/description)
   */
  async GET(ctx: FreshContext) {
    try {
      const url = new URL(ctx.req.url);

      // Parse query params
      const options: McpListOptions = {
        type: url.searchParams.get("type") as McpType | undefined,
        routing: url.searchParams.get("routing") as McpRouting | undefined,
        page: parseInt(url.searchParams.get("page") || "1"),
        limit: Math.min(parseInt(url.searchParams.get("limit") || "50"), 100),
        search: url.searchParams.get("search") || undefined,
      };

      // Clean undefined values
      if (!options.type) delete options.type;
      if (!options.routing) delete options.routing;
      if (!options.search) delete options.search;

      // Get DB and service
      const db = await getDb();
      const service = new McpRegistryService(db);

      // Fetch catalog
      const catalog = await service.list(options);

      return new Response(JSON.stringify(catalog), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60", // Cache for 1 minute
        },
      });
    } catch (error) {
      console.error("[/mcp] Error listing MCPs:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
