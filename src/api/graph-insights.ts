/**
 * Graph Insights Handler
 *
 * Unified endpoint that returns related nodes from ALL algorithms,
 * deduplicated by node_id with algorithm badges.
 *
 * @module api/graph-insights
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { errorResponse, jsonResponse } from "../mcp/routing/types.ts";
import {
  ALGO_WEIGHTS,
  type AlgorithmScore,
  type InsightItem,
  type InsightsResponse,
} from "./types.ts";

type NodeType = "tool" | "capability";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a node ID into server and name components.
 */
function parseNodeId(id: string): { server: string; name: string } {
  const colonIndex = id.indexOf(":");
  if (colonIndex === -1) {
    return { server: "unknown", name: id };
  }
  return {
    server: id.substring(0, colonIndex),
    name: id.substring(colonIndex + 1),
  };
}

/**
 * Determine node type from ID.
 */
function getNodeType(id: string): NodeType {
  return id.startsWith("cap:") ? "capability" : "tool";
}

/**
 * Get display name for a node.
 */
function getNodeDisplayName(
  id: string,
  type: NodeType,
  capabilityNames: Map<string, string>,
): string {
  if (type === "capability") {
    return capabilityNames.get(id) || id.replace(/^cap:/, "");
  }
  return parseNodeId(id).name;
}

/**
 * Calculate combined score from algorithm contributions.
 */
function calculateCombinedScore(algorithms: Record<string, AlgorithmScore>): number {
  const entries = Object.entries(algorithms);
  if (entries.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [algo, data] of entries) {
    const weight = ALGO_WEIGHTS[algo] ?? 0.5;
    weightedSum += data.score * weight;
    totalWeight += weight;
  }

  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const algoBoost = Math.min(1.5, 1 + (entries.length - 1) * 0.1);
  return Math.round(baseScore * algoBoost * 1000) / 1000;
}

/**
 * Calculate algorithm statistics from insight items.
 */
function calculateAlgorithmStats(
  items: InsightItem[],
): Record<string, { count: number; avgScore: number }> {
  const stats: Record<string, { count: number; totalScore: number }> = {};

  for (const item of items) {
    for (const [algo, data] of Object.entries(item.algorithms)) {
      if (!stats[algo]) {
        stats[algo] = { count: 0, totalScore: 0 };
      }
      stats[algo].count++;
      stats[algo].totalScore += data.score;
    }
  }

  const result: Record<string, { count: number; avgScore: number }> = {};
  for (const [algo, { count, totalScore }] of Object.entries(stats)) {
    result[algo] = {
      count,
      avgScore: Math.round((totalScore / count) * 1000) / 1000,
    };
  }

  return result;
}

// ============================================================================
// Insight Collector
// ============================================================================

/**
 * Collector for merging algorithm results into unified insight items.
 */
class InsightCollector {
  private items = new Map<string, InsightItem>();

  add(
    id: string,
    name: string,
    type: NodeType,
    server: string | undefined,
    algorithm: string,
    score: number,
    rank: number,
    metadata?: Record<string, unknown>,
  ): void {
    const existing = this.items.get(id);
    const algoScore: AlgorithmScore = { score, rank, metadata };

    if (existing) {
      existing.algorithms[algorithm] = algoScore;
    } else {
      this.items.set(id, {
        id,
        name,
        type,
        server,
        algorithms: { [algorithm]: algoScore },
        combinedScore: 0,
      });
    }
  }

  finalize(): InsightItem[] {
    const items = Array.from(this.items.values());

    for (const item of items) {
      item.combinedScore = calculateCombinedScore(item.algorithms);
    }

    items.sort((a, b) => b.combinedScore - a.combinedScore);
    return items;
  }
}

// ============================================================================
// Algorithm Collectors
// ============================================================================

