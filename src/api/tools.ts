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
import {
  MAX_NAME_LENGTH,
  type ToolsSyncRequest,
  UUID_REGEX,
  VALID_NAME_PATTERN,
} from "./types.ts";
import { ensureUiCacheReady } from "../services/ui-cache-service.ts";
import { generateEmbeddings } from "../vector/embeddings.ts";

/**
 * Normalize userId to valid UUID.
 * Maps "local" and other non-UUID values to LOCAL_DEV_USER_ID from env.
 */
function normalizeUserId(userId: string): string | null {
  if (UUID_REGEX.test(userId)) {
    return userId;
  }
  const devUserId = Deno.env.get("LOCAL_DEV_USER_ID");
  log.debug(`[tools/sync] normalizeUserId: "${userId}" → devUserId=${devUserId ?? "NOT SET"}`);
  return devUserId ?? null;
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
    const { tools, observedConfig = {} } = body;

    if (!Array.isArray(tools)) {
      return errorResponse("Invalid request: 'tools' must be an array", 400, corsHeaders);
    }

    let syncedTools = 0;
    let syncedObservations = 0;
    // Track first tool_id per server for FK compliance in tool_observations
    const serverFirstToolId = new Map<string, string>();

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

      for (const tool of result.tools) {
        // F1 Fix: Validate tool.name to prevent injection/malformed data
        if (!isValidName(tool.name)) {
          log.warn(`[tools/sync] Invalid tool name in ${result.serverName}, skipping: ${JSON.stringify(tool.name).slice(0, 50)}`);
          continue;
        }

        const toolId = `${result.serverName}:${tool.name}`;

        // F15 Fix: Wrap in transaction for atomicity
        try {
          await db.transaction(async (tx) => {
            // Upsert tool_schema (global, not multi-tenant)
            // Story 16.6: Include ui_meta for MCP Apps UI support
            // Note: Pass objects directly - postgres.js handles JSONB serialization
            // Do NOT use JSON.stringify() as it causes double-encoding
            await tx.exec(`
              INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema, ui_meta)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (tool_id) DO UPDATE SET
                description = EXCLUDED.description,
                input_schema = EXCLUDED.input_schema,
                ui_meta = EXCLUDED.ui_meta,
                cached_at = NOW()
            `, [toolId, result.serverName, tool.name, tool.description || null, tool.inputSchema || {}, tool.uiMeta ?? null]);
          });

          syncedTools++;
          // Track first tool_id for this server (for FK in tool_observations)
          if (!serverFirstToolId.has(result.serverName)) {
            serverFirstToolId.set(result.serverName, toolId);
          }
        } catch (error) {
          log.warn(`[tools/sync] Failed to sync tool ${toolId}: ${error}`);
        }
      }
    }

    // Tech-spec 01.5: Store server spawn configs in tool_observations
    // One observation per server (not per tool) with full config JSONB
    if (userId) {
      for (const [serverName, config] of Object.entries(observedConfig)) {
        if (!isValidName(serverName)) {
          log.warn(`[tools/sync] Invalid serverName in observedConfig, skipping: ${JSON.stringify(serverName).slice(0, 50)}`);
          continue;
        }

        // Get a real tool_id for FK compliance (use first tool synced for this server)
        const representativeToolId = serverFirstToolId.get(serverName);
        if (!representativeToolId) {
          log.debug(`[tools/sync] No tools synced for ${serverName}, skipping config observation`);
          continue;
        }

        try {
          await db.exec(`
            INSERT INTO tool_observations (user_id, tool_id, server_namespace, observed_config)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, server_namespace) DO UPDATE SET
              observed_config = EXCLUDED.observed_config,
              observed_at = NOW()
          `, [userId, representativeToolId, serverName, config]);
          syncedObservations++;
        } catch (error) {
          log.warn(`[tools/sync] Failed to sync config for ${serverName}: ${error}`);
        }
      }
    }

    // Story 16.6: Store UI HTML in KV cache
    let cachedUis = 0;
    for (const result of tools) {
      if (result.uiHtml && Array.isArray(result.uiHtml)) {
        try {
          const cacheService = await ensureUiCacheReady();

          for (const ui of result.uiHtml) {
            if (ui.resourceUri && ui.content) {
              await cacheService.set(
                ui.resourceUri,
                ui.content,
                ui.mimeType || "text/html",
                result.serverName,
              );
              cachedUis++;
              log.debug(`[tools/sync] Cached UI: ${ui.resourceUri} from ${result.serverName}`);
            }
          }
        } catch (error) {
          log.warn(`[tools/sync] Failed to cache UIs from ${result.serverName}: ${error}`);
        }
      }
    }

    log.info(`[tools/sync] User ${userId?.slice(0, 8) ?? rawUserId}: synced ${syncedTools} tools, ${syncedObservations} observations, ${cachedUis} UIs`);

    // Generate embeddings for new/modified tools (fire-and-forget)
    // generateEmbeddings() checks cache validity — only processes tools whose
    // description or input_schema changed, so renames/updates are covered.
    if (syncedTools > 0 && ctx.embeddingModel) {
      generateEmbeddings(db, ctx.embeddingModel)
        .then((stats) => {
          if (stats.newlyGenerated > 0) {
            log.info(`[tools/sync] Embeddings: ${stats.newlyGenerated} generated, ${stats.cachedCount} cached (${stats.duration.toFixed(1)}s)`);
          }
        })
        .catch((err) => {
          log.warn(`[tools/sync] Background embedding generation failed: ${err}`);
        });
    }

    return jsonResponse({
      synced: syncedTools,
      observations: syncedObservations,
      cachedUis,
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
