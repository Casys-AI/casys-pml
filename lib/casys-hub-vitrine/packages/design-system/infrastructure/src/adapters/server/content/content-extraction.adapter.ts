import type { TopicCandidate } from '@casys/core';
import type { ArticleContentFetcherPort, EnrichedArticle } from '@casys/application';

import { createLogger } from '../../../utils/logger';
import type { ContentExtractionService } from './services/content-extraction.service';
import type { QualifiedContent } from './strategies/types';

/**
 * Adapter qui utilise le ContentExtractionService pour implémenter ArticleContentFetcherPort
 * Fait le pont entre le service d'extraction et l'interface métier
 */
export class ContentExtractionAdapter implements ArticleContentFetcherPort {
  private readonly logger = createLogger('ContentExtractionAdapter');

  constructor(private readonly extractionService: ContentExtractionService) {}

  canHandle(sourceUrl: string, _metadata?: Record<string, unknown>): boolean {
    return sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://');
  }

  async fetchFullContent(article: TopicCandidate): Promise<EnrichedArticle> {
    const { sourceUrl } = article;

    try {
      this.logger.debug(`🔍 Fetching content via service: ${sourceUrl}`);

      // Appeler le service d'extraction
      const qualified = await this.extractionService.extractContent(sourceUrl, article);

      // Convertir vers EnrichedArticle
      return this.buildEnrichedArticle(article, qualified);

    } catch (error) {
      this.logger.error(`❌ Content extraction failed for ${sourceUrl}:`, error);

      // Fallback vers contenu disponible
      const fallbackContent = article.description || 'Contenu non disponible';
      return this.buildFallbackArticle(article, fallbackContent);
    }
  }

  private buildEnrichedArticle(article: TopicCandidate, qualified: QualifiedContent): EnrichedArticle {
    return {
      id: article.id,
      title: qualified.title ?? article.title,
      description: qualified.summary || article.description || 'Description non disponible',
      sourceUrl: article.sourceUrl,
      sourceTitle: article.sourceTitle || 'Source inconnue',
      publishedAt: qualified.publishedAt || new Date(),
      author: qualified.author || article.author,
      fullContent: qualified.cleanedContent,
      imageUrls: article.imageUrls || [],
      language: article.language,
      metadata: {
        ...article.metadata,
        // Métadonnées d'extraction
        extractionStrategy: qualified.strategy,
        confidence: qualified.confidence,
        qualityScore: qualified.qualityScore,
        contentType: qualified.contentType,
        keyPoints: qualified.keyPoints,
        // Stats agent
        agentProcessed: true,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  }

  private buildFallbackArticle(article: TopicCandidate, fallbackContent: string): EnrichedArticle {
    return {
      id: article.id,
      title: article.title,
      description: article.description || 'Description non disponible',
      sourceUrl: article.sourceUrl,
      sourceTitle: article.sourceTitle || 'Source inconnue',
      publishedAt: new Date(),
      author: article.author,
      fullContent: fallbackContent,
      imageUrls: article.imageUrls || [],
      language: article.language,
      metadata: {
        ...article.metadata,
        extractionStrategy: 'fallback',
        confidence: 0.1,
        qualityScore: 0.1,
        agentProcessed: false,
        extractionTimestamp: new Date().toISOString(),
      },
    };
  }
}
