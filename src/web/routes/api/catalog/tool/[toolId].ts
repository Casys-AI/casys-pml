/**
 * Tool Detail API
 *
 * Returns full tool details including input_schema and ui_meta
 * for the catalog detail panel.
 *
 * GET /api/catalog/tool/:toolId
 *
 * @module web/routes/api/catalog/tool/[toolId]
 */

import type { FreshContext } from "fresh";
import { getRawDb } from "../../../../../server/auth/db.ts";

interface ToolDetail {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  serverId: string;
  inputSchema: Record<string, unknown> | null;
  uiMeta: {
    resourceUri: string;
    emits?: string[];
    accepts?: string[];
  } | null;
}

export const handler = {
  async GET(ctx: FreshContext): Promise<Response> {
    const toolId = decodeURIComponent(ctx.params.toolId || "");

    if (!toolId) {
      return new Response(JSON.stringify({ error: "Tool ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const db = await getRawDb();

      const rows = await db.query<{
        tool_id: string;
        name: string;
        description: string | null;
        routing: "local" | "cloud";
        server_id: string;
        input_schema: Record<string, unknown> | null;
        ui_meta: { resourceUri: string; emits?: string[]; accepts?: string[] } | null;
      }>(`
        SELECT
          tool_id,
          name,
          description,
          routing,
          server_id,
          input_schema,
          ui_meta
        FROM tool_schema
        WHERE tool_id = $1
        LIMIT 1
      `, [toolId]);

      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "Tool not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const row = rows[0];

      // Handle double-encoded JSON
      let uiMeta = row.ui_meta;
      if (typeof uiMeta === "string") {
        try {
          uiMeta = JSON.parse(uiMeta);
        } catch {
          uiMeta = null;
        }
      }

      const tool: ToolDetail = {
        id: row.tool_id,
        name: row.name,
        description: row.description,
        routing: row.routing,
        serverId: row.server_id,
        inputSchema: row.input_schema,
        uiMeta,
      };

      return new Response(JSON.stringify(tool), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error loading tool detail:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
