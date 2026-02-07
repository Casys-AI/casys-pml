import type { TopicCandidate } from '@casys/core';

import { createLogger } from '../../../../utils/logger';
import type { ContentExtractionStrategy, RawContent } from './types';

/**
 * Stratégie d'extraction prioritaire pour contenu RSS
 * Réutilise l'apprentissage de l'ancien ArticleContentFetcher :
 * - Si RSS content:encoded disponible et > 200 chars → utiliser directement
 * - Très rapide, pas de requête HTTP
 * - Priorité maximale
 */
export class RssContentStrategy implements ContentExtractionStrategy {
  readonly name = 'rss-content';
  readonly priority = 10; // Priorité maximale - pas de requête HTTP

  private readonly logger = createLogger('RssContentStrategy');

  canHandle(url: string): boolean {
    // Peut traiter toute URL (dépend du metadata RSS)
    return url.startsWith('http://') || url.startsWith('https://');
  }

  async extract(url: string, article?: TopicCandidate): Promise<RawContent> {
    this.logger.debug(`📡 RSS content check: ${url}`);

    // Vérifier si contenu RSS disponible et suffisant
    if (!article?.metadata?.content || 
        typeof article.metadata.content !== 'string' ||
        article.metadata.content.length < 200) {
      throw new Error('RSS content not available or too short');
    }

    const rssContent = article.metadata.content;
    this.logger.debug(`✅ RSS content utilisé: ${rssContent.length} caractères`);

    // Nettoyer le contenu RSS (peut contenir du HTML)
    const cleanContent = this.cleanRssContent(rssContent);

    return {
      content: cleanContent,
      title: article.title,
      author: article.author,
      publishedAt: article.createdAt ? new Date(article.createdAt) : undefined,
      confidence: 0.9, // Très haute confiance - contenu source
      strategy: this.name,
      metadata: {
        source: 'rss_content_encoded',
        originalLength: rssContent.length,
        cleanedLength: cleanContent.length,
        extractionTime: 0 // Instantané
      }
    };
  }

  private cleanRssContent(content: string): string {
    // Le contenu RSS peut contenir du HTML, le nettoyer
    return content
      // Supprimer balises HTML courantes
      .replace(/<[^>]+>/g, ' ')
      // Nettoyer entités HTML (apprentissage de l'ancien adapter)
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&hellip;/g, '...')
      // Nettoyer espaces multiples
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n') // Préserver paragraphes
      .trim();
  }
}
