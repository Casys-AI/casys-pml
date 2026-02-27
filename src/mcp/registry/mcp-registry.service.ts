/**
 * MCP Registry Service (Story 14.7)
 *
 * Provides unified access to MCPs from pml_registry VIEW + mcp_server config.
 * No seed JSON - all metadata derived dynamically.
 *
 * @module mcp/registry/mcp-registry.service
 */

import * as log from "@std/log";
import type { DbClient } from "../../db/types.ts";
import {
  generateFQDN,
  getFQDNPartCount,
  parseFQDN,
  parseFQDNWithoutHash,
  stripHash,
} from "../../capabilities/fqdn.ts";
import type {
  McpCatalogItem,
  McpCatalogResponse,
  McpListOptions,
  McpRegistryEntry,
  McpRouting,
  McpType,
  PmlRegistryRow,
  ServerConnectionInfo,
} from "./types.ts";
import {
  computeIntegrity,
  deriveEnvRequired,
  deriveMcpType,
  extractShortHash,
} from "./hash-utils.ts";

// Tech-spec 01.5: Server config now comes from tool_observations DB table
// (synced from client .pml.json via POST /api/tools/sync)

/**
 * MCP Registry Service
 *
 * Queries pml_registry VIEW and enriches with mcp_server config.
 */
export class McpRegistryService {
  constructor(private readonly db: DbClient) {}

  /**
   * Get MCP by full FQDN (5-part with hash).
   *
   * AC1-AC4: Returns entry with appropriate content type.
   * AC5: Returns null if hash doesn't match.
   *
   * @param fqdn - Full 5-part FQDN with hash
   * @returns Registry entry or null if not found/hash mismatch
   */
  async getByFqdn(fqdn: string): Promise<McpRegistryEntry | null> {
    const partCount = getFQDNPartCount(fqdn);
    if (partCount !== 5) {
      log.debug(`[McpRegistry] Invalid FQDN format: ${fqdn}`);
      return null;
    }

    // Validate FQDN format
    parseFQDN(fqdn);
    const fqdnWithoutHash = stripHash(fqdn);

    // Query pml_registry VIEW
    const entry = await this.findInRegistry(fqdnWithoutHash);
    if (!entry) {
      log.debug(`[McpRegistry] Not found in registry: ${fqdnWithoutHash}`);
      return null;
    }

    // Validate hash — accept current OR previous hash
    if (entry.fqdn !== fqdn) {
      const requestedHash = fqdn.split(".").pop() ?? "";
      const accepted = await this.matchesPreviousHash(entry, requestedHash);
      if (!accepted) {
        log.debug(`[McpRegistry] Hash mismatch: expected ${entry.fqdn}, got ${fqdn}`);
        return null;
      }
      log.info(`[McpRegistry] Resolved via previous_hash: ${fqdn} → ${entry.fqdn}`);
    }

    return entry;
  }

  /**
   * Get MCP by FQDN without hash (4-part).
   *
   * AC10: Returns current version for redirect.
   *
   * @param fqdnWithoutHash - 4-part FQDN without hash
   * @returns Registry entry or null if not found
   */
  async getByFqdnWithoutHash(fqdnWithoutHash: string): Promise<McpRegistryEntry | null> {
    const partCount = getFQDNPartCount(fqdnWithoutHash);
    if (partCount !== 4 && partCount !== 0) {
      // Could be 5-part FQDN, strip hash
      try {
        const stripped = stripHash(fqdnWithoutHash);
        return await this.findInRegistry(stripped);
      } catch {
        // Not a valid 5-part either
      }
    }

    return await this.findInRegistry(fqdnWithoutHash);
  }

  /**
   * Get current FQDN with hash for a 4-part FQDN.
   *
   * @param fqdnWithoutHash - 4-part FQDN
   * @returns Full 5-part FQDN or null if not found
   */
  async getCurrentFqdn(fqdnWithoutHash: string): Promise<string | null> {
    const entry = await this.findInRegistry(fqdnWithoutHash);
    return entry?.fqdn ?? null;
  }

