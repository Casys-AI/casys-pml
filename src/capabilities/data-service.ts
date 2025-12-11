/**
 * Capability Data Service (Epic 8 - Story 8.1)
 *
 * Provides API data layer for capabilities and hypergraph visualization.
 * Queries workflow_pattern table and builds graph-ready data for D3.js visualization.
 *
 * Note: Migration from Cytoscape.js to D3.js completed in cb15d9e.
 * Type aliases CytoscapeNode/CytoscapeEdge kept for backward compatibility.
 *
 * @module capabilities/data-service
 */

import type { PGliteClient } from "../db/client.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type {
  CapabilityFilters,
  CapabilityListResponseInternal,
  CapabilityResponseInternal,
  CytoscapeEdge,
  CytoscapeNode,
  HypergraphOptions,
  HypergraphResponseInternal,
} from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * CapabilityDataService - API data layer for capabilities
 *
 * Provides structured access to capability data for REST API endpoints.
 * Handles filtering, pagination, and Cytoscape graph formatting.
 *
 * @example
 * ```typescript
 * const service = new CapabilityDataService(db, graphEngine);
 *
 * // List capabilities with filters
 * const list = await service.listCapabilities({
 *   minSuccessRate: 0.7,
 *   limit: 50,
 * });
 *
 * // Build hypergraph data
 * const hypergraph = await service.buildHypergraphData({
 *   includeTools: true,
 * });
 * ```
 */
export class CapabilityDataService {
  constructor(
    private db: PGliteClient,
    private graphEngine: GraphRAGEngine,
  ) {
    logger.debug("CapabilityDataService initialized");
  }

