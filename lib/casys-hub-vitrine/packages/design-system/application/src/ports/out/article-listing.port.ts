import {
  type ArticleNode,
  type ArticleSearchResult,
  type ArticleStructure,
  type SectionNode,
  type ComponentUsage,
} from '@casys/core';

/**
 * Port pour les opérations de listing et consultation des articles
 * Séparé du port de stockage/indexation pour respecter le principe de séparation des responsabilités
 */
export interface ArticleListingPort {
  /**
   * Récupère tous les articles (scope global)
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste de tous les articles
   */
  getAllArticles(limit?: number): Promise<ArticleNode[]>;

  /**
   * Récupère tous les articles d'un tenant (scope tenant)
   * @param tenantId ID du tenant
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste des articles du tenant
   */
  getArticlesByTenantId(tenantId: string, limit?: number): Promise<ArticleNode[]>;

  /**
   * Récupère tous les articles d'un projet (scope project)
   * @param projectId ID du projet
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste des articles du projet
   */
  getArticlesByProjectId(
    projectId: string,
    tenantId?: string,
    limit?: number
  ): Promise<ArticleNode[]>;

  /**
   * Récupère un article par son ID
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   * @returns Article simple (métadonnées uniquement)
   */
  getArticleById(articleId: string, tenantId?: string): Promise<ArticleNode | null>;

  /**
   * Récupère la structure complète d'un article par son ID (scope article)
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   * @returns Structure complète de l'article
   */
  getArticleStructureById(articleId: string, tenantId?: string): Promise<ArticleStructure | null>;

  /**
   * Récupère toutes les sections d'un article
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   * @returns Liste des sections de l'article
   */
  getSectionsByArticleId(articleId: string, tenantId?: string): Promise<SectionNode[]>;

  /**
   * Récupère les composants utilisés dans une section spécifique
   * @param sectionId ID de la section
   * @param tenantId ID du tenant (optionnel)
   * @returns Liste des composants utilisés dans la section
   */
  getComponentsBySectionId(sectionId: string, tenantId?: string): Promise<ComponentUsage[]>;

  /**
   * Récupère les articles qui utilisent un composant spécifique (recherche inverse)
   * @param componentId ID du composant
   * @param tenantId ID du tenant (optionnel)
   * @param limit Nombre maximum de résultats (optionnel)
   * @returns Liste des articles utilisant ce composant
   */
  getArticlesByComponentId(
    componentId: string,
    tenantId?: string,
    limit?: number
  ): Promise<ArticleSearchResult[]>;
}
