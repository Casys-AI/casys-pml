import type { EmbeddingPort, SeoBriefStorePort } from '@casys/application';
import {
  buildKeywordTagId,
  normalizeKeyword,
  type SeoBriefDataV3,
  slugifyKeyword,
} from '@casys/core';

import { type Logger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jSeoBriefStoreAdapter implements SeoBriefStorePort {
  constructor(
    private readonly conn: Neo4jConnection,
    private readonly logger: Logger,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  async saveSeoBriefForProject(params: {
    tenantId: string;
    projectId: string;
    seoBriefData: SeoBriefDataV3;
  }): Promise<{ seoBriefId: string }> {
    const { tenantId, projectId, seoBriefData } = params;
    const seoBriefId = `seobrief_${tenantId}_${projectId}`;
    const now = Date.now();

    // 1. Créer le nœud SeoBrief
    // V3 Architecture: Serialize structured fields to JSON for Neo4j
    const contentGapsJson = JSON.stringify(seoBriefData.competitiveAnalysis.contentGaps ?? []);
    const contentRecommendationsJson = JSON.stringify(
      seoBriefData.contentStrategy.recommendations ?? { seo: [], editorial: [], technical: [] }
    );
    const topicClustersJson = JSON.stringify(seoBriefData.contentStrategy.topicClusters ?? []);

    const cypher = `
      MERGE (b:SeoBrief { id: $id })
      ON CREATE SET b.created_at = $now
      SET b.tenant_id = $tenantId,
          b.project_id = $projectId,
          b.updated_at = $now,
          b.user_questions = $userQuestions,
          b.content_gaps_json = $contentGapsJson,
          b.topic_clusters_json = $topicClustersJson,
          b.seo_recommendations = $seoRecommendations,
          b.search_intent = $searchIntent,
          b.search_confidence = $searchConfidence,
          b.content_recommendations_json = $contentRecommendationsJson
    `;

    await this.conn.query(cypher, {
      id: seoBriefId,
      tenantId,
      projectId,
      now,
      userQuestions: seoBriefData.searchIntent.supportingQueries ?? [],
      contentGapsJson,
      topicClustersJson,
      seoRecommendations: seoBriefData.contentStrategy.recommendations?.seo ?? [],
      searchIntent: seoBriefData.searchIntent.intent ?? 'informational',
      searchConfidence: seoBriefData.searchIntent.confidence ?? 0,
      contentRecommendationsJson,
    });

    // 2. Créer les nœuds KeywordTag et les lier au SeoBrief (avec déduplication)
    const keywordTags = seoBriefData.keywordTags ?? [];
    this.logger.log('[DEBUG-NEO4J] 🔄 Début persistance SeoBrief tags', {
      tenantId,
      projectId,
      seoBriefId,
      totalTags: keywordTags.length,
      tags: keywordTags.map(t => ({ label: t.label, source: t.source })),
    });

    for (const tag of keywordTags) {
      const label = String(tag?.label ?? '').trim();
      if (!label) continue;

      const slugBase = tag.slug ?? label;
      const normalized = slugifyKeyword(slugBase);
      const tagId = buildKeywordTagId(tenantId, projectId, normalized);
      const source = tag.source ?? 'opportunity';

      // Log removed for brevity (see batch log above)

      // Optional: generate embedding for this KeywordTag (SeoBrief HAS_KEYWORD)
      let embedding: number[] | null = null;
      if (this.embeddingService) {
        try {
          const emb = await this.embeddingService.generateEmbedding(label);
          embedding = Array.isArray(emb) && emb.length > 0 ? emb : null;
        } catch (e) {
          this.logger.debug?.('[Neo4jSeoBriefStore] embedding generation failed (non blocking)');
          embedding = null;
        }
      }

      // MERGE KeywordTag avec accumulation des sources ET métriques SEO
      await this.conn.query(
        `MERGE (kt:KeywordTag { id: $tagId })
         ON CREATE SET kt.label = $label,
                       kt.slug = $normalized,
                       kt.source = $source,
                       kt.sources = [$source],
                       kt.tenant_id = $tenantId,
                       kt.project_id = $projectId,
                       kt.created_at = $now,
                       kt.embedding = $embedding,
                       kt.embedding_text = $label,
                       kt.priority = $priority,
                       kt.opportunity_score = $opportunityScore,
                       kt.cluster_type = $clusterType,
                       kt.search_volume = $searchVolume,
                       kt.difficulty = $difficulty,
                       kt.cpc = $cpc,
                       kt.competition = $competition,
                       kt.low_top_of_page_bid = $lowTopOfPageBid,
                       kt.high_top_of_page_bid = $highTopOfPageBid
         ON MATCH SET kt.sources = CASE
           WHEN $source IS NOT NULL AND NOT $source IN COALESCE(kt.sources, [])
           THEN COALESCE(kt.sources, []) + $source
           ELSE COALESCE(kt.sources, [])
         END,
         kt.updated_at = $now,
         kt.embedding = CASE WHEN kt.embedding IS NULL THEN $embedding ELSE kt.embedding END,
         kt.embedding_text = COALESCE(kt.embedding_text, $label),
         kt.priority = COALESCE($priority, kt.priority),
         kt.opportunity_score = COALESCE($opportunityScore, kt.opportunity_score),
         kt.cluster_type = COALESCE($clusterType, kt.cluster_type),
         kt.search_volume = COALESCE($searchVolume, kt.search_volume),
         kt.difficulty = COALESCE($difficulty, kt.difficulty),
         kt.cpc = COALESCE($cpc, kt.cpc),
         kt.competition = COALESCE($competition, kt.competition),
         kt.low_top_of_page_bid = COALESCE($lowTopOfPageBid, kt.low_top_of_page_bid),
         kt.high_top_of_page_bid = COALESCE($highTopOfPageBid, kt.high_top_of_page_bid)
         WITH kt
         MATCH (sb:SeoBrief { id: $seoBriefId })
         MERGE (sb)-[rel:HAS_KEYWORD]->(kt)
         ON CREATE SET rel.source = $source, rel.created_at = $now
         ON MATCH SET rel.updated_at = $now`,
        {
          tagId,
          label,
          normalized,
          source,
          tenantId,
          projectId,
          seoBriefId,
          now,
          embedding,
          priority: tag.priority ?? null,
          opportunityScore: tag.opportunityScore ?? null,
          clusterType: tag.clusterType ?? null,
          searchVolume: tag.searchVolume ?? null,
          difficulty: tag.difficulty ?? null,
          cpc: tag.cpc ?? null,
          competition: tag.competition ?? null,
          lowTopOfPageBid: tag.lowTopOfPageBid ?? null,
          highTopOfPageBid: tag.highTopOfPageBid ?? null,
        },
        'WRITE'
      );
    }

    this.logger.log('[DEBUG-NEO4J] ✅ Tags persistés avec succès', {
      seoBriefId,
      processedTags: keywordTags.length,
    });
    this.logger.debug?.('[Neo4jSeoBriefStore] saved project SeoBrief with KeywordTags', {
      tenantId,
      projectId,
      seoBriefId,
      keywordTagsCount: keywordTags.length,
    });
    return { seoBriefId };
  }

  async getSeoBriefForProject(params: {
    tenantId: string;
    projectId: string;
  }): Promise<SeoBriefDataV3 | null> {
    const { tenantId, projectId } = params;

    // Récupérer le SeoBrief
    const briefCypher = `
      MATCH (b:SeoBrief { tenant_id: $tenantId, project_id: $projectId })
      RETURN b.user_questions AS userQuestions,
             b.content_gaps_json AS contentGapsJson,
             b.topic_clusters_json AS topicClustersJson,
             b.seo_recommendations AS seoRecommendations,
             b.search_intent AS searchIntent,
             b.search_confidence AS searchConfidence,
             b.content_recommendations_json AS contentRecommendationsJson,
             b.id AS seoBriefId
      ORDER BY b.updated_at DESC
      LIMIT 1
    `;

    const briefRows = await this.conn.query<Record<string, unknown>>(
      briefCypher,
      { tenantId, projectId },
      'READ'
    );
    const r = briefRows[0];
    if (!r) return null;
    // Petite garde: s'assurer que seoBriefId est présent avant la requête suivante
    if (!('seoBriefId' in r) || typeof r.seoBriefId !== 'string') {
      this.logger.log?.(
        'getSeoBriefForProject: seoBriefId manquant pour tenant/project; abort tags fetch',
        { tenantId, projectId }
      );
      return null;
    }

    // Récupérer les KeywordTags liés via HAS_KEYWORD
    const tagsCypher = `
      MATCH (b:SeoBrief { id: $seoBriefId })-[:HAS_KEYWORD]->(kt:KeywordTag)
      RETURN kt.label AS label,
             kt.slug AS slug,
             kt.source AS source,
             kt.sources AS sources
    `;

    const tagsRows = await this.conn.query<{
      label: string;
      slug: string;
      source: string;
      sources: string[];
    }>(tagsCypher, { seoBriefId: r.seoBriefId }, 'READ');

    // Parse JSON fields (v3 architecture)
    const contentGaps = r.contentGapsJson ? JSON.parse(r.contentGapsJson as string) : [];
    const topicClusters = r.topicClustersJson ? JSON.parse(r.topicClustersJson as string) : [];
    const contentRecommendations = r.contentRecommendationsJson
      ? JSON.parse(r.contentRecommendationsJson as string)
      : { seo: [], editorial: [], technical: [] };

    // Return v3 structure
    return {
      keywordTags: tagsRows.map(t => ({
        label: t.label,
        slug: t.slug,
        source: t.source as any,
        sources: t.sources as any[],
      })),
      searchIntent: {
        intent: r.searchIntent as string as any,
        confidence: Number(r.searchConfidence ?? 0.8),
        supportingQueries: (r.userQuestions as string[]) ?? [],
        contentRecommendations: undefined, // WHAT to write (not stored in Neo4j legacy)
      },
      contentStrategy: {
        topicClusters,
        recommendations:
          typeof contentRecommendations === 'object' && !Array.isArray(contentRecommendations)
            ? contentRecommendations
            : {
                seo: (r.seoRecommendations as string[]) ?? [],
                editorial: [],
                technical: [],
              },
      },
      competitiveAnalysis: {
        contentGaps,
        competitorTitles: [],
      },
    };
  }

  async linkSeoBriefToProject(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId } = params;
    const cypher = `
      MERGE (p:Project { id: $projectId })
      ON CREATE SET p.created_at = timestamp(), p.tenant_id = $tenantId
      MERGE (b:SeoBrief { id: $seoBriefId })
      MERGE (p)-[:HAS_SEO_BRIEF]->(b)
    `;
    await this.conn.query(cypher, { tenantId, projectId, seoBriefId }, 'WRITE');
    this.logger.debug?.('[Neo4jSeoBriefStore] linked brief to project', {
      tenantId,
      projectId,
      seoBriefId,
    });
  }

  async linkSeoBriefToEditorialBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    briefId: string;
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId, briefId } = params;
    const cypher = `
      MATCH (b:SeoBrief { id: $seoBriefId, tenant_id: $tenantId, project_id: $projectId })
      MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId, project_id: $projectId })
      MERGE (b)-[:INFORMS]->(e)
    `;
    await this.conn.query(cypher, { tenantId, projectId, seoBriefId, briefId }, 'WRITE');
    this.logger.debug?.('[Neo4jSeoBriefStore] linked SeoBrief -> EditorialBrief', {
      seoBriefId,
      briefId,
    });
  }

  async linkSeoBriefToKeywordPlans(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    keywords: string[];
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId } = params;
    const normalized = Array.from(
      new Set((params.keywords ?? []).map(k => normalizeKeyword(String(k) || '')).filter(Boolean))
    );
    if (normalized.length === 0) return;

    const cypher = `
      MATCH (b:SeoBrief { id: $seoBriefId, tenant_id: $tenantId, project_id: $projectId })
      WITH b, $norms AS norms
      UNWIND norms AS norm
      MATCH (kp:KeywordPlan { normalized: norm, tenant_id: $tenantId, project_id: $projectId })
      MERGE (b)-[:SEO_BRIEF_USES_KEYWORD_PLAN]->(kp)
    `;
    await this.conn.query(cypher, { tenantId, projectId, seoBriefId, norms: normalized }, 'WRITE');
    this.logger.debug?.('[Neo4jSeoBriefStore] linked SeoBrief -> KeywordPlans', {
      seoBriefId,
      keywords: normalized.length,
    });
  }

  /**
   * V3: Lie SeoBrief à BusinessContext enrichi (siteType, personas)
   */
  async linkSeoBriefToBusinessContext(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    businessContext: {
      targetAudience: string;
      industry: string;
      businessDescription?: string;
      contentType?: string;
      siteType?: string;
      personas?: Array<{
        category: string;
        archetype: string;
        emoji?: string;
        profile: {
          demographics: string;
          psychographics: string;
          techSavviness: string;
        };
        painPoints: string[];
        motivations: string[];
        messagingAngle: string;
      }>;
    };
  }): Promise<void> {
    const { tenantId, projectId, seoBriefId, businessContext } = params;
    const now = Date.now();
    const bcId = `bc_${tenantId}_${projectId}`;

    // V3: Sérialiser personas en JSON pour stockage Neo4j
    const personasJson = businessContext.personas && businessContext.personas.length > 0
      ? JSON.stringify(businessContext.personas)
      : null;

    const cypher = `
      MERGE (p:Project { id: $projectId, tenant_id: $tenantId })
      MERGE (b:SeoBrief { id: $seoBriefId })
      MERGE (bc:BusinessContext { id: $bcId })
      ON CREATE SET bc.created_at = $now
      SET bc.target_audience = $targetAudience,
          bc.industry = $industry,
          bc.business_description = $businessDescription,
          bc.content_type = $contentType,
          bc.site_type = $siteType,
          bc.personas = $personas,
          bc.updated_at = $now
      MERGE (p)-[rel:PROJECT_HAS_BUSINESS_CONTEXT]->(bc)
      ON CREATE SET rel.effective_from = $now
      SET rel.active = true
      MERGE (b)-[:SEO_BRIEF_USES_BUSINESS_CONTEXT]->(bc)
    `;

    await this.conn.query(
      cypher,
      {
        tenantId,
        projectId,
        seoBriefId,
        bcId,
        now,
        targetAudience: businessContext.targetAudience ?? '',
        industry: businessContext.industry ?? '',
        businessDescription: businessContext.businessDescription ?? '',
        contentType: businessContext.contentType ?? '',
        siteType: businessContext.siteType ?? null,
        personas: personasJson,
      },
      'WRITE'
    );

    this.logger.debug?.('[Neo4jSeoBriefStore] linked SeoBrief -> BusinessContext V3 & Project', {
      seoBriefId,
      bcId,
      hasPersonas: !!personasJson,
      hasSiteType: !!businessContext.siteType,
    });
  }
}
