/**
 * Discover Handler Facade
 *
 * Thin facade that routes discover requests to use cases with optimized
 * embedding generation (single encoding shared across use cases).
 *
 * Phase 3.2: Performance optimization - avoids duplicate embedding generation.
 * MCP Tools Consolidation: Extended with pattern, name, id modes.
 *
 * @module mcp/handlers/discover-handler-facade
 */

import * as log from "@std/log";
import { addBreadcrumb, captureError, startTransaction } from "../../telemetry/sentry.ts";
import { formatMCPSuccess } from "../server/responses.ts";
import type { MCPToolResponse, MCPErrorResponse } from "../server/types.ts";
import {
  DiscoverToolsUseCase,
  DiscoverCapabilitiesUseCase,
  ListCapabilitiesUseCase,
  LookupUseCase,
  GetDetailsUseCase,
  filterCapabilityIdsByScope,
  type DiscoveredTool,
  type DiscoveredCapability,
  type Scope,
} from "../../application/use-cases/discover/mod.ts";
import type { IDecisionLogger } from "../../telemetry/decision-logger.ts";
import { getUserScope } from "../../lib/user.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Extended discover request arguments (MCP Tools Consolidation)
 */
export interface DiscoverArgs {
  // Mode selection (at least one required)
  intent?: string;       // Semantic search mode
  pattern?: string;      // List mode
  name?: string;         // Lookup mode
  id?: string;           // Details mode

  // Details options
  details?: boolean | string[];

  // Filters (for semantic search mode)
  filter?: {
    type?: "tool" | "capability" | "all";
    minScore?: number;
  };

  // Pagination
  limit?: number;
  offset?: number;

  // Related tools
  include_related?: boolean;
}

/**
 * Unified discover result item
 */
type DiscoverResultItem = DiscoveredTool | DiscoveredCapability;

/**
 * Discover response format (semantic search mode)
 */
interface DiscoverResponse {
  results: DiscoverResultItem[];
  meta: {
    query: string;
    filter_type: string;
    total_found: number;
    returned_count: number;
    tools_count: number;
    capabilities_count: number;
  };
}

/**
 * Embedding model interface
 */
export interface IEmbeddingModel {
  encode(text: string): Promise<number[]>;
}

/**
 * Get user scope function type
 */
export type GetUserScopeFn = (userId: string | null) => Promise<Scope>;

/**
 * Dependencies for DiscoverHandlerFacade
 */
export interface DiscoverHandlerFacadeDeps {
  toolsUseCase: DiscoverToolsUseCase;
  capabilitiesUseCase: DiscoverCapabilitiesUseCase;
  listCapabilitiesUseCase?: ListCapabilitiesUseCase;
  lookupUseCase?: LookupUseCase;
  getDetailsUseCase?: GetDetailsUseCase;
  embeddingModel?: IEmbeddingModel;
  decisionLogger?: IDecisionLogger;
  getUserScope?: GetUserScopeFn;
  db?: import("../../db/types.ts").DbClient; // For scope filtering
}

// ============================================================================
// Facade Implementation
// ============================================================================

/**
 * Discover Handler Facade
 *
 * Routes discover requests to appropriate use cases based on parameters:
 * - intent: Semantic search (original behavior)
 * - pattern: List capabilities by glob pattern
 * - name: Lookup by exact name (capabilities + tools)
 * - id: Get detailed metadata (whois-style)
 */
export class DiscoverHandlerFacade {
  constructor(private readonly deps: DiscoverHandlerFacadeDeps) {}

