import type { ArticleNode } from '@casys/core';
import type { EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour la génération d'embeddings d'articles
 * Construit le texte à partir du titre, description, tags et sources
 */
export class ArticleEmbeddingAdapter {
  private readonly logger = createLogger('ArticleEmbeddingAdapter');

  /**
   * Génère l'embedding pour un article
   * @param article Article pour lequel générer l'embedding
   * @param embeddingService Service d'embedding
   * @returns Embedding et texte source, ou null si données insuffisantes
   */
  async generate(
    article: ArticleNode,
    embeddingService: EmbeddingPort
  ): Promise<{ embedding: number[]; embeddingText: string } | null> {
    try {
      // Construire le texte pour l'embedding : métadonnées uniquement
      const tags = Array.isArray(article.keywords) ? article.keywords.join(' ') : '';
      const sources = Array.isArray(article.sources)
        ? article.sources
            .map(s => {
              if (typeof s === 'object' && s !== null && 'title' in s) {
                return (s as { title: string }).title;
              }
              return String(s);
            })
            .join(' ')
        : '';

      const textForEmbedding =
        `${article.title ?? ''} ${article.description ?? ''} ${tags} ${sources}`.trim();

      if (!textForEmbedding) {
        this.logger.warn(
          `Données insuffisantes pour générer l'embedding de l'article ${article.id}`
        );
        return null;
      }

      // Générer l'embedding
      const embedding = await embeddingService.generateEmbedding(textForEmbedding);

      // Fail-fast: vérifier la dimension attendue
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        this.logger.error(
          `Embedding Article dimension invalide: attendu 1536, reçu ${Array.isArray(embedding) ? embedding.length : '∅'}`
        );
        return null;
      }

      return {
        embedding,
        embeddingText: textForEmbedding.substring(0, 500), // Garder les premiers 500 caractères pour debug
      };
    } catch (error) {
      this.logger.error(
        `Erreur lors de la génération d'embedding pour l'article ${article.id}:`,
        error
      );
      // Continuer en cas d'erreur sur l'embedding
      return null;
    }
  }
}
