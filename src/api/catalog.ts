/**
 * Catalog API Route Handlers
 *
 * Migrated from Fresh routes to core API for framework-agnostic access.
 *
 * GET /api/catalog/entries              - List public catalog entries
 * GET /api/catalog/tool/:toolId         - Get tool detail with schema & UI meta
 * GET /api/catalog/capability/:capId    - Get capability detail with code & tools
 *
 * @module api/catalog
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { jsonResponse } from "../mcp/routing/types.ts";

// ─── Types ───────────────────────────────────────────────────────────

interface CatalogEntry {
  recordType: "mcp-tool" | "capability";
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  serverId: string | null;
  namespace: string | null;
  action: string | null;
  hasUi: boolean;
}

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

// ─── Handler 1: GET /api/catalog/entries ─────────────────────────────

/**
 * List public catalog entries from pml_registry VIEW.
 *
 * Returns all public tools and capabilities with a has_ui indicator
 * for tools that have UI metadata in tool_schema.
 */
async function handleCatalogEntries(
  _req: Request,
  _url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const rows = await ctx.db!.query(`
      SELECT
        r.record_type,
        r.id,
        r.name,
        r.description,
        r.routing,
        r.server_id,
        r.namespace,
        r.action,
        COALESCE(ts.ui_meta IS NOT NULL, false) as has_ui
      FROM pml_registry r
      LEFT JOIN tool_schema ts ON r.record_type = 'mcp-tool' AND r.id = ts.tool_id
      WHERE r.visibility = 'public'
      ORDER BY r.record_type, r.name
      LIMIT 500
    `);

    const entries: CatalogEntry[] = rows.map((row) => ({
      recordType: row.record_type as "mcp-tool" | "capability",
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      routing: row.routing as "local" | "cloud",
      serverId: row.server_id as string | null,
      namespace: row.namespace as string | null,
      action: row.action as string | null,
      hasUi: row.has_ui as boolean,
    }));

    return jsonResponse(entries, 200, {
      ...corsHeaders,
      "Cache-Control": "public, max-age=60",
    });
  } catch (error) {
    log.error(
      `[Catalog] Error loading entries: ${error instanceof Error ? error.message : String(error)}`,
    );
    return jsonResponse(
      { error: "internal_error", message: "Failed to load catalog entries" },
      500,
      corsHeaders,
    );
  }
}

// ─── Handler 2: GET /api/catalog/tool/:toolId ────────────────────────

/**
 * Get full tool detail including input_schema and ui_meta.
 *
 * Handles double-encoded JSON for ui_meta (strings that are JSON).
 */
async function handleCatalogToolDetail(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Extract toolId from path: /api/catalog/tool/:toolId
  const pathMatch = url.pathname.match(/^\/api\/catalog\/tool\/(.+)$/);
  if (!pathMatch) {
    return jsonResponse(
      { error: "bad_request", message: "Tool ID required" },
      400,
      corsHeaders,
    );
  }

  const toolId = decodeURIComponent(pathMatch[1]);

  try {
    const rows = await ctx.db!.query(
      `
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
    `,
      [toolId],
    );

    if (rows.length === 0) {
      return jsonResponse(
        { error: "not_found", message: `Tool not found: ${toolId}` },
        404,
        corsHeaders,
      );
    }

    const row = rows[0];

    // Handle double-encoded JSON for ui_meta
    let uiMeta = row.ui_meta as
      | { resourceUri: string; emits?: string[]; accepts?: string[] }
      | null;
    if (typeof uiMeta === "string") {
      try {
        uiMeta = JSON.parse(uiMeta);
      } catch {
        uiMeta = null;
      }
    }

    // Handle double-encoded JSON for input_schema
    let inputSchema = row.input_schema as Record<string, unknown> | null;
    if (typeof inputSchema === "string") {
      try {
        inputSchema = JSON.parse(inputSchema);
      } catch {
        inputSchema = null;
      }
    }

    const tool: ToolDetail = {
      id: row.tool_id as string,
      name: row.name as string,
      description: row.description as string | null,
      routing: row.routing as "local" | "cloud",
      serverId: row.server_id as string,
      inputSchema,
      uiMeta,
    };

    return jsonResponse(tool, 200, corsHeaders);
  } catch (error) {
    log.error(
      `[Catalog] Error loading tool detail for ${toolId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return jsonResponse(
      { error: "internal_error", message: "Failed to load tool detail" },
      500,
      corsHeaders,
    );
  }
}

// ─── Handler 3: GET /api/catalog/capability/:capId ───────────────────

/**
 * Get full capability detail including code, tools used, and input schema.
 *
 * Joins pml_registry with workflow_pattern to get code snippet and DAG info.
 */
async function handleCatalogCapabilityDetail(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Extract capabilityId from path: /api/catalog/capability/:capId
  const pathMatch = url.pathname.match(/^\/api\/catalog\/capability\/(.+)$/);
  if (!pathMatch) {
    return jsonResponse(
      { error: "bad_request", message: "Capability ID required" },
      400,
      corsHeaders,
    );
  }

  const capabilityId = decodeURIComponent(pathMatch[1]);

  try {
    const rows = await ctx.db!.query(
      `
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
    `,
      [capabilityId],
    );

    if (rows.length === 0) {
      return jsonResponse(
        { error: "not_found", message: `Capability not found: ${capabilityId}` },
        404,
        corsHeaders,
      );
    }

    const row = rows[0];

    const capability: CapabilityDetail = {
      id: row.id as string,
      name: row.name as string,
      action: row.action as string | null,
      namespace: row.namespace as string | null,
      description: row.description as string | null,
      routing: row.routing as "local" | "cloud",
      code: row.code as string | null,
      toolsUsed: (row.tools_used as string[]) ?? [],
      inputSchema: row.parameters_schema as ParametersSchema | null,
    };

    return jsonResponse(capability, 200, corsHeaders);
  } catch (error) {
    log.error(
      `[Catalog] Error loading capability detail for ${capabilityId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return jsonResponse(
      { error: "internal_error", message: "Failed to load capability detail" },
      500,
      corsHeaders,
    );
  }
}

// ─── Router ──────────────────────────────────────────────────────────

/**
 * Route /api/catalog requests to the appropriate handler.
 *
 * @returns Response if matched, null if no match (pass to next handler)
 */
export async function handleCatalogRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (req.method !== "GET") return null;

  if (url.pathname === "/api/catalog/entries") {
    return handleCatalogEntries(req, url, ctx, corsHeaders);
  }
  if (url.pathname.startsWith("/api/catalog/tool/")) {
    return handleCatalogToolDetail(req, url, ctx, corsHeaders);
  }
  if (url.pathname.startsWith("/api/catalog/capability/")) {
    return handleCatalogCapabilityDetail(req, url, ctx, corsHeaders);
  }
  return null;
}
