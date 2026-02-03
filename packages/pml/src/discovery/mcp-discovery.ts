/**
 * MCP Tool Discovery Module
 *
 * Discovers tools from MCP servers via tools/list.
 * Validates schemas with AJV before accepting.
 *
 * @module discovery/mcp-discovery
 */

import type { McpServerConfig } from "../types.ts";
import type { McpDependency } from "../loader/types.ts";
import { StdioManager } from "../loader/stdio-manager.ts";
import * as log from "@std/log";
import Ajv from "npm:ajv@8.17.1";
import Ajv2020 from "npm:ajv@8.17.1/dist/2020.js";

/**
 * Default timeout for tools/list call (10 seconds).
 * Shorter than the 30s request timeout - we want fast discovery.
 */
const DISCOVERY_TIMEOUT_MS = 10_000;

/**
 * AJV instances for schema validation.
 * ajv07: draft-07 (default, most MCP servers)
 * ajv2020: draft/2020-12 (modern servers like Playwright)
 * strict: false to allow unknown keywords often found in MCP schemas.
 */
const Ajv07Constructor = Ajv.default || Ajv;
const ajv07 = new Ajv07Constructor({ strict: false });
const Ajv2020Constructor = Ajv2020.default || Ajv2020;
const ajv2020 = new Ajv2020Constructor({ strict: false });

/**
 * UI metadata from MCP Apps (SEP-1865)
 */
export interface ToolUiMeta {
  resourceUri?: string;
  visibility?: Array<"model" | "app">;
  emits?: string[];
  accepts?: string[];
}

/**
 * Tool discovered from an MCP server.
 */
export interface DiscoveredTool {
  /** Tool name */
  name: string;
  /** Optional description */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;
  /** MCP Apps UI metadata (Story 16.6) */
  uiMeta?: ToolUiMeta;
}

/**
 * Fetched UI HTML content (Story 16.6)
 */
export interface FetchedUiHtml {
  /** Resource URI (e.g., "ui://mcp-std/table-viewer") */
  resourceUri: string;
  /** HTML content */
  content: string;
  /** MIME type */
  mimeType: string;
}

/**
 * Result of discovering tools from a single MCP server.
 */
export interface DiscoveryResult {
  /** Server name (from config key) */
  serverName: string;
  /** Discovered tools with valid schemas */
  tools: DiscoveredTool[];
  /** Server config used */
  config: McpServerConfig;
  /** Error message if discovery failed */
  error?: string;
  /** Tools skipped due to invalid schemas */
  skippedTools?: string[];
  /** Fetched UI HTML content (Story 16.6) */
  uiHtml?: FetchedUiHtml[];
}

/**
 * Convert McpServerConfig to McpDependency format for StdioManager.
 */
function configToDependency(name: string, config: McpServerConfig): McpDependency {
  if (config.type === "stdio") {
    return {
      name,
      type: "stdio",
      install: config.command ?? "",
      version: "latest",
      integrity: "", // Not used for discovery
      command: config.command,
      args: config.args,
      env: config.env, // Pass env vars to spawn process
    };
  }

  // HTTP type - not yet supported for discovery
  throw new Error(`HTTP MCP servers not yet supported for discovery: ${name}`);
}

/**
 * Maximum allowed tool name length.
 */
const MAX_TOOL_NAME_LENGTH = 256;

/**
 * Valid tool name pattern: alphanumeric, underscore, hyphen, dot.
 * Must not contain colons (reserved for serverName:toolName format).
 */
const VALID_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;

/**
 * Validate that a tool's inputSchema is a valid JSON Schema.
 * Uses validateSchema() instead of compile() to avoid memory leak (F6 fix).
 *
 * @param tool - Tool object with optional inputSchema
 * @returns true if schema is valid or not present
 */
