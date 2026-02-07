import { type ArticleListResponseDTO, type ArticleMetadataDTO } from '@casys/shared';
import {
  type ArticleIndexingArticle,
  type ArticleIndexingGlobal,
  type ArticleIndexingProject,
  type ArticleIndexingTenant,
  type ArticleStructure,
} from '@casys/core';

import type { ArticleReadPort } from '../ports/out';
import { createLogger } from '../utils/logger';

// Logger centralisé pour le use case
const logger = createLogger('ListArticlesUseCase');

/**
 * Interface pour les paramètres d'entrée de récupération d'un article
 */
export interface GetArticleInput {
  articleId: string;
  tenantId?: string;
  projectId?: string;
}

/**
 * Interface pour le résultat de récupération d'un article
 */
export interface GetArticleOutput {
  article: ArticleStructure | null;
  found: boolean;
  message?: string;
}

/**
 * Interface pour les paramètres d'entrée de listing des articles
 */
export interface ListArticlesInput {
  tenantId?: string;
  projectId?: string;
  articleId?: string;
  limit?: number;
}

// Utilisation des DTOs du package shared à la place des interfaces locales

/**
 * Type union pour le résultat de listing des articles
 * Utilise les types utilitaires du domaine selon la granularité
 */
export type ListArticlesOutput =
  | ArticleIndexingGlobal
  | ArticleIndexingTenant
  | ArticleIndexingProject
  | ArticleIndexingArticle;

/**
 * Interface du use case de listing des articles
 */
export interface ListArticlesUseCase {
  /**
   * Récupère un article par son ID
   */
  getArticle(input: GetArticleInput): Promise<GetArticleOutput>;

  /**
   * Liste tous les articles (catalogue global)
   */
  listAllArticles(): Promise<ArticleIndexingGlobal>;

  /**
   * Liste tous les articles avec leurs métadonnées
   */
  listAllArticlesWithMeta(): Promise<ArticleListResponseDTO>;

  /**
   * Liste les articles d'un tenant spécifique
   */
  listArticlesByTenant(tenantId: string): Promise<ArticleIndexingTenant>;

  /**
   * Liste les articles d'un projet spécifique
   */
  listArticlesByProject(tenantId: string, projectId: string): Promise<ArticleIndexingProject>;

  /**
   * Récupère les détails d'un article spécifique
   */
  getArticleDetails(articleId: string): Promise<ArticleIndexingArticle>;
}

/**
 * Dépendances du ListArticlesUseCase
 */
export interface ListArticlesUseCaseDeps {
  articleStructureRepository: ArticleReadPort;
}

/**
 * Implémentation du use case de listing des articles
 */
export class ListArticlesUseCaseImpl implements ListArticlesUseCase {
  constructor(private readonly articleStructureRepository: ArticleReadPort) {}

  /**
   * Récupère un article par son ID
   * @param input - Les paramètres de récupération
   * @returns L'article trouvé ou null
   */
  async getArticle(input: GetArticleInput): Promise<GetArticleOutput> {
    logger.log("Récupération d'un article", { input });

    // Fail-fast: articleId requis
    if (!input?.articleId || input.articleId.trim().length === 0) {
      throw new Error('[ListArticlesUseCase] articleId requis');
    }

    try {
      const article = await this.articleStructureRepository.findById(input.articleId);

      const result = {
        article,
        found: article !== null,
      };

      logger.log('Article récupéré', { found: result.found, articleId: input.articleId });
      return result;
    } catch (error) {
      logger.error("Erreur lors de la récupération de l'article", { error, input });
      throw error;
    }
  }

  /**
   * Liste tous les articles (catalogue global)
   * @returns Liste globale des articles
   */
  async listAllArticles(): Promise<ArticleIndexingGlobal> {
    logger.log('Listing global des articles');

    try {
      const articles = await this.articleStructureRepository.findAll();

      const result: ArticleIndexingGlobal = {
        success: true,
        indexedCount: articles.length,
        failedCount: 0,
        errors: [],
        indexedArticleIds: articles.map((a: ArticleStructure) => a.article.id),
        scope: 'global',
        message: `${articles.length} articles trouvés dans le catalogue global`,
      };

      logger.log('Listing global terminé', { count: articles.length });
      return result;
    } catch (error) {
      logger.error('Erreur lors du listing global des articles', { error });
      throw error;
    }
  }