  /**
   * Handle pml:discover request
   *
   * @param args - Discover arguments
   * @param userId - Authenticated user ID (null for local mode)
   */
  async handle(args: unknown, userId?: string | null): Promise<MCPToolResponse | MCPErrorResponse> {
    const transaction = startTransaction("mcp.discover", "mcp");
    const startTime = performance.now();

    try {
      const params = args as DiscoverArgs;

      // Get user scope for multi-tenant filtering
      const getScopeFn = this.deps.getUserScope ?? getUserScope;
      const scope = await getScopeFn(userId ?? null);

      // Mode detection and routing
      if (params.pattern) {
        return await this.handleListMode(params, scope, transaction, startTime);
      }
      if (params.name) {
        return await this.handleLookupMode(params, scope, transaction, startTime);
      }
      if (params.id) {
        return await this.handleDetailsMode(params, scope, transaction, startTime);
      }
      if (params.intent) {
        return await this.handleSearchMode(params, scope, transaction, startTime);
      }

      // No valid mode parameter provided
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Missing required parameter. Provide one of: 'intent' (search), 'pattern' (list), 'name' (lookup), or 'id' (details).",
          }),
        }],
      };
    } catch (error) {
      log.error(`discover error: ${error}`);
      captureError(error as Error, { operation: "discover", handler: "DiscoverHandlerFacade" });
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Discover failed: ${(error as Error).message}` }),
        }],
      };
    }
  }

  /**
   * Handle list mode (pattern parameter)
   */
  private async handleListMode(
    params: DiscoverArgs,
    scope: Scope,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    const { listCapabilitiesUseCase } = this.deps;

    if (!listCapabilitiesUseCase) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "List mode not available (listCapabilitiesUseCase not configured)" }),
        }],
      };
    }

    transaction.setData("mode", "list");
    transaction.setData("pattern", params.pattern);
    addBreadcrumb("mcp", "Processing list request", { pattern: params.pattern });

    const result = await listCapabilitiesUseCase.execute({
      pattern: params.pattern!,
      scope,
      limit: params.limit,
      offset: params.offset,
    });

    const elapsedMs = performance.now() - startTime;
    log.info(`discover (list): pattern="${params.pattern}" in ${elapsedMs.toFixed(1)}ms`);

    transaction.finish();

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: result.error?.message ?? "List failed" }),
        }],
      };
    }

    return formatMCPSuccess(result.data);
  }

  /**
   * Handle lookup mode (name parameter)
   */
  private async handleLookupMode(
    params: DiscoverArgs,
    scope: Scope,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    const { lookupUseCase } = this.deps;

    if (!lookupUseCase) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Lookup mode not available (lookupUseCase not configured)" }),
        }],
      };
    }

    transaction.setData("mode", "lookup");
    transaction.setData("name", params.name);
    addBreadcrumb("mcp", "Processing lookup request", { name: params.name });

    const result = await lookupUseCase.execute({
      name: params.name!,
      scope,
    });

    const elapsedMs = performance.now() - startTime;
    log.info(`discover (lookup): name="${params.name}" in ${elapsedMs.toFixed(1)}ms`);

    transaction.finish();

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: result.error?.message ?? "Lookup failed" }),
        }],
      };
    }

    return formatMCPSuccess(result.data);
  }

  /**
   * Handle details mode (id parameter)
   */
  private async handleDetailsMode(
    params: DiscoverArgs,
    scope: Scope,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    const { getDetailsUseCase } = this.deps;

    if (!getDetailsUseCase) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Details mode not available (getDetailsUseCase not configured)" }),
        }],
      };
    }

    transaction.setData("mode", "details");
    transaction.setData("id", params.id);
    addBreadcrumb("mcp", "Processing details request", { id: params.id });

    const result = await getDetailsUseCase.execute({
      id: params.id!,
      scope,
      details: params.details,
    });

    const elapsedMs = performance.now() - startTime;
    log.info(`discover (details): id="${params.id}" in ${elapsedMs.toFixed(1)}ms`);

    transaction.finish();

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: result.error?.message ?? "Details lookup failed" }),
        }],
      };
    }

    return formatMCPSuccess(result.data);
  }

  /**
   * Handle search mode (intent parameter) - original behavior
   * Filters SHGAT results by user scope (multi-tenant isolation)
   */
  private async handleSearchMode(
    params: DiscoverArgs,
    scope: Scope,
    transaction: { finish: () => void; setData: (k: string, v: unknown) => void },
    startTime: number,
  ): Promise<MCPToolResponse | MCPErrorResponse> {
    const correlationId = crypto.randomUUID();
    const intent = params.intent!;
    const filterType = params.filter?.type ?? "all";
    const minScore = params.filter?.minScore ?? 0.0;
    const limit = Math.min(params.limit ?? 1, 50);
    const includeRelated = params.include_related ?? false;

    transaction.setData("mode", "search");
    transaction.setData("intent", intent);
    transaction.setData("filter_type", filterType);
    transaction.setData("limit", limit);
    addBreadcrumb("mcp", "Processing search request", { intent, filterType });

    log.info(`discover (search): intent="${intent}", filter=${filterType}, limit=${limit}, includeRelated=${includeRelated}`);

    // Generate embedding ONCE for all use cases
    let intentEmbedding: number[] | undefined;
    if (this.deps.embeddingModel) {
      try {
        const embedStart = performance.now();
        intentEmbedding = await this.deps.embeddingModel.encode(intent);
        const embedTime = performance.now() - embedStart;
        log.info(`[DiscoverFacade] Embedding generated in ${embedTime.toFixed(1)}ms`);
      } catch (err) {
        log.warn(`[DiscoverFacade] Failed to generate embedding: ${err}`);
      }
    }

    const results: DiscoverResultItem[] = [];
    let toolsCount = 0;
    let capabilitiesCount = 0;

    // Search tools if filter allows
    if (filterType === "all" || filterType === "tool") {
      const toolsStart = performance.now();
      const toolsResult = await this.deps.toolsUseCase.execute({
        intent,
        limit,
        minScore,
        includeRelated,
        correlationId,
        intentEmbedding,
      });
      log.info(`[DiscoverFacade] Tools search took ${(performance.now() - toolsStart).toFixed(1)}ms`);

      if (toolsResult.success && toolsResult.data) {
        for (const tool of toolsResult.data.tools) {
          if (tool.score >= minScore) {
            results.push(tool);
            toolsCount++;
          }
        }
      }
    }

    // Search capabilities if filter allows
    if (filterType === "all" || filterType === "capability") {
      const capsStart = performance.now();

      // Create scope filter function for multi-tenant isolation
      // This filters SHGAT results BEFORE fetching capability details (efficient)
      const scopeFilter = this.deps.db
        ? async (capIds: string[]) => filterCapabilityIdsByScope(this.deps.db!, capIds, scope)
        : undefined;

      const capsResult = await this.deps.capabilitiesUseCase.execute({
        intent,
        limit,
        minScore,
        correlationId,
        intentEmbedding,
        scopeFilter,
      });
      log.info(`[DiscoverFacade] Capabilities search took ${(performance.now() - capsStart).toFixed(1)}ms`);

      if (capsResult.success && capsResult.data) {
        for (const cap of capsResult.data.capabilities) {
          if (cap.score >= minScore) {
            results.push(cap);
            capabilitiesCount++;
          }
        }
      }
    }

    // Sort by score descending and apply limit
    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, limit);

    // Apply softmax to convert SHGAT scores to relative probabilities
    if (limitedResults.length > 1) {
      const temperature = 0.1;
      const scores = limitedResults.map((r) => r.score);
      const maxScore = Math.max(...scores);
      const expScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
      const sumExp = expScores.reduce((a, b) => a + b, 0);

      for (let i = 0; i < limitedResults.length; i++) {
        (limitedResults[i] as DiscoverResultItem & { semantic_score: number }).semantic_score =
          limitedResults[i].score;
        limitedResults[i].score = expScores[i] / sumExp;
      }
    }

    const response: DiscoverResponse = {
      results: limitedResults,
      meta: {
        query: intent,
        filter_type: filterType,
        total_found: results.length,
        returned_count: limitedResults.length,
        tools_count: toolsCount,
        capabilities_count: capabilitiesCount,
      },
    };

    const elapsedMs = performance.now() - startTime;
    log.info(
      `discover (search): found ${limitedResults.length} results (${toolsCount} tools, ${capabilitiesCount} caps) in ${elapsedMs.toFixed(1)}ms`,
    );

    transaction.finish();
    return formatMCPSuccess(response);
  }
}