function validateToolSchema(tool: { name: string; inputSchema?: unknown }): boolean {
  // Name is required and must be a string
  if (!tool.name || typeof tool.name !== "string") {
    return false;
  }

  // F10 Fix: Validate tool name length
  if (tool.name.length > MAX_TOOL_NAME_LENGTH) {
    return false;
  }

  // F10 Fix: Validate tool name characters (no colons, control chars, etc.)
  if (!VALID_TOOL_NAME_PATTERN.test(tool.name)) {
    return false;
  }

  // No schema = OK (tool without parameters)
  if (!tool.inputSchema) {
    return true;
  }

  // Schema must be an object
  if (typeof tool.inputSchema !== "object" || tool.inputSchema === null) {
    return false;
  }

  // F6 Fix: Use validateSchema() instead of compile() to avoid memory leak.
  // validateSchema() checks if the schema is valid JSON Schema without storing it.
  // compile() would cache the compiled schema in the global ajv instance forever.
  // Try draft-07 first (most common), fallback to 2020-12 for modern schemas.
  // Note: validateSchema() throws on unknown $schema URI, so we need try/catch.
  const schema = tool.inputSchema as Record<string, unknown>;

  try {
    const isValid07 = ajv07.validateSchema(schema);
    if (isValid07 === true) {
      return true;
    }
  } catch {
    // draft-07 failed, try 2020-12
  }

  try {
    const isValid2020 = ajv2020.validateSchema(schema);
    return isValid2020 === true;
  } catch {
    // Both drafts failed
    return false;
  }
}

/**
 * Log debug message for discovery operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:discovery] ${message}`);
}

/**
 * Raw tool from MCP server response.
 */
interface RawTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  /** MCP Apps metadata (SEP-1865) */
  _meta?: {
    ui?: {
      resourceUri?: string;
      visibility?: Array<"model" | "app">;
      emits?: string[];
      accepts?: string[];
    };
  };
}

/**
 * Process and validate raw tools from MCP server.
 * Extracted to reduce duplication between HTTP and stdio discovery.
 */
function processRawTools(
  rawTools: RawTool[],
  serverName: string,
): { validTools: DiscoveredTool[]; skippedTools: string[]; uiToolCount: number } {
  const validTools: DiscoveredTool[] = [];
  const skippedTools: string[] = [];
  let uiToolCount = 0;

  for (const tool of rawTools) {
    if (validateToolSchema(tool)) {
      // Extract UI metadata if present (MCP Apps SEP-1865)
      const uiMeta = tool._meta?.ui;
      if (uiMeta?.resourceUri) {
        uiToolCount++;
      }

      validTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
        uiMeta: uiMeta ? {
          resourceUri: uiMeta.resourceUri,
          visibility: uiMeta.visibility,
          emits: uiMeta.emits,
          accepts: uiMeta.accepts,
        } : undefined,
      });
    } else {
      log.warn(`[pml:discovery] ${serverName}: invalid schema for "${tool.name}", skipping`);
      skippedTools.push(tool.name);
    }
  }

  logDebug(`${serverName}: discovered ${validTools.length} tools (${skippedTools.length} skipped, ${uiToolCount} with UI)`);
  return { validTools, skippedTools, uiToolCount };
}

/**
 * Discover tools from an HTTP MCP server.
 *
 * Makes a JSON-RPC call to the server's URL to get tools/list.
 *
 * @param serverName - Name of the server (from config key)
 * @param config - MCP server configuration (must have url)
 * @param timeout - Timeout in ms for the HTTP call
 * @returns Discovery result with tools or error
 */
