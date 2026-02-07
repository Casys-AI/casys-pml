import neo4j from 'neo4j-driver';

import { type EditorialBrief, slugifyKeyword, buildKeywordTagId } from '@casys/core';
import type {
  EditorialBriefSearchResult,
  EditorialBriefStorePort,
  EmbeddingPort,
} from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { EditorialBriefEmbeddingAdapter } from '../../../ai/embeddings/editorial-brief-embedding.adapter';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jEditorialBriefStoreAdapter implements EditorialBriefStorePort {
  private readonly logger = createLogger('Neo4jEditorialBriefStore');
  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort
  ) {}

  async saveEditorialBrief(brief: EditorialBrief): Promise<void> {
    const data = brief.toObject();
    const now = Date.now();

    // Generate embedding if service available
    let embedding: number[] | null = null;
    let embeddingText: string | null = null;
    if (this.embeddingService) {
      try {
        const ebAdapter = new EditorialBriefEmbeddingAdapter();
        const gen = await ebAdapter.generate(brief, this.embeddingService);
        embedding = gen?.embedding ?? null;
        embeddingText = gen?.embeddingText ?? data.angle;
      } catch (error) {
        this.logger.warn('Embedding generation failed, saving without embedding', error);
      }
    }

    // 1. Save EditorialBrief node with V3 enriched fields (direct, no wrapper)
    await this.conn.query(
      `//cypher
      MERGE (e:EditorialBrief { id: $id })
       ON CREATE SET e.created_at = $now,
                     e.embedding = $embedding,
                     e.embedding_text = $embeddingText
       SET e.tenant_id = $tenantId,
           e.project_id = $projectId,
           e.language = $language,
           e.angle = $angle,
           e.corpus_topic_ids = $corpusTopicIds,
           e.enriched_relevant_questions = $relevantQuestions,
           e.enriched_priority_gaps = $priorityGaps,
           e.enriched_recommendations_seo = $recommendationsSeo,
           e.enriched_recommendations_editorial = $recommendationsEditorial,
           e.enriched_recommendations_technical = $recommendationsTechnical,
           e.enriched_corpus_summary = $corpusSummary,
           e.enriched_competitor_angles = $competitorAngles,
           e.target_sections_count = $targetSectionsCount,
           e.target_chars_per_section = $targetCharsPerSection,
           e.updated_at = $now`,
      {
        id: data.id,
        tenantId: data.tenantId,
        projectId: data.projectId,
        language: data.language,
        angle: data.angle,
        corpusTopicIds: data.corpusTopicIds,
        // V3: Champs enrichis directs (pas de wrapper enrichedData)
        relevantQuestions: data.relevantQuestions ?? null,
        priorityGaps: data.priorityGaps
          ? data.priorityGaps.map((g: any) => JSON.stringify(g))
          : null,
        recommendationsSeo: data.guidingRecommendations?.seo ?? null,
        recommendationsEditorial: data.guidingRecommendations?.editorial ?? null,
        recommendationsTechnical: data.guidingRecommendations?.technical ?? null,
        corpusSummary: data.corpusSummary ?? null,
        competitorAngles: data.competitorAngles ?? null,
        // V3.1: Contraintes structurelles (optionnels)
        targetSectionsCount: data.targetSectionsCount
          ? neo4j.int(data.targetSectionsCount)
          : null,
        targetCharsPerSection: data.targetCharsPerSection
          ? neo4j.int(data.targetCharsPerSection)
          : null,
        embedding,
        embeddingText,
        now,
      },
      'WRITE'
    );

    // 2. Create/link BusinessContext V3 (centralized by project, with siteType and personas)
    const bcId = `bc_${data.tenantId}_${data.projectId}`;
    const bc = brief.businessContext;

    // V3: Sérialiser personas en JSON si présents
    const personasJson = bc.personas && bc.personas.length > 0
      ? JSON.stringify(bc.personas)
      : null;

    await this.conn.query(
      `//cypher
      MERGE (p:Project { id: $projectId, tenant_id: $tenantId })
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
       ON CREATE SET rel.active = true, rel.effective_from = $now
       WITH bc
       MATCH (e:EditorialBrief { id: $briefId })
       MERGE (e)-[:BRIEF_USES_BUSINESS_CONTEXT { snapshot_at: $now }]->(bc)`,
      {
        tenantId: data.tenantId,
        projectId: data.projectId,
        bcId,
        targetAudience: bc.targetAudience,
        industry: bc.industry,
        businessDescription: bc.businessDescription ?? '',
        contentType: bc.contentType ?? 'article',
        siteType: bc.siteType ?? null,
        personas: personasJson,
        briefId: data.id,
        now,
      },
      'WRITE'
    );

    // 3. Create USES_KEYWORD relations for keywordTags (V3 direct fields)
    if (data.keywordTags && data.keywordTags.length > 0) {
      for (const tag of data.keywordTags) {
        const tagId = buildKeywordTagId(
          data.tenantId,
          data.projectId,
          tag.slug || slugifyKeyword(tag.label)
        );
        await this.conn.query(
          `//cypher
          MERGE (kt:KeywordTag { id: $tagId })
           ON CREATE SET kt.tenant_id = $tenantId,
                         kt.project_id = $projectId,
                         kt.label = $label,
                         kt.slug = $slug,
                         kt.source = $source,
                         kt.created_at = $now
           ON MATCH SET kt.updated_at = $now
           WITH kt
           MATCH (e:EditorialBrief { id: $briefId })
           MERGE (e)-[r:USES_KEYWORD]->(kt)
           ON CREATE SET r.created_at = $now,
                         r.source = $source
           ON MATCH SET r.updated_at = $now`,
          {
            briefId: data.id,
            tenantId: data.tenantId,
            projectId: data.projectId,
            tagId,
            label: tag.label,
            slug: tag.slug || slugifyKeyword(tag.label),
            source: tag.source || 'opportunity',
            now,
          },
          'WRITE'
        );
      }
    }
  }

  async getEditorialBrief(
    id: string,
    tenantId: string,
    projectId: string
  ): Promise<EditorialBrief | null> {
    // 1. Get brief + business context V3 (avec champs enrichis directs)
    const briefRows = await this.conn.query<Record<string, unknown>>(
      `//cypher
       MATCH (e:EditorialBrief { id: $id, tenant_id: $tenantId, project_id: $projectId })
       MATCH (e)-[:BRIEF_USES_BUSINESS_CONTEXT]->(bc:BusinessContext)
       RETURN e.id AS id,
              e.tenant_id AS tenantId,
              e.project_id AS projectId,
              e.language AS language,
              e.angle AS angle,
              e.corpus_topic_ids AS corpusTopicIds,
              e.created_at AS createdAt,
              e.enriched_relevant_questions AS relevantQuestions,
              e.enriched_priority_gaps AS priorityGaps,
              e.enriched_recommendations_seo AS recommendationsSeo,
              e.enriched_recommendations_editorial AS recommendationsEditorial,
              e.enriched_recommendations_technical AS recommendationsTechnical,
              e.enriched_corpus_summary AS corpusSummary,
              e.enriched_competitor_angles AS competitorAngles,
              e.target_sections_count AS targetSectionsCount,
              e.target_chars_per_section AS targetCharsPerSection,
              bc.target_audience AS targetAudience,
              bc.industry AS industry,
              bc.business_description AS businessDescription,
              bc.content_type AS contentType,
              bc.site_type AS siteType,
              bc.personas AS personas
       LIMIT 1`,
      { id, tenantId, projectId },
      'READ'
    );

    if (briefRows.length === 0) return null;
    const row = briefRows[0];

    // 2. Get linked SeoBrief (if exists)
    const seoBriefRows = await this.conn.query<Record<string, unknown>>(
      `//cypher
      MATCH (sb:SeoBrief)-[:INFORMS]->(e:EditorialBrief { id: $id })
       RETURN sb.id AS seoBriefId,
              sb.user_questions AS userQuestions,
              sb.content_gaps AS contentGaps,
              sb.seo_recommendations AS seoRecommendations,
              sb.search_intent AS searchIntent,
              sb.search_confidence AS searchConfidence,
              sb.content_recommendations AS contentRecommendations
       LIMIT 1`,
      { id },
      'READ'
    );

    // 3. Reconstruct SeoBrief metadata from linked SeoBrief (still required for intent/reco)
    if (seoBriefRows.length === 0) {
      this.logger.warn(`No SeoBrief found for EditorialBrief ${id}, returning null`);
      return null;
    }

    const sb = seoBriefRows[0];

    // 3b. Récupérer les KeywordTags du SNAPSHOT EB via la relation USES_KEYWORD (prioritaire, pas de fallback)
    const keywordTagsRows = await this.conn.query<{
      label: string;
      slug: string;
      source: string;
    }>(
      `//cypher
      MATCH (e:EditorialBrief { id: $briefId })-[:USES_KEYWORD]->(kt:KeywordTag)
      RETURN kt.label AS label,
             kt.slug AS slug,
             kt.source AS source`,
      { briefId: id },
      'READ'
    );

    const { SeoBrief } = await import('@casys/core');
    const keywordPlan = {
      tags: keywordTagsRows.map(kt => ({
        label: kt.label,
        slug: kt.slug,
        source: kt.source as any,
      })),
    };
    const searchIntent = {
      keyword: keywordPlan.tags[0]?.label ?? '',
      intent: (sb.searchIntent as any) ?? 'informational',
      confidence: Number(sb.searchConfidence ?? 0.8),
      supportingQueries: (sb.userQuestions as string[]) ?? [],
      contentRecommendations: (sb.contentRecommendations as string[]) ?? [],
      contentGaps: (sb.contentGaps as string[]) ?? [],
      seoRecommendations: (sb.seoRecommendations as string[]) ?? [],
    };
    const seoBrief = SeoBrief.create(keywordPlan, searchIntent);

    // 4. Reconstruct EditorialBrief V3 avec tous les champs enrichis
    const { EditorialBrief } = await import('@casys/core');

    // Parse personas JSON si présent
    let personas: any[] | undefined;
    if (typeof row.personas === 'string') {
      try {
        personas = JSON.parse(row.personas);
      } catch (e) {
        this.logger.warn('Failed to parse personas JSON', e);
        personas = undefined;
      }
    }

    // Parse priorityGaps JSON array
    let priorityGaps: any[] | undefined;
    if (Array.isArray(row.priorityGaps)) {
      priorityGaps = (row.priorityGaps as string[])
        .map((g: string) => {
          try {
            return JSON.parse(g);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    return EditorialBrief.create({
      id: String(row.id),
      tenantId: String(row.tenantId),
      projectId: String(row.projectId),
      language: typeof row.language === 'string' ? row.language : 'en',
      angle: typeof row.angle === 'string' ? row.angle : '',
      seoBrief,
      businessContext: {
        targetAudience: typeof row.targetAudience === 'string' ? row.targetAudience : '',
        industry: typeof row.industry === 'string' ? row.industry : '',
        businessDescription:
          typeof row.businessDescription === 'string' ? row.businessDescription : '',
        contentType: typeof row.contentType === 'string' ? row.contentType : '',
        siteType: typeof row.siteType === 'string' ? row.siteType : undefined,
        personas,
      },
      corpusTopicIds: (row.corpusTopicIds as string[]) ?? [],
      // V3: Champs enrichis directs
      keywordTags: keywordPlan.tags,
      relevantQuestions: Array.isArray(row.relevantQuestions)
        ? (row.relevantQuestions as string[])
        : undefined,
      priorityGaps,
      guidingRecommendations: {
        seo: Array.isArray(row.recommendationsSeo)
          ? (row.recommendationsSeo as string[])
          : [],
        editorial: Array.isArray(row.recommendationsEditorial)
          ? (row.recommendationsEditorial as string[])
          : [],
        technical: Array.isArray(row.recommendationsTechnical)
          ? (row.recommendationsTechnical as string[])
          : [],
      },
      corpusSummary: typeof row.corpusSummary === 'string' ? row.corpusSummary : undefined,
      competitorAngles: Array.isArray(row.competitorAngles)
        ? (row.competitorAngles as string[])
        : undefined,
      // V3.1: Contraintes structurelles (optionnels)
      targetSectionsCount:
        typeof row.targetSectionsCount === 'number'
          ? row.targetSectionsCount
          : neo4j.isInt(row.targetSectionsCount)
            ? neo4j.integer.toNumber(row.targetSectionsCount as any)
            : undefined,
      targetCharsPerSection:
        typeof row.targetCharsPerSection === 'number'
          ? row.targetCharsPerSection
          : neo4j.isInt(row.targetCharsPerSection)
            ? neo4j.integer.toNumber(row.targetCharsPerSection as any)
            : undefined,
      createdAt:
        typeof row.createdAt === 'number'
          ? new Date(row.createdAt).toISOString()
          : typeof row.createdAt === 'string'
            ? row.createdAt
            : new Date().toISOString(),
    });
  }

  async searchSimilarBriefs(params: {
    queryText: string;
    angle?: string;
    projectId: string;
    tenantId: string;
    limit?: number;
    threshold?: number;
  }): Promise<EditorialBriefSearchResult[]> {
    const { queryText, angle, projectId, tenantId, limit = 5, threshold = 0.6 } = params;

    if (!this.embeddingService) {
      this.logger.warn('EmbeddingService not available, skip similarity search');
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

      // Validate embedding
      const hasInvalidValues = queryEmbedding.some(
        v => !Number.isFinite(v) || v < -1e10 || v > 1e10
      );
      if (hasInvalidValues) {
        this.logger.error('Invalid embedding values detected', {
          length: queryEmbedding.length,
          sample: queryEmbedding.slice(0, 5),
          hasNaN: queryEmbedding.some(v => Number.isNaN(v)),
          hasInfinity: queryEmbedding.some(v => !Number.isFinite(v)),
        });
        return [];
      }

      this.logger.debug('[searchSimilarBriefs] Query params', {
        projectId,
        tenantId,
        angle,
        embeddingDim: queryEmbedding.length,
        embeddingSample: queryEmbedding.slice(0, 3),
        threshold,
        limit,
        limitCandidates: Math.max(limit * 4, 20),
      });

      // Search all EditorialBriefs in project/tenant (no seoBriefId scoping)
      const cypher = `//cypher
        CALL db.index.vector.queryNodes('brief_embedding_index', toInteger($limitCandidates), $queryEmbedding)
        YIELD node, score
        WITH node, score
        WHERE score >= $threshold
          AND node.project_id = $projectId
          AND node.tenant_id = $tenantId
          AND ($angle IS NULL OR node.angle = $angle)
        OPTIONAL MATCH (node)-[:BRIEF_GENERATED_ARTICLE]->(a:Article)
        OPTIONAL MATCH (node)-[:BRIEF_USES_BUSINESS_CONTEXT]->(bc:BusinessContext)
        WITH node AS e,
             score AS similarity,
             a.id AS articleId,
             a.status AS articleStatus,
             bc
        RETURN e.id AS id,
               e.tenant_id AS tenantId,
               e.project_id AS projectId,
               e.language AS language,
               e.angle AS angle,
               e.corpus_topic_ids AS corpusTopicIds,
               e.created_at AS createdAt,
               similarity,
               articleId,
               articleStatus,
               bc.target_audience AS targetAudience,
               bc.industry AS industry,
               bc.business_description AS businessDescription,
               bc.content_type AS contentType
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      const rows = await this.conn.query<Record<string, unknown>>(
        cypher,
        {
          queryEmbedding,
          projectId,
          tenantId,
          threshold,
          limit: neo4j.int(limit),
          limitCandidates: neo4j.int(Math.max(limit * 4, 20)),
          angle: angle ?? null,
        },
        'READ'
      );

      const { EditorialBrief } = await import('@casys/core');

      return rows.map(r => {
        // No SeoBrief needed for search results (only metadata required)
        const brief = EditorialBrief.create({
          id: String(r.id),
          tenantId: String(r.tenantId),
          projectId: String(r.projectId),
          language: typeof r.language === 'string' ? r.language : 'en',
          angle: typeof r.angle === 'string' ? r.angle : '',
          businessContext: {
            targetAudience: typeof r.targetAudience === 'string' ? r.targetAudience : '',
            industry: typeof r.industry === 'string' ? r.industry : '',
            businessDescription:
              typeof r.businessDescription === 'string' ? r.businessDescription : '',
            contentType: typeof r.contentType === 'string' ? r.contentType : '',
          },
          corpusTopicIds: (r.corpusTopicIds as string[]) ?? [],
          createdAt:
            typeof r.createdAt === 'number'
              ? new Date(r.createdAt).toISOString()
              : typeof r.createdAt === 'string'
                ? r.createdAt
                : new Date().toISOString(),
        });

        return {
          brief,
          similarityScore: Number(r.similarity ?? 0),
          articleId: r.articleId ? String(r.articleId) : undefined,
          articleStatus: r.articleStatus ? String(r.articleStatus) : undefined,
        };
      });
    } catch (error) {
      this.logger.error('searchSimilarBriefs failed', error);
      return [];
    }
  }

  async linkBriefToArticle(briefId: string, articleId: string, tenantId: string): Promise<void> {
    const cypher = `//cypher
      MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId })
      MERGE (a:Article { id: $articleId })
      MERGE (e)-[:BRIEF_GENERATED_ARTICLE]->(a)
    `;
    await this.conn.query(cypher, { briefId, articleId, tenantId }, 'WRITE');
  }

  async linkBriefToKeywordPlans(
    briefId: string,
    planIds: string[],
    tenantId: string
  ): Promise<void> {
    if (!planIds || planIds.length === 0) return;

    const now = Date.now();
    for (const planId of planIds) {
      await this.conn.query(
        `MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId })
         MATCH (kp:KeywordPlan { id: $planId })
         MERGE (e)-[r:USES_KEYWORD_PLAN]->(kp)
         ON CREATE SET r.created_at = $now
         ON MATCH SET r.updated_at = $now`,
        { briefId, tenantId, planId, now },
        'WRITE'
      );
    }
  }

  async hasBriefForArticle(params: { tenantId: string; articleId: string }): Promise<boolean> {
    const { tenantId, articleId } = params;
    const cypher = `//cypher
      MATCH (e:EditorialBrief { tenant_id: $tenantId })-[:BRIEF_GENERATED_ARTICLE]->(a:Article { id: $articleId })
      RETURN e.id AS id
      LIMIT 1
    `;
    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { tenantId, articleId },
      'READ'
    );
    return rows.length > 0;
  }

  async getExistingAngles(params: {
    projectId: string;
    tenantId: string;
    limit?: number | undefined;
  }): Promise<string[]> {
    const { tenantId, projectId, limit = 20 } = params;

    this.logger.debug('[getExistingAngles] Loading angles for project', {
      projectId,
      tenantId,
      limit,
    });

    const cypher = `//cypher
      MATCH (e:EditorialBrief { tenant_id: $tenantId, project_id: $projectId })
      RETURN e.angle AS angle
      ORDER BY e.created_at DESC
      LIMIT $limit
    `;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      { tenantId, projectId, limit: neo4j.int(limit) },
      'READ'
    );

    const angles = rows.map(r => String(r.angle ?? '')).filter(a => a.length > 0);

    this.logger.debug('[getExistingAngles] Found angles', {
      count: angles.length,
      projectId,
    });

    return angles;
  }

  async getAllEditorialBriefs(params: {
    projectId: string;
    tenantId: string;
    limit?: number;
  }): Promise<EditorialBrief[]> {
    const { tenantId, projectId, limit = 20 } = params;

    this.logger.debug('[getAllEditorialBriefs] Loading all briefs for project', {
      projectId,
      tenantId,
      limit,
    });

    const cypher = `//cypher
      MATCH (eb:EditorialBrief { tenant_id: $tenantId, project_id: $projectId })
      OPTIONAL MATCH (eb)-[:BRIEF_USES_BUSINESS_CONTEXT]->(bc:BusinessContext)
      OPTIONAL MATCH (eb)-[:USES_KEYWORD]->(kt:KeywordTag)
      WITH eb, bc, collect(DISTINCT kt) as keywords
      RETURN eb.id AS id,
             eb.tenant_id AS tenantId,
             eb.project_id AS projectId,
             eb.language AS language,
             eb.angle AS angle,
             eb.corpus_topic_ids AS corpusTopicIds,
             eb.target_sections_count AS targetSectionsCount,
             eb.target_chars_per_section AS targetCharsPerSection,
             eb.created_at AS createdAt,
             bc.target_audience AS targetAudience,
             bc.industry AS industry,
             bc.business_description AS businessDescription,
             bc.content_type AS contentType,
             bc.site_type AS siteType,
             keywords
      ORDER BY eb.created_at DESC
      LIMIT $limit
    `;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      {
        tenantId,
        projectId,
        limit: neo4j.int(limit),
      },
      'READ'
    );

    this.logger.debug('[getAllEditorialBriefs] Found briefs', {
      count: rows.length,
      projectId,
    });

    if (rows.length === 0) return [];

    const { EditorialBrief } = await import('@casys/core');

    // Return partial EditorialBriefs (without seoBrief) - same pattern as getEditorialBriefsForSeoBrief
    return rows.map(r => {
      return EditorialBrief.create({
        id: String(r.id),
        tenantId: String(r.tenantId),
        projectId: String(r.projectId),
        language: typeof r.language === 'string' ? r.language : 'en',
        angle: typeof r.angle === 'string' ? r.angle : '',
        businessContext: {
          targetAudience: typeof r.targetAudience === 'string' && r.targetAudience.trim()
            ? r.targetAudience
            : 'Unknown',
          industry: typeof r.industry === 'string' && r.industry.trim()
            ? r.industry
            : 'Unknown',
          businessDescription:
            typeof r.businessDescription === 'string' && r.businessDescription.trim()
              ? r.businessDescription
              : 'No description',
          contentType: typeof r.contentType === 'string' ? r.contentType : '',
          siteType: typeof r.siteType === 'string' ? r.siteType : undefined,
        },
        keywordTags: Array.isArray(r.keywords)
          ? (r.keywords as any[]).map(kt => ({
              label: String(kt.label ?? ''),
              slug: String(kt.slug ?? ''),
              source: (kt.source ?? 'editorial') as any,
            }))
          : [],
        corpusTopicIds: (r.corpusTopicIds as string[]) ?? [],
        targetSectionsCount:
          typeof r.targetSectionsCount === 'number'
            ? r.targetSectionsCount
            : neo4j.isInt(r.targetSectionsCount)
              ? neo4j.integer.toNumber(r.targetSectionsCount as any)
              : undefined,
        targetCharsPerSection:
          typeof r.targetCharsPerSection === 'number'
            ? r.targetCharsPerSection
            : neo4j.isInt(r.targetCharsPerSection)
              ? neo4j.integer.toNumber(r.targetCharsPerSection as any)
              : undefined,
        createdAt:
          typeof r.createdAt === 'number'
            ? new Date(r.createdAt).toISOString()
            : typeof r.createdAt === 'string'
              ? r.createdAt
              : new Date().toISOString(),
        // No seoBrief - pattern validated in searchSimilarBriefs line 431
      });
    });
  }

  async getEditorialBriefsForSeoBrief(params: {
    seoBriefId: string;
    tenantId: string;
    projectId: string;
    limit?: number;
  }): Promise<EditorialBrief[]> {
    const { seoBriefId, tenantId, projectId, limit = 10 } = params;

    this.logger.debug('[getEditorialBriefsForSeoBrief] Searching briefs for SeoBrief', {
      seoBriefId,
      projectId,
      limit,
    });

    const cypher = `//cypher
      MATCH (sb:SeoBrief { id: $seoBriefId })-[:INFORMS]->(eb:EditorialBrief)
      WHERE eb.tenant_id = $tenantId AND eb.project_id = $projectId
      OPTIONAL MATCH (eb)-[:BRIEF_USES_BUSINESS_CONTEXT]->(bc:BusinessContext)
      OPTIONAL MATCH (eb)-[:USES_KEYWORD]->(kt:KeywordTag)
      WITH eb, bc, collect(DISTINCT kt) as keywords
      RETURN eb.id AS id,
             eb.tenant_id AS tenantId,
             eb.project_id AS projectId,
             eb.language AS language,
             eb.angle AS angle,
             eb.corpus_topic_ids AS corpusTopicIds,
             eb.target_sections_count AS targetSectionsCount,
             eb.target_chars_per_section AS targetCharsPerSection,
             eb.created_at AS createdAt,
             bc.target_audience AS targetAudience,
             bc.industry AS industry,
             bc.business_description AS businessDescription,
             bc.content_type AS contentType,
             bc.site_type AS siteType,
             keywords
      ORDER BY eb.created_at DESC
      LIMIT $limit
    `;

    const rows = await this.conn.query<Record<string, unknown>>(
      cypher,
      {
        seoBriefId,
        tenantId,
        projectId,
        limit: neo4j.int(limit),
      },
      'READ'
    );

    this.logger.debug('[getEditorialBriefsForSeoBrief] Found briefs', {
      count: rows.length,
      seoBriefId,
    });

    if (rows.length === 0) return [];

    const { EditorialBrief } = await import('@casys/core');

    // Pattern searchSimilarBriefs (ligne 431): EditorialBrief partiel sans seoBrief
    return rows.map(r => {
      return EditorialBrief.create({
        id: String(r.id),
        tenantId: String(r.tenantId),
        projectId: String(r.projectId),
        language: typeof r.language === 'string' ? r.language : 'en',
        angle: typeof r.angle === 'string' ? r.angle : '',
        businessContext: {
          targetAudience: typeof r.targetAudience === 'string' && r.targetAudience.trim()
            ? r.targetAudience
            : 'Unknown',
          industry: typeof r.industry === 'string' && r.industry.trim()
            ? r.industry
            : 'Unknown',
          businessDescription:
            typeof r.businessDescription === 'string' && r.businessDescription.trim()
              ? r.businessDescription
              : 'No description',
          contentType: typeof r.contentType === 'string' ? r.contentType : '',
          siteType: typeof r.siteType === 'string' ? r.siteType : undefined,
        },
        keywordTags: Array.isArray(r.keywords)
          ? (r.keywords as any[]).map(kt => ({
              label: String(kt.label ?? ''),
              slug: String(kt.slug ?? ''),
              source: (kt.source ?? 'editorial') as any,
            }))
          : [],
        corpusTopicIds: (r.corpusTopicIds as string[]) ?? [],
        // V3.1: Contraintes structurelles (optionnels)
        targetSectionsCount:
          typeof r.targetSectionsCount === 'number'
            ? r.targetSectionsCount
            : neo4j.isInt(r.targetSectionsCount)
              ? neo4j.integer.toNumber(r.targetSectionsCount as any)
              : undefined,
        targetCharsPerSection:
          typeof r.targetCharsPerSection === 'number'
            ? r.targetCharsPerSection
            : neo4j.isInt(r.targetCharsPerSection)
              ? neo4j.integer.toNumber(r.targetCharsPerSection as any)
              : undefined,
        createdAt:
          typeof r.createdAt === 'number'
            ? new Date(r.createdAt).toISOString()
            : typeof r.createdAt === 'string'
              ? r.createdAt
              : new Date().toISOString(),
        // PAS de seoBrief - pattern validé searchSimilarBriefs ligne 431
      });
    });
  }

  async linkBriefToTopicClusters(params: {
    briefId: string;
    tenantId: string;
    projectId: string;
    pillarTag?: { label: string; slug: string; source?: string };
    satelliteTags: { label: string; slug: string; source?: string }[];
  }): Promise<void> {
    const { briefId, tenantId, projectId, pillarTag, satelliteTags } = params;
    const now = Date.now();

    if (pillarTag) {
      const normalizedSlug = slugifyKeyword(pillarTag.slug ?? pillarTag.label);
      const tagId = buildKeywordTagId(tenantId, projectId, normalizedSlug);
      await this.conn.query(
        `//cypher
        MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId, project_id: $projectId })
        MERGE (kt:KeywordTag { id: $tagId })
          ON CREATE SET kt.created_at = $now
        SET kt.slug = $slug,
            kt.label = $label,
            kt.source = coalesce($source, kt.source),
            kt.tenant_id = $tenantId,
            kt.project_id = $projectId,
            kt.updated_at = $now
        MERGE (e)-[r:BRIEF_COVERS_PILLAR]->(kt)
          ON CREATE SET r.created_at = $now
          ON MATCH SET r.updated_at = $now
        `,
        {
          briefId,
          tenantId,
          projectId,
          tagId,
          slug: normalizedSlug,
          label: pillarTag.label,
          source: pillarTag.source ?? null,
          now,
        },
        'WRITE'
      );
    }

    for (const s of satelliteTags ?? []) {
      const normalizedSlug = slugifyKeyword(s.slug ?? s.label);
      const tagId = buildKeywordTagId(tenantId, projectId, normalizedSlug);
      await this.conn.query(
        `//cypher
        MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId, project_id: $projectId })
        MERGE (kt:KeywordTag { id: $tagId })
          ON CREATE SET kt.created_at = $now
        SET kt.slug = $slug,
            kt.label = $label,
            kt.source = coalesce($source, kt.source),
            kt.tenant_id = $tenantId,
            kt.project_id = $projectId,
            kt.updated_at = $now
        MERGE (e)-[r:BRIEF_COVERS_SATELLITE]->(kt)
          ON CREATE SET r.created_at = $now
          ON MATCH SET r.updated_at = $now
        `,
        {
          briefId,
          tenantId,
          projectId,
          tagId,
          slug: normalizedSlug,
          label: s.label,
          source: s.source ?? null,
          now,
        },
        'WRITE'
      );
    }
  }
}