  /**
   * Liste tous les articles avec leurs métadonnées
   * @returns Liste des articles avec leurs métadonnées complètes selon ArticleListResponseDTO
   */
  async listAllArticlesWithMeta(): Promise<ArticleListResponseDTO> {
    logger.log('Listing global des articles avec métadonnées');

    try {
      const articles = await this.articleStructureRepository.findAll();

      // Extraire les métadonnées pertinentes de chaque article selon le format ArticleMetadataDTO
      const articlesWithMeta: ArticleMetadataDTO[] = articles.map(
        (articleStructure: ArticleStructure) => ({
          id: articleStructure.article.id,
          title: articleStructure.article.title,
          description: articleStructure.article.description,
          language: articleStructure.article.language,
          tags: articleStructure.article.keywords ?? [],
          createdAt: articleStructure.article.createdAt,
          tenantId: articleStructure.article.tenantId,
          projectId: articleStructure.article.projectId,
          sectionsCount: articleStructure.sections.length,
          fragmentsCount: articleStructure.textFragments.length,
          commentsCount: articleStructure.comments?.length ?? 0,
          componentUsagesCount: articleStructure.componentUsages.length,
        })
      );

      const result: ArticleListResponseDTO = {
        articles: articlesWithMeta,
        count: articles.length,
        message: `${articles.length} articles trouvés avec métadonnées complètes`,
      };

      logger.log('Listing avec métadonnées terminé', { count: articles.length });
      return result;
    } catch (error) {
      logger.error('Erreur lors du listing des articles avec métadonnées', { error });
      throw error;
    }
  }

  /**
   * Liste les articles d'un tenant spécifique
   * @param tenantId - Identifiant du tenant
   * @returns Liste des articles du tenant
   */
  async listArticlesByTenant(tenantId: string): Promise<ArticleIndexingTenant> {
    logger.log('Listing des articles par tenant', { tenantId });

    // Fail-fast: tenantId requis
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('[ListArticlesUseCase] tenantId requis');
    }

    try {
      const articles = await this.articleStructureRepository.findByTenant(tenantId);

      const result: ArticleIndexingTenant = {
        success: true,
        indexedCount: articles.length,
        failedCount: 0,
        errors: [],
        indexedArticleIds: articles.map((a: ArticleStructure) => a.article.id),
        scope: 'tenant',
        tenantId,
        message: `${articles.length} articles trouvés pour le tenant ${tenantId}`,
      };

      logger.log('Listing par tenant terminé', { tenantId, count: articles.length });
      return result;
    } catch (error) {
      logger.error('Erreur lors du listing des articles par tenant', { error, tenantId });
      throw error;
    }
  }

  /**
   * Liste les articles d'un projet spécifique
   * @param tenantId - Identifiant du tenant
   * @param projectId - Identifiant du projet
   * @returns Liste des articles du projet
   */
  async listArticlesByProject(
    tenantId: string,
    projectId: string
  ): Promise<ArticleIndexingProject> {
    logger.log('Listing des articles par projet', { tenantId, projectId });

    // Fail-fast: ids requis
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('[ListArticlesUseCase] tenantId requis');
    }
    if (!projectId || projectId.trim().length === 0) {
      throw new Error('[ListArticlesUseCase] projectId requis');
    }

    try {
      const articles = await this.articleStructureRepository.findByProject(tenantId, projectId);

      const result: ArticleIndexingProject = {
        success: true,
        indexedCount: articles.length,
        failedCount: 0,
        errors: [],
        indexedArticleIds: articles.map((a: ArticleStructure) => a.article.id),
        scope: 'project',
        tenantId,
        projectId,
        message: `${articles.length} articles trouvés pour le projet ${projectId}`,
      };

      logger.log('Listing par projet terminé', { tenantId, projectId, count: articles.length });
      return result;
    } catch (error) {
      logger.error('Erreur lors du listing des articles par projet', {
        error,
        tenantId,
        projectId,
      });
      throw error;
    }
  }

  /**
   * Récupère les détails d'un article spécifique
   * @param articleId - Identifiant de l'article
   * @returns Détails de l'article
   */
  async getArticleDetails(articleId: string): Promise<ArticleIndexingArticle> {
    logger.log("Récupération des détails d'un article", { articleId });

    // Fail-fast: articleId requis
    if (!articleId || articleId.trim().length === 0) {
      throw new Error('[ListArticlesUseCase] articleId requis');
    }

    try {
      const article = await this.articleStructureRepository.findById(articleId);

      if (!article) {
        const result: ArticleIndexingArticle = {
          success: false,
          indexedCount: 0,
          failedCount: 1,
          errors: [],
          indexedArticleIds: [],
          scope: 'article',
          articleId,
          tenantId: '',
          projectId: '',
          message: `Article ${articleId} non trouvé`,
          title: '',
          description: '',
          language: '',
          createdAt: '',
        };

        logger.log('Article non trouvé', { articleId });
        return result;
      }

      const result: ArticleIndexingArticle = {
        success: true,
        indexedCount: 1,
        failedCount: 0,
        errors: [],
        indexedArticleIds: [articleId],
        scope: 'article',
        articleId,
        tenantId: article.article.tenantId,
        projectId: article.article.projectId,
        message: `Détails de l'article ${articleId} récupérés`,
        // Métadonnées de l'article
        title: article.article.title ?? 'Sans titre',
        description: article.article.description ?? 'Aucune description',
        language: article.article.language ?? 'fr',
        createdAt: article.article.createdAt,
      };

      logger.log("Détails d'article récupérés", { articleId });
      return result;
    } catch (error) {
      logger.error("Erreur lors de la récupération des détails d'article", { error, articleId });
      throw error;
    }
  }
}
