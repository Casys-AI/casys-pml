/**
 * Get Details Use Case
 *
 * Returns full metadata for a capability or tool (whois-style).
 * Extracted from cap-handler.ts handleWhois() method.
 *
 * @module application/use-cases/discover/get-details
 */

import * as log from "@std/log";
import type { UseCaseResult } from "../shared/types.ts";
import type {
  GetDetailsRequest,
  GetDetailsResult,
  CapabilityDetails,
  ToolDetails,
  Scope,
} from "./types.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { IToolRepository } from "../../../domain/interfaces/tool-repository.ts";
import type { DbClient } from "../../../db/types.ts";
import { parseFQDN } from "../../../capabilities/fqdn.ts";
import { getCapabilityDisplayName, getCapabilityFqdn } from "../../../capabilities/types/fqdn.ts";

/**
 * Dependencies for GetDetailsUseCase
 */
export interface GetDetailsDeps {
  capabilityRegistry: CapabilityRegistry;
  toolRepository: IToolRepository;
  db: DbClient;
}

/**
 * Get Details Use Case
 *
 * Returns full metadata for a capability or tool.
 * Accepts UUID or FQDN for capabilities, or tool_id for tools.
 *
 * Multi-tenant scoping: capabilities must be in user's scope OR public.
 */
export class GetDetailsUseCase {
  constructor(private readonly deps: GetDetailsDeps) {}

  /**
   * Execute details lookup
   */
  async execute(request: GetDetailsRequest): Promise<UseCaseResult<GetDetailsResult>> {
    const { id, scope, details } = request;

    // Validate id
    if (!id || id.trim().length === 0) {
      return {
        success: false,
        error: { code: "MISSING_ID", message: "ID is required for details lookup" },
      };
    }

    try {
      // Try capability lookup first (UUID or FQDN)
      const capabilityResult = await this.getCapabilityDetails(id, scope, details);
      if (capabilityResult) {
        return { success: true, data: { type: "capability", data: capabilityResult } };
      }

      // Fall back to tool lookup
      const toolResult = await this.getToolDetails(id, details);
      if (toolResult) {
        return { success: true, data: { type: "tool", data: toolResult } };
      }

      // Not found in either
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Capability or tool not found: ${id}` },
      };
    } catch (error) {
      log.error(`[GetDetails] Failed: ${error}`);
      return {
        success: false,
        error: { code: "DETAILS_FAILED", message: (error as Error).message },
      };
    }
  }

  /**
   * Get capability details by UUID or FQDN
   */
  private async getCapabilityDetails(
    id: string,
    scope: Scope,
    details?: boolean | string[],
  ): Promise<CapabilityDetails | null> {
    const { capabilityRegistry, db } = this.deps;

    // Try to find by UUID first
    let record = await capabilityRegistry.getById(id);

    if (!record) {
      // Try to parse as FQDN and look up by components
      try {
        const components = parseFQDN(id);
        record = await capabilityRegistry.getByFqdnComponents(
          components.org,
          components.project,
          components.namespace,
          components.action,
          components.hash,
        );
      } catch {
        // Not a valid FQDN, that's OK - record stays null
      }
    }

    if (!record) {
      return null;
    }

    // Multi-tenant check: record must be in user's scope OR public
    const isInScope = record.org === scope.org && record.project === scope.project;
    const isPublic = record.visibility === "public";

    if (!isInScope && !isPublic) {
      // Don't reveal that the capability exists to unauthorized users
      return null;
    }

    // Get additional data from workflow_pattern
    interface PatternRow {
      description: string | null;
      parameters_schema: Record<string, unknown> | null;
      tools_used: string[] | null;
    }
    let description: string | null = null;
    let parametersSchema: Record<string, unknown> | null = null;
    let toolsUsed: string[] | null = null;

    if (record.workflowPatternId) {
      const patternRows = (await db.query(
        `SELECT description, parameters_schema, dag_structure->'tools_used' as tools_used
         FROM workflow_pattern WHERE pattern_id = $1`,
        [record.workflowPatternId],
      )) as unknown as PatternRow[];

      if (patternRows.length > 0) {
        description = patternRows[0].description;
        parametersSchema = patternRows[0].parameters_schema;
        toolsUsed = patternRows[0].tools_used;
      }
    }

    const result: CapabilityDetails = {
      id: record.id,
      fqdn: getCapabilityFqdn(record),
      displayName: getCapabilityDisplayName(record),
      org: record.org,
      project: record.project,
      namespace: record.namespace,
      action: record.action,
      hash: record.hash,
      workflowPatternId: record.workflowPatternId ?? null,
      userId: record.userId ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt?.toISOString() ?? null,
      version: record.version,
      versionTag: record.versionTag ?? null,
      verified: record.verified,
      signature: record.signature ?? null,
      usageCount: record.usageCount,
      successCount: record.successCount,
      tags: record.tags,
      visibility: record.visibility,
      routing: record.routing,
      description,
      parametersSchema,
      toolsUsed,
    };

    // Filter fields if specific fields requested
    if (Array.isArray(details) && details.length > 0) {
      const filteredResult: Record<string, unknown> = {};
      for (const field of details) {
        if (Object.prototype.hasOwnProperty.call(result, field)) {
          filteredResult[field] = result[field as keyof CapabilityDetails];
        }
      }
      log.info(`[GetDetails] capability ${id} -> ${record.id} (filtered: ${details.join(", ")})`);
      return filteredResult as unknown as CapabilityDetails;
    }

    log.info(`[GetDetails] capability ${id} -> ${record.id}`);
    return result;
  }

  /**
   * Get tool details by ID
   */
  private async getToolDetails(
    id: string,
    details?: boolean | string[],
  ): Promise<ToolDetails | null> {
    const { toolRepository } = this.deps;

    const tool = await toolRepository.findById(id);

    if (!tool) {
      return null;
    }

    const result: ToolDetails = {
      id: tool.toolId,
      name: tool.toolId,
      description: tool.description,
      serverId: tool.serverId,
      inputSchema: tool.inputSchema ?? {},
    };

    // Filter fields if specific fields requested
    if (Array.isArray(details) && details.length > 0) {
      const filteredResult: Record<string, unknown> = {};
      for (const field of details) {
        if (Object.prototype.hasOwnProperty.call(result, field)) {
          filteredResult[field] = result[field as keyof ToolDetails];
        }
      }
      log.info(`[GetDetails] tool ${id} -> ${tool.toolId} (filtered: ${details.join(", ")})`);
      return filteredResult as unknown as ToolDetails;
    }

    log.info(`[GetDetails] tool ${id} -> ${tool.toolId}`);
    return result;
  }
}
