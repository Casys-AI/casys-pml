/**
 * Capability Resolver
 *
 * Resolves capability names/FQDNs to full metadata at startup
 * for the `--expose` flag. Fetches from cloud registry.
 *
 * @module cli/shared/capability-resolver
 */

import type { SessionClient } from "../../session/mod.ts";
import { PML_TOOLS_FULL } from "./constants.ts";

/**
 * Metadata for an exposed capability registered as a named MCP tool.
 */
export interface ExposedCapability {
  /** Tool name for MCP (e.g. "weather_forecast") */
  name: string;
  /** Full FQDN from registry */
  fqdn: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input */
  inputSchema: Record<string, unknown>;
}

/**
 * Raw metadata returned from cloud capability lookup.
 */
interface CapabilityMetadata {
  name: string;
  fqdn: string;
  description: string;
  parametersSchema?: Record<string, unknown>;
}

/**
 * Sanitize a capability name for use as an MCP tool name.
 * MCP tool names must be alphanumeric + underscore.
 *
 * Examples:
 *   "weather:forecast" → "weather_forecast"
 *   "file:convert"     → "file_convert"
 *   "my-tool"          → "my_tool"
 */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Fetch capability metadata from cloud registry.
 * Uses the discover endpoint with exact name lookup.
 *
 * @throws Error if capability not found or cloud unreachable
 */
async function fetchCapabilityMetadata(
  capabilityName: string,
  cloudUrl: string,
  sessionClient: SessionClient | null,
): Promise<CapabilityMetadata> {
  const apiKey = Deno.env.get("PML_API_KEY");
  if (!apiKey) {
    throw new Error(
      `PML_API_KEY is required to resolve exposed capabilities. ` +
      `Set it with: export PML_API_KEY=your_key`,
    );
  }

  // Build headers - use session if registered, otherwise API key
  const headers: Record<string, string> = sessionClient?.isRegistered
    ? sessionClient.getHeaders()
    : {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      };

  // Use discover with exact name lookup to get FQDN + metadata
  const response = await fetch(`${cloudUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `resolve-${capabilityName}`,
      method: "tools/call",
      params: {
        name: "discover",
        arguments: { name: capabilityName },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to resolve capability "${capabilityName}": cloud returned ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();

  // Parse the discover response to extract capability metadata
  const content = result?.result?.content?.[0]?.text;
  if (!content) {
    throw new Error(
      `Capability "${capabilityName}" not found in registry. ` +
      `Check the name or use a full FQDN.`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      `Invalid response from registry for "${capabilityName}": could not parse JSON`,
    );
  }

  // The discover response returns capability details with fqdn, description, parametersSchema
  const fqdn = (parsed.fqdn ?? parsed.id ?? "") as string;
  const description = (parsed.description ?? `Exposed capability: ${capabilityName}`) as string;
  const parametersSchema = parsed.parametersSchema as Record<string, unknown> | undefined;

  if (!fqdn) {
    throw new Error(
      `Capability "${capabilityName}" found but has no FQDN. ` +
      `This may indicate a registry issue.`,
    );
  }

  return {
    name: capabilityName,
    fqdn,
    description,
    parametersSchema,
  };
}

/**
 * Resolve a list of capability names/FQDNs to full metadata.
 * Called at startup when `--expose` is specified.
 *
 * @param capabilities - List of capability names or FQDNs to expose
 * @param cloudUrl - PML cloud URL
 * @param sessionClient - Session client for authenticated requests
 * @returns Resolved capabilities ready for MCP tool registration
 * @throws Error if any capability cannot be resolved or name collision detected
 */
export async function resolveExposedCapabilities(
  capabilities: string[],
  cloudUrl: string,
  sessionClient: SessionClient | null,
): Promise<ExposedCapability[]> {
  // Resolve all capabilities in parallel
  const results = await Promise.allSettled(
    capabilities.map((cap) => fetchCapabilityMetadata(cap, cloudUrl, sessionClient)),
  );

  // Collect errors and successes
  const errors: string[] = [];
  const resolved: ExposedCapability[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      errors.push(`${capabilities[i]}: ${result.reason?.message ?? result.reason}`);
    } else {
      const metadata = result.value;
      resolved.push({
        name: sanitizeToolName(metadata.name),
        fqdn: metadata.fqdn,
        description: metadata.description,
        inputSchema: metadata.parametersSchema ?? {
          type: "object",
          properties: {},
        },
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Failed to resolve ${errors.length} capability(ies):\n  - ${errors.join("\n  - ")}`,
    );
  }

  // Check for name collisions after sanitization
  const names = resolved.map((c) => c.name);
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const name of names) {
    if (seen.has(name)) {
      dupes.push(name);
    }
    seen.add(name);
  }

  if (dupes.length > 0) {
    throw new Error(
      `Tool name collision after sanitization: ${[...new Set(dupes)].join(", ")}. ` +
      `Use FQDNs to disambiguate or rename the capabilities.`,
    );
  }

  // Check for collisions with PML built-in tools (discover, execute, admin, abort, replan)
  const builtinNames = new Set(PML_TOOLS_FULL.map((t) => t.name));
  const collisions = names.filter((n) => builtinNames.has(n));
  if (collisions.length > 0) {
    throw new Error(
      `Exposed capability name(s) collide with PML built-in tools: ${collisions.join(", ")}. ` +
      `Rename the capability or use a different name.`,
    );
  }

  return resolved;
}

/**
 * Build MCP tool definitions from resolved exposed capabilities.
 */
export function buildExposedToolDefinitions(
  capabilities: ExposedCapability[],
): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return capabilities.map((cap) => ({
    name: cap.name,
    description: cap.description,
    inputSchema: cap.inputSchema,
  }));
}