async function collectLouvainInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
  capabilityNames: Map<string, string>,
): Promise<void> {
  const communityId = ctx.graphEngine.getCommunity(nodeId);
  if (communityId === undefined) return;

  const memberIds = ctx.graphEngine.findCommunityMembers(nodeId);
  const members = memberIds
    .filter((id) => id !== nodeId)
    .map((id) => ({ id, pagerank: ctx.graphEngine.getPageRank(id) }))
    .sort((a, b) => b.pagerank - a.pagerank)
    .slice(0, limit);

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const { server } = parseNodeId(member.id);
    const memberType = getNodeType(member.id);
    collector.add(
      member.id,
      getNodeDisplayName(member.id, memberType, capabilityNames),
      memberType,
      memberType === "capability" ? undefined : server,
      "louvain",
      member.pagerank,
      i + 1,
      { communityId: parseInt(communityId, 10) },
    );
  }
}

function collectNeighborInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
  capabilityNames: Map<string, string>,
): void {
  const neighborIds = ctx.graphEngine.getNeighbors(nodeId);
  const neighbors = neighborIds
    .map((id) => ({
      id,
      pagerank: ctx.graphEngine.getPageRank(id),
      edgeData: ctx.graphEngine.getEdgeData(nodeId, id) || ctx.graphEngine.getEdgeData(id, nodeId),
    }))
    .sort((a, b) => b.pagerank - a.pagerank)
    .slice(0, limit);

  for (let i = 0; i < neighbors.length; i++) {
    const neighbor = neighbors[i];
    const { server } = parseNodeId(neighbor.id);
    const neighborType = getNodeType(neighbor.id);
    collector.add(
      neighbor.id,
      getNodeDisplayName(neighbor.id, neighborType, capabilityNames),
      neighborType,
      neighborType === "capability" ? undefined : server,
      "neighbors",
      neighbor.pagerank,
      i + 1,
      { edgeWeight: neighbor.edgeData?.weight ?? null, edgeType: neighbor.edgeData?.edge_type ?? null },
    );
  }
}

function collectAdamicAdarInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
): void {
  const related = ctx.graphEngine.computeAdamicAdar(nodeId, limit);
  for (let i = 0; i < related.length; i++) {
    const r = related[i];
    const { server, name } = parseNodeId(r.toolId);
    collector.add(r.toolId, name, "tool", server, "adamic_adar", r.score, i + 1);
  }
}

async function collectHyperedgeInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
): Promise<void> {
  if (!ctx.capabilityDataService) return;

  const capList = await ctx.capabilityDataService.listCapabilities({ limit: 100 });
  const sourceCapability = capList.capabilities.find((c) => c.id === nodeId);

  if (!sourceCapability || sourceCapability.toolsUsed.length === 0) return;

  const sourceTools = new Set(sourceCapability.toolsUsed);
  const overlaps = capList.capabilities
    .filter((c) => c.id !== nodeId)
    .map((c) => {
      const sharedCount = c.toolsUsed.filter((t) => sourceTools.has(t)).length;
      const unionCount = new Set([...sourceCapability.toolsUsed, ...c.toolsUsed]).size;
      const jaccardScore = unionCount > 0 ? sharedCount / unionCount : 0;
      return { capability: c, sharedCount, jaccardScore };
    })
    .filter((o) => o.sharedCount > 0)
    .sort((a, b) => b.jaccardScore - a.jaccardScore)
    .slice(0, limit);

  for (let i = 0; i < overlaps.length; i++) {
    const overlap = overlaps[i];
    collector.add(
      overlap.capability.id,
      overlap.capability.name || overlap.capability.id,
      "capability",
      undefined,
      "hyperedge",
      overlap.jaccardScore,
      i + 1,
      { sharedTools: overlap.sharedCount },
    );
  }
}

async function collectCoOccurrenceInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
): Promise<void> {
  if (!ctx.capabilityDataService) return;

  const cooccurring = await ctx.capabilityDataService.findCoOccurringCapabilities(nodeId, limit);
  for (let i = 0; i < cooccurring.length; i++) {
    const co = cooccurring[i];
    const normalizedScore = Math.min(1.0, Math.log10(co.cooccurrenceCount + 1) / 2);
    collector.add(
      co.capabilityId,
      co.name || co.capabilityId,
      "capability",
      undefined,
      "co_occurrence",
      normalizedScore,
      i + 1,
      { count: co.cooccurrenceCount, lastSeen: co.lastSeen },
    );
  }
}

