/**
 * Port OUT pour la gestion des tags
 * Utilise les types du core (@casys/core) pour respecter l'architecture hexagonale
 */

import type { KeywordTag, KeywordTagSearchResult } from '@casys/core';

export interface UpsertArticleTagsParams {
  articleId: string;
  projectId: string;
  tenantId: string;
  tags: KeywordTag[];
  /**
   * Si true, tente de lier les tags au KeywordPlan du projet via matching vectoriel
   * avec les seeds. Sinon, crée des tags orphelins liés uniquement à l'article.
   * @default true
   */
  linkToKeywordPlan?: boolean;
}

export interface GetTagsForArticleParams {
  articleId: string;
  tenantId: string;
}

export interface GetProjectTagsParams {
  projectId: string;
  tenantId: string;
}

export interface SearchSimilarTagsParams {
  queryText: string;
  projectId: string;
  tenantId: string;
  limit?: number;      // Défaut: 10
  threshold?: number;  // Défaut: 0.7
}

export interface UpsertProjectSeedTagsParams {
  tenantId: string;
  projectId: string;
  seeds: KeywordTag[]; // source='seed', slug normalisé
}

export interface GetProjectSeedTagsParams {
  tenantId: string;
  projectId: string;
}

export interface TagRepositoryPort {
  upsertArticleTags(params: UpsertArticleTagsParams): Promise<void>;
  getTagsForArticle(params: GetTagsForArticleParams): Promise<KeywordTag[]>;
  getProjectTags(params: GetProjectTagsParams): Promise<KeywordTag[]>;
  upsertProjectSeedTags(params: UpsertProjectSeedTagsParams): Promise<void>;
  getProjectSeedTags(params: GetProjectSeedTagsParams): Promise<KeywordTag[]>;
  
  /**
   * RAG Vector : Recherche sémantique de tags similaires
   * Utilise les embeddings des tags pour trouver ceux qui sont proches du texte de requête
   * Scoring composite : 70% similarité + 30% popularité (usage count)
   */
  searchSimilarTags(params: SearchSimilarTagsParams): Promise<KeywordTagSearchResult[]>;
}