export async function discoverHttpMcpTools(
  serverName: string,
  config: McpServerConfig,
  timeout: number = DISCOVERY_TIMEOUT_MS,
): Promise<DiscoveryResult> {
  logDebug(`Starting HTTP discovery for ${serverName}`);

  if (!config.url) {
    return {
      serverName,
      tools: [],
      config,
      error: "HTTP server missing url",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // JSON-RPC 2.0 request for tools/list
      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as {
        result?: { tools?: unknown[] };
        error?: { message: string };
      };

      if (result.error) {
        throw new Error(result.error.message);
      }

      const rawTools = (result.result?.tools ?? []) as RawTool[];
      const { validTools, skippedTools, uiToolCount } = processRawTools(rawTools, serverName);

      // Log UI tools for observability (Story 16.6)
      if (uiToolCount > 0) {
        console.error(`[pml:discovery] ${serverName}: ${uiToolCount} tools with UI`);
      }

      return {
        serverName,
        tools: validTools,
        config,
        skippedTools: skippedTools.length > 0 ? skippedTools : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn(`[pml:discovery] ${serverName}: HTTP discovery failed - ${errorMessage}`);

    return {
      serverName,
      tools: [],
      config,
      error: errorMessage,
    };
  }
}

/**
 * Discover tools from a single MCP server.
 *
 * Spawns the MCP server, initializes MCP protocol, calls tools/list,
 * validates each tool's schema, and returns valid tools.
 *
 * @param serverName - Name of the server (from config key)
 * @param config - MCP server configuration
 * @param stdioManager - StdioManager instance for process management
 * @param timeout - Timeout in ms for tools/list call
 * @returns Discovery result with tools or error
 */
export async function discoverMcpTools(
  serverName: string,
  config: McpServerConfig,
  stdioManager: StdioManager,
  timeout: number = DISCOVERY_TIMEOUT_MS,
): Promise<DiscoveryResult> {
  logDebug(`Starting discovery for ${serverName}`);

  try {
    // Convert config to dependency format
    const dep = configToDependency(serverName, config);

    // Spawn MCP server (includes initialize handshake)
    await stdioManager.getOrSpawn(dep);

    // Call tools/list with timeout
    const response = await Promise.race([
      stdioManager.call(serverName, "tools/list", {}),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Discovery timeout after ${timeout}ms`)), timeout)
      ),
    ]) as { tools?: unknown[] };

    const rawTools = (response?.tools ?? []) as RawTool[];
    const { validTools, skippedTools, uiToolCount } = processRawTools(rawTools, serverName);

    // Log UI tools for observability (Story 16.6)
    if (uiToolCount > 0) {
      console.error(`[pml:discovery] ${serverName}: ${uiToolCount} tools with UI`);
    }

    // Story 16.6: Fetch UI HTML resources
    let uiHtml: FetchedUiHtml[] | undefined;
    if (uiToolCount > 0) {
      uiHtml = await fetchUiResources(serverName, validTools, stdioManager);
      if (uiHtml.length > 0) {
        console.error(`[pml:discovery] ${serverName}: Fetched ${uiHtml.length} UI HTML resources`);
      }
    }

    return {
      serverName,
      tools: validTools,
      config,
      skippedTools: skippedTools.length > 0 ? skippedTools : undefined,
      uiHtml: uiHtml && uiHtml.length > 0 ? uiHtml : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn(`[pml:discovery] ${serverName}: discovery failed - ${errorMessage}`);

    // F7 Fix: Clean up spawned process on error to avoid zombie processes
    try {
      stdioManager.shutdown(serverName);
    } catch {
      // Ignore shutdown errors - process may not have been spawned
    }

    return {
      serverName,
      tools: [],
      config,
      error: errorMessage,
    };
  }
}

/**
 * Default concurrency limit for parallel discovery.
 */
const DEFAULT_CONCURRENCY = 5;

/**
 * Global timeout for entire discovery process (60 seconds).
 */
const GLOBAL_DISCOVERY_TIMEOUT_MS = 60_000;

/**
 * Discover tools from multiple MCP servers.
 *
 * F5 Fix: Runs discovery in parallel with concurrency limit.
 * Also has a global timeout to prevent indefinite blocking.
 *
 * @param servers - Map of server name to config
 * @param stdioManager - StdioManager instance
 * @param timeout - Per-server timeout
 * @param concurrency - Max parallel discoveries (default: 5)
 * @returns Array of discovery results
 */
export async function discoverAllMcpTools(
  servers: Map<string, McpServerConfig>,
  stdioManager: StdioManager,
  timeout: number = DISCOVERY_TIMEOUT_MS,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<DiscoveryResult[]> {
  const entries = Array.from(servers.entries());
  const results: DiscoveryResult[] = [];

  // Process in batches with concurrency limit
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);

    const batchPromises = batch.map(async ([name, config]) => {
      // Route to appropriate discovery function based on server type
      if (config.type === "http") {
        return await discoverHttpMcpTools(name, config, timeout);
      }
      // Default to stdio
      return await discoverMcpTools(name, config, stdioManager, timeout);
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Discover tools with global timeout.
 * Wraps discoverAllMcpTools with a global timeout to prevent indefinite blocking.
 *
 * @param servers - Map of server name to config
 * @param stdioManager - StdioManager instance
 * @param perServerTimeout - Per-server timeout
 * @param globalTimeout - Global timeout for entire discovery
 * @param concurrency - Max parallel discoveries
 * @returns Array of discovery results (partial if timeout)
 */
export async function discoverAllMcpToolsWithTimeout(
  servers: Map<string, McpServerConfig>,
  stdioManager: StdioManager,
  perServerTimeout: number = DISCOVERY_TIMEOUT_MS,
  globalTimeout: number = GLOBAL_DISCOVERY_TIMEOUT_MS,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<DiscoveryResult[]> {
  try {
    return await Promise.race([
      discoverAllMcpTools(servers, stdioManager, perServerTimeout, concurrency),
      new Promise<DiscoveryResult[]>((_, reject) =>
        setTimeout(() => reject(new Error(`Global discovery timeout after ${globalTimeout}ms`)), globalTimeout)
      ),
    ]);
  } catch (error) {
    log.warn(`[pml:discovery] ${error instanceof Error ? error.message : error}`);
    // Return empty results on global timeout
    return [];
  }
}

/**
 * Summary statistics for discovery results.
 */
export interface DiscoverySummary {
  /** Total servers attempted */
  totalServers: number;
  /** Servers with successful discovery */
  successfulServers: number;
  /** Servers that failed */
  failedServers: number;
  /** Total tools discovered */
  totalTools: number;
  /** Total tools skipped */
  skippedTools: number;
  /** Total tools with UI (MCP Apps) */
  uiTools: number;
  /** List of failed server names with errors */
  failures: Array<{ server: string; error: string }>;
}

/**
 * Fetch UI HTML resources for tools with _meta.ui.resourceUri (Story 16.6)
 *
 * Calls resources/read for each unique resourceUri and returns the HTML content.
 *
 * @param serverName - Server name for logging
 * @param tools - Discovered tools to check for UI
 * @param stdioManager - StdioManager for MCP calls
 * @returns Array of fetched UI HTML
 */
async function fetchUiResources(
  serverName: string,
  tools: DiscoveredTool[],
  stdioManager: StdioManager,
): Promise<FetchedUiHtml[]> {
  // Collect unique resourceUris
  const urisToFetch = new Set<string>();
  for (const tool of tools) {
    if (tool.uiMeta?.resourceUri) {
      urisToFetch.add(tool.uiMeta.resourceUri);
    }
  }

  if (urisToFetch.size === 0) {
    return [];
  }

  logDebug(`${serverName}: Fetching ${urisToFetch.size} UI resources`);
  const results: FetchedUiHtml[] = [];

  for (const uri of urisToFetch) {
    try {
      const response = await stdioManager.call(serverName, "resources/read", { uri }) as {
        contents?: Array<{ uri: string; mimeType?: string; text?: string }>;
      };

      const content = response?.contents?.[0];
      if (content?.text) {
        results.push({
          resourceUri: uri,
          content: content.text,
          mimeType: content.mimeType ?? "text/html",
        });
        logDebug(`${serverName}: Fetched UI ${uri} (${content.text.length} bytes)`);
      } else {
        log.warn(`[pml:discovery] ${serverName}: No content for UI ${uri}`);
      }
    } catch (error) {
      // resources/read may not be supported - that's OK, just skip
      log.warn(`[pml:discovery] ${serverName}: Failed to fetch UI ${uri}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return results;
}

/**
 * Summarize discovery results.
 */
export function summarizeDiscovery(results: DiscoveryResult[]): DiscoverySummary {
  const failures: Array<{ server: string; error: string }> = [];

  let totalTools = 0;
  let skippedTools = 0;
  let uiTools = 0;
  let successfulServers = 0;

  for (const result of results) {
    if (result.error) {
      failures.push({ server: result.serverName, error: result.error });
    } else {
      successfulServers++;
      totalTools += result.tools.length;
      skippedTools += result.skippedTools?.length ?? 0;
      // Count tools with UI (Story 16.6)
      uiTools += result.tools.filter(t => t.uiMeta?.resourceUri).length;
    }
  }

  return {
    totalServers: results.length,
    successfulServers,
    failedServers: failures.length,
    totalTools,
    skippedTools,
    uiTools,
    failures,
  };
}
