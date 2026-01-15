/**
 * Lookup Use Case
 *
 * Unified lookup for capabilities AND tools by exact name.
 * Tries capability lookup first, then falls back to tool lookup.
 *
 * @module application/use-cases/discover/lookup
 */

import * as log from "@std/log";
import type { UseCaseResult } from "../shared/types.ts";
import type { LookupRequest, LookupResult } from "./types.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { IToolRepository, ToolMetadata } from "../../../domain/interfaces/tool-repository.ts";
import type { DbClient } from "../../../db/types.ts";
import { getCapabilityDisplayName, getCapabilityFqdn } from "../../../capabilities/types/fqdn.ts";

/**
 * Dependencies for LookupUseCase
 */
export interface LookupDeps {
  capabilityRegistry: CapabilityRegistry;
  toolRepository: IToolRepository;
  db: DbClient;
}

/**
 * Lookup Use Case
 *
 * Provides unified lookup for capabilities and tools.
 * - For capabilities: looks up by namespace:action using CapabilityRegistry
 * - For tools: looks up by tool_id using IToolRepository
 *
 * Multi-tenant scoping: capabilities must be in user's scope OR public.
 */
export class LookupUseCase {
  constructor(private readonly deps: LookupDeps) {}

  /**
   * Execute lookup by exact name
   */
  async execute(request: LookupRequest): Promise<UseCaseResult<LookupResult>> {
    const { name, scope } = request;

    // Validate name
    if (!name || name.trim().length === 0) {
      return {
        success: false,
        error: { code: "MISSING_NAME", message: "Name is required for lookup" },
      };
    }

    try {
      // Try capability lookup first (namespace:action format)
      const capabilityResult = await this.lookupCapability(name, scope);
      if (capabilityResult) {
        return { success: true, data: capabilityResult };
      }

      // Fall back to tool lookup (server:tool format)
      const toolResult = await this.lookupTool(name);
      if (toolResult) {
        return { success: true, data: toolResult };
      }

      // Not found in either
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Capability or tool not found: ${name}` },
      };
    } catch (error) {
      log.error(`[Lookup] Failed: ${error}`);
      return {
        success: false,
        error: { code: "LOOKUP_FAILED", message: (error as Error).message },
      };
    }
  }

  /**
   * Look up capability by name (namespace:action)
   */
  private async lookupCapability(
    name: string,
    scope: { org: string; project: string },
  ): Promise<LookupResult | null> {
    const { capabilityRegistry, db } = this.deps;

    // Resolve by name (namespace:action format)
    const record = await capabilityRegistry.resolveByName(name, scope);

    if (!record) {
      return null;
    }

    // Multi-tenant check: record must be in user's scope OR public
    // The registry already handles this via scope parameter, but let's verify
    const isInScope = record.org === scope.org && record.project === scope.project;
    const isPublic = record.visibility === "public";

    if (!isInScope && !isPublic) {
      return null;
    }

    // Get additional data from workflow_pattern
    interface PatternRow {
      description: string | null;
      tools_used: string[] | null;
    }
    let description: string | null = null;
    let toolsUsed: string[] | null = null;

    if (record.workflowPatternId) {
      const patternRows = (await db.query(
        `SELECT description, dag_structure->'tools_used' as tools_used
         FROM workflow_pattern WHERE pattern_id = $1`,
        [record.workflowPatternId],
      )) as unknown as PatternRow[];

      if (patternRows.length > 0) {
        description = patternRows[0].description;
        toolsUsed = patternRows[0].tools_used;
      }
    }

    return {
      type: "capability",
      id: record.id,
      name: getCapabilityDisplayName(record),
      description,
      namespace: record.namespace,
      action: record.action,
      fqdn: getCapabilityFqdn(record),
      usageCount: record.usageCount,
      successRate: record.usageCount > 0 ? record.successCount / record.usageCount : 0,
      toolsUsed,
    };
  }

  /**
   * Look up tool by ID (server:tool format)
   */
  private async lookupTool(name: string): Promise<LookupResult | null> {
    const { toolRepository } = this.deps;

    // Direct lookup - tools are stored as "server:tool" format
    const tool: ToolMetadata | undefined = await toolRepository.findById(name);

    if (!tool) {
      return null;
    }

    return {
      type: "tool",
      id: tool.toolId,
      name: tool.toolId,
      description: tool.description,
      serverId: tool.serverId,
      inputSchema: tool.inputSchema,
    };
  }
}