  /**
   * List capabilities with filtering and pagination
   *
   * @param filters Query filters and pagination options
   * @returns List of capabilities with pagination metadata
   */
  async listCapabilities(
    filters: CapabilityFilters = {},
  ): Promise<CapabilityListResponseInternal> {
    const {
      communityId,
      minSuccessRate = 0,
      minUsage = 0,
      limit = 50,
      offset = 0,
      sort = "usageCount",
      order = "desc",
    } = filters;

    // Validate and cap limit
    const cappedLimit = Math.min(limit, 100);

    // Map internal sort field to DB column
    const sortFieldMap: Record<string, string> = {
      usageCount: "usage_count",
      successRate: "success_rate",
      lastUsed: "last_used",
      createdAt: "created_at",
    };
    const dbSortField = sortFieldMap[sort] || "usage_count";

    logger.debug("Listing capabilities", {
      filters: {
        communityId,
        minSuccessRate,
        minUsage,
        limit: cappedLimit,
        offset,
        sort,
        order,
      },
    });

    try {
      // Build WHERE clause dynamically
      const conditions: string[] = ["code_hash IS NOT NULL"];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (communityId !== undefined) {
        conditions.push(`community_id = $${paramIndex++}`);
        params.push(communityId);
      }

      conditions.push(`success_rate >= $${paramIndex++}`);
      params.push(minSuccessRate);

      conditions.push(`usage_count >= $${paramIndex++}`);
      params.push(minUsage);

      const whereClause = conditions.join(" AND ");

      // Query capabilities
      const query = `
        SELECT
          pattern_id as id,
          name,
          description,
          code_snippet,
          dag_structure->'toolsUsed' as tools_used,
          success_rate,
          usage_count,
          avg_duration_ms,
          community_id,
          created_at,
          last_used,
          source,
          CASE
            WHEN description IS NOT NULL AND LENGTH(description) > 100
            THEN SUBSTRING(description, 1, 97) || '...'
            ELSE description
          END as intent_preview
        FROM workflow_pattern
        WHERE ${whereClause}
        ORDER BY ${dbSortField} ${order.toUpperCase()}
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `;
      params.push(cappedLimit, offset);

      const result = await this.db.query(query, params);

      // Count total matching records
      const countQuery = `
        SELECT COUNT(*) as total
        FROM workflow_pattern
        WHERE ${whereClause}
      `;
      const countResult = await this.db.query(
        countQuery,
        params.slice(0, params.length - 2),
      ); // Exclude limit/offset
      const total = Number(countResult[0]?.total || 0);

      // Map rows to response objects
      const capabilities: CapabilityResponseInternal[] = result.map(
        (row: Record<string, unknown>) => {
          // Parse tools_used from JSONB
          let toolsUsed: string[] = [];
          if (row.tools_used) {
            try {
              // Handle both string and array formats
              if (typeof row.tools_used === "string") {
                toolsUsed = JSON.parse(row.tools_used);
              } else if (Array.isArray(row.tools_used)) {
                toolsUsed = row.tools_used;
              }
            } catch (error) {
              logger.warn("Failed to parse tools_used", { error, row: row.id });
            }
          }

          return {
            id: String(row.id),
            name: row.name ? String(row.name) : null,
            description: row.description ? String(row.description) : null,
            codeSnippet: String(row.code_snippet || ""),
            toolsUsed,
            successRate: Number(row.success_rate || 0),
            usageCount: Number(row.usage_count || 0),
            avgDurationMs: Number(row.avg_duration_ms || 0),
            communityId: row.community_id !== null && row.community_id !== undefined
              ? Number(row.community_id)
              : null,
            intentPreview: String(row.intent_preview || row.description || ""),
            createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : "",
            lastUsed: row.last_used ? new Date(String(row.last_used)).toISOString() : "",
            source: (row.source as "emergent" | "manual") || "emergent",
          };
        },
      );

      logger.info("Capabilities listed", {
        count: capabilities.length,
        total,
        limit: cappedLimit,
        offset,
      });

      return {
        capabilities,
        total,
        limit: cappedLimit,
        offset,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to list capabilities", { error: errorMsg });
      throw new Error(`Failed to list capabilities: ${errorMsg}`);
    }
  }

  /**
   * Build hypergraph data for D3.js visualization
   *
   * Creates a compound graph with:
   * - Capability nodes (parents)
   * - Tool nodes (children or standalone)
   * - Hierarchical edges (capability → tool)
   * - Capability links (shared tools)
   *
   * Note: Migrated from Cytoscape.js to D3.js for hyperedge support.
   *
   * @param options Hypergraph build options
   * @returns Graph-ready hypergraph data for D3.js force-directed layout
   */
  async buildHypergraphData(
    options: HypergraphOptions = {},
  ): Promise<HypergraphResponseInternal> {
    const {
      includeTools = true,
      minSuccessRate = 0,
      minUsage = 0,
    } = options;

    logger.debug("Building hypergraph data", { options });

    try {
      // 1. Fetch capabilities
      const capabilityList = await this.listCapabilities({
        minSuccessRate,
        minUsage,
        limit: 100, // Reasonable max for visualization
      });

      const capabilities = capabilityList.capabilities;
      const nodes: CytoscapeNode[] = [];
      const edges: CytoscapeEdge[] = [];

      // Track tools for deduplication
      const toolsInCapabilities = new Set<string>();
      const capabilityToolsMap = new Map<string, Set<string>>(); // cap-id -> tool IDs

      // Get graph snapshot ONCE before loops (Fix #24: Performance N+1)
      let graphSnapshot = null;
      try {
        graphSnapshot = this.graphEngine.getGraphSnapshot();
      } catch (error) {
        logger.warn("Failed to get graph snapshot, tool metrics unavailable", { error });
      }

      // 2. Create capability nodes and hierarchical edges
      for (const cap of capabilities) {
        const capId = `cap-${cap.id}`;

        // Create capability node
        nodes.push({
          data: {
            id: capId,
            type: "capability",
            label: cap.name || cap.intentPreview.substring(0, 50),
            codeSnippet: cap.codeSnippet,
            successRate: cap.successRate,
            usageCount: cap.usageCount,
            toolsCount: cap.toolsUsed.length,
          },
        });

        // Create tool nodes as children and hierarchical edges
        const toolSet = new Set<string>();
        for (const toolId of cap.toolsUsed) {
          toolsInCapabilities.add(toolId);
          toolSet.add(toolId);

          // Extract server and name from tool_id
          const [server = "unknown", ...nameParts] = toolId.split(":");
          const name = nameParts.join(":") || toolId;

          // Get PageRank and degree from graph snapshot (already fetched)
          let pagerank = 0;
          let degree = 0;
          if (graphSnapshot) {
            const toolNode = graphSnapshot.nodes.find((n) => n.id === toolId);
            if (toolNode) {
              pagerank = toolNode.pagerank || 0;
              degree = toolNode.degree || 0;
            }
          }

          // Add tool node as child of capability
          nodes.push({
            data: {
              id: toolId,
              parent: capId,
              type: "tool",
              server,
              label: name,
              pagerank,
              degree,
            },
          });

          // Add hierarchical edge (capability → tool)
          edges.push({
            data: {
              id: `edge-${capId}-${toolId}`,
              source: capId,
              target: toolId,
              edgeType: "hierarchy",
              edgeSource: "observed",
              observedCount: cap.usageCount, // Use capability usage as proxy
            },
          });
        }

        capabilityToolsMap.set(capId, toolSet);
      }

      // 3. Create capability link edges (shared tools)
      const capIds = Array.from(capabilityToolsMap.keys());
      for (let i = 0; i < capIds.length; i++) {
        for (let j = i + 1; j < capIds.length; j++) {
          const capId1 = capIds[i];
          const capId2 = capIds[j];
          const tools1 = capabilityToolsMap.get(capId1)!;
          const tools2 = capabilityToolsMap.get(capId2)!;

          // Count shared tools
          const sharedTools = Array.from(tools1).filter((t) => tools2.has(t)).length;

          if (sharedTools > 0) {
            edges.push({
              data: {
                id: `edge-${capId1}-${capId2}`,
                source: capId1,
                target: capId2,
                sharedTools,
                edgeType: "capability_link",
                edgeSource: "inferred",
              },
            });
          }
        }
      }

      // 4. Optionally include standalone tools
      if (includeTools) {
        try {
          const graphSnapshot = this.graphEngine.getGraphSnapshot();

          for (const toolNode of graphSnapshot.nodes) {
            const toolId = toolNode.id;

            // Skip tools already in capabilities
            if (toolsInCapabilities.has(toolId)) continue;

            // Add standalone tool node (no parent)
            nodes.push({
              data: {
                id: toolId,
                type: "tool",
                server: toolNode.server,
                label: toolNode.label,
                pagerank: toolNode.pagerank,
                degree: toolNode.degree,
              },
            });
          }
        } catch (error) {
          logger.warn("Failed to include standalone tools", { error });
        }
      }

      const result: HypergraphResponseInternal = {
        nodes,
        edges,
        capabilitiesCount: capabilities.length,
        toolsCount: nodes.filter((n) => n.data.type === "tool").length,
        metadata: {
          generatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      logger.info("Hypergraph data built", {
        capabilitiesCount: result.capabilitiesCount,
        toolsCount: result.toolsCount,
        nodesCount: result.nodes.length,
        edgesCount: result.edges.length,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to build hypergraph data", { error: errorMsg });
      throw new Error(`Failed to build hypergraph data: ${errorMsg}`);
    }
  }
}
