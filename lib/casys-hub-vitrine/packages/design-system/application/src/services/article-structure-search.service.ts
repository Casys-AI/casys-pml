import { type ArticleSearchResult } from '@casys/core/src/domain/entities/article-structure.entity';

import type { ArticleStructureSearchPort } from '../ports/out';
import { createLogger, type Logger } from '../utils/logger';

/**
 * Requête pour recherche contextuelle dans les articles
 */
export interface ArticleContextSearchRequest {
  commentContent: string;
  tenantId?: string;
  minSimilarity?: number;
  searchTypes?: ('sections' | 'fragments' | 'comments' | 'hybrid')[];
  contextLimit?: number;
}

/**
 * Résultat enrichi avec contexte sémantique multi-niveau
 */
export interface ArticleContextResult {
  primaryContext: {
    sections: ArticleSearchResult[];
    fragments: (ArticleSearchResult & { fragmentId: string; fragmentContent: string })[];
    comments: ArticleSearchResult[];
  };
  hybridResults: ArticleSearchResult[];
  contextSummary: {
    totalResults: number;
    averageRelevanceScore: number;
    topRelevantSections: string[];
    keyTopics: string[];
  };
}

/**
 * Service de recherche contextuelle dans la structure des articles
 * Utilise ArticleStructureSearchPort pour fournir du contexte sémantique
 * similaire à ComponentGenerationService mais pour les articles
 */
export class ArticleStructureSearchService {
  private readonly logger: Logger;

  constructor(
    private readonly articleSearchPort: ArticleStructureSearchPort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ArticleStructureSearchService');
  }

  /**
   * Recherche du contexte sémantique pertinent pour un commentaire
   * Combine plusieurs types de recherche pour enrichir le contexte
   * @param request Paramètres de recherche contextuelle
   * @returns Contexte sémantique multi-niveau
   */
  async searchContextForComment(
    request: ArticleContextSearchRequest
  ): Promise<ArticleContextResult> {
    try {
      this.logger.log(`Recherche de contexte pour commentaire: "${request.commentContent}"`);

      const searchTypes = request.searchTypes ?? ['sections', 'fragments', 'comments', 'hybrid'];
      const contextLimit = request.contextLimit ?? 5;
      const minSimilarity = request.minSimilarity ?? 0.7;

      // Résultats par type de recherche
      const sections: ArticleSearchResult[] = [];
      const fragments: (ArticleSearchResult & { fragmentId: string; fragmentContent: string })[] =
        [];
      const comments: ArticleSearchResult[] = [];
      let hybridResults: ArticleSearchResult[] = [];

      // 1. Recherche sémantique de sections si demandée
      if (searchTypes.includes('sections')) {
        this.logger.debug('Recherche sémantique de sections...');
        const sectionResults = await this.articleSearchPort.searchSectionsByEmbedding(
          request.commentContent,
          request.tenantId,
          contextLimit,
          minSimilarity
        );
        sections.push(...sectionResults);
        this.logger.debug(`Trouvé ${sectionResults.length} sections pertinentes`);
      }

      // 2. Recherche sémantique de fragments si demandée
      if (searchTypes.includes('fragments')) {
        this.logger.debug('Recherche sémantique de fragments...');
        const fragmentResults = await this.articleSearchPort.searchTextFragmentsByEmbedding(
          request.commentContent,
          request.tenantId,
          contextLimit,
          minSimilarity
        );
        fragments.push(...fragmentResults);
        this.logger.debug(`Trouvé ${fragmentResults.length} fragments pertinents`);
      }

      // 3. Recherche sémantique de commentaires si demandée
      if (searchTypes.includes('comments')) {
        this.logger.debug('Recherche sémantique de commentaires...');
        const commentResults = await this.articleSearchPort.searchCommentsByEmbedding(
          request.commentContent,
          request.tenantId,
          contextLimit,
          minSimilarity
        );
        comments.push(...commentResults);
        this.logger.debug(`Trouvé ${commentResults.length} commentaires pertinents`);
      }

      // 4. Recherche hybride intelligente si demandée
      if (searchTypes.includes('hybrid')) {
        this.logger.debug('Recherche hybride Graph RAG...');
        hybridResults = await this.articleSearchPort.searchSectionsHybrid(
          request.commentContent,
          request.tenantId,
          contextLimit
        );
        this.logger.debug(`Trouvé ${hybridResults.length} résultats hybrides`);
      }

      // 5. Calcul du résumé contextuel
      const allResults = [...sections, ...fragments, ...comments, ...hybridResults];
      const contextSummary = this.generateContextSummary(allResults);

      const result: ArticleContextResult = {
        primaryContext: {
          sections: sections.slice(0, contextLimit),
          fragments: fragments.slice(0, contextLimit),
          comments: comments.slice(0, contextLimit),
        },
        hybridResults: hybridResults.slice(0, contextLimit),
        contextSummary,
      };

      this.logger.log(
        `Contexte trouvé: ${contextSummary.totalResults} résultats, ` +
          `score moyen: ${contextSummary.averageRelevanceScore.toFixed(3)}`
      );

      return result;
    } catch (error) {
      this.logger.error('Erreur lors de la recherche de contexte:', error);
      throw error;
    }
  }

