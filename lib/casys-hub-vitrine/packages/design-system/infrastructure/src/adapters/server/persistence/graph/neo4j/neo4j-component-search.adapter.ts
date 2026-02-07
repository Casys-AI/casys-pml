import { type ComponentDefinition } from '@casys/core';
import { type ComponentSearchPort, type EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jComponentSearchAdapter implements ComponentSearchPort {
  private readonly logger = createLogger('Neo4jComponentSearchAdapter');

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  async searchComponentsWithContext(
    query: string,
    context: {
      tenantId?: string;
      projectId?: string;
      categories?: string[];
      tags?: string[];
      minSimilarity?: number;
    },
    limit = 20
  ): Promise<{ id: string; score: number; metadata: Partial<ComponentDefinition> }[]> {
    if (!this.embeddingService) {
      this.logger.warn('Embedding service not available for component search');
      return [];
    }

    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    const { categories = [], tags = [], minSimilarity = 0.7 } = context;

    try {
      // Graph RAG: vector similarity + usage signals
      const cypher = `
        CALL db.index.vector.queryNodes('component_embedding_index', toInteger($candidateLimit), $queryEmbedding)
        YIELD node, score AS vectorScore
        WITH node, vectorScore
        WHERE vectorScore >= $minSimilarity
          ${categories.length > 0 ? 'AND node.category IN $categories' : ''}
          ${tags.length > 0 ? 'AND any(tag IN node.tags WHERE tag IN $tags)' : ''}
        
        // Graph signals: count usage across sections
        OPTIONAL MATCH (s:Section)-[:USES_COMPONENT]->(node)
        WITH node, vectorScore, count(DISTINCT s) AS usageCount
        
        // Composite score: 70% vector + 30% popularity (normalized to max 10 usages)
        WITH node, vectorScore, usageCount,
             (vectorScore * 0.7 + (toFloat(usageCount) / 10.0) * 0.3) AS compositeScore
        
        ORDER BY compositeScore DESC
        LIMIT $limit
        
        RETURN node.id AS id,
               node.name AS name,
               node.path AS path,
               node.description AS description,
               node.category AS category,
               node.tags AS tags,
               node.props_json AS propsJson,
               compositeScore AS score,
               vectorScore,
               usageCount
      `;

      const rows = await this.conn.query<Record<string, unknown>>(
        cypher,
        {
          queryEmbedding,
          candidateLimit: Math.max(limit * 4, 40),
          minSimilarity,
          categories,
          tags,
          limit,
        },
        'READ'
      );

      return rows.map(r => {
        let props = undefined;
        try {
          props = r.propsJson ? JSON.parse(String(r.propsJson)) : undefined;
        } catch {
          props = undefined;
        }

        return {
          id: String(r.id),
          score: Number(r.score ?? 0),
          metadata: {
            id: String(r.id),
            name: String(r.name ?? r.id),
            path: (r.path as string) ?? undefined,
            description: (r.description as string) ?? undefined,
            category: (r.category as string) ?? undefined,
            tags: (r.tags as string[]) ?? [],
            props,
          },
        };
      });
    } catch (e) {
      this.logger.error('Component search failed', e);
      return [];
    }
  }
}
