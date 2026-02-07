import {
  type ArticleIndexingArticle,
  type ArticleIndexingGlobal,
  type ArticleIndexingProject,
  type ArticleIndexingTenant,
  type ArticleNode,
  type ArticleOperationResult,
  type ArticleStructure,
  type SectionNode,
} from '@casys/core/src/domain/entities/article-structure.entity';

import type { ArticleStructureRepositoryPort } from '../ports/out';
import { type ArticleStructureStorePort } from '../ports/out/article-structure-store.port';
import { createLogger, type Logger } from '../utils/logger';

// Logger injecté par DI (fallback local via createLogger)

/**
 * Paramètres pour l'indexation des articles
 */
export interface ArticleIndexingParams {
  articles: ArticleStructure[];
  tenantId?: string;
  projectId?: string;
}

/**
 * Résultat de base de l'indexation des articles (service)
 */
export interface ArticleIndexingServiceResult extends ArticleOperationResult {
  indexedCount: number;
  failedCount: number;
  errors: Error[];
  indexedArticleIds: string[];
}

/**
 * Service du domaine pour l'indexation d'articles
 * Encapsule la logique métier d'indexation et gestion des erreurs
 */
export class ArticleIndexingService {
  private readonly logger: Logger;

  constructor(
    private readonly articleStructureStore: ArticleStructureStorePort,
    private readonly articleStructureRepository?: ArticleStructureRepositoryPort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ArticleIndexingService');
  }

  /**
   * Indexation incrémentale: outline (article + sections sans contenu)
   * - Valide niveaux (1..6) et unicité des ids
   * - Normalise position (0..n-1)
   * - Déléguée au port `ArticleStructureStorePort.upsertOutline`
   */
  async indexOutlineProgressively(
    article: ArticleNode,
    sections: SectionNode[],
    tenantId?: string
  ): Promise<void> {
    // Validation outline silencieuse

    // Validations de base
    const ids = new Set<string>();
    for (const s of sections) {
      if (s.level < 1 || s.level > 6) {
        throw new Error(`Invalid section level ${s.level} for id ${s.id}`);
      }
      if (ids.has(s.id)) {
        throw new Error(`Duplicate section id detected: ${s.id}`);
      }
      ids.add(s.id);
    }

    // Normalisation des positions
    let pos = 0;
    const normalized: SectionNode[] = sections.map(s => ({
      ...s,
      position: pos++,
      content: s.content ?? '',
    }));

    await this.articleStructureStore.upsertOutline(article, normalized, tenantId);
  }

  /**
   * Indexation incrémentale: mise à jour du contenu d'une section
   * - Valide contenu non vide (trim)
   * - Déléguée au port `ArticleStructureStorePort.updateSectionContent`
   */
  async indexSectionContentProgressively(
    sectionId: string,
    content: string,
    projectId: string,
    tenantId?: string,
    summary?: string
  ): Promise<void> {
    const trimmed = (content ?? '').trim();
    if (trimmed.length === 0) {
      throw new Error(`Empty content for section ${sectionId}`);
    }
    if (!projectId || projectId.trim().length === 0) {
      throw new Error('[ArticleIndexingService] projectId requis pour updateSectionContent');
    }
    await this.articleStructureStore.updateSectionContent(
      sectionId,
      content,
      projectId,
      tenantId,
      summary
    );
  }

  /**
   * Lier une section à un article interne pour le maillage interne
   * Délègue au port ArticleStructureStorePort.linkSectionToArticle
   */
  async linkSectionToArticle(params: {
    sectionId: string;
    articleId: string;
    tenantId: string;
    projectId: string;
  }): Promise<void> {
    await this.articleStructureStore.linkSectionToArticle(params);
  }