  /**
   * Recherche simplifiée pour obtenir les sections les plus pertinentes
   * Équivalent à searchComponentsWithContext pour les composants
   * @param commentContent Contenu du commentaire
   * @param options Options de recherche
   * @param limit Nombre maximum de résultats
   * @returns Sections les plus pertinentes avec métadonnées
   */
  async searchSectionsWithContext(
    commentContent: string,
    options: {
      tenantId?: string;
      projectId?: string;
      articleId?: string;
      minSimilarity?: number;
    } = {},
    limit = 3
  ): Promise<ArticleSearchResult[]> {
    this.logger.log(`Recherche de sections pour: "${commentContent}"`);

    const minSimilarity = options.minSimilarity ?? 0.7;

    try {
      // Utilise la recherche hybride pour avoir le meilleur contexte
      const results = await this.articleSearchPort.searchSectionsHybrid(
        commentContent,
        options.tenantId,
        limit,
        options.projectId,
        options.articleId
      );

      // Filtre par seuil de similarité
      const filteredResults = results.filter(result => result.relevanceScore >= minSimilarity);

      this.logger.log(
        `Trouvé ${filteredResults.length}/${results.length} sections ` +
          `avec similarité >= ${minSimilarity}`
      );

      return filteredResults;
    } catch (error) {
      this.logger.error('Erreur lors de la recherche de sections:', error);
      return [];
    }
  }

  /**
   * Recherche graphe pure: sections voisines par position dans le même article.
   * Délègue au port sous-jacent (Kuzu adapter).
   */
  async searchSectionsByGraphNeighborhood(
    articleId: string,
    position: number,
    options: { tenantId?: string; projectId?: string; window?: number; limit?: number } = {}
  ): Promise<ArticleSearchResult[]> {
    const window = options.window ?? 5;
    const limit = options.limit;
    try {
      return await this.articleSearchPort.searchSectionsByGraphNeighborhood(
        articleId,
        position,
        window,
        options.tenantId,
        options.projectId,
        limit
      );
    } catch (error) {
      this.logger.error('Erreur lors de la recherche graphe (voisinage sections):', error);
      return [];
    }
  }

  /**
   * Génère un résumé contextuel des résultats
   */
  private generateContextSummary(results: ArticleSearchResult[]): {
    totalResults: number;
    averageRelevanceScore: number;
    topRelevantSections: string[];
    keyTopics: string[];
  } {
    if (results.length === 0) {
      return {
        totalResults: 0,
        averageRelevanceScore: 0,
        topRelevantSections: [],
        keyTopics: [],
      };
    }

    // Calcul de la moyenne des scores
    const totalScore = results.reduce((sum, result) => sum + result.relevanceScore, 0);
    const averageScore = totalScore / results.length;

    // Extraction des sections les plus pertinentes (top 3)
    const topSections = results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3)
      .map(result => result.sectionTitle ?? result.articleTitle ?? 'Section sans titre');

    // Extraction des mots-clés/topics (simulation basique)
    const keyTopics = this.extractKeyTopics(results);

    return {
      totalResults: results.length,
      averageRelevanceScore: averageScore,
      topRelevantSections: topSections,
      keyTopics,
    };
  }

  /**
   * Extrait les topics clés des résultats (implémentation basique)
   */
  private extractKeyTopics(results: ArticleSearchResult[]): string[] {
    // Collecte tous les titres et contenus
    const allText = results
      .map(result => `${result.articleTitle ?? ''} ${result.sectionTitle ?? ''}`)
      .join(' ')
      .toLowerCase();
    // wtf ???
    // Mots-clés techniques courants (peut être enrichi avec NLP)
    const technicalKeywords = [
      'api',
      'service',
      'component',
      'database',
      'authentication',
      'authorization',
      'react',
      'vue',
      'angular',
      'node',
      'typescript',
      'javascript',
      'python',
      'docker',
      'kubernetes',
      'microservice',
      'architecture',
      'design',
      'test',
      'unit',
      'integration',
      'performance',
      'security',
    ];

    const foundKeywords = technicalKeywords.filter(keyword => allText.includes(keyword));

    return foundKeywords.slice(0, 5); // Top 5 topics
  }
}
