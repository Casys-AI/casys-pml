import { buildKeywordTagId, type KeywordPlan, slugifyKeyword } from '@casys/core';
import {
  type EmbeddingPort,
  type KeywordPlanRepositoryPort,
  type UpsertProjectKeywordPlanParams,
} from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

/**
 * Neo4j implementation of KeywordPlanRepositoryPort
 */
export class Neo4jKeywordPlanRepositoryAdapter implements KeywordPlanRepositoryPort {
  private readonly logger = createLogger('Neo4jKeywordPlanRepositoryAdapter');
  private readonly embeddingService?: EmbeddingPort;
  private static readonly EXPECTED_EMBED_DIM = 1536;

  constructor(
    private readonly conn: Neo4jConnection,
    embeddingService?: EmbeddingPort
  ) {
    this.embeddingService = embeddingService;
  }
  async upsertProjectKeywordPlan(
    params: UpsertProjectKeywordPlanParams
  ): Promise<{ planId: string }> {
    const { tenantId, projectId, seoBriefId, plan, planHash, seedNormalized } = params;
    if (!tenantId?.trim()) throw new Error('tenantId requis');
    if (!projectId?.trim()) throw new Error('projectId requis');
    if (!plan) throw new Error('plan requis');

    // Réutiliser un KeywordPlan existant pour ce seed si déjà présent (idempotence par seed)
    let planId: string;
    if (seedNormalized?.trim()) {
      try {
        const existing = await this.getKeywordPlanBySeed({ tenantId, projectId, seedNormalized });
        if (existing?.planId) {
          planId = existing.planId;
          // Planid existant réutilisé silencieusement
        } else {
          planId = `${tenantId}::${projectId}::plan::${Date.now()}::${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          // Nouveau planId créé silencieusement
        }
      } catch (_) {
        planId = `${tenantId}::${projectId}::plan::${Date.now()}::${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        this.logger.warn(`Failed to check existing plan for seed "${seedNormalized}", creating new`);
      }
    } else {
      planId = `${tenantId}::${projectId}::plan::${Date.now()}::${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      // Nouveau planId créé (pas de seed) silencieusement
    }
    const now = Date.now();

    // Serialize blog strategy v2 fields as JSON
    const topicClustersJson = plan.topicClusters ? JSON.stringify(plan.topicClusters) : null;
    const recommendationsJson = plan.recommendations ? JSON.stringify(plan.recommendations) : null;
    const contentGapsJson = plan.contentGaps ? JSON.stringify(plan.contentGaps) : null;

    // Créer le KeywordPlan et le lier au SeoBrief (si disponible) ou au Project (fallback)
    if (seoBriefId) {
      await this.conn.query(
        `MERGE (sb:SeoBrief { id: $seoBriefId })
         MERGE (p:Project { id: $projectId })
         SET p.tenant_id = COALESCE(p.tenant_id, $tenantId)
         MERGE (kp:KeywordPlan { id: $planId })
         ON CREATE SET kp.created_at = $now
         SET kp.project_id = $projectId,
             kp.seo_brief_id = $seoBriefId,
             kp.plan_hash = $planHash,
             kp.is_plan_aggregate = true,
             kp.topic_clusters_json = $topicClustersJson,
             kp.recommendations_json = $recommendationsJson,
             kp.content_gaps_json = $contentGapsJson,
             kp.updated_at = $now,
             kp.tenant_id = COALESCE(kp.tenant_id, $tenantId)
         MERGE (sb)-[:HAS_KEYWORD_PLAN]->(kp)
         MERGE (p)-[:PROJECT_HAS_KEYWORD_PLAN]->(kp)`,
        {
          tenantId,
          projectId,
          seoBriefId,
          planId,
          planHash: planHash ?? null,
          topicClustersJson,
          recommendationsJson,
          contentGapsJson,
          now,
        },
        'WRITE'
      );
    } else {
      // Fallback: lier au Project si pas de SeoBrief
      await this.conn.query(
        `MERGE (p:Project { id: $projectId })
         SET p.tenant_id = COALESCE(p.tenant_id, $tenantId)
         MERGE (kp:KeywordPlan { id: $planId })
         ON CREATE SET kp.created_at = $now
         SET kp.project_id = $projectId,
             kp.plan_hash = $planHash,
             kp.is_plan_aggregate = true,
             kp.topic_clusters_json = $topicClustersJson,
             kp.recommendations_json = $recommendationsJson,
             kp.content_gaps_json = $contentGapsJson,
             kp.updated_at = $now,
             kp.tenant_id = COALESCE(kp.tenant_id, $tenantId)
         MERGE (p)-[:PROJECT_HAS_KEYWORD_PLAN]->(kp)`,
        {
          tenantId,
          projectId,
          planId,
          planHash: planHash ?? null,
          topicClustersJson,
          recommendationsJson,
          contentGapsJson,
          now,
        },
        'WRITE'
      );
    }

    // Optionally link SEED (MERGE par id canonique)
    if (seedNormalized?.trim()) {
      const seedSlug = slugifyKeyword(seedNormalized);
      const seedId = buildKeywordTagId(tenantId, projectId, seedSlug);
      await this.conn.query(
        `MATCH (kp:KeywordPlan { id: $planId })
         MERGE (seed:KeywordTag { id: $seedId })
         ON CREATE SET seed.tenant_id = $tenantId,
                       seed.project_id = $projectId,
                       seed.slug = $seedSlug,
                       seed.label = $seedLabel,
                       seed.source = 'seed',
                       seed.sources = CASE WHEN 'seed' IS NOT NULL THEN ['seed'] ELSE [] END,
                       seed.created_at = $now
         SET seed.updated_at = $now,
             seed.sources = CASE
               WHEN NOT 'seed' IN COALESCE(seed.sources, []) THEN COALESCE(seed.sources, []) + 'seed'
               ELSE COALESCE(seed.sources, [])
             END
         MERGE (kp)-[:SEED]->(seed)`,
        {
          planId,
          tenantId,
          projectId,
          seedId,
          seedSlug,
          seedLabel: seedNormalized,
          now,
        },
        'WRITE'
      );
    }

    // Link included tags (with optional embeddings for vector operations)
    const tags = [] as {
      label: string;
      slug: string;
      id: string;
      source: string | null;
      weight: number | null;
      searchVolume: number | null;
      difficulty: number | null;
      cpc: number | null;
      competition: 'low' | 'medium' | 'high' | null;
      lowTopOfPageBid: number | null;
      highTopOfPageBid: number | null;
      monthlySearches: string | null;
      embedding?: number[] | null;
      embeddingText?: string | null;
    }[];

    for (const t of plan.tags) {
      const safeSlug = slugifyKeyword(t.slug ?? t.label);
      const base = {
        label: t.label,
        slug: safeSlug,
        id: buildKeywordTagId(tenantId, projectId, safeSlug),
        source: t.source ?? null,
        weight: typeof t.weight === 'number' ? t.weight : null,
        searchVolume: typeof t.searchVolume === 'number' ? t.searchVolume : null,
        difficulty: typeof t.difficulty === 'number' ? t.difficulty : null,
        cpc: typeof t.cpc === 'number' ? t.cpc : null,
        competition: t.competition ?? null,
        lowTopOfPageBid: typeof t.lowTopOfPageBid === 'number' ? t.lowTopOfPageBid : null,
        highTopOfPageBid: typeof t.highTopOfPageBid === 'number' ? t.highTopOfPageBid : null,
        monthlySearches: t.monthlySearches ? JSON.stringify(t.monthlySearches) : null,
      };

      if (this.embeddingService) {
        try {
          const emb = await this.embeddingService.generateEmbedding(t.label);
          if (
            Array.isArray(emb) &&
            emb.length === Neo4jKeywordPlanRepositoryAdapter.EXPECTED_EMBED_DIM
          ) {
            tags.push({ ...base, embedding: emb, embeddingText: t.label });
          } else {
            this.logger.warn(`Invalid embedding for tag "${t.label}": expected ${Neo4jKeywordPlanRepositoryAdapter.EXPECTED_EMBED_DIM}D`);
            tags.push(base);
          }
        } catch (e) {
          this.logger.warn('Embedding generation failed for tag:', e);
          tags.push(base);
        }
      } else {
        tags.push(base);
      }
    }

    if (tags.length > 0) {
      await this.conn.query(
        `UNWIND $tags AS t
         MATCH (kp:KeywordPlan { id: $planId })
         WITH kp, t
         MERGE (kt:KeywordTag { id: t.id })
         ON CREATE SET kt.tenant_id = $tenantId,
                       kt.project_id = $projectId,
                       kt.slug = t.slug,
                       kt.created_at = $now,
                       kt.sources = CASE WHEN t.source IS NOT NULL THEN [t.source] ELSE [] END,
                       kt.embedding = COALESCE(t.embedding, kt.embedding),
                       kt.embedding_text = COALESCE(t.embeddingText, kt.embedding_text)
         SET kt.label = t.label,
             kt.source = COALESCE(t.source, kt.source),
             kt.sources = CASE
               WHEN t.source IS NOT NULL AND NOT t.source IN COALESCE(kt.sources, [])
               THEN COALESCE(kt.sources, []) + t.source
               ELSE COALESCE(kt.sources, [])
             END,
             kt.weight = CASE WHEN t.weight IS NULL THEN kt.weight ELSE toFloat(t.weight) END,
             kt.search_volume = COALESCE(t.searchVolume, kt.search_volume),
             kt.difficulty = COALESCE(t.difficulty, kt.difficulty),
             kt.cpc = COALESCE(t.cpc, kt.cpc),
             kt.competition = COALESCE(t.competition, kt.competition),
             kt.low_top_of_page_bid = COALESCE(t.lowTopOfPageBid, kt.low_top_of_page_bid),
             kt.high_top_of_page_bid = COALESCE(t.highTopOfPageBid, kt.high_top_of_page_bid),
             kt.monthly_searches = COALESCE(t.monthlySearches, kt.monthly_searches),
             kt.embedding = CASE WHEN kt.embedding IS NULL THEN t.embedding ELSE kt.embedding END,
             kt.embedding_text = COALESCE(kt.embedding_text, t.embeddingText),
             kt.updated_at = $now
         MERGE (kp)-[r:INCLUDES]->(kt)
         SET r.source = COALESCE(t.source, r.source),
             r.weight = CASE WHEN t.weight IS NULL THEN r.weight ELSE toFloat(t.weight) END`,
        { planId, tenantId, projectId, tags, now },
        'WRITE'
      );
    }

    this.logger.log(`KeywordPlan saved: ${plan.tags?.length || 0} tags${seedNormalized ? ` (seed: ${seedNormalized})` : ''}`);

    return { planId };
  }

  async getKeywordPlanBySeed(params: {
    tenantId: string;
    projectId: string;
    seedNormalized: string;
  }): Promise<{ planId: string } | null> {
    const { tenantId, projectId, seedNormalized } = params;
    if (!tenantId?.trim()) throw new Error('tenantId requis');
    if (!projectId?.trim()) throw new Error('projectId requis');
    if (!seedNormalized?.trim()) throw new Error('seedNormalized requis');

    // Cohérence: slugifier le seed comme à la création (ligne 122)
    const seedSlug = slugifyKeyword(seedNormalized);

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (p:Project { id: $projectId, tenant_id: $tenantId })-[:PROJECT_HAS_KEYWORD_PLAN]->(kp:KeywordPlan)
       MATCH (kp)-[:SEED]->(kt:KeywordTag { tenant_id: $tenantId, project_id: $projectId, slug: $seedSlug })
       RETURN kp.id AS planId
       LIMIT 1`,
      { tenantId, projectId, seedSlug },
      'READ'
    );
    if (rows.length === 0) return null;
    return { planId: String(rows[0].planId) };
  }

  async getKeywordPlanById(params: {
    tenantId: string;
    projectId: string;
    planId: string;
  }): Promise<KeywordPlan | null> {
    const { tenantId, projectId, planId } = params;
    if (!tenantId?.trim()) throw new Error('tenantId requis');
    if (!projectId?.trim()) throw new Error('projectId requis');
    if (!planId?.trim()) throw new Error('planId requis');

    // First get plan-level blog strategy fields
    const planRows = await this.conn.query<Record<string, unknown>>(
      `MATCH (p:Project { id: $projectId, tenant_id: $tenantId })-[:PROJECT_HAS_KEYWORD_PLAN]->(kp:KeywordPlan { id: $planId })
       RETURN kp.topic_clusters_json AS topicClustersJson,
              kp.recommendations_json AS recommendationsJson,
              kp.content_gaps_json AS contentGapsJson
       LIMIT 1`,
      { tenantId, projectId, planId },
      'READ'
    );

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (p:Project { id: $projectId, tenant_id: $tenantId })-[:PROJECT_HAS_KEYWORD_PLAN]->(kp:KeywordPlan { id: $planId })
       MATCH (kp)-[:INCLUDES]->(kt:KeywordTag)
       RETURN kt.label AS label,
              kt.slug AS slug,
              kt.source AS source,
              kt.weight AS weight,
              kt.priority AS priority,
              kt.cluster_type AS clusterType,
              kt.search_volume AS searchVolume,
              kt.difficulty AS difficulty,
              kt.cpc AS cpc,
              kt.competition AS competition,
              kt.low_top_of_page_bid AS lowTopOfPageBid,
              kt.high_top_of_page_bid AS highTopOfPageBid,
              kt.monthly_searches AS monthlySearches`,
      { tenantId, projectId, planId },
      'READ'
    );
    if (!rows || rows.length === 0) return null;
    
    // Parse blog strategy v2 fields from plan
    const planData = planRows[0] || {};
    const topicClusters = planData.topicClustersJson 
      ? JSON.parse(planData.topicClustersJson as string) 
      : undefined;
    const recommendations = planData.recommendationsJson 
      ? JSON.parse(planData.recommendationsJson as string) 
      : undefined;
    const contentGaps = planData.contentGapsJson 
      ? JSON.parse(planData.contentGapsJson as string) 
      : undefined;

    const tags = rows.map(r => {
      const monthly =
        typeof r.monthlySearches === 'string' ? JSON.parse(r.monthlySearches) : r.monthlySearches;
      return {
        label: r.label as string,
        slug: r.slug as string,
        source: (r.source as string | undefined) ?? undefined,
        weight: typeof r.weight === 'number' ? r.weight : undefined,
        priority: typeof r.priority === 'number' ? r.priority : undefined,
        clusterType: (r.clusterType as 'pillar' | 'cluster' | undefined) ?? undefined,
        searchVolume: typeof r.searchVolume === 'number' ? r.searchVolume : undefined,
        difficulty: typeof r.difficulty === 'number' ? r.difficulty : undefined,
        cpc: typeof r.cpc === 'number' ? r.cpc : undefined,
        competition: (r.competition as 'low' | 'medium' | 'high' | undefined) ?? undefined,
        lowTopOfPageBid: typeof r.lowTopOfPageBid === 'number' ? r.lowTopOfPageBid : undefined,
        highTopOfPageBid: typeof r.highTopOfPageBid === 'number' ? r.highTopOfPageBid : undefined,
        monthlySearches: monthly as KeywordPlan['tags'][number]['monthlySearches'],
      };
    });
    
    return { 
      tags,
      topicClusters,
      recommendations,
      contentGaps
    };
  }
}