  /**
   * Indexe le catalogue complet des articles
   * @returns Résultat de l'indexation avec scope global
   */
  async indexGlobalCatalog(): Promise<ArticleIndexingGlobal> {
    this.logger.log("Début de l'indexation globale des articles");

    if (!this.articleStructureRepository) {
      throw new Error("ArticleStructureRepository requis pour l'indexation globale");
    }

    try {
      // Récupérer tous les articles via le repository
      this.logger.debug?.('About to call articleStructureRepository.findAll()');
      this.logger.debug?.(
        'Repository type check:',
        this.articleStructureRepository.constructor.name
      );
      // Ne pas déterminer si c'est un mock en se basant sur toString() qui donne des faux positifs
      const articles = await this.articleStructureRepository.findAll();
      this.logger.debug?.(
        `Repository returned ${articles.length} articles:`,
        articles.map((a: ArticleStructure) => ({
          id: a.article.id,
          title: a.article.title,
          tenant: a.article.tenantId,
          project: a.article.projectId,
        }))
      );

      this.logger.log(`${articles.length} articles trouvés pour l'indexation globale`);

      // Indexer chaque article
      const result = await this.indexArticlesList(articles);

      return {
        ...result,
        scope: 'global' as const,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue lors de l'indexation globale";
      this.logger.error(message, error);
      return {
        success: false,
        message,
        indexedCount: 0,
        failedCount: 0,
        errors: [new Error(message)],
        indexedArticleIds: [],
        scope: 'global' as const,
      };
    }
  }

  /**
   * Indexe le catalogue d'un tenant spécifique
   * @param tenantId - ID du tenant
   * @returns Résultat de l'indexation avec scope tenant
   */
  async indexTenantCatalog(tenantId: string): Promise<ArticleIndexingTenant> {
    this.logger.log(`Début de l'indexation des articles du tenant ${tenantId}`);

    if (!this.articleStructureRepository) {
      throw new Error("ArticleStructureRepository requis pour l'indexation par tenant");
    }

    try {
      // Récupérer tous les articles du tenant via le repository
      const articles = await this.articleStructureRepository.findByTenant(tenantId);

      this.logger.log(`${articles.length} articles trouvés pour le tenant ${tenantId}`);

      // Indexer chaque article
      const result = await this.indexArticlesList(articles);

      return {
        ...result,
        scope: 'tenant' as const,
        tenantId,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Erreur inconnue lors de l'indexation du tenant ${tenantId}`;
      this.logger.error(message, error);
      return {
        success: false,
        message,
        indexedCount: 0,
        failedCount: 0,
        errors: [new Error(message)],
        indexedArticleIds: [],
        scope: 'tenant' as const,
        tenantId,
      };
    }
  }

  /**
   * Indexe le catalogue d'un projet spécifique
   * @param tenantId - ID du tenant
   * @param projectId - ID du projet
   * @returns Résultat de l'indexation avec scope projet
   */
  async indexProjectCatalog(tenantId: string, projectId: string): Promise<ArticleIndexingProject> {
    this.logger.log(
      `Début de l'indexation des articles du projet ${projectId} (tenant ${tenantId})`
    );

    if (!this.articleStructureRepository) {
      throw new Error("ArticleStructureRepository requis pour l'indexation par projet");
    }

    try {
      // Récupérer tous les articles du projet via le repository
      const articles = await this.articleStructureRepository.findByProject(tenantId, projectId);

      this.logger.log(`${articles.length} articles trouvés pour le projet ${projectId}`);

      // Indexer chaque article
      const result = await this.indexArticlesList(articles);

      return {
        ...result,
        scope: 'project' as const,
        tenantId,
        projectId,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Erreur inconnue lors de l'indexation du projet ${projectId}`;
      this.logger.error(message, error);
      return {
        success: false,
        message,
        indexedCount: 0,
        failedCount: 0,
        errors: [new Error(message)],
        indexedArticleIds: [],
        scope: 'project' as const,
        tenantId,
        projectId,
      };
    }
  }

  /**
   * Indexe un article spécifique
   * @param articleId - ID de l'article
   * @returns Résultat de l'indexation avec scope article
   */
  async indexArticleCatalog(articleId: string): Promise<ArticleIndexingArticle> {
    this.logger.log(`Début de l'indexation de l'article ${articleId}`);

    if (!this.articleStructureRepository) {
      throw new Error("ArticleStructureRepository requis pour l'indexation par article");
    }

    try {
      // Récupérer l'article spécifique via le repository
      const article = await this.articleStructureRepository.findById(articleId);

      if (!article) {
        throw new Error(`Article ${articleId} non trouvé`);
      }

      this.logger.log(`Article ${articleId} trouvé pour l'indexation`);

      // Indexer l'article
      const result = await this.indexArticlesList([article]);

      // Utiliser les vrais tenantId et projectId de l'article récupéré
      const { tenantId: actualTenantId, projectId: actualProjectId } = article.article;

      return {
        ...result,
        scope: 'article' as const,
        tenantId: actualTenantId,
        projectId: actualProjectId,
        articleId,
        // Métadonnées essentielles de l'article
        title: article.article.title ?? 'Sans titre',
        description: article.article.description ?? 'Aucune description',
        language: article.article.language ?? 'fr',
        createdAt: article.article.createdAt,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Erreur inconnue lors de l'indexation de l'article ${articleId}`;
      this.logger.error(message, error);
      return {
        success: false,
        message,
        indexedCount: 0,
        failedCount: 0,
        errors: [new Error(message)],
        indexedArticleIds: [],
        scope: 'article' as const,
        tenantId: '',
        projectId: '',
        articleId,
        // Valeurs par défaut pour les métadonnées obligatoires
        title: 'Erreur - Article non trouvé',
        description: "L'article n'a pas pu être récupéré",
        language: 'fr',
      };
    }
  }

  /**
   * Indexe une liste d'articles
   * @param params - Paramètres d'indexation
   * @returns Résultat de l'indexation
   */
  async indexArticles(params: ArticleIndexingParams): Promise<ArticleIndexingServiceResult> {
    this.logger.log(`Début de l'indexation de ${params.articles.length} articles`);

    return await this.indexArticlesList(params.articles, params.tenantId);
  }

  /**
   * Méthode privée pour indexer une liste d'articles
   * @param articles - Liste des articles à indexer
   * @param tenantId - ID du tenant (optionnel)
   * @returns Résultat de l'indexation
   */
  private async indexArticlesList(
    articles: ArticleStructure[],
    tenantId?: string
  ): Promise<ArticleIndexingServiceResult> {
    const errors: Error[] = [];
    const indexedArticleIds: string[] = [];

    for (const article of articles) {
      try {
        // Indexer l'article via le store
        await this.articleStructureStore.indexArticleStructure(article, tenantId);
        indexedArticleIds.push(article.article.id);
        // Article indexé silencieusement
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.logger.error(`Erreur lors de l'indexation de l'article ${article.article.id}:`, err);
      }
    }

    const success = errors.length === 0;
    const message = success
      ? `${indexedArticleIds.length} articles indexés avec succès`
      : `${indexedArticleIds.length} articles indexés, ${errors.length} erreurs`;

    this.logger.log(message);

    return {
      success,
      message,
      indexedCount: indexedArticleIds.length,
      failedCount: errors.length,
      errors,
      indexedArticleIds,
    };
  }
}
