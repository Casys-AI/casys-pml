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
 * Sync discovered tools to PML cloud.
 *
 * Sends the discovery results to POST /api/tools/sync.
 * The server will upsert tool_schema and insert tool_observations.
 *
 * @param cloudUrl - PML cloud URL
 * @param apiKey - User's PML API key
 * @param results - Discovery results from MCP servers
 * @param observedArgs - Optional args observed per server (for multi-config scenarios)
 * @returns Sync result
 */
export async function syncDiscoveredTools(
  cloudUrl: string,
  apiKey: string,
  results: DiscoveryResult[],
  observedArgs: Record<string, string[]> = {},
): Promise<SyncResult> {
  // Filter out results with no tools
  const resultsToSync = results.filter((r) => r.tools.length > 0);

  if (resultsToSync.length === 0) {
    log.debug("[tool-sync] No tools to sync");
    return { success: true, synced: 0, observations: 0 };
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
          })),
          error: r.error,
        })),
        observedArgs,
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
