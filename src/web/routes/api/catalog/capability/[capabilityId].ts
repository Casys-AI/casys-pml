/**
 * Capability Detail API
 *
 * Returns full capability details including code, toolsUsed, and inputSchema
 * for the catalog detail panel.
 *
 * GET /api/catalog/capability/:capabilityId
 *
 * @module web/routes/api/catalog/capability/[capabilityId]
 */

import type { FreshContext } from "fresh";
import { getRawDb } from "../../../../../server/auth/db.ts";

interface ParametersSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    examples?: unknown[];
    description?: string;
  }>;
  required?: string[];
}

interface CapabilityDetail {
  id: string;
  name: string;
  action: string | null;
  namespace: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
  inputSchema: ParametersSchema | null;
}

export const handler = {
  async GET(ctx: FreshContext): Promise<Response> {
    const capabilityId = decodeURIComponent(ctx.params.capabilityId || "");

    if (!capabilityId) {
      return new Response(JSON.stringify({ error: "Capability ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const db = await getRawDb();

      const rows = await db.query<{
        id: string;
        name: string;
        action: string | null;
        namespace: string | null;
        description: string | null;
        routing: "local" | "cloud";
        code: string | null;
        tools_used: string[] | null;
        parameters_schema: ParametersSchema | null;
      }>(`
        SELECT
          pr.id,
          pr.name,
          pr.action,
          pr.namespace,
          pr.description,
          pr.routing,
          wp.code_snippet as code,
          wp.dag_structure->'tools_used' as tools_used,
          wp.parameters_schema
        FROM pml_registry pr
        LEFT JOIN workflow_pattern wp ON pr.workflow_pattern_id = wp.pattern_id
        WHERE pr.id = $1
          AND pr.record_type = 'capability'
        LIMIT 1
      `, [capabilityId]);

      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "Capability not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const row = rows[0];

      const capability: CapabilityDetail = {
        id: row.id,
        name: row.name,
        action: row.action,
        namespace: row.namespace,
        description: row.description,
        routing: row.routing,
        code: row.code,
        toolsUsed: row.tools_used || [],
        inputSchema: row.parameters_schema,
      };

      return new Response(JSON.stringify(capability), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error loading capability detail:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
