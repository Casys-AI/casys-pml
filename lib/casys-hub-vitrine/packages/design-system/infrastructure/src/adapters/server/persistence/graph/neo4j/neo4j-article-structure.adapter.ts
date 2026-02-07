import {
  type ArticleListingPort,
  type ArticleStructureStorePort,
  type EmbeddingPort,
} from '@casys/application';
import {
  type ArticleNode,
  type ArticleSearchResult,
  type ArticleStructure,
  type ComponentUsage,
  type SectionNode,
} from '@casys/core';

import { createLogger } from '../../../../../utils/logger';
import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jArticleStructureAdapter implements ArticleStructureStorePort, ArticleListingPort {
  private readonly logger = createLogger('Neo4jArticleStructureAdapter');

  // Helpers to coerce unknown values safely
  private str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v : fallback;
  }
  private num(v: unknown, fallback = 0): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }
  private strArr(v: unknown): string[] {
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  }
  private isoDate(v: unknown): string {
    if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
    if (typeof v === 'string') return v;
    return new Date().toISOString();
  }

  constructor(
    private readonly conn: Neo4jConnection,
    private readonly embeddingService?: EmbeddingPort,
    private readonly sectionHierarchyAdapter?: import('./neo4j-section-hierarchy.adapter').Neo4jSectionHierarchyAdapter,
    private readonly textFragmentAdapter?: import('./neo4j-text-fragment.adapter').Neo4jTextFragmentAdapter,
    private readonly commentAdapter?: import('./neo4j-comment.adapter').Neo4jCommentAdapter
  ) {}

  async indexArticleStructure(
    articleStructure: ArticleStructure,
    tenantId?: string
  ): Promise<void> {
    const { article, sections, textFragments, comments } = articleStructure;
    await this.upsertOutline(article, sections, tenantId);

    for (const section of sections) {
      if (section.content) {
        await this.updateSectionContent(
          `${article.id}::${section.position}`,
          section.content,
          article.projectId,
          tenantId,
          section.summary
        );
      }
    }

    // Create TextFragments with embeddings if present
    if (textFragments && textFragments.length > 0 && this.textFragmentAdapter) {
      await this.textFragmentAdapter.createTextFragments(textFragments);
    }

    // Create Comments with embeddings if present
    if (comments && comments.length > 0 && this.commentAdapter) {
      await this.commentAdapter.createComments(comments, textFragments ?? []);
    }

    this.logger.log(
      `Indexed article structure: ${article.id} (${sections.length} sections, ${textFragments?.length ?? 0} fragments, ${comments?.length ?? 0} comments)`
    );
  }

  async deleteArticleStructure(articleId: string, tenantId?: string): Promise<void> {
    const cypher = `
      MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} })
      OPTIONAL MATCH (a)-[:HAS_SECTION]->(s:Section)
      DETACH DELETE s, a
    `;
    await this.conn.query(cypher, { articleId, tenantId }, 'WRITE');
    this.logger.log(`Deleted article structure: ${articleId}`);
  }

  async upsertOutline(
    article: ArticleNode,
    sections: SectionNode[],
    tenantId?: string
  ): Promise<void> {
    const now = Date.now();
    let articleEmbedding: number[] | null = null;
    let embeddingText: string | null = null;

    if (this.embeddingService && article.title) {
      try {
        embeddingText = `${article.title}\n\n${article.description ?? ''}`;
        articleEmbedding = await this.embeddingService.generateEmbedding(embeddingText);
      } catch (e) {
        this.logger.warn(`Failed to generate article embedding: ${e}`);
      }
    }

    await this.conn.query(
      `MERGE (a:Article { id: $id })
       ON CREATE SET a.created_at = $now,
                     a.embedding = $embedding,
                     a.embedding_text = $embeddingText
       SET a.title = $title,
           a.slug = COALESCE($slug, a.slug, $id),
           a.description = $description,
           a.tenant_id = COALESCE($tenantId, a.tenant_id),
           a.project_id = $projectId,
           a.keywords = $keywords,
           a.sources = $sources,
           a.updated_at = $now`,
      {
        id: article.id,
        title: article.title,
        slug: article.slug ?? null,
        description: article.description ?? '',
        tenantId: tenantId ?? null,
        projectId: article.projectId,
        keywords: article.keywords ?? [],
        sources: article.sources ?? [],
        embedding: articleEmbedding,
        embeddingText,
        now,
      },
      'WRITE'
    );

    // Étape 1 : Créer toutes les sections et construire une map position → canonicalId
    const positionToIdMap = new Map<number, string>();
    for (const section of sections) {
      const canonicalId = `${article.id}::${section.position}`;
      positionToIdMap.set(section.position, canonicalId);

      await this.conn.query(
        `MATCH (a:Article { id: $articleId })
         MERGE (s:Section { id: $id })
         ON CREATE SET s.created_at = $now
         SET s.title = $title,
             s.description = $description,
             s.level = $level,
             s.position = $position,
             s.article_id = $articleId,
             s.parent_section_id = $parentSectionId,
             s.updated_at = $now
         MERGE (a)-[:HAS_SECTION]->(s)`,
        {
          id: canonicalId,
          articleId: article.id,
          title: section.title,
          description: section.description ?? '',
          level: section.level,
          position: section.position,
          parentSectionId: section.parentSectionId ?? null,
          now,
        },
        'WRITE'
      );
    }

    // Étape 2 : Créer les relations de hiérarchie parent-enfant via HAS_SUBSECTION
    if (this.sectionHierarchyAdapter) {
      for (const section of sections) {
        if (!section.parentSectionId) continue;

        const canonicalId = positionToIdMap.get(section.position);
        if (!canonicalId) {
          this.logger.warn(`Section position ${section.position} not found in map, skipping hierarchy link`);
          continue;
        }

        // Résoudre parentSectionId : soit c'est déjà un ID canonique, soit c'est une position à résoudre
        let parentCanonicalId: string | undefined;
        if (section.parentSectionId.includes('::')) {
          // Format canonique (articleId::position)
          parentCanonicalId = section.parentSectionId;
        } else {
          // C'est probablement une position, chercher dans la map
          const parentPosition = parseInt(section.parentSectionId, 10);
          if (!isNaN(parentPosition)) {
            parentCanonicalId = positionToIdMap.get(parentPosition);
          }
        }

        if (!parentCanonicalId) {
          this.logger.warn(`Parent section not found for section ${section.position}, parentSectionId: ${section.parentSectionId}`);
          continue;
        }

        await this.sectionHierarchyAdapter.linkSectionToParent({
          sectionId: canonicalId,
          parentSectionId: parentCanonicalId,
          articleId: article.id,
          tenantId,
        });
      }
    }
    this.logger.log(`Outline upserted for article: ${article.id}`);
  }

  async upsertSection(section: SectionNode, projectId: string, tenantId?: string): Promise<void> {
    const canonicalId = `${section.articleId}::${section.position}`;
    const now = Date.now();

    await this.conn.query(
      `MATCH (a:Article { id: $articleId, project_id: $projectId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       MERGE (s:Section { id: $id })
       ON CREATE SET s.created_at = $now
       SET s.title = $title,
           s.description = $description,
           s.level = $level,
           s.position = $position,
           s.article_id = $articleId,
           s.parent_section_id = $parentSectionId,
           s.updated_at = $now
       MERGE (a)-[:HAS_SECTION]->(s)`,
      {
        id: canonicalId,
        articleId: section.articleId,
        projectId,
        tenantId,
        title: section.title,
        description: section.description ?? '',
        level: section.level,
        position: section.position,
        parentSectionId: section.parentSectionId ?? null,
        now,
      },
      'WRITE'
    );
  }

  async updateSectionContent(
    sectionId: string,
    content: string,
    projectId: string,
    tenantId?: string,
    summary?: string
  ): Promise<void> {
    let sectionEmbedding: number[] | null = null;
    let embeddingText: string | null = null;

    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (s:Section { id: $sectionId })<-[:HAS_SECTION]-(a:Article { project_id: $projectId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN s.title AS title`,
      { sectionId, projectId, tenantId },
      'READ'
    );

    if (rows.length > 0 && this.embeddingService) {
      try {
        const title = this.str(rows[0]?.title);
        embeddingText = `${title}\n\n${content}`;
        sectionEmbedding = await this.embeddingService.generateEmbedding(embeddingText);
      } catch (e) {
        this.logger.warn(`Failed to generate section embedding: ${e}`);
      }
    }

    await this.conn.query(
      `MATCH (s:Section { id: $sectionId })<-[:HAS_SECTION]-(a:Article { project_id: $projectId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       SET s.content = $content,
           s.summary = COALESCE($summary, s.summary),
           s.embedding = $embedding,
           s.embedding_text = $embeddingText,
           s.updated_at = $now`,
      {
        sectionId,
        projectId,
        tenantId,
        content,
        summary: summary ?? null,
        embedding: sectionEmbedding,
        embeddingText,
        now: Date.now(),
      },
      'WRITE'
    );
  }

  async linkSectionToArticle(params: {
    sectionId: string;
    articleId: string;
    tenantId: string;
    projectId: string;
  }): Promise<void> {
    await this.conn.query(
      `MATCH (s:Section { id: $sectionId })
       MATCH (target:Article { id: $articleId, tenant_id: $tenantId, project_id: $projectId })
       MERGE (s)-[:REFERENCES]->(target)`,
      params,
      'WRITE'
    );
  }

  async getAllArticles(limit = 50): Promise<ArticleNode[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article)
       RETURN a.id AS id, a.title AS title, a.slug AS slug, a.description AS description,
              a.project_id AS projectId, a.tenant_id AS tenantId,
              a.keywords AS keywords, a.sources AS sources,
              a.language AS language, a.created_at AS createdAt,
              a.agents AS agents, a.content AS content
       ORDER BY a.created_at DESC
       LIMIT $limit`,
      { limit },
      'READ'
    );

    return rows.map(r => ({
      id: this.str(r.id),
      title: this.str(r.title),
      description: this.str(r.description),
      language: this.str(r.language, 'en'),
      createdAt: this.isoDate(r.createdAt),
      keywords: this.strArr(r.keywords),
      cover: undefined,
      sources: this.strArr(r.sources),
      agents: this.strArr(r.agents),
      tenantId: this.str(r.tenantId),
      projectId: this.str(r.projectId),
      content: this.str(r.content) || undefined,
    }));
  }

  async getArticlesByTenantId(tenantId: string, limit = 50): Promise<ArticleNode[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { tenant_id: $tenantId })
       RETURN a.id AS id, a.title AS title, a.slug AS slug, a.description AS description,
              a.project_id AS projectId, a.keywords AS keywords, a.sources AS sources,
              a.language AS language, a.created_at AS createdAt,
              a.agents AS agents, a.content AS content
       ORDER BY a.created_at DESC
       LIMIT $limit`,
      { tenantId, limit },
      'READ'
    );

    return rows.map(r => ({
      id: this.str(r.id),
      title: this.str(r.title),
      description: this.str(r.description),
      language: this.str(r.language, 'en'),
      createdAt: this.isoDate(r.createdAt),
      keywords: this.strArr(r.keywords),
      cover: undefined,
      sources: this.strArr(r.sources),
      agents: this.strArr(r.agents),
      tenantId,
      projectId: this.str(r.projectId),
      content: this.str(r.content) || undefined,
    }));
  }

  async getArticlesByProjectId(
    projectId: string,
    tenantId?: string,
    limit = 50
  ): Promise<ArticleNode[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { project_id: $projectId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN a.id AS id, a.title AS title, a.slug AS slug, a.description AS description,
              a.project_id AS projectId, a.keywords AS keywords, a.sources AS sources,
              a.language AS language, a.created_at AS createdAt,
              a.agents AS agents, a.content AS content,
              a.tenant_id AS tenantId
       ORDER BY a.created_at DESC
       LIMIT $limit`,
      { projectId, tenantId, limit },
      'READ'
    );

    return rows.map(r => ({
      id: this.str(r.id),
      title: this.str(r.title),
      description: this.str(r.description),
      language: this.str(r.language, 'en'),
      createdAt: this.isoDate(r.createdAt),
      keywords: this.strArr(r.keywords),
      cover: undefined,
      sources: this.strArr(r.sources),
      agents: this.strArr(r.agents),
      tenantId: this.str(r.tenantId),
      projectId: this.str(r.projectId),
      content: this.str(r.content) || undefined,
    }));
  }

  async getArticleById(articleId: string, tenantId?: string): Promise<ArticleNode | null> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} })
       RETURN a.id AS id, a.title AS title, a.slug AS slug, a.description AS description,
              a.project_id AS projectId, a.keywords AS keywords, a.sources AS sources,
              a.language AS language, a.created_at AS createdAt,
              a.agents AS agents, a.content AS content,
              a.tenant_id AS tenantId
       LIMIT 1`,
      { articleId, tenantId },
      'READ'
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: this.str(r.id),
      title: this.str(r.title),
      description: this.str(r.description),
      language: this.str(r.language, 'en'),
      createdAt: this.isoDate(r.createdAt),
      keywords: this.strArr(r.keywords),
      cover: undefined,
      sources: this.strArr(r.sources),
      agents: this.strArr(r.agents),
      tenantId: this.str(r.tenantId),
      projectId: this.str(r.projectId),
      content: this.str(r.content) || undefined,
    };
  }

  async getArticleStructureById(
    articleId: string,
    tenantId?: string
  ): Promise<ArticleStructure | null> {
    const article = await this.getArticleById(articleId, tenantId);
    if (!article) return null;

    const sections = await this.getSectionsByArticleId(articleId, tenantId);
    // Retourner une structure complète (champs requis par l'interface ArticleStructure)
    return {
      article,
      sections,
      componentUsages: [],
      textFragments: [],
    };
  }

  async getSectionsByArticleId(articleId: string, tenantId?: string): Promise<SectionNode[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (a:Article { id: $articleId ${tenantId ? ', tenant_id: $tenantId' : ''} })-[:HAS_SECTION]->(s:Section)
       RETURN s.id AS id, s.title AS title, s.description AS description,
              s.level AS level, s.position AS position, s.content AS content,
              s.summary AS summary, s.parent_section_id AS parentSectionId,
              s.article_id AS articleId
       ORDER BY s.position`,
      { articleId, tenantId },
      'READ'
    );

    return rows.map(r => ({
      id: this.str(r.id),
      articleId: this.str(r.articleId, articleId),
      title: this.str(r.title),
      description: this.str(r.description) || undefined,
      level: this.num(r.level, 1),
      position: this.num(r.position, 0),
      content: this.str(r.content),
      summary: this.str(r.summary) || undefined,
      parentSectionId: this.str(r.parentSectionId) || undefined,
    }));
  }

  async getComponentsBySectionId(sectionId: string, tenantId?: string): Promise<ComponentUsage[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (s:Section { id: $sectionId })-[:HAS_TEXT_FRAGMENT]->(tf:TextFragment)<-[:IN_TEXT_FRAGMENT]-(u:ComponentUsage)
       WHERE $tenantId IS NULL OR u.tenant_id = $tenantId
       RETURN u.id AS id,
              u.component_id AS componentId,
              u.text_fragment_id AS textFragmentId,
              u.props_json AS propsJson,
              u.position AS position,
              u.is_section_header AS isSectionHeader`,
      { sectionId, tenantId: tenantId ?? null },
      'READ'
    );

    return rows.map(r => {
      let props: Record<string, unknown> | undefined;
      try {
        props = r.propsJson ? JSON.parse(String(r.propsJson)) : undefined;
      } catch {
        props = undefined;
      }
      return {
        id: this.str(r.id),
        componentId: this.str(r.componentId),
        textFragmentId: this.str(r.textFragmentId),
        props: props ?? {},
        position: this.num(r.position, 0),
        isSectionHeader: Boolean(r.isSectionHeader),
      } satisfies ComponentUsage;
    });
  }

  async getArticlesByComponentId(
    componentId: string,
    tenantId?: string,
    limit = 10
  ): Promise<ArticleSearchResult[]> {
    const rows = await this.conn.query<Record<string, unknown>>(
      `MATCH (c:Component { id: $componentId })<-[:USES_COMPONENT]-(u:ComponentUsage)-[:IN_TEXT_FRAGMENT]->(tf:TextFragment)<-[:HAS_TEXT_FRAGMENT]-(s:Section)<-[:HAS_SECTION]-(a:Article ${tenantId ? '{ tenant_id: $tenantId }' : ''})
       RETURN DISTINCT a.id AS articleId, a.title AS articleTitle, a.slug AS articleSlug,
              s.id AS sectionId, s.title AS sectionTitle, s.level AS sectionLevel
       LIMIT $limit`,
      { componentId, tenantId, limit },
      'READ'
    );

    return rows.map(r => ({
      articleId: this.str(r.articleId),
      articleTitle: this.str(r.articleTitle),
      articleSlug: this.str(r.articleSlug) || undefined,
      sectionId: this.str(r.sectionId),
      sectionTitle: this.str(r.sectionTitle) || undefined,
      sectionLevel: this.num(r.sectionLevel, 1),
      relevanceScore: 1.0,
      componentIds: [componentId],
    }));
  }
}
