import neo4j from 'neo4j-driver';

import { type ArticleStructureSearchPort, type EmbeddingPort } from '@casys/application';
import { type ArticleSearchResult } from '@casys/core';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jArticleStructureSearchAdapter implements ArticleStructureSearchPort {
  private readonly logger = createLogger('Neo4jArticleStructureSearchAdapter');

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  async searchArticlesByEmbedding(
    queryText: string,
    tenantId?: string,
    limit = 10,
    threshold = 0.6
  ): Promise<ArticleSearchResult[]> {
    if (!this.embeddingService) return [];

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    try {
      const rows = await this.conn.query<Record<string, unknown>>(
        `CALL db.index.vector.queryNodes('article_embedding_index', $limit, $queryEmbedding)
         YIELD node, score
         WHERE score >= $threshold ${tenantId ? 'AND node.tenant_id = $tenantId' : ''}
         RETURN node.id AS id,
                node.slug AS slug,
                node.title AS title,
                node.description AS description,
                score AS score
         LIMIT $limit`,
        { queryEmbedding, threshold, limit: neo4j.int(limit), tenantId },
        'READ'
      );

      return rows.map(r => ({
        articleId: String(r.id),
        articleTitle: typeof r.title === 'string' ? r.title : '',
        articleSlug: typeof r.slug === 'string' ? r.slug : undefined,
        articleTags: [],
        relevanceScore: Number(r.score ?? 0),
      }));
    } catch (e) {
      this.logger.warn('Vector search failed for articles', e);
      return [];
    }
  }

  async searchSectionsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit = 10,
    threshold = 0.6
  ): Promise<ArticleSearchResult[]> {
    if (!this.embeddingService) return [];

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    try {
      const rows = await this.conn.query<Record<string, unknown>>(
        `CALL db.index.vector.queryNodes('section_embedding_index', $limit, $queryEmbedding)
         YIELD node, score
         WITH node, score
         MATCH (a:Article)-[:HAS_SECTION]->(node)
         WHERE score >= $threshold ${tenantId ? 'AND a.tenant_id = $tenantId' : ''}
         RETURN a.id AS id,
                a.slug AS slug,
                a.title AS title,
                node.title AS sectionTitle,
                node.content AS sectionContent,
                score AS score
         LIMIT $limit`,
        { queryEmbedding, threshold, limit: neo4j.int(limit), tenantId },
        'READ'
      );

      return rows.map(r => ({
        articleId: String(r.id),
        articleTitle: typeof r.title === 'string' ? r.title : '',
        articleSlug: typeof r.slug === 'string' ? r.slug : undefined,
        sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : undefined,
        sectionContent: typeof r.sectionContent === 'string' ? r.sectionContent : undefined,
        relevanceScore: Number(r.score ?? 0),
      }));
    } catch (e) {
      this.logger.warn('Vector search failed for sections', e);
      return [];
    }
  }

  async searchTextFragmentsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit = 10,
    threshold = 0.7
  ): Promise<(ArticleSearchResult & { fragmentId: string; fragmentContent: string })[]> {
    if (!this.embeddingService) return [];

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);
    // Use cosine via array_dot_product; no vector index assumed for TextFragment
    const cypher = `
      MATCH (a:Article)-[:HAS_SECTION]->(s:Section)-[:HAS_TEXT_FRAGMENT]->(f:TextFragment)
      WHERE f.embedding IS NOT NULL ${tenantId ? 'AND a.tenant_id = $tenantId' : ''}
      WITH a, s, f,
           (array_dot_product(CAST(f.embedding AS FLOAT[]), CAST($queryEmbedding AS FLOAT[])) /
            (sqrt(array_dot_product(CAST(f.embedding AS FLOAT[]), CAST(f.embedding AS FLOAT[]))) *
             sqrt(array_dot_product(CAST($queryEmbedding AS FLOAT[]), CAST($queryEmbedding AS FLOAT[]))))) AS similarity
      WHERE similarity >= $threshold
      RETURN a.id AS articleId,
             a.title AS articleTitle,
             s.id AS sectionId,
             s.title AS sectionTitle,
             f.id AS fragmentId,
             f.content AS fragmentContent,
             similarity AS relevanceScore
      ORDER BY similarity DESC
      LIMIT $limit`;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { queryEmbedding, tenantId, threshold, limit },
      'READ'
    );

    return rows.map(r => ({
      articleId: String(r.articleId),
      articleTitle: typeof r.articleTitle === 'string' ? r.articleTitle : '',
      sectionId: String(r.sectionId),
      sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : '',
      fragmentId: String(r.fragmentId),
      fragmentContent: typeof r.fragmentContent === 'string' ? r.fragmentContent : '',
      relevanceScore: Number(r.relevanceScore ?? 0),
    }));
  }

  async searchCommentsByEmbedding(
    queryText: string,
    tenantId?: string,
    limit = 10,
    threshold = 0.7
  ): Promise<
    (ArticleSearchResult & { commentId: string; commentContent: string; fragmentContent: string })[]
  > {
    if (!this.embeddingService) return [];
    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    const cypher = `
      MATCH (a:Article)-[:HAS_SECTION]->(s:Section)-[:HAS_TEXT_FRAGMENT]->(f:TextFragment)-[:HAS_COMMENT]->(c:Comment)
      WHERE c.embedding IS NOT NULL ${tenantId ? 'AND a.tenant_id = $tenantId' : ''}
      WITH a, s, f, c,
           (array_dot_product(CAST(c.embedding AS FLOAT[]), CAST($queryEmbedding AS FLOAT[])) /
            (sqrt(array_dot_product(CAST(c.embedding AS FLOAT[]), CAST(c.embedding AS FLOAT[]))) *
             sqrt(array_dot_product(CAST($queryEmbedding AS FLOAT[]), CAST($queryEmbedding AS FLOAT[]))))) AS similarity
      WHERE similarity >= $threshold
      RETURN a.id AS articleId,
             a.title AS articleTitle,
             s.id AS sectionId,
             s.title AS sectionTitle,
             f.id AS fragmentId,
             f.content AS fragmentContent,
             c.id AS commentId,
             c.content AS commentContent,
             similarity AS relevanceScore
      ORDER BY similarity DESC
      LIMIT $limit`;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { queryEmbedding, tenantId, threshold, limit },
      'READ'
    );

    return rows.map(r => ({
      articleId: String(r.articleId),
      articleTitle: typeof r.articleTitle === 'string' ? r.articleTitle : '',
      sectionId: String(r.sectionId),
      sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : '',
      fragmentId: String(r.fragmentId),
      fragmentContent: typeof r.fragmentContent === 'string' ? r.fragmentContent : '',
      commentId: String(r.commentId),
      commentContent: typeof r.commentContent === 'string' ? r.commentContent : '',
      relevanceScore: Number(r.relevanceScore ?? 0),
    }));
  }

  async searchArticlesByTagsAndSemantic(params: {
    queryText: string;
    tags?: string[];
    projectId: string;
    tenantId: string;
    limit?: number;
    semanticWeight?: number;
    threshold?: number;
  }): Promise<ArticleSearchResult[]> {
    const {
      queryText,
      tags = [],
      projectId,
      tenantId,
      limit = 10,
      semanticWeight = 0.5,
      threshold = 0.65,
    } = params;

    if (!this.embeddingService) return [];

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    try {
      const cypher =
        tags.length > 0
          ? `CALL db.index.vector.queryNodes('article_embedding_index', $limit, $queryEmbedding)
           YIELD node, score AS vectorScore
           WITH node, vectorScore
           MATCH (node)-[:ARTICLE_HAS_TAG]->(t:KeywordTag)
           WHERE node.tenant_id = $tenantId AND node.project_id = $projectId AND t.label IN $tags AND t.tenant_id = $tenantId AND t.project_id = $projectId
           WITH node, vectorScore, count(DISTINCT t) AS tagCount
           WITH node, (vectorScore * $semanticWeight + (toFloat(tagCount) / size($tags)) * (1 - $semanticWeight)) AS compositeScore
           WHERE compositeScore >= $threshold
           RETURN node.id AS id, node.slug AS slug, node.title AS title, node.description AS description, compositeScore AS score
           ORDER BY compositeScore DESC
           LIMIT $limit`
          : `CALL db.index.vector.queryNodes('article_embedding_index', $limit, $queryEmbedding)
           YIELD node, score
           WHERE node.tenant_id = $tenantId AND node.project_id = $projectId AND score >= $threshold
           RETURN node.id AS id, node.slug AS slug, node.title AS title, node.description AS description, score
           ORDER BY score DESC
           LIMIT $limit`;

      const rows = await this.conn.query<Record<string, unknown>>(
        cypher,
        { queryEmbedding, tags, tenantId, projectId, semanticWeight, threshold, limit },
        'READ'
      );

      return rows.map(r => ({
        id: String(r.id),
        slug: String(r.slug ?? ''),
        title: String(r.title ?? ''),
        description: (r.description as string) ?? undefined,
        score: Number(r.score ?? 0),
      }));
    } catch (e) {
      this.logger.warn('Hybrid search failed for articles', e);
      return [];
    }
  }

  async searchSectionsByTagsAndSemantic(params: {
    queryText: string;
    tags?: string[];
    projectId: string;
    tenantId: string;
    limit?: number;
    semanticWeight?: number;
    threshold?: number;
  }): Promise<ArticleSearchResult[]> {
    const {
      queryText,
      tags = [],
      projectId,
      tenantId,
      limit = 10,
      semanticWeight = 0.6,
      threshold = 0.65,
    } = params;
    if (!this.embeddingService) {
      this.logger.warn('EmbeddingService not available, skip hybrid search');
      return [];
    }

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    // Validate embedding
    const hasInvalidValues = queryEmbedding.some(
      (v: number) => !Number.isFinite(v) || v < -1e10 || v > 1e10
    );
    if (hasInvalidValues) {
      this.logger.error('Invalid embedding values detected', {
        length: queryEmbedding.length,
        sample: queryEmbedding.slice(0, 5),
        hasNaN: queryEmbedding.some((v: number) => Number.isNaN(v)),
        hasInfinity: queryEmbedding.some((v: number) => !Number.isFinite(v)),
      });
      return [];
    }

    this.logger.debug('[searchSections] Query params', {
      projectId,
      tenantId,
      tagsCount: tags.length,
      embeddingDim: queryEmbedding.length,
      embeddingSample: queryEmbedding.slice(0, 3),
      threshold,
      limit,
      limitCandidates: Math.max(limit * 4, 20),
    });

    try {
      const cypher = `
        CALL db.index.vector.queryNodes('section_embedding_index', toInteger($limitCandidates), $queryEmbedding)
        YIELD node, score AS vectorScore
        WITH node, vectorScore
        MATCH (a:Article)-[:HAS_SECTION]->(node)
        WHERE a.project_id = $projectId AND a.tenant_id = $tenantId
        ${tags.length > 0 ? 'OPTIONAL MATCH (a)-[:ARTICLE_HAS_TAG]->(t:KeywordTag) WHERE t.label IN $tags AND t.tenant_id = $tenantId AND t.project_id = $projectId' : ''}
        WITH node, a, vectorScore, ${tags.length > 0 ? 'count(DISTINCT t) AS tagCount' : '0 AS tagCount'}
        WITH node, a, vectorScore,
             CASE WHEN $tagsCount = 0 THEN vectorScore
                  ELSE (vectorScore * $semanticWeight + (toFloat(tagCount) / toFloat($tagsCount)) * (1.0 - $semanticWeight)) END AS compositeScore
        WHERE compositeScore >= $threshold
        RETURN a.id AS articleId,
               a.title AS articleTitle,
               node.id AS sectionId,
               node.title AS sectionTitle,
               node.content AS sectionContent,
               compositeScore AS relevanceScore
        ORDER BY compositeScore DESC
        LIMIT $limit`;

      const rows = await this.conn.query<Record<string, unknown>>(
        cypher,
        {
          queryEmbedding,
          projectId,
          tenantId,
          tags,
          tagsCount: neo4j.int(tags.length),
          semanticWeight,
          threshold,
          limit: neo4j.int(limit),
          limitCandidates: neo4j.int(Math.max(limit * 4, 20)),
        },
        'READ'
      );

      return rows.map(r => ({
        articleId: String(r.articleId),
        articleTitle: typeof r.articleTitle === 'string' ? r.articleTitle : '',
        sectionId: String(r.sectionId),
        sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : '',
        sectionContent: typeof r.sectionContent === 'string' ? r.sectionContent : undefined,
        relevanceScore: Number(r.relevanceScore ?? 0),
      }));
    } catch (e) {
      this.logger.warn('Hybrid search failed for sections', e);
      return [];
    }
  }

  async searchSectionsHybrid(
    queryText: string,
    tenantId?: string,
    limit = 10
  ): Promise<ArticleSearchResult[]> {
    if (!this.embeddingService) return [];
    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    // Compute limitCandidates
    const limitCandidates = Math.max(limit * 4, 20);

    // Diagnostic log to trace numeric values before query
    this.logger.debug('[searchSectionsHybrid] Query params', {
      limit,
      limitType: typeof limit,
      limitIsFinite: Number.isFinite(limit),
      limitCandidates,
      limitCandidatesType: typeof limitCandidates,
      limitCandidatesIsFinite: Number.isFinite(limitCandidates),
      tenantId,
    });

    // Neo4j: use the section vector index; compute base score from index score and omit parent/child context
    /*cypher*/
    const cypher = `
      CALL db.index.vector.queryNodes('section_embedding_index', toInteger($limitCandidates), $queryEmbedding)
      YIELD node, score
      WITH node, score
      MATCH (a:Article)-[:HAS_SECTION]->(node)
      ${tenantId ? 'WHERE a.tenant_id = $tenantId' : ''}
      RETURN a.id AS articleId,
             a.title AS articleTitle,
             node.id AS sectionId,
             node.title AS sectionTitle,
             substring(node.content, 0, 200) AS sectionContentPreview,
             score AS baseRelevanceScore,
             0.0 AS parentContextScore,
             0.0 AS childrenContextScore,
             score AS relevanceScore
      ORDER BY score DESC
      LIMIT $limit`;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { queryEmbedding, tenantId, limit, limitCandidates },
      'READ'
    );

    return rows.map(r => ({
      articleId: String(r.articleId),
      articleTitle: typeof r.articleTitle === 'string' ? r.articleTitle : '',
      sectionId: String(r.sectionId),
      sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : '',
      sectionContentPreview:
        typeof r.sectionContentPreview === 'string' ? r.sectionContentPreview : '',
      baseRelevanceScore: Number(r.baseRelevanceScore ?? 0),
      parentContextScore: Number(r.parentContextScore ?? 0),
      childrenContextScore: Number(r.childrenContextScore ?? 0),
      relevanceScore: Number(r.relevanceScore ?? 0),
    }));
  }

  async searchSectionsByGraphNeighborhood(
    articleId: string,
    position: number,
    window = 5,
    tenantId?: string,
    projectId?: string,
    limit = 10
  ): Promise<ArticleSearchResult[]> {
    const cypher = `
      MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} ${projectId ? ', project_id: $projectId' : ''} })-[:HAS_SECTION]->(s:Section)
      WHERE s.position <> $position AND abs(s.position - $position) <= $window
      WITH a, s, abs(s.position - $position) AS distance
      ORDER BY distance ASC
      LIMIT $limit
      RETURN a.id AS id,
             a.slug AS slug,
             a.title AS title,
             s.title AS sectionTitle,
             s.content AS sectionContent,
             (1.0 / (1.0 + toFloat(distance))) AS score
    `;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { articleId, position, window, tenantId, projectId, limit },
      'READ'
    );

    return rows.map(r => ({
      articleId: String(r.id),
      articleTitle: typeof r.title === 'string' ? r.title : '',
      articleSlug: typeof r.slug === 'string' ? r.slug : undefined,
      sectionTitle: typeof r.sectionTitle === 'string' ? r.sectionTitle : undefined,
      sectionContent: typeof r.sectionContent === 'string' ? r.sectionContent : undefined,
      relevanceScore: Number(r.score ?? 0),
    }));
  }
}