  /**
   * List MCPs with filtering and pagination.
   *
   * AC8-AC9: Catalog listing with type filter.
   *
   * @param options - List options
   * @returns Paginated catalog response
   */
  async list(options: McpListOptions = {}): Promise<McpCatalogResponse> {
    const { type, routing, recordType, page = 1, limit = 50, search } = options;

    // Build WHERE clauses
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (recordType) {
      conditions.push(`record_type = $${paramIndex}`);
      params.push(recordType);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM pml_registry ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total as string) || 0;

    // Get paginated results
    const offset = (page - 1) * limit;
    const rows = (await this.db.query(
      `SELECT * FROM pml_registry ${whereClause} ORDER BY name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    )) as unknown as PmlRegistryRow[];

    // Enrich and filter by type/routing (done post-query since derived)
    const enrichedItems: McpCatalogItem[] = [];

    for (const row of rows) {
      const entry = await this.enrichRow(row);
      if (entry) {
        // Apply type/routing filters
        if (type && entry.type !== type) continue;
        if (routing && entry.routing !== routing) continue;

        enrichedItems.push({
          fqdn: entry.fqdn,
          type: entry.type,
          routing: entry.routing,
          description: entry.description,
        });
      }
    }

    return {
      items: enrichedItems,
      total,
      page,
      limit,
    };
  }

  /**
   * Get TypeScript code for a deno-type MCP.
   *
   * AC1-AC2: Returns code for capabilities/MiniTools.
   *
   * @param fqdn - Full 5-part FQDN
   * @returns TypeScript code or null if not deno type
   */
  async getCode(fqdn: string): Promise<string | null> {
    const entry = await this.getByFqdn(fqdn);
    if (!entry || entry.type !== "deno") {
      return null;
    }

    // For capabilities: get code_snippet from workflow_pattern via capability_records
    if (entry.recordType === "capability") {
      try {
        const result = await this.db.query(
          `SELECT wp.code_snippet
           FROM capability_records cr
           JOIN workflow_pattern wp ON cr.workflow_pattern_id = wp.pattern_id
           WHERE cr.namespace = $1 AND cr.action = $2
           LIMIT 1`,
          [fqdn.split(".")[2], fqdn.split(".")[3]?.split(".")[0]], // namespace, action from FQDN
        );

        if (result.length > 0 && result[0].code_snippet) {
          const rawCode = result[0].code_snippet as string;
          return await this.resolveCapRefs(rawCode);
        }
      } catch (e) {
        log.warn(`[McpRegistry] Failed to get code for ${fqdn}: ${e}`);
      }
    }

    // MiniTools (pml.std.*) are bundled client-side in lib/std/bundle.js
    // No server-side code serving needed - client uses local bundle
    return null;
  }

  /**
   * Resolve a capability by namespace:action name with scope-aware lookup.
   *
   * Mirrors CapabilityRegistry.resolveByName() but returns McpRegistryEntry.
   * Used when the package sends a FQDN with wrong org/project (e.g., pml.mcp.fake.person)
   * but the capability exists under a different org/project (e.g., local.default.fake.person).
   *
   * Resolution order:
   * 1. User scope: org/project/namespace/action
   * 2. Public: namespace/action with visibility='public'
   *
   * @param name - namespace:action format (e.g., "fake:person")
   * @param scope - { org, project } from user session
   * @returns Registry entry or null
   */
  async resolveByName(
    name: string,
    scope: { org: string; project: string },
  ): Promise<McpRegistryEntry | null> {
    const colonIndex = name.indexOf(":");
    if (colonIndex <= 0) {
      log.debug(`[McpRegistry] resolveByName: invalid format (no colon): ${name}`);
      return null;
    }

    const namespace = name.substring(0, colonIndex);
    const action = name.substring(colonIndex + 1);

    // 1. Try user scope: exact org/project/namespace/action
    const scopeResult = await this.db.query(
      `SELECT * FROM pml_registry
       WHERE org = $1 AND project = $2 AND namespace = $3 AND action = $4
       LIMIT 1`,
      [scope.org, scope.project, namespace, action],
    );

    if (scopeResult.length > 0) {
      log.debug(`[McpRegistry] resolveByName: found ${name} in scope ${scope.org}.${scope.project}`);
      return await this.enrichRow(scopeResult[0] as unknown as PmlRegistryRow);
    }

    // 2. Try public visibility: namespace/action regardless of org/project
    const publicResult = await this.db.query(
      `SELECT * FROM pml_registry
       WHERE namespace = $1 AND action = $2 AND visibility = 'public'
       LIMIT 1`,
      [namespace, action],
    );

    if (publicResult.length > 0) {
      log.debug(`[McpRegistry] resolveByName: found ${name} as public capability`);
      return await this.enrichRow(publicResult[0] as unknown as PmlRegistryRow);
    }

    log.debug(`[McpRegistry] resolveByName: ${name} not found in scope or public`);
    return null;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Find entry in pml_registry VIEW by 4-part FQDN.
   */
  private async findInRegistry(fqdnWithoutHash: string): Promise<McpRegistryEntry | null> {
    try {
      const parts = parseFQDNWithoutHash(fqdnWithoutHash);

      // Try to find by org.project.namespace.action pattern
      // For MiniTools: server_id = "std", name = "std:{tool}"
      // For capabilities: org, project, namespace, action columns

      let row: PmlRegistryRow | null = null;

      // Check if it's a capability (has org/project/namespace/action)
      const capResult = await this.db.query(
        `SELECT * FROM pml_registry
         WHERE org = $1 AND project = $2 AND namespace = $3 AND action = $4
         LIMIT 1`,
        [parts.org, parts.project, parts.namespace, parts.action],
      );

      if (capResult.length > 0) {
        row = capResult[0] as unknown as PmlRegistryRow;
      } else {
        // Try MCP tool lookup by server_id + name
        // DB: server_id = "filesystem", name = "read_file"
        // FQDN pml.mcp.filesystem.read_file → namespace=filesystem, action=read_file
        const toolResult = await this.db.query(
          `SELECT * FROM pml_registry
           WHERE server_id = $1 AND name = $2
           LIMIT 1`,
          [parts.namespace, parts.action],
        );

        if (toolResult.length > 0) {
          row = toolResult[0] as unknown as PmlRegistryRow;
        }
      }

      if (!row) {
        return null;
      }

      return await this.enrichRow(row);
    } catch (e) {
      log.debug(`[McpRegistry] Error finding ${fqdnWithoutHash}: ${e}`);
      return null;
    }
  }

  /**
   * Enrich a pml_registry row with server config.
   */
  private async enrichRow(row: PmlRegistryRow): Promise<McpRegistryEntry | null> {
    try {
      // Get server connection info from config file
      const config = await this.getServerConfig(row.server_id);

      // Derive type from config or row
      // Capabilities are "deno" (have code to fetch), MCP tools are "stdio" (spawn process)
      let type: McpType;
      if (row.record_type === "capability") {
        type = "deno"; // Capabilities have code to fetch
      } else if (config) {
        type = deriveMcpType(config);
      } else {
        type = "stdio"; // Default for MCP tools
      }

      // Derive routing (from row or default based on type)
      const routing: McpRouting = (row.routing as McpRouting) || (type === "http" ? "server" : "client");

      // Use stored hash from DB (persistent since migration 051)
      let integrity: string;
      let shortHash: string;

      if (row.record_type === "capability" && row.hash) {
        shortHash = row.hash;
        integrity = `capability:${row.hash}`;
      } else if (row.hash) {
        // MCP tools: use stored hash from tool_schema (persisted at sync time)
        shortHash = row.hash;
        integrity = `tool:${row.hash}`;
      } else {
        // Fallback: tool not yet synced — compute ephemeral hash
        log.warn(`[McpRegistry] No stored hash for ${row.name} — ephemeral. Sync to persist.`);
        const hashContent = `${row.name}:${row.description || ""}`;
        integrity = await computeIntegrity("stdio", hashContent);
        shortHash = extractShortHash(integrity);
      }

      // Build FQDN
      let fqdn: string;
      if (row.org && row.project && row.namespace && row.action) {
        // Capability
        fqdn = generateFQDN({
          org: row.org,
          project: row.project,
          namespace: row.namespace,
          action: row.action,
          hash: shortHash,
        });
      } else {
        // MCP tool - use server_id if available, otherwise derive from name
        let server: string;
        let tool: string;

        if (row.server_id) {
          // Use server_id from DB (preferred)
          server = row.server_id;
          tool = row.name.includes(":") ? row.name.split(":")[1] : row.name;
        } else if (row.name.includes(":")) {
          // Fallback: derive from name (server:tool format)
          [server, tool] = row.name.split(":");
        } else {
          // Last resort: assume std
          server = "std";
          tool = row.name;
        }

        fqdn = generateFQDN({
          org: "pml",
          project: "mcp", // MCP tools always use "mcp" project
          namespace: server,
          action: tool,
          hash: shortHash,
        });
      }

      // For capabilities, fetch parameters_schema and tools_used from workflow_pattern
      let parametersSchema: Record<string, unknown> | undefined;
      let toolsUsed: string[] | undefined;

      if (row.record_type === "capability" && row.workflow_pattern_id) {
        const wpResult = await this.db.query(
          `SELECT parameters_schema, dag_structure FROM workflow_pattern WHERE pattern_id = $1`,
          [row.workflow_pattern_id],
        );
        if (wpResult.length > 0) {
          // Extract parameters_schema
          if (wpResult[0].parameters_schema) {
            const schema = wpResult[0].parameters_schema;
            parametersSchema = typeof schema === "string"
              ? JSON.parse(schema)
              : schema as Record<string, unknown>;
          }

          // Issue 6 fix: Extract tools_used from dag_structure (now contains FQDNs)
          // Client uses this to populate fqdnMap for nested capability trace matching
          if (wpResult[0].dag_structure) {
            const dagStructure = typeof wpResult[0].dag_structure === "string"
              ? JSON.parse(wpResult[0].dag_structure)
              : wpResult[0].dag_structure;
            if (Array.isArray(dagStructure?.tools_used)) {
              toolsUsed = dagStructure.tools_used;
            }
          }
        }
      }

      // Build entry
      const entry: McpRegistryEntry = {
        fqdn,
        type,
        description: row.description || "",
        routing,
        tools: [row.name], // Simplified - could expand
        integrity,
        recordType: row.record_type,
        codeUrl: row.code_url || undefined,
        envRequired: deriveEnvRequired(config),
        parametersSchema,
        toolsUsed, // Issue 6 fix: FQDNs for nested capability trace matching
      };

      // Add type-specific fields
      // Tech-spec 01.5: All servers (including std) get install info from observed_config
      if (type === "stdio" && config) {
        entry.install = {
          command: config.command || "",
          args: config.args || [],
          envRequired: deriveEnvRequired(config),
        };
      } else if (type === "http" && config) {
        entry.proxyTo = config.url;
      }

      return entry;
    } catch (e) {
      log.warn(`[McpRegistry] Error enriching row ${row.name}: ${e}`);
      return null;
    }
  }

  /**
   * Resolve $cap:UUID references in code_snippet to mcp.namespace.action format.
   *
   * Code_snippets store stable UUID refs: mcp["$cap:9f597aff-..."](args)
   * The package sandbox only supports mcp.namespace.action(args).
   * Server resolves UUIDs to current names at serve time.
   */
  private async resolveCapRefs(codeSnippet: string): Promise<string> {
    // Match mcp["$cap:UUID"] and mcp['$cap:UUID']
    const pattern = /\$cap:([a-f0-9-]+)/g;

    const uuids = new Set<string>();
    let match;
    while ((match = pattern.exec(codeSnippet)) !== null) {
      uuids.add(match[1]);
    }

    if (uuids.size === 0) return codeSnippet;

    log.debug(`[McpRegistry] Resolving ${uuids.size} $cap:UUID refs in code_snippet`);

    let result = codeSnippet;
    for (const uuid of uuids) {
      const rows = await this.db.query(
        `SELECT namespace, action FROM capability_records WHERE id = $1 LIMIT 1`,
        [uuid],
      );

      if (rows.length > 0) {
        const { namespace, action } = rows[0] as { namespace: string; action: string };
        // mcp["$cap:UUID"] → mcp.namespace.action
        result = result.replaceAll(`mcp["$cap:${uuid}"]`, `mcp.${namespace}.${action}`);
        result = result.replaceAll(`mcp['$cap:${uuid}']`, `mcp.${namespace}.${action}`);
        log.debug(`[McpRegistry] Resolved $cap:${uuid} → ${namespace}:${action}`);
      } else {
        log.warn(`[McpRegistry] $cap:UUID not found in capability_records: ${uuid}`);
      }
    }

    return result;
  }

  /**
   * Check if a requested hash matches the previous_hash of a tool or capability.
   *
   * For MCP tools: checks tool_schema.previous_hash
   * For capabilities: checks capability_name_history
   *
   * This allows old FQDNs (from traces, DAG structures, cached references)
   * to still resolve after a hash/schema change or capability rename.
   */
  private async matchesPreviousHash(
    entry: McpRegistryEntry,
    requestedHash: string,
  ): Promise<boolean> {
    try {
      if (entry.recordType === "capability") {
        // Check capability_name_history for old hashes after rename
        const rows = await this.db.query(
          `SELECT 1 FROM capability_name_history
           WHERE capability_id = (
             SELECT id FROM capability_records
             WHERE namespace || ':' || action = $1
             LIMIT 1
           )
           AND old_hash = $2
           LIMIT 1`,
          [entry.tools[0] ?? "", requestedHash],
        );
        return rows.length > 0;
      } else {
        // MCP tool: check tool_schema.previous_hash
        const toolId = entry.tools[0] ?? "";
        // tool_id format is "server:name", try matching by server_id + name
        const rows = await this.db.query(
          `SELECT 1 FROM tool_schema
           WHERE previous_hash = $1
           AND (tool_id = $2 OR name = $3)
           LIMIT 1`,
          [requestedHash, toolId, toolId.includes(":") ? toolId.split(":")[1] : toolId],
        );
        return rows.length > 0;
      }
    } catch (e) {
      log.debug(`[McpRegistry] Error checking previous_hash: ${e}`);
      return false;
    }
  }

  /**
   * Get server connection info from tool_observations DB.
   * Tech-spec 01.5: Config is synced from client .pml.json
   */
  private async getServerConfig(serverId: string | null): Promise<ServerConnectionInfo | null> {
    if (!serverId) return null;

    try {
      // Query tool_observations for the server's observed_config
      // Note: observed_config is JSONB containing { command, args, env }
      const rows = await this.db.query(
        `SELECT observed_config
         FROM tool_observations
         WHERE server_namespace = $1
         LIMIT 1`,
        [serverId],
      ) as { observed_config: ServerConnectionInfo }[];

      if (rows.length > 0 && rows[0].observed_config) {
        return rows[0].observed_config;
      }

      return null;
    } catch (e) {
      log.debug(`[McpRegistry] Error getting server config for ${serverId}: ${e}`);
      return null;
    }
  }
}