async function collectSpectralInsights(
  collector: InsightCollector,
  nodeId: string,
  limit: number,
  ctx: RouteContext,
): Promise<void> {
  if (!ctx.dagSuggester || !ctx.capabilityDataService) return;

  const pageranks = ctx.dagSuggester.getCapabilityPageranks();
  if (pageranks.size === 0) return;

  const capList = await ctx.capabilityDataService.listCapabilities({ limit: 100 });
  ctx.dagSuggester.ensurePageranksComputed(
    capList.capabilities.map((c) => ({ id: c.id, toolsUsed: c.toolsUsed })),
  );

  const sourcePagerank = pageranks.get(nodeId) || 0;
  if (sourcePagerank === 0) return;

  const spectralPeers = capList.capabilities
    .filter((c) => c.id !== nodeId && pageranks.has(c.id))
    .map((c) => {
      const pr = pageranks.get(c.id) || 0;
      return { capability: c, pagerank: pr, distance: Math.abs(pr - sourcePagerank) };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  for (let i = 0; i < spectralPeers.length; i++) {
    const peer = spectralPeers[i];
    collector.add(
      peer.capability.id,
      peer.capability.name || peer.capability.id,
      "capability",
      undefined,
      "spectral",
      1 - peer.distance,
      i + 1,
      { pagerank: peer.pagerank },
    );
  }
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * GET /api/graph/insights
 *
 * Query params:
 * - node_id: Node ID to find insights for (required)
 * - limit: Max results per algorithm (default: 10)
 *
 * Algorithms included:
 * - louvain: Community members (same Louvain cluster)
 * - neighbors: Direct neighbors sorted by PageRank
 * - adamic_adar: Adamic-Adar similarity (for tools)
 * - hyperedge: Capabilities sharing tools (hyperedge overlap)
 * - spectral: Same spectral cluster
 * - co_occurrence: Capabilities that co-occur in execution traces
 */
export async function handleGraphInsights(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const nodeId = url.searchParams.get("node_id") || "";
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!nodeId) {
    return errorResponse("Missing required parameter: 'node_id'", 400, corsHeaders);
  }

  const isCapability = nodeId.startsWith("cap:") || !nodeId.includes(":");
  const nodeType: NodeType = isCapability ? "capability" : "tool";

  // Build capability name lookup
  const capabilityNames = new Map<string, string>();
  if (ctx.capabilityDataService) {
    try {
      const capList = await ctx.capabilityDataService.listCapabilities({ limit: 200 });
      for (const cap of capList.capabilities) {
        capabilityNames.set(cap.id, cap.name || cap.id);
      }
    } catch (e) {
      log.warn(`Failed to build capability names lookup: ${e}`);
    }
  }

  const collector = new InsightCollector();

  // Collect insights from all algorithms (errors logged but don't stop processing)
  try {
    await collectLouvainInsights(collector, nodeId, limit, ctx, capabilityNames);
  } catch (e) {
    log.warn(`Louvain failed for ${nodeId}: ${e}`);
  }

  try {
    collectNeighborInsights(collector, nodeId, limit, ctx, capabilityNames);
  } catch (e) {
    log.warn(`Neighbors failed for ${nodeId}: ${e}`);
  }

  if (nodeType === "tool") {
    try {
      collectAdamicAdarInsights(collector, nodeId, limit, ctx);
    } catch (e) {
      log.warn(`Adamic-Adar failed for ${nodeId}: ${e}`);
    }
  }

  if (nodeType === "capability") {
    try {
      await collectHyperedgeInsights(collector, nodeId, limit, ctx);
    } catch (e) {
      log.warn(`Hyperedge overlap failed for ${nodeId}: ${e}`);
    }

    try {
      await collectCoOccurrenceInsights(collector, nodeId, limit, ctx);
    } catch (e) {
      log.warn(`Co-occurrence failed for ${nodeId}: ${e}`);
    }
  }

  try {
    await collectSpectralInsights(collector, nodeId, limit, ctx);
  } catch (e) {
    log.warn(`Spectral clustering failed for ${nodeId}: ${e}`);
  }

  const items = collector.finalize();
  const algorithmStats = calculateAlgorithmStats(items);

  const response: InsightsResponse = { nodeId, nodeType, items, algorithmStats };
  return jsonResponse(response, 200, corsHeaders);
}
