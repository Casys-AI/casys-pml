/**
 * Discover Handler (Story 10.6)
 *
 * Unified discovery API for tools and capabilities.
 * Implements Active Search mode from ADR-038.
 *
 * Algorithm (AC12-13 Unified Scoring Formula):
 * score = semanticScore × reliabilityFactor
 *
 * This simplifies the formula for pml_discover (search without context)
 * where graph relatedness (Adamic-Adar) returns 0 anyway.
 *
 * For tools: successRate defaults to 1.0 (cold start favorable)
 * For capabilities: successRate from capability.successRate
 *
 * @module mcp/handlers/discover-handler
 */

import * as log from "@std/log";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { VectorSearch } from "../../vector/search.ts";
import type { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import type { MCPErrorResponse, MCPToolResponse } from "../server/types.ts";
import { formatMCPSuccess } from "../server/responses.ts";
import { addBreadcrumb, captureError, startTransaction } from "../../telemetry/sentry.ts";
import type { HybridSearchResult } from "../../graphrag/types.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import {
  calculateReliabilityFactor,
  DEFAULT_RELIABILITY_CONFIG,
  GLOBAL_SCORE_CAP,
  type ReliabilityConfig,
} from "../../graphrag/algorithms/unified-search.ts";
import type { IDecisionLogger } from "../../telemetry/decision-logger.ts";
import type { SHGAT } from "../../graphrag/algorithms/shgat.ts";
import type { EmbeddingModel } from "../../embeddings/types.ts";

/**
 * Discover request arguments
 */
export interface DiscoverArgs {
  intent?: string;
  filter?: {
    type?: "tool" | "capability" | "all";
    minScore?: number;
  };
  limit?: number;
  include_related?: boolean;
}

/**
 * Related tool in discover response
 */
interface RelatedToolResponse {
  tool_id: string;
  relation: string;
  score: number;
}

/**
 * Unified discover result item
 *
 * Story 13.8: Added record_type field for pml_registry VIEW compatibility.
 * - type: Original field for backward compatibility ('tool' | 'capability')
 * - record_type: New field matching pml_registry VIEW ('mcp-tool' | 'capability')
 */
interface DiscoverResultItem {
  type: "tool" | "capability";
  /** Record type matching pml_registry VIEW (Story 13.8) */
  record_type: "mcp-tool" | "capability";
  id: string;
  name: string;
  description: string;
  score: number;
  // Tool-specific fields
  server_id?: string;
  input_schema?: Record<string, unknown>;
  related_tools?: RelatedToolResponse[];
  // Capability-specific fields
  code_snippet?: string;
  success_rate?: number;
  usage_count?: number;
  semantic_score?: number;
  /** How to call this capability: "namespace:action" format */
  call_name?: string;
  /** Inner capabilities called by this meta-capability */
  called_capabilities?: Array<{
    id: string;
    call_name?: string;
    input_schema?: Record<string, unknown>;
  }>;
}

/**
 * Discover response format
 */
interface DiscoverResponse {
  results: DiscoverResultItem[];
  meta: {
    query: string;
    filter_type: string;
    total_found: number; // Total matches before limit
    returned_count: number; // Actual results returned after limit
    tools_count: number;
    capabilities_count: number;
  };
}

/**
 * Compute unified discover score (AC12-13)
 *
 * Formula: score = semanticScore × reliabilityFactor
 *
 * This is the simplified formula for pml_discover (Active Search without context).
 * Graph relatedness (Adamic-Adar) is not used because contextNodes is empty.
 *
 * @param semanticScore - Vector similarity score (0-1)
 * @param successRate - Success rate (0-1), defaults to 1.0 for tools
 * @param config - Reliability thresholds configuration
 * @returns Final score capped at 0.95
 */
export function computeDiscoverScore(
  semanticScore: number,
  successRate: number = 1.0,
  config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG,
): number {
  const reliabilityFactor = calculateReliabilityFactor(successRate, config);
  const rawScore = semanticScore * reliabilityFactor;
  return Math.min(rawScore, GLOBAL_SCORE_CAP);
}

