import type { TopicCandidate } from '@casys/core/src/domain/entities/topic.entity';

/**
 * Port pour récupération du contenu complet des articles
 */
export interface ArticleContentFetcherPort {
  /**
   * Enrichit un article avec son contenu complet
   * @param article Article à enrichir
   * @returns Article enrichi avec contenu complet
   */
  fetchFullContent(article: TopicCandidate): Promise<EnrichedArticle>;

  /**
   * Vérifie si le fetcher peut traiter cette URL/metadata
   * @param sourceUrl URL de l'article
   * @param metadata Métadonnées optionnelles
   * @returns true si le fetcher peut traiter cette source
   */
  canHandle(sourceUrl: string, metadata?: Record<string, unknown>): boolean;
}

/**
 * Interface pour un article enrichi avec contenu complet
 */
export interface EnrichedArticle {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: Date;
  author?: string;
  fullContent: string; // Contenu complet récupéré
  imageUrls: string[];
  language?: string;
  metadata?: Record<string, unknown>;
}
