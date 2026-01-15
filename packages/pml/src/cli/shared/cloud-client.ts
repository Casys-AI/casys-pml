/**
 * Cloud Client - Forward requests to PML cloud server
 *
 * @module cli/shared/cloud-client
 */

import type { CloudForwardResult } from "./types.ts";
import type { SessionClient } from "../../session/mod.ts";

/**
 * Forward a PML tool call to the cloud.
 *
 * Both pml_discover and pml_execute are handled by the cloud server
 * which has SHGAT, GraphRAG, and full execution infrastructure.
 *
 * Uses session header if registered, otherwise falls back to x-api-key detection.
 *
 * @param id - JSON-RPC request ID (must be preserved in response)
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @param cloudUrl - Cloud server URL
 * @param sessionClient - Optional session client for authenticated requests
 * @returns Cloud response or error
 */
export async function forwardToCloud(
  id: string | number,
  toolName: string,
  args: Record<string, unknown>,
  cloudUrl: string,
  sessionClient?: SessionClient | null,
): Promise<CloudForwardResult> {
  const apiKey = Deno.env.get("PML_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "PML_API_KEY required" };
  }

  // Build headers - use session header if registered
  const headers: Record<string, string> = sessionClient?.isRegistered
    ? sessionClient.getHeaders()
    : {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      };

  try {
    const response = await fetch(`${cloudUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Cloud error: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    return { ok: true, response: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Cloud unreachable: ${message}` };
  }
}
