import {
  type ArticleNode,
  type ArticleSearchResult,
  type ArticleStructure,
 type ComponentUsage,  type SectionNode } from '@casys/core';
import { createLogger, type Logger } from '../utils/logger';

import { type ArticleListingPort, type ArticleStructureStorePort } from '../ports/out';

/**
 * Service de listing et consultation des structures d'articles
 * Gère les opérations de lecture et recherche dans les articles
 */
export class ArticleListingService {
  private readonly logger: Logger;

  constructor(
    private readonly articleListingStore: ArticleListingPort,
    private readonly articleStructureStore: ArticleStructureStorePort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ArticleListingService');
  }

  /**
   * Récupère tous les articles (scope global)
   * TODO: Implémenter getAllArticles dans ArticleStructureStorePort
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste de tous les articles
   */
  async getAllArticles(limit?: number): Promise<ArticleNode[]> {
    this.logger.log('[ArticleListingService] Getting all articles (global scope)');
    return this.articleListingStore.getAllArticles(limit);
  }

  /**
   * Récupère tous les articles d'un tenant (scope tenant)
   * @param tenantId ID du tenant
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste des articles du tenant
   */
  async getArticlesByTenant(tenantId: string, limit?: number): Promise<ArticleNode[]> {
    this.logger.log(`[ArticleListingService] Getting articles for tenant: ${tenantId}`);
    return this.articleListingStore.getArticlesByTenantId(tenantId, limit);
  }

  /**
   * Récupère tous les articles d'un projet (scope project)
   * @param tenantId ID du tenant
   * @param projectId ID du projet
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste des articles du projet
   */
  async getArticlesByProject(
    tenantId: string,
    projectId: string,
    limit?: number
  ): Promise<ArticleNode[]> {
    this.logger.log(
      `[ArticleListingService] Getting articles for project: ${projectId} (tenant: ${tenantId})`
    );
    return this.articleListingStore.getArticlesByProjectId(projectId, tenantId, limit);
  }

  /**
   * Récupère la structure complète d'un article par son ID (scope article)
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   * @returns Structure complète de l'article
   */
  async getArticleStructureById(
    articleId: string,
    tenantId?: string
  ): Promise<ArticleStructure | null> {
    this.logger.log(`[ArticleListingService] Retrieving article structure: ${articleId}`);
    return this.articleListingStore.getArticleStructureById(articleId, tenantId);
  }

  /**
   * Récupère toutes les sections d'un article
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  async getSectionsByArticleId(articleId: string, tenantId?: string): Promise<SectionNode[]> {
    this.logger.log(`[ArticleListingService] Getting sections for article: ${articleId}`);
    return this.articleListingStore.getSectionsByArticleId(articleId, tenantId);
  }

  /**
   * Récupère les composants utilisés dans une section spécifique
   * @param sectionId ID de la section
   * @param tenantId ID du tenant (optionnel)
   */
  async getComponentsBySectionId(sectionId: string, tenantId?: string): Promise<ComponentUsage[]> {
    this.logger.log(`[ArticleListingService] Getting components for section: ${sectionId}`);
    return this.articleListingStore.getComponentsBySectionId(sectionId, tenantId);
  }

  /**
   * Récupère les articles qui utilisent un composant spécifique
   * @param componentId ID du composant
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   */
  async getArticlesByComponentId(
    componentId: string,
    tenantId?: string,
    limit?: number
  ): Promise<ArticleSearchResult[]> {
    this.logger.log(`[ArticleListingService] Getting articles using component: ${componentId}`);
    return this.articleListingStore.getArticlesByComponentId(componentId, tenantId, limit);
  }

  /**
   * Supprime un article et toute sa structure
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  async deleteArticleStructure(articleId: string, tenantId?: string): Promise<void> {
    this.logger.log(`[ArticleListingService] Deleting article structure: ${articleId}`);
    return this.articleStructureStore.deleteArticleStructure(articleId, tenantId);
  }
}
