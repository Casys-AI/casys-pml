import type {
  ArticleIndexingArticle,
  ArticleIndexingGlobal,
  ArticleIndexingProject,
  ArticleIndexingTenant,
  ArticleNode,
  ArticleStructure,
  SectionNode,
} from '@casys/core';

/** Port: Article Indexing - actions: upsert outline and section content */
export interface ArticleIndexingUpsertPort {
  indexOutlineProgressively(
    article: ArticleNode,
    sections: SectionNode[],
    tenantId?: string
  ): Promise<void>;
  indexSectionContentProgressively(
    sectionId: string,
    content: string,
    projectId: string,
    tenantId?: string,
    summary?: string
  ): Promise<void>;

  /** Lier une section à un article interne pour le maillage interne */
  linkSectionToArticle(params: {
    sectionId: string;
    articleId: string;
    tenantId: string;
    projectId: string;
  }): Promise<void>;

  // Exécution d'indexation (batch/catalogues)
  indexArticles(params: {
    articles: ArticleStructure[];
    tenantId?: string;
    projectId?: string;
  }): Promise<{
    success: boolean;
    indexedCount: number;
    failedCount: number;
    errors: Error[];
    indexedArticleIds: string[];
    message: string;
  }>;

  indexGlobalCatalog(): Promise<ArticleIndexingGlobal>;
  indexTenantCatalog(tenantId: string): Promise<ArticleIndexingTenant>;
  indexProjectCatalog(tenantId: string, projectId: string): Promise<ArticleIndexingProject>;
  indexArticleCatalog(articleId: string): Promise<ArticleIndexingArticle>;
}

export type IArticleIndexingUpsertPort = ArticleIndexingUpsertPort;
