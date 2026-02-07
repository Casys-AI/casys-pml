import type { KeywordTagDTO } from '@casys/shared';
import {
  buildKeywordTagId,
  type KeywordTag,
  type KeywordTagSearchResult,
  slugifyKeyword,
} from '@casys/core';
import type {
  EmbeddingPort,
  GetProjectTagsParams,
  GetTagsForArticleParams,
  SearchSimilarTagsParams,
  TagRepositoryPort,
  UpsertArticleTagsParams,
} from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jTagRepositoryAdapter implements TagRepositoryPort {
  private readonly logger = createLogger('Neo4jTagRepositoryAdapter');
  private static readonly EXPECTED_EMBEDDING_DIM = 1536;

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  async upsertArticleTags(params: UpsertArticleTagsParams): Promise<void> {
    const { articleId, projectId, tenantId, tags, linkToKeywordPlan = true } = params;
    if (!tags || tags.length === 0) return;

    const now = Date.now();

    await this.conn.query(
      `MERGE (tenant:Tenant {id: $tenantId})
       MERGE (project:Project {id: $projectId})
       MERGE (article:Article {id: $articleId})
       SET project.tenant_id = COALESCE(project.tenant_id, $tenantId),
           article.tenant_id = COALESCE(article.tenant_id, $tenantId)
       MERGE (tenant)-[:TENANT_HAS_PROJECT]->(project)
       MERGE (project)-[:CONTAINS]->(article)`,
      { tenantId, projectId, articleId },
      'WRITE'
    );

    for (const tag of tags) {
      const candidate = tag.slug?.trim() ?? '';
      const baseForSlug = candidate.length > 0 ? candidate : tag.label;
      const safeSlug = slugifyKeyword(baseForSlug); // VO centralisé
      const tagId = buildKeywordTagId(tenantId, projectId, safeSlug);

      // Generate and validate embedding
      const embedding = await this.generateValidatedEmbedding(tag.label);

      const weightValueRaw =
        typeof tag.weight === 'number' && Number.isFinite(tag.weight) ? tag.weight : null;
      const weightValue =
        typeof weightValueRaw === 'number' ? Math.max(0, Math.min(1, weightValueRaw)) : null;

      // Blog strategy v2: extract priority and clusterType
      const tagWithBlogStrategy = tag as KeywordTagDTO;
      const priorityValue = typeof tagWithBlogStrategy.priority === 'number' 
        ? Math.max(1, Math.min(10, Math.round(tagWithBlogStrategy.priority)))
        : null;
      const clusterTypeValue = tagWithBlogStrategy.clusterType ?? null;

      await this.conn.query(
        `MERGE (t:KeywordTag {id: $tagId})
         ON CREATE SET t.created_at = $now,
                       t.embedding = $embedding,
                       t.embedding_text = $embeddingText,
                       t.sources = CASE WHEN $source IS NOT NULL THEN [$source] ELSE [] END
         SET t.label = $label,
             t.slug = $slug,
             t.source = COALESCE($source, t.source),
             t.sources = CASE
               WHEN $source IS NOT NULL AND NOT $source IN COALESCE(t.sources, [])
               THEN COALESCE(t.sources, []) + $source
               ELSE COALESCE(t.sources, [])
             END,
             t.weight = CASE WHEN $weight IS NULL THEN t.weight ELSE toFloat($weight) END,
             t.priority = CASE WHEN $priority IS NULL THEN t.priority ELSE toInteger($priority) END,
             t.cluster_type = CASE WHEN $clusterType IS NULL THEN t.cluster_type ELSE $clusterType END,
             t.tenant_id = $tenantId,
             t.project_id = $projectId,
             t.updated_at = $now`,
        {
          tagId,
          label: tag.label,
          slug: safeSlug,
          // Toujours passer une valeur définie; null si absent pour éviter ParameterMissing
          source: (tag as { source?: KeywordTagDTO['source'] }).source ?? null,
          weight: weightValue,
          priority: priorityValue,
          clusterType: clusterTypeValue,
          embedding,
          embeddingText: tag.label,
          tenantId,
          projectId,
          now,
        },
        'WRITE'
      );

      // Déduplication silencieuse (log supprimé pour performances)

      await this.conn.query(
        `MATCH (a:Article {id: $articleId})
         MATCH (t:KeywordTag {id: $tagId})
         MERGE (a)-[r:ARTICLE_HAS_TAG]->(t)
         ON CREATE SET r.source = 'article', r.created_at = $now
         ON MATCH SET r.updated_at = $now`,
        { articleId, tagId, now },
        'WRITE'
      );

      // Intelligent Tag -> KeywordPlan linking
      if (linkToKeywordPlan) {
        await this.linkTagToKeywordPlan(tagId, tenantId, projectId, tag.label, embedding);
      }
    }

    this.logger.log(`${tags.length} tags processed for article ${articleId}`);
  }

  /**
   * Génère et valide un embedding pour un label donné
   * @returns embedding validé ou null si échec/invalide
   */
  private async generateValidatedEmbedding(label: string): Promise<number[] | null> {
    if (!this.embeddingService) return null;

    try {
      const embedding = await this.embeddingService.generateEmbedding(label);

      // Validate embedding dimensions
      if (
        !embedding ||
        !Array.isArray(embedding) ||
        embedding.length !== Neo4jTagRepositoryAdapter.EXPECTED_EMBEDDING_DIM
      ) {
        this.logger.warn(
          `Invalid embedding for "${label}": expected ${Neo4jTagRepositoryAdapter.EXPECTED_EMBEDDING_DIM} dimensions, got ${Array.isArray(embedding) ? embedding.length : typeof embedding}`
        );
        return null;
      }

      return embedding;
    } catch (error) {
      this.logger.warn(`Failed to generate embedding for "${label}"`, error);
      return null;
    }
  }

  /**
   * Liaison intelligente d'un tag au KeywordPlan du projet
   * Stratégie:
   * 1. Déduplication exacte via INCLUDES ou SEED (même slug = même nœud)
   * 2. Matching vectoriel avec seeds (similarité ≥ 0.7)
   * 3. Fallback: tag orphelin (pas de lien au plan)
   */
  private async linkTagToKeywordPlan(
    tagId: string,
    tenantId: string,
    projectId: string,
    tagLabel: string,
    embedding: number[] | null
  ): Promise<void> {
    try {
      const now = Date.now();
      // 1. Vérifier si déjà inclus dans un KeywordPlan (dédup exacte via INCLUDES ou SEED)
      const exactMatch = await this.conn.query<{ planId: string }>(
        `MATCH (t:KeywordTag {id: $tagId})
         MATCH (kp:KeywordPlan)-[:INCLUDES|SEED]->(t)
         WHERE kp.tenant_id = $tenantId AND kp.project_id = $projectId
         RETURN kp.id as planId
         LIMIT 1`,
        { tagId, tenantId, projectId },
        'READ'
      );

      if (exactMatch.length > 0) {
        // Déjà lié, créer juste la relation inverse si besoin
        await this.conn.query(
          `MATCH (t:KeywordTag {id: $tagId})
           MATCH (kp:KeywordPlan {id: $planId})
           MERGE (t)-[r:PART_OF]->(kp)
           ON CREATE SET r.source = 'exact', r.created_at = $now
           ON MATCH SET r.updated_at = $now`,
          { tagId, planId: exactMatch[0].planId, now },
          'WRITE'
        );
        return;
      }

      // 2. Matching vectoriel avec seeds si embedding disponible
      if (embedding && this.embeddingService) {
        const closestSeed = await this.findClosestSeedTag(tenantId, projectId, embedding);

        if (closestSeed && closestSeed.score >= 0.7) {
          // Récupérer le KeywordPlan lié à ce seed
          const planForSeed = await this.conn.query<{ planId: string }>(
            `MATCH (seed:KeywordTag {id: $seedId})
             MATCH (kp:KeywordPlan)-[:SEED]->(seed)
             WHERE kp.tenant_id = $tenantId AND kp.project_id = $projectId
             RETURN kp.id as planId
             LIMIT 1`,
            { seedId: closestSeed.tagId, tenantId, projectId },
            'READ'
          );

          if (planForSeed.length > 0) {
            // Lier le tag au plan trouvé
            await this.conn.query(
              `MATCH (t:KeywordTag {id: $tagId})
               MATCH (kp:KeywordPlan {id: $planId})
               MERGE (t)-[r:PART_OF]->(kp)
               ON CREATE SET r.source = 'seed_similarity', r.created_at = $now
               ON MATCH SET r.updated_at = $now`,
              { tagId, planId: planForSeed[0].planId, now },
              'WRITE'
            );
            return;
          }
        }

        // 2bis. Fallback Top-K cluster: rapprocher le tag du KeywordPlan via moyenne des 10 tags les plus similaires
        try {
          const centroidRows = await this.conn.query<{ planId: string; avgSim: number }>(
            `//cypher
             MATCH (kp:KeywordPlan)
             WHERE kp.tenant_id = $tenantId AND kp.project_id = $projectId
             MATCH (kp)-[:INCLUDES|SEED]->(kt:KeywordTag)
             WHERE kt.embedding IS NOT NULL
             WITH kp, kt,
                  reduce(dot = 0.0, i IN range(0, size($embedding)-1) | dot + $embedding[i] * kt.embedding[i]) AS dotProduct,
                  reduce(normA = 0.0, i IN range(0, size($embedding)-1) | normA + $embedding[i]*$embedding[i]) AS normA,
                  reduce(normB = 0.0, i IN range(0, size(kt.embedding)-1) | normB + kt.embedding[i]*kt.embedding[i]) AS normB
             WITH kp, CASE WHEN sqrt(normA) = 0 OR sqrt(normB) = 0 THEN 0.0 ELSE dotProduct / (sqrt(normA) * sqrt(normB)) END AS sim
             ORDER BY kp.id, sim DESC
             WITH kp, collect(sim)[0..10] AS topSims
             WITH kp, reduce(s = 0.0, x IN topSims | s + x) / size(topSims) AS avgTopSim
             WHERE avgTopSim >= 0.65
             RETURN kp.id AS planId, avgTopSim AS avgSim
             ORDER BY avgTopSim DESC
             LIMIT 1`,
            { tenantId, projectId, embedding },
            'READ'
          );
          if (centroidRows.length > 0) {
            const best = centroidRows[0];
            await this.conn.query(
              `MATCH (t:KeywordTag {id: $tagId})
               MATCH (kp:KeywordPlan {id: $planId})
               MERGE (t)-[r:PART_OF]->(kp)
               ON CREATE SET r.source = 'plan_top_k_cluster', r.created_at = $now
               ON MATCH SET r.updated_at = $now`,
              { tagId, planId: best.planId, now },
              'WRITE'
            );
            return;
          }
        } catch {
          // Centroid fallback silent error
        }
      }

      // 3. Fallback: tag orphelin (pas de lien au plan)
      this.logger.warn(`Orphan tag: "${tagLabel}" (no matching KeywordPlan)`);
    } catch (e) {
      this.logger.warn(`Link failed for tag "${tagLabel}":`, e);
    }
  }

  /**
   * Trouve le seed tag le plus proche vectoriellement via l'index vectoriel Neo4j
   */
  private async findClosestSeedTag(
    tenantId: string,
    projectId: string,
    embedding: number[]
  ): Promise<{ tagId: string; score: number } | null> {
    try {
      const results = await this.conn.query<{ tagId: string; score: number }>(
        `CALL db.index.vector.queryNodes('tag_embedding_index', 10, $queryEmbedding)
         YIELD node, score
         WHERE node.tenant_id = $tenantId
           AND node.project_id = $projectId
           AND 'seed' IN node.sources
           AND score >= 0.7
         RETURN node.id as tagId, score
         ORDER BY score DESC
         LIMIT 1`,
        { tenantId, projectId, queryEmbedding: embedding },
        'READ'
      );

      return results.length > 0 ? results[0] : null;
    } catch (e) {
      this.logger.warn(`findClosestSeedTag failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async getTagsForArticle(params: GetTagsForArticleParams): Promise<KeywordTagDTO[]> {
    const { articleId, tenantId } = params;
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article {id: $articleId})-[:ARTICLE_HAS_TAG]->(t:KeywordTag)
       WHERE $tenantId IS NULL OR a.tenant_id = $tenantId
       RETURN t.label as label, t.slug as slug, t.source as source, t.weight as weight,
              t.priority as priority, t.cluster_type as clusterType`,
      { articleId, tenantId: tenantId ?? null },
      'READ'
    );
    return rows.map(toTagRow).filter(isTag);
  }

  async getProjectTags(params: GetProjectTagsParams): Promise<KeywordTagDTO[]> {
    const { projectId, tenantId } = params;
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (p:Project {id: $projectId})-[:CONTAINS]->(:Article)-[:ARTICLE_HAS_TAG]->(t:KeywordTag)
       WHERE $tenantId IS NULL OR p.tenant_id = $tenantId
       RETURN DISTINCT t.label as label, t.slug as slug, t.source as source, t.weight as weight,
                       t.priority as priority, t.cluster_type as clusterType`,
      { projectId, tenantId: tenantId ?? null },
      'READ'
    );
    return rows.map(toTagRow).filter(isTag);
  }

  async searchSimilarTags(params: SearchSimilarTagsParams): Promise<KeywordTagSearchResult[]> {
    const { queryText, projectId, tenantId, limit = 10, threshold = 0.7 } = params;

    if (this.embeddingService) {
      const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);
      const limitCandidates = Math.max(limit * 4, 20);
      try {
        const rows = await this.conn.query<Record<string, unknown>>(
          `CALL db.index.vector.queryNodes('tag_embedding_index', toInteger($limitCandidates), $queryEmbedding)
           YIELD node, score
           WITH node, score
           WHERE node.project_id = $projectId
             AND node.tenant_id = $tenantId
             AND score >= $threshold
           OPTIONAL MATCH (a:Article)-[:ARTICLE_HAS_TAG]->(node)
           WITH node as t, score as similarity, count(DISTINCT a) as usageCount
           WITH t, similarity, usageCount,
                (similarity * 0.7 + (toFloat(usageCount) / 10.0) * 0.3) as compositeScore
           ORDER BY compositeScore DESC, usageCount DESC
           LIMIT $limit
           RETURN t.label as label,
                  t.slug as slug,
                  t.source as source,
                  t.weight as weight,
                  t.priority as priority,
                  t.cluster_type as clusterType,
                  similarity as score,
                  usageCount`,
          { queryEmbedding, projectId, tenantId, threshold, limit, limitCandidates },
          'READ'
        );

        return rows.map(row => ({
          label: row.label as string,
          slug: (row.slug as string) ?? '',
          source: (row.source as KeywordTagSearchResult['source']) ?? 'seed',
          weight: row.weight as number | undefined,
          priority: row.priority as number | undefined,
          clusterType: row.clusterType as 'pillar' | 'cluster' | undefined,
          score: row.score as number,
          usageCount: row.usageCount as number,
        }));
      } catch (error) {
        this.logger.warn('Vector index query failed for tags; falling back to text match', error);
        // fallthrough to textual fallback below
      }
    }

    // Textual fallback: simple CONTAINS on label // REMOVE CAUSE NO FB
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (t:KeywordTag { tenant_id: $tenantId, project_id: $projectId })
       WHERE toLower(t.label) CONTAINS toLower($q)
       OPTIONAL MATCH (a:Article)-[:ARTICLE_HAS_TAG]->(t)
       WITH t, count(DISTINCT a) as usageCount
       RETURN t.label as label, t.slug as slug, t.source as source, t.weight as weight,
              t.priority as priority, t.cluster_type as clusterType,
              0.5 as score, usageCount
       ORDER BY usageCount DESC
       LIMIT $limit`,
      { tenantId, projectId, q: queryText, limit },
      'READ'
    );

    return rows.map(row => ({
      label: row.label as string,
      slug: (row.slug as string) ?? '',
      source: (row.source as KeywordTagSearchResult['source']) ?? 'seed',
      weight: row.weight as number | undefined,
      priority: row.priority as number | undefined,
      clusterType: row.clusterType as 'pillar' | 'cluster' | undefined,
      score: row.score as number,
      usageCount: row.usageCount as number,
    }));
  }

  async upsertProjectSeedTags(params: {
    tenantId: string;
    projectId: string;
    seeds: KeywordTag[];
  }): Promise<void> {
    const { tenantId, projectId, seeds } = params;
    if (!tenantId?.trim()) throw new Error('tenantId requis');
    if (!projectId?.trim()) throw new Error('projectId requis');
    if (!Array.isArray(seeds) || seeds.length === 0) return;

    const now = Date.now();

    await this.conn.query(
      `MERGE (tenant:Tenant {id: $tenantId})
       MERGE (project:Project {id: $projectId})
       SET project.tenant_id = COALESCE(project.tenant_id, $tenantId)
       MERGE (tenant)-[:TENANT_HAS_PROJECT]->(project)`,
      { tenantId, projectId },
      'WRITE'
    );

    for (const seed of seeds) {
      const base = seed.slug?.trim();
      const baseForSlug = base && base.length > 0 ? base : seed.label;
      const slug = slugifyKeyword(baseForSlug); // ✅ VO centralisé
      if (!slug) continue;
      const id = buildKeywordTagId(tenantId, projectId, slug);

      // Generate and validate embedding for seed (enables vector matching later)
      const embedding = await this.generateValidatedEmbedding(seed.label);

      // ✅ Optimisé: Une seule query pour MERGE tag + créer relation
      await this.conn.query(
        `MATCH (p:Project {id: $projectId})
         MERGE (k:KeywordTag { id: $id })
         ON CREATE SET k.created_at = $now,
                       k.embedding = $embedding,
                       k.embedding_text = $embeddingText,
                       k.sources = CASE WHEN $source IS NOT NULL THEN [$source] ELSE [] END
         SET k.label = $label,
             k.slug = $slug,
             k.source = COALESCE($source, k.source),
             k.sources = CASE
               WHEN $source IS NOT NULL AND NOT $source IN COALESCE(k.sources, [])
               THEN COALESCE(k.sources, []) + $source
               ELSE COALESCE(k.sources, [])
             END,
             k.tenant_id = $tenantId,
             k.project_id = $projectId,
             k.updated_at = $now
         MERGE (p)-[rel:PROJECT_HAS_SEED_KEYWORD]->(k)
         ON CREATE SET rel.created_at = $now`,
        {
          projectId,
          id,
          label: seed.label,
          slug,
          source: seed.source ?? 'seed',
          tenantId,
          now,
          embedding,
          embeddingText: seed.label,
        },
        'WRITE'
      );
    }
  }

  async getProjectSeedTags(params: {
    tenantId: string;
    projectId: string;
  }): Promise<KeywordTagDTO[]> {
    const { tenantId, projectId } = params;
    if (!projectId?.trim()) throw new Error('projectId requis');

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (p:Project {id: $projectId})-[:PROJECT_HAS_SEED_KEYWORD]->(k:KeywordTag)
       WHERE $tenantId IS NULL OR p.tenant_id = $tenantId
       RETURN k.label as label, k.slug as slug, k.source as source, k.weight as weight,
              k.priority as priority, k.cluster_type as clusterType`,
      { projectId, tenantId: tenantId ?? null },
      'READ'
    );

    return rows.map(toTagRow).filter(isTag);
  }
}

function toTagRow(row: Record<string, unknown>): KeywordTagDTO {
  return {
    label: row.label as string,
    slug: row.slug as string,
    source: row.source as KeywordTagDTO['source'],
    weight: typeof row.weight === 'number' ? row.weight : undefined,
    priority: typeof row.priority === 'number' ? (row.priority as number) : undefined,
    clusterType: (row.clusterType as 'pillar' | 'cluster' | undefined) ?? undefined,
  };
}

function isTag(x: unknown): x is KeywordTagDTO {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.label === 'string' && typeof r.slug === 'string' && typeof r.source === 'string';
}
