import { slugifyKeyword, type Topic } from '@casys/core';
import {
  type EmbeddingPort,
  type GetTopicByIdParams,
  type GetTopicBySourceUrlParams,
  type TopicRepositoryPort,
  type UpsertTopicsParams,
} from '@casys/application';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jTopicRepositoryAdapter implements TopicRepositoryPort {
  private readonly logger = createLogger('Neo4jTopicRepositoryAdapter');
  constructor(private readonly conn: Neo4jConnection, private readonly embeddingService?: EmbeddingPort) {}

  async upsertTopics(params: UpsertTopicsParams): Promise<void> {
    const { tenantId, projectId, topics } = params;
    if (!tenantId?.trim() || !projectId?.trim()) throw new Error('tenantId/projectId requis');
    if (!Array.isArray(topics) || topics.length === 0) throw new Error('topics[] vide');

    await this.conn.query(
      `MERGE (ten:Tenant { id: $tenantId })
       MERGE (proj:Project { id: $projectId })
       SET proj.tenant_id = COALESCE(proj.tenant_id, $tenantId)
       MERGE (ten)-[:TENANT_HAS_PROJECT]->(proj)`,
      { tenantId, projectId },
      'WRITE'
    );

    for (const t of topics) {
      if (!t?.id?.trim()) throw new Error('topic.id requis');
      const id = t.id;
      const name = (t.title ?? '').trim();
      const language = (t.language ?? '').trim() || null;
      const sourceUrl = (t.sourceUrl ?? '').trim() || null;
      const summary = (t.sourceContent ?? '').trim().slice(0, 400) || null;
      const imageUrls = Array.isArray(t.imageUrls) ? t.imageUrls.filter(u => typeof u === 'string') : [];
      const now = Date.now();

      let embTitle: number[] | null = null;
      let embDesc: number[] | null = null;
      if (this.embeddingService) {
        try { if (name) embTitle = await this.embeddingService.generateEmbedding(name); } catch (e) { this.logger.warn('Embedding title failed', e); }
        try { if (summary) embDesc = await this.embeddingService.generateEmbedding(summary); } catch (e) { this.logger.warn('Embedding desc failed', e); }
      }

      await this.conn.query(
        `MERGE (t:Topic { id: $id })
         ON CREATE SET t.created_at = $now
         SET t.name = $name,
             t.tenant_id = COALESCE(t.tenant_id, $tenantId),
             t.project_id = COALESCE(t.project_id, $projectId),
             t.source_url = COALESCE($sourceUrl, t.source_url),
             t.language = COALESCE($language, t.language),
             t.summary = COALESCE($summary, t.summary),
             t.image_urls = CASE WHEN size($imageUrls) > 0 THEN $imageUrls ELSE t.image_urls END,
             t.updated_at = $now`,
        { id, name, tenantId, projectId, sourceUrl, language, summary, imageUrls, now },
        'WRITE'
      );

      if (Array.isArray(embTitle) && embTitle.length > 0) {
        await this.conn.query(`MATCH (t:Topic { id: $id }) SET t.embedding_title = $emb`, { id, emb: embTitle }, 'WRITE');
      }
      if (Array.isArray(embDesc) && embDesc.length > 0) {
        await this.conn.query(`MATCH (t:Topic { id: $id }) SET t.embedding_desc = $emb`, { id, emb: embDesc }, 'WRITE');
      }

      // Lier automatiquement le Topic aux KeywordTags pertinents
      await this.linkTopicToKeywordTags({
        topicId: id,
        tenantId,
        projectId,
        sourceUrl,
        titleEmbedding: embTitle,
        summaryEmbedding: embDesc,
      });
    }
  }

  /**
   * Lie un Topic aux KeywordTags pertinents via:
   * 1. Match exact sur les keywords de l'URL (toujours)
   * 2. Match vectoriel via embeddings (optionnel, si disponibles)
   */
  private async linkTopicToKeywordTags(params: {
    topicId: string;
    tenantId: string;
    projectId: string;
    sourceUrl: string | null;
    titleEmbedding?: number[] | null;
    summaryEmbedding?: number[] | null;
  }): Promise<void> {
    const { topicId, tenantId, projectId, sourceUrl, titleEmbedding, summaryEmbedding } = params;
    const now = Date.now();

    // 1. MATCH EXACT via URL keywords (si URL présente)
    if (sourceUrl) {
      const urlKeywords = this.extractKeywordsFromUrl(sourceUrl);
      this.logger.debug(`[linkTopicToKeywordTags] URL keywords extracted`, {
        topicId,
        sourceUrl,
        keywords: urlKeywords,
      });

      for (const keyword of urlKeywords) {
        const slug = slugifyKeyword(keyword);
        const tagId = `${tenantId}::${projectId}::${slug}`;

        // Vérifier si le KeywordTag existe
        const tagExists = await this.conn.query(
          `MATCH (kt:KeywordTag {id: $tagId}) RETURN kt.id LIMIT 1`,
          { tagId },
          'READ'
        );

        if (tagExists.length > 0) {
          // Créer la relation RELATES_TO
          await this.conn.query(
            `MATCH (t:Topic {id: $topicId})
             MATCH (kt:KeywordTag {id: $tagId})
             MERGE (t)-[r:RELATES_TO]->(kt)
             ON CREATE SET r.score = 1.0, r.source = 'url_exact', r.created_at = $now
             ON MATCH SET r.updated_at = $now`,
            { topicId, tagId, now },
            'WRITE'
          );
          this.logger.debug(`[linkTopicToKeywordTags] Linked via URL exact match`, {
            topicId,
            tagId,
            keyword,
          });
        }
      }
    }

    // 2. MATCH VECTORIEL (optionnel - uniquement si embeddings disponibles)
    let embedding = titleEmbedding && titleEmbedding.length > 0 ? titleEmbedding : summaryEmbedding;
    
    // Fallback: générer embedding à partir des keywords de l'URL si pas d'embedding title/desc
    if ((!embedding || embedding.length === 0) && sourceUrl && this.embeddingService) {
      const urlKeywords = this.extractKeywordsFromUrl(sourceUrl);
      if (urlKeywords.length > 0) {
        const slugText = urlKeywords.join(' ');
        try {
          embedding = await this.embeddingService.generateEmbedding(slugText);
          this.logger.debug(`[linkTopicToKeywordTags] Generated embedding from URL slug`, {
            topicId,
            slugText,
            embeddingDim: embedding?.length,
          });
        } catch (e) {
          this.logger.warn(`[linkTopicToKeywordTags] Failed to generate slug embedding`, e);
        }
      }
    }

    const hasEmbedding = embedding && embedding.length > 0;

    if (hasEmbedding && this.embeddingService) {
      this.logger.debug(`[linkTopicToKeywordTags] Attempting vector match`, { topicId });

      try {
        // Recherche vectorielle des KeywordTags similaires
        // Note: Cypher avec cosine similarity approximée
        const similarTags = await this.conn.query<{
          tagId: string;
          label: string;
          score: number;
        }>(
          `MATCH (kt:KeywordTag)
           WHERE kt.tenant_id = $tenantId
             AND kt.project_id = $projectId
             AND kt.embedding IS NOT NULL
           WITH kt,
                reduce(dot = 0.0, i IN range(0, size($embedding)-1) |
                  dot + $embedding[i] * kt.embedding[i]
                ) AS dotProduct,
                reduce(normA = 0.0, i IN range(0, size($embedding)-1) |
                  normA + $embedding[i] * $embedding[i]
                ) AS normA,
                reduce(normB = 0.0, i IN range(0, size(kt.embedding)-1) |
                  normB + kt.embedding[i] * kt.embedding[i]
                ) AS normB
           WITH kt,
                dotProduct / (sqrt(normA) * sqrt(normB)) AS score
           WHERE score >= 0.7
           RETURN kt.id AS tagId, kt.label AS label, score
           ORDER BY score DESC
           LIMIT 10`,
          { tenantId, projectId, embedding },
          'READ'
        );

        this.logger.debug(`[linkTopicToKeywordTags] Vector match found`, {
          topicId,
          matchesCount: similarTags.length,
        });

        for (const tag of similarTags) {
          await this.conn.query(
            `MATCH (t:Topic {id: $topicId})
             MATCH (kt:KeywordTag {id: $tagId})
             MERGE (t)-[r:RELATES_TO]->(kt)
             ON CREATE SET r.score = $score, r.source = 'embedding', r.created_at = $now
             ON MATCH SET r.score = CASE
               WHEN r.source = 'url_exact' THEN r.score
               ELSE $score
             END,
             r.updated_at = $now`,
            { topicId, tagId: tag.tagId, score: tag.score, now },
            'WRITE'
          );
          this.logger.debug(`[linkTopicToKeywordTags] Linked via vector match`, {
            topicId,
            tagId: tag.tagId,
            label: tag.label,
            score: tag.score,
          });
        }
      } catch (error) {
        this.logger.warn(`[linkTopicToKeywordTags] Vector match failed`, error);
      }
    }
  }

  /**
   * Extrait les keywords potentiels de l'URL
   * Ex: "https://site.com/reglementation-btp-2025-normes"
   *  → ["reglementation", "btp", "normes"]
   */
  private extractKeywordsFromUrl(url: string): string[] {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      // Split par / et -
      const parts = pathname
        .split('/')
        .flatMap(part => part.split('-'))
        .map(p => p.trim().toLowerCase())
        .filter(p => p.length > 2) // Mots > 2 caractères
        .filter(p => !/^\d+$/.test(p)); // Exclure nombres purs

      return [...new Set(parts)]; // Déduplication
    } catch (error) {
      this.logger.warn(`[extractKeywordsFromUrl] Failed to parse URL`, { url, error });
      return [];
    }
  }

  async getTopicById(params: GetTopicByIdParams): Promise<Topic | null> {
    const { topicId } = params;
    if (!topicId?.trim()) throw new Error('topicId requis');
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (t:Topic { id: $id }) RETURN t.id AS id, t.name AS name LIMIT 1`,
      { id: topicId },
      'READ'
    );
    const r = rows[0];
    if (!r) return null;
    return { id: String(r.id), title: (r.name as string) ?? String(r.id), createdAt: new Date().toISOString() } as Topic;
  }

  async getTopicBySourceUrl(params: GetTopicBySourceUrlParams): Promise<Topic | null> {
    const { tenantId, projectId, sourceUrl } = params;
    if (!tenantId?.trim() || !projectId?.trim() || !sourceUrl?.trim()) throw new Error('paramètres requis');
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (t:Topic { source_url: $sourceUrl })
       WHERE t.tenant_id = $tenantId AND t.project_id = $projectId
       RETURN t.id AS id, t.name AS name, t.language AS language, t.source_url AS sourceUrl, t.summary AS summary
       LIMIT 1`,
      { tenantId, projectId, sourceUrl },
      'READ'
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      title: (r.name as string) ?? String(r.id),
      createdAt: new Date().toISOString(),
      language: (r.language as string | undefined) ?? undefined,
      sourceUrl: (r.sourceUrl as string | undefined) ?? undefined,
      sourceContent: (r.summary as string | undefined) ?? undefined,
    } as Topic;
  }
}