/**
 * Handle pml:discover request (Story 10.6)
 *
 * Unified search across tools and capabilities with merged, sorted results.
 *
 * @param args - Discover arguments (intent, filter, limit, include_related)
 * @param vectorSearch - Vector search for semantic matching
 * @param graphEngine - GraphRAG engine for hybrid tool search
 * @param dagSuggester - DAG suggester for capability search
 * @returns Unified discover results
 */
export async function handleDiscover(
  args: unknown,
  vectorSearch: VectorSearch,
  graphEngine: GraphRAGEngine,
  dagSuggester: DAGSuggester,
  capabilityRegistry?: CapabilityRegistry,
  decisionLogger?: IDecisionLogger,
  shgat?: SHGAT,
  embeddingModel?: EmbeddingModel,
): Promise<MCPToolResponse | MCPErrorResponse> {
  const transaction = startTransaction("mcp.discover", "mcp");
  const startTime = performance.now();
  const correlationId = crypto.randomUUID();

  try {
    const params = args as DiscoverArgs;

    // Validate required intent parameter (must be non-empty string)
    if (!params.intent || typeof params.intent !== "string" || !params.intent.trim()) {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Missing or empty required parameter: 'intent'",
          }),
        }],
      };
    }

    const intent = params.intent;
    const filterType = params.filter?.type ?? "all";
    const minScore = params.filter?.minScore ?? 0.0;
    const limit = Math.min(params.limit ?? 1, 50); // Default 1, Max 50
    const includeRelated = params.include_related ?? false;

    transaction.setData("intent", intent);
    transaction.setData("filter_type", filterType);
    transaction.setData("limit", limit);
    addBreadcrumb("mcp", "Processing discover request", { intent, filterType });

    log.info(`discover: intent="${intent}", filter=${filterType}, limit=${limit}`);

    const results: DiscoverResultItem[] = [];
    let toolsCount = 0;
    let capabilitiesCount = 0;

    // Search tools if filter allows
    // Story 10.6: Use SHGAT K-head for tool scoring (unified with capabilities)
    if (filterType === "all" || filterType === "tool") {
      const toolResults = await searchTools(
        intent,
        vectorSearch,
        graphEngine,
        limit,
        includeRelated,
        minScore,
        correlationId,
        decisionLogger,
        shgat,
        embeddingModel,
      );
      for (const tool of toolResults) {
        if (tool.score >= minScore) {
          results.push(tool);
          toolsCount++;
        }
      }
    }

    // Search capabilities if filter allows
    // Story 10.6: Use SHGAT K-head for capability scoring (unified with pml:execute)
    if (filterType === "all" || filterType === "capability") {
      const capabilityResults = await searchCapabilities(
        intent,
        dagSuggester,
        capabilityRegistry,
        minScore,
        correlationId,
        decisionLogger,
        shgat,
        embeddingModel,
        limit,
      );
      for (const cap of capabilityResults) {
        if (cap.score >= minScore) {
          results.push(cap);
          capabilitiesCount++;
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit after merge and sort
    const limitedResults = results.slice(0, limit);

    const response: DiscoverResponse = {
      results: limitedResults,
      meta: {
        query: intent,
        filter_type: filterType,
        total_found: results.length, // Before limit
        returned_count: limitedResults.length, // After limit
        tools_count: toolsCount,
        capabilities_count: capabilitiesCount,
      },
    };

    const elapsedMs = performance.now() - startTime;
    log.info(
      `discover: found ${limitedResults.length} results (${toolsCount} tools, ${capabilitiesCount} capabilities) in ${
        elapsedMs.toFixed(1)
      }ms`,
    );

    transaction.finish();
    return formatMCPSuccess(response);
  } catch (error) {
    log.error(`discover error: ${error}`);
    captureError(error as Error, {
      operation: "discover",
      handler: "handleDiscover",
    });
    transaction.finish();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Discover failed: ${(error as Error).message}`,
        }),
      }],
    };
  }
}

/**
 * Search tools using SHGAT K-head (preferred) or hybrid search (fallback)
 *
 * Story 10.6: Unified SHGAT scoring for tools and capabilities.
 * Uses SHGAT.scoreAllTools() when available, falls back to HybridSearch.
 *
 * SHGAT K-head provides learned attention weights vs simple cosine/hybrid.
 */
async function searchTools(
  intent: string,
  vectorSearch: VectorSearch,
  graphEngine: GraphRAGEngine,
  limit: number,
  includeRelated: boolean,
  minScore: number,
  correlationId?: string,
  decisionLogger?: IDecisionLogger,
  shgat?: SHGAT,
  embeddingModel?: EmbeddingModel,
): Promise<DiscoverResultItem[]> {
  const results: DiscoverResultItem[] = [];

  // Use SHGAT if available (unified with capabilities scoring)
  if (shgat && embeddingModel) {
    const intentEmbedding = await embeddingModel.encode(intent);
    if (intentEmbedding && intentEmbedding.length > 0) {
      // Score tools with SHGAT K-head (same architecture as capabilities)
      const shgatResults = shgat.scoreAllTools(intentEmbedding);

      log.debug("[discover] SHGAT scored tools", {
        count: shgatResults.length,
        top3: shgatResults.slice(0, 3).map((r) => ({
          id: r.toolId,
          score: r.score.toFixed(3),
        })),
      });

      // Fetch tool metadata from DB for enrichment
      const topToolIds = shgatResults.slice(0, limit).map((r) => r.toolId);
      const toolsMetadata = await vectorSearch.getToolsById(topToolIds);

      // Process top results up to limit
      for (const shgatResult of shgatResults.slice(0, limit)) {
        // Trace SHGAT scoring decision
        decisionLogger?.logDecision({
          algorithm: "SHGAT",
          mode: "active_search",
          targetType: "tool",
          intent,
          finalScore: shgatResult.score,
          threshold: minScore,
          decision: shgatResult.score >= minScore ? "accepted" : "rejected",
          targetId: shgatResult.toolId,
          correlationId,
          signals: {
            numHeads: shgatResult.headScores?.length ?? 0,
            avgHeadScore: shgatResult.headScores
              ? shgatResult.headScores.reduce((a, b) => a + b, 0) / shgatResult.headScores.length
              : 0,
          },
        });

        // Get metadata from DB (or fallback to toolId)
        const metadata = toolsMetadata.get(shgatResult.toolId);

        results.push({
          type: "tool",
          record_type: "mcp-tool",
          id: shgatResult.toolId,
          name: extractToolName(shgatResult.toolId),
          description: metadata?.description ?? shgatResult.toolId,
          score: shgatResult.score,
          server_id: metadata?.serverId,
          input_schema: metadata?.inputSchema,
        });
      }

      return results;
    }
    log.warn("[discover] Failed to generate intent embedding for tools, falling back to HybridSearch");
  }

  // Fallback: Legacy HybridSearch (semantic + graph)
  log.debug("[discover] Using HybridSearch for tools (SHGAT not available)");
  const hybridResults: HybridSearchResult[] = await graphEngine.searchToolsHybrid(
    vectorSearch,
    intent,
    limit,
    [], // contextTools - empty for pml_discover
    includeRelated,
    undefined, // minScore
    correlationId,
  );

  for (const result of hybridResults) {
    // AC12: Apply unified formula: score = semantic × reliability
    // Tools don't have successRate yet, default to 1.0 (cold start favorable)
    const toolSuccessRate = 1.0;
    const unifiedScore = computeDiscoverScore(result.semanticScore, toolSuccessRate);

    // Trace tool scoring decision
    decisionLogger?.logDecision({
      algorithm: "HybridSearch",
      mode: "active_search",
      targetType: "tool",
      intent,
      finalScore: unifiedScore,
      threshold: minScore,
      decision: unifiedScore >= minScore ? "accepted" : "rejected",
      targetId: result.toolId,
      correlationId,
      signals: {
        semanticScore: result.semanticScore,
        successRate: toolSuccessRate,
      },
      params: {
        reliabilityFactor: 1.0,
      },
    });

    const item: DiscoverResultItem = {
      type: "tool",
      record_type: "mcp-tool", // Story 13.8: pml_registry VIEW compatibility
      id: result.toolId,
      name: extractToolName(result.toolId),
      description: result.description,
      score: unifiedScore, // Use unified score instead of finalScore
      server_id: result.serverId,
      input_schema: result.schema?.inputSchema as Record<string, unknown> | undefined,
    };

    // Add related tools if present
    if (result.relatedTools && result.relatedTools.length > 0) {
      item.related_tools = result.relatedTools.map((rt) => ({
        tool_id: rt.toolId,
        relation: rt.relation,
        score: rt.score,
      }));
    }

    results.push(item);
  }

  return results;
}

/**
 * Search capabilities using SHGAT K-head (unified with pml:execute)
 *
 * Story 10.6: Uses SHGAT.scoreAllCapabilities() like execute-handler.
 * Fallback: If SHGAT unavailable, uses legacy CapabilityMatcher (cosine).
 *
 * SHGAT K-head scores via multi-head attention + message passing,
 * which provides better semantic + structural scoring than cosine alone.
 */
async function searchCapabilities(
  intent: string,
  dagSuggester: DAGSuggester,
  capabilityRegistry?: CapabilityRegistry,
  minScore: number = 0,
  correlationId?: string,
  decisionLogger?: IDecisionLogger,
  shgat?: SHGAT,
  embeddingModel?: EmbeddingModel,
  limit: number = 5,
): Promise<DiscoverResultItem[]> {
  const results: DiscoverResultItem[] = [];

  // Use SHGAT if available (like execute-handler)
  if (shgat && embeddingModel) {
    const intentEmbedding = await embeddingModel.encode(intent);
    if (!intentEmbedding || intentEmbedding.length === 0) {
      log.warn("[discover] Failed to generate intent embedding, falling back to legacy");
    } else {
      // Score capabilities with SHGAT K-head (same as execute-handler:1459)
      const shgatResults = shgat.scoreAllCapabilities(intentEmbedding);

      log.debug("[discover] SHGAT scored capabilities", {
        count: shgatResults.length,
        top3: shgatResults.slice(0, 3).map((r) => ({
          id: r.capabilityId,
          score: r.score.toFixed(3),
        })),
      });

      // Get capability store for additional data
      const capStore = dagSuggester.getCapabilityStore();

      // Process top results up to limit
      for (const shgatResult of shgatResults.slice(0, limit)) {
        // Trace SHGAT scoring decision
        decisionLogger?.logDecision({
          algorithm: "SHGAT",
          mode: "active_search",
          targetType: "capability",
          intent,
          finalScore: shgatResult.score,
          threshold: minScore,
          decision: shgatResult.score >= minScore ? "accepted" : "rejected",
          targetId: shgatResult.capabilityId,
          correlationId,
          signals: {
            numHeads: shgatResult.headScores?.length ?? 0,
            avgHeadScore: shgatResult.headScores
              ? shgatResult.headScores.reduce((a, b) => a + b, 0) / shgatResult.headScores.length
              : 0,
          },
        });

        // Get capability details from store
        const capability = await capStore?.findById(shgatResult.capabilityId);
        if (!capability) continue;

        // Get namespace:action from registry
        let callName: string | undefined;
        if (capabilityRegistry) {
          const record = await capabilityRegistry.getByWorkflowPatternId(shgatResult.capabilityId);
          if (record) {
            callName = `${record.namespace}:${record.action}`;
          }
        } else if (capability.fqdn) {
          const parts = capability.fqdn.split(".");
          if (parts.length >= 5) {
            callName = `${parts[2]}:${parts[3]}`;
          }
        }

        // Parse $cap:uuid references for meta-capabilities
        const calledCapabilities: Array<{
          id: string;
          call_name?: string;
          input_schema?: Record<string, unknown>;
        }> = [];

        if (capability.codeSnippet && capabilityRegistry) {
          const capRefPattern = /\$cap:([a-f0-9-]{36})/g;
          let capMatch;
          const seenIds = new Set<string>();

          while ((capMatch = capRefPattern.exec(capability.codeSnippet)) !== null) {
            const capUuid = capMatch[1];
            if (seenIds.has(capUuid)) continue;
            seenIds.add(capUuid);

            const innerRecord = await capabilityRegistry.getByWorkflowPatternId(capUuid);
            if (innerRecord) {
              const innerCap = await capStore?.findById(capUuid);
              calledCapabilities.push({
                id: capUuid,
                call_name: `${innerRecord.namespace}:${innerRecord.action}`,
                input_schema: innerCap?.parametersSchema as Record<string, unknown> | undefined,
              });
            }
          }
        }

        results.push({
          type: "capability",
          record_type: "capability",
          id: shgatResult.capabilityId,
          name: capability.name ?? shgatResult.capabilityId.substring(0, 8),
          description: capability.description ?? "Learned capability",
          score: shgatResult.score,
          code_snippet: capability.codeSnippet,
          success_rate: capability.successRate,
          usage_count: capability.usageCount,
          semantic_score: shgatResult.featureContributions?.semantic ?? shgatResult.score,
          call_name: callName,
          input_schema: capability.parametersSchema as Record<string, unknown> | undefined,
          called_capabilities: calledCapabilities.length > 0 ? calledCapabilities : undefined,
        });
      }

      return results;
    }
  }

  // Fallback: Legacy CapabilityMatcher (cosine via pgvector)
  log.debug("[discover] Using legacy CapabilityMatcher (SHGAT not available)");
  const match = await dagSuggester.searchCapabilities(intent, correlationId);

  if (!match) {
    decisionLogger?.logDecision({
      algorithm: "CapabilityMatcher",
      mode: "active_search",
      targetType: "capability",
      intent,
      finalScore: 0,
      threshold: minScore,
      decision: "rejected",
      correlationId,
    });
    return [];
  }

  decisionLogger?.logDecision({
    algorithm: "CapabilityMatcher",
    mode: "active_search",
    targetType: "capability",
    intent,
    finalScore: match.score,
    threshold: minScore,
    decision: match.score >= minScore ? "accepted" : "rejected",
    targetId: match.capability.id,
    correlationId,
    signals: {
      semanticScore: match.semanticScore,
      successRate: match.capability.successRate,
    },
  });

  // Get callName
  let callName: string | undefined;
  if (capabilityRegistry) {
    const record = await capabilityRegistry.getByWorkflowPatternId(match.capability.id);
    if (record) {
      callName = `${record.namespace}:${record.action}`;
    }
  } else if (match.capability.fqdn) {
    const parts = match.capability.fqdn.split(".");
    if (parts.length >= 5) {
      callName = `${parts[2]}:${parts[3]}`;
    }
  }

  results.push({
    type: "capability",
    record_type: "capability",
    id: match.capability.id,
    name: match.capability.name ?? match.capability.id.substring(0, 8),
    description: match.capability.description ?? "Learned capability",
    score: match.score,
    code_snippet: match.capability.codeSnippet,
    success_rate: match.capability.successRate,
    usage_count: match.capability.usageCount,
    semantic_score: match.semanticScore,
    call_name: callName,
    input_schema: match.parametersSchema as Record<string, unknown> | undefined,
  });

  return results;
}

/**
 * Extract tool name from tool ID
 *
 * @example "filesystem:read_file" → "read_file"
 */
function extractToolName(toolId: string): string {
  const parts = toolId.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : toolId;
}
