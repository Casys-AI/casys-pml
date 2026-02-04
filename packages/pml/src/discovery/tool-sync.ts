/**
 * Tool Sync Client
 *
 * Syncs discovered tools from local MCP servers to the PML cloud.
 * Part of the BYOK-extended-to-MCPs model.
 *
 * @module discovery/tool-sync
 */

import type { DiscoveryResult } from "./mcp-discovery.ts";
import * as log from "@std/log";

/**
 * Result of syncing tools to cloud.
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Number of tools synced */
  synced: number;
  /** Number of observations recorded */
  observations: number;
  /** Error message if failed */
  error?: string;
}

/**
 * MCP server spawn config synced to cloud.
 * Tech-spec 01.5: Server Config Sync
 */
export interface ObservedConfig {
  /** Command to spawn the server (deno, npx, uvx, etc.) */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Environment variables (placeholders only, never actual values!) */
  env?: Record<string, string>;
}

/**
 * Convert env values to placeholders for safe transmission.
 * NEVER send actual API keys to the server.
 *
 * Tech-spec 01.5: Security - ensures secrets never leave the client.
 * Exported for testing.
 *
 * @example { "API_KEY": "sk-secret" } → { "API_KEY": "${API_KEY}" }
 */
export function sanitizeEnvToPlaceholders(
  env: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env || Object.keys(env).length === 0) return undefined;
  const sanitized: Record<string, string> = {};
  for (const key of Object.keys(env)) {
    sanitized[key] = `\${${key}}`;
  }
  return sanitized;
}

/**
 * Sync discovered tools to PML cloud.
 *
 * Sends the discovery results to POST /api/tools/sync.
 * The server will upsert tool_schema and insert tool_observations.
 *
 * Tech-spec 01.5: Now includes observedConfig with server spawn config
 * (command, args, env placeholders) from .pml.json.
 *
 * @param cloudUrl - PML cloud URL
 * @param apiKey - User's PML API key
 * @param results - Discovery results from MCP servers
 * @returns Sync result
 */
export async function syncDiscoveredTools(
  cloudUrl: string,
  apiKey: string,
  results: DiscoveryResult[],
): Promise<SyncResult> {
  // Filter out results with no tools
  const resultsToSync = results.filter((r) => r.tools.length > 0);

  if (resultsToSync.length === 0) {
    log.debug("[tool-sync] No tools to sync");
    return { success: true, synced: 0, observations: 0 };
  }

  // Tech-spec 01.5: Build observedConfig from discovery results
  // Only include stdio servers (with command), skip http servers (with url)
  const observedConfig: Record<string, ObservedConfig> = {};
  for (const r of resultsToSync) {
    if (r.config && !r.error && r.config.command) {
      observedConfig[r.serverName] = {
        command: r.config.command,
        args: r.config.args || [],
        env: sanitizeEnvToPlaceholders(r.config.env),
      };
    }
  }

  try {
    const response = await fetch(`${cloudUrl}/api/tools/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        tools: resultsToSync.map((r) => ({
          serverName: r.serverName,
          tools: r.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            uiMeta: t.uiMeta,
          })),
          error: r.error,
          // Story 16.6: Include fetched UI HTML
          uiHtml: r.uiHtml,
        })),
        // Tech-spec 01.5: Include server spawn configs
        observedConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn(`[tool-sync] Sync failed: ${response.status} ${errorText}`);
      return {
        success: false,
        synced: 0,
        observations: 0,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json() as { synced: number; observations: number };

    log.debug(`[tool-sync] Synced ${result.synced} tools, ${result.observations} observations`);

    return {
      success: true,
      synced: result.synced,
      observations: result.observations,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn(`[tool-sync] Sync error: ${errorMessage}`);

    return {
      success: false,
      synced: 0,
      observations: 0,
      error: errorMessage,
    };
  }
}
