/**
 * Tools API Route Handler
 *
 * Handles /api/tools/* endpoints for the MCP Gateway.
 * Includes tool discovery sync (Tech-Spec 01: MCP Config Sync).
 *
 * @module mcp/routing/handlers/tools
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { errorResponse, jsonResponse } from "../mcp/routing/types.ts";

/**
 * Normalize userId to valid UUID.
 * Maps "local" and other non-UUID values to LOCAL_DEV_USER_ID from env.
 */
function normalizeUserId(userId: string): string | null {
  // Check if already valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(userId)) {
    return userId;
  }
  // Map non-UUID values to dev UUID from env
  const devUserId = Deno.env.get("LOCAL_DEV_USER_ID");
  log.debug(`[tools/sync] normalizeUserId: "${userId}" → devUserId=${devUserId ?? "NOT SET"}`);
  return devUserId ?? null;
}

/**
 * Input for a discovered tool from client.
 */
interface DiscoveredToolInput {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Discovery result for a single MCP server.
 */
interface DiscoveryResultInput {
  serverName: string;
  tools: DiscoveredToolInput[];
  error?: string;
}

/**
 * Request body for POST /api/tools/sync.
 */
interface ToolsSyncRequest {
  tools: DiscoveryResultInput[];
  observedArgs?: Record<string, string[]>;
}

// F1 Fix: Server-side validation for tool names and server names
// Must match client-side validation in mcp-discovery.ts (F10)
const MAX_NAME_LENGTH = 256;
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;

/**
 * F9 Fix: Convert JS string[] to PostgreSQL TEXT[] literal format.
 * Works with both postgres.js (.unsafe()) and PGlite (.exec()).
 *
 * Format: {val1,val2} or {"val with space","another"}
 */
function toPostgresArray(arr: string[]): string {
  if (arr.length === 0) return "{}";

  const escaped = arr.map((val) => {
    // Escape backslashes and double quotes
    const esc = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    // Quote if contains special chars (comma, space, brace, quote, backslash)
    if (/[,\s{}"\\ ]/.test(val)) {
      return `"${esc}"`;
    }
    return esc;
  });

  return `{${escaped.join(",")}}`;
}

/**
 * Validate a server or tool name.
 * - Max 256 characters
 * - Only alphanumeric, underscore, hyphen, dot
 * - No colons (reserved for serverName:toolName format)
 * - No control characters, newlines, null bytes
 */
function isValidName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return false;
  return VALID_NAME_PATTERN.test(name);
}

/**
 * GET /api/tools/search
 *
 * Search tools for autocomplete (Story 6.4 AC10)
 *
 * Query params:
 * - q: Search query (min 2 chars)
 * - limit: Max results (default: 10)
 */
export function handleToolsSearch(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const q = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    if (q.length < 2) {
      return jsonResponse({ results: [], total: 0 }, 200, corsHeaders);
    }

    const results = ctx.graphEngine.searchToolsForAutocomplete(q, limit);
    return jsonResponse({ results, total: results.length }, 200, corsHeaders);
  } catch (error) {
    log.error(`Search failed: ${error}`);
    return errorResponse(`Search failed: ${error}`, 500, corsHeaders);
  }
}

/**
 * POST /api/tools/sync
 *
 * Sync discovered tools from client MCP servers (Tech-Spec 01).
 * Upserts tool_schema (global) and inserts tool_observations (per-user).
 *
 * Auth: x-api-key header required (userId extracted from token).
 */
export async function handleToolsSync(
  req: Request,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Get userId from context (set by auth middleware)
  const rawUserId = ctx.userId;
  if (!rawUserId) {
    return errorResponse("Unauthorized: Missing or invalid API key", 401, corsHeaders);
  }
  // Normalize to UUID (maps "local" → dev UUID)
  const userId = normalizeUserId(rawUserId);

  // Require db for this endpoint
  if (!ctx.db) {
    return errorResponse("Database not available", 503, corsHeaders);
  }

  const db = ctx.db;

  try {
    const body = await req.json() as ToolsSyncRequest;
    const { tools, observedArgs = {} } = body;

    if (!Array.isArray(tools)) {
      return errorResponse("Invalid request: 'tools' must be an array", 400, corsHeaders);
    }

    let syncedTools = 0;
    let syncedObservations = 0;

    for (const result of tools) {
      // Skip servers with errors
      if (result.error) {
        log.debug(`[tools/sync] Skipping ${result.serverName}: ${result.error}`);
        continue;
      }

      // F1 Fix: Validate serverName to prevent injection/malformed data
      if (!isValidName(result.serverName)) {
        log.warn(`[tools/sync] Invalid serverName, skipping: ${JSON.stringify(result.serverName).slice(0, 50)}`);
        continue;
      }

      const args = observedArgs[result.serverName] || [];

      for (const tool of result.tools) {
        // F1 Fix: Validate tool.name to prevent injection/malformed data
        if (!isValidName(tool.name)) {
          log.warn(`[tools/sync] Invalid tool name in ${result.serverName}, skipping: ${JSON.stringify(tool.name).slice(0, 50)}`);
          continue;
        }

        const toolId = `${result.serverName}:${tool.name}`;

        // F15 Fix: Wrap both inserts in transaction for atomicity
        try {
          await db.transaction(async (tx) => {
            // 1. Upsert tool_schema (global, not multi-tenant)
            await tx.exec(`
              INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (tool_id) DO UPDATE SET
                description = EXCLUDED.description,
                input_schema = EXCLUDED.input_schema,
                cached_at = NOW()
            `, [toolId, result.serverName, tool.name, tool.description || null, JSON.stringify(tool.inputSchema || {})]);

            // 2. Insert observation (multi-tenant) - skip if no valid userId
            // F9 Fix: Serialize args to PostgreSQL array literal for cross-driver compatibility
            if (userId) {
              await tx.exec(`
                INSERT INTO tool_observations (user_id, tool_id, server_namespace, observed_args)
                VALUES ($1, $2, $3, $4::text[])
                ON CONFLICT (user_id, tool_id, observed_args) DO UPDATE SET
                  observed_at = NOW()
              `, [userId, toolId, result.serverName, toPostgresArray(args)]);
              syncedObservations++;
            }
          });

          syncedTools++;
        } catch (error) {
          log.warn(`[tools/sync] Failed to sync tool ${toolId}: ${error}`);
        }
      }
    }

    log.info(`[tools/sync] User ${userId?.slice(0, 8) ?? rawUserId}: synced ${syncedTools} tools, ${syncedObservations} observations`);

    return jsonResponse({
      synced: syncedTools,
      observations: syncedObservations,
    }, 200, corsHeaders);
  } catch (error) {
    // F13 Fix: Log full error server-side, return generic message to client
    log.error(`[tools/sync] Error: ${error instanceof Error ? error.stack : error}`);
    return errorResponse("Sync failed: Internal server error", 500, corsHeaders);
  }
}

/**
 * Route /api/tools/* requests
 */
export async function handleToolsRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (url.pathname === "/api/tools/search" && req.method === "GET") {
    return handleToolsSearch(req, url, ctx, corsHeaders);
  }
  if (url.pathname === "/api/tools/sync" && req.method === "POST") {
    return await handleToolsSync(req, ctx, corsHeaders);
  }
  return null;
}
