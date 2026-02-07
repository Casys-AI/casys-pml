import {
  type ArticleIndexingArticle,
  type ArticleIndexingGlobal,
  type ArticleIndexingProject,
  type ArticleIndexingTenant,
  type ArticleStructure,
} from '@casys/core';

import type { ArticleIndexingUpsertPort } from '../ports/out';
import { createLogger } from '../utils/logger';

// Logger centralisé pour le use case
const logger = createLogger('IndexArticlesUseCase');

/**
 * Interface pour les paramètres d'entrée d'indexation des articles
 */
export interface IndexArticlesInput {
  articles: ArticleStructure[];
  tenantId?: string;
  projectId?: string;
}

/**
 * Interface pour le résultat d'indexation des articles
 */
export interface IndexArticlesOutput {
  success: boolean;
  indexedCount: number;
  failedCount: number;
  errors: Error[];
  indexedArticleIds: string[];
  message: string;
}

/**
 * Interface du use case d'indexation des articles
 */
export interface IndexArticlesUseCase {
  /**
   * Indexe une liste spécifique d'articles
   */
  execute(input: IndexArticlesInput): Promise<IndexArticlesOutput>;

  /**
   * Indexe le catalogue complet des articles (catalogue global)
   */
  indexGlobalCatalog(): Promise<ArticleIndexingGlobal>;

  /**
   * Indexe le catalogue spécifique à un tenant
   */
  indexTenantCatalog(tenantId: string): Promise<ArticleIndexingTenant>;

  /**
   * Indexe le catalogue spécifique à un projet
   */
  indexProjectCatalog(tenantId: string, projectId: string): Promise<ArticleIndexingProject>;

  /**
   * Indexe un article spécifique
   */
  indexArticle(articleId: string): Promise<ArticleIndexingArticle>;
}

/**
 * Dépendances du IndexArticlesUseCase
 */
export interface IndexArticlesUseCaseDeps {
  articleStructureStore: ArticleIndexingUpsertPort;
}

/**
 * Implémentation du use case d'indexation des articles
 */
export class IndexArticlesUseCaseImpl implements IndexArticlesUseCase {
  constructor(private readonly articleIndexing: ArticleIndexingUpsertPort) {}

  /**
   * Exécute l'indexation des articles
   * @param input - Les paramètres d'indexation des articles
   * @returns Résultat de l'indexation
   */
  async execute(input: IndexArticlesInput): Promise<IndexArticlesOutput> {
    logger.log("Exécution du use case d'indexation des articles", {
      count: input.articles.length,
      tenantId: input.tenantId,
      projectId: input.projectId,
      articleIds: input.articles.map(a => a.article.id),
    });

    // Fail-fast: articles requis et non vide
    if (!input?.articles || !Array.isArray(input.articles) || input.articles.length === 0) {
      throw new Error("[IndexArticlesUseCase] 'articles' requis et non vide");
    }
    // Fail-fast léger: chaque article doit contenir un id minimal côté entité
    for (const a of input.articles) {
      const id = a?.article?.id;
      if (!id || id.trim().length === 0) {
        throw new Error('[IndexArticlesUseCase] article.article.id requis');
      }
    }

    try {
      // Déléguer au service du domaine
      const result = await this.articleIndexing.indexArticles({
        articles: input.articles,
        tenantId: input.tenantId,
        projectId: input.projectId,
      });

      logger.log("Use case d'indexation terminé", { result });
      return {
        success: result.success,
        indexedCount: result.indexedCount,
        failedCount: result.failedCount,
        errors: result.errors,
        indexedArticleIds: result.indexedArticleIds,
        message: result.message,
      };
    } catch (error) {
      logger.error("Erreur lors de l'exécution du use case d'indexation", {
        error: error instanceof Error ? error.message : String(error),
        tenantId: input?.tenantId,
        projectId: input?.projectId,
        count: Array.isArray(input?.articles) ? input.articles.length : 0,
      });
      throw error;
    }
  }

  /**
   * Indexe le catalogue complet des articles (catalogue global)
   * @returns Résultat de l'indexation globale
   */
  async indexGlobalCatalog(): Promise<ArticleIndexingGlobal> {
    logger.log('Indexation du catalogue global des articles');

    try {
      const result = await this.articleIndexing.indexGlobalCatalog();
      logger.log('Indexation globale terminée', { result });
      return result;
    } catch (error) {
      logger.error("Erreur lors de l'indexation du catalogue global", { error });
      throw error;
    }
  }

  /**
   * Indexe le catalogue spécifique à un tenant
   * @param tenantId - Identifiant du tenant
   * @returns Résultat de l'indexation du tenant
   */
  async indexTenantCatalog(tenantId: string): Promise<ArticleIndexingTenant> {
    logger.log('Indexation du catalogue tenant', { tenantId });

    // Fail-fast: tenantId requis
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('[IndexArticlesUseCase] tenantId requis');
    }

    try {
      const result = await this.articleIndexing.indexTenantCatalog(tenantId);
      logger.log('Indexation tenant terminée', { result, tenantId });
      return result;
    } catch (error) {
      logger.error("Erreur lors de l'indexation du catalogue tenant", { error, tenantId });
      throw error;
    }
  }

  /**
   * Indexe le catalogue spécifique à un projet
   * @param tenantId - Identifiant du tenant
   * @param projectId - Identifiant du projet
   * @returns Résultat de l'indexation du projet
   */
  async indexProjectCatalog(tenantId: string, projectId: string): Promise<ArticleIndexingProject> {
    logger.log('Indexation du catalogue projet', { tenantId, projectId });

    // Fail-fast: ids requis
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('[IndexArticlesUseCase] tenantId requis');
    }
    if (!projectId || projectId.trim().length === 0) {
      throw new Error('[IndexArticlesUseCase] projectId requis');
    }

    try {
      const result = await this.articleIndexing.indexProjectCatalog(tenantId, projectId);
      logger.log('Indexation projet terminée', { result, tenantId, projectId });
      return result;
    } catch (error) {
      logger.error("Erreur lors de l'indexation du catalogue projet", {
        error,
        tenantId,
        projectId,
      });
      throw error;
    }
  }

  /**
   * Indexe un article spécifique
   * @param articleId - Identifiant de l'article
   * @returns Résultat de l'indexation de l'article
   */
  async indexArticle(articleId: string): Promise<ArticleIndexingArticle> {
    logger.log("Indexation d'un article spécifique", { articleId });

    // Fail-fast: articleId requis
    if (!articleId || articleId.trim().length === 0) {
      throw new Error('[IndexArticlesUseCase] articleId requis');
    }

    try {
      // Le service va récupérer l'article et extraire automatiquement ses tenantId/projectId
      const result = await this.articleIndexing.indexArticleCatalog(articleId);
      logger.log('Indexation article terminée', { result, articleId });
      return result;
    } catch (error) {
      logger.error("Erreur lors de l'indexation de l'article", { error, articleId });
      throw error;
    }
  }
}

/**
 * Factory pour créer une instance de IndexArticlesUseCase
 * @param articleIndexingService Service d'indexation des articles
 * @returns Instance de IndexArticlesUseCaseImpl
 */
export function createIndexArticlesUseCase(
  articleIndexing: ArticleIndexingUpsertPort
): IndexArticlesUseCaseImpl {
  return new IndexArticlesUseCaseImpl(articleIndexing);
}
