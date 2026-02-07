import type { SectionNode } from '@casys/core';
import type { EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour la génération d'embeddings de sections
 * Construit le texte à partir du titre et du contenu de la section
 */
export class SectionEmbeddingAdapter {
  private readonly logger = createLogger('SectionEmbeddingAdapter');

  /**
   * Génère les embeddings pour une liste de sections
   * @param sections Liste des sections pour lesquelles générer les embeddings
   * @param embeddingService Service d'embedding
   * @returns Array d'embeddings enrichis avec sectionId
   */
  async generateBatch(
    sections: SectionNode[],
    embeddingService: EmbeddingPort
  ): Promise<Array<{ sectionId: string; embedding: number[]; embeddingText: string }>> {
    this.logger.log(`Génération d'embeddings pour ${sections.length} sections...`);

    const results: Array<{ sectionId: string; embedding: number[]; embeddingText: string }> = [];

    for (const section of sections) {
      try {
        // Construire le texte pour l'embedding : titre + contenu
        const textForEmbedding = `${section.title}\n${section.content || ''}`;

        if (!textForEmbedding.trim()) {
          this.logger.warn(`Section ${section.id} vide, embedding ignoré`);
          continue;
        }

        // Générer l'embedding
        const embedding = await embeddingService.generateEmbedding(textForEmbedding);

        // Fail-fast: vérifier la dimension attendue
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          this.logger.error(
            `Embedding Section dimension invalide: attendu 1536, reçu ${Array.isArray(embedding) ? embedding.length : '∅'}`
          );
          continue;
        }

        // Utiliser l'ID canonique (articleId::position)
        const canonicalId = `${section.articleId}::${section.position}`;

        results.push({
          sectionId: canonicalId,
          embedding,
          embeddingText: textForEmbedding.substring(0, 500),
        });

        this.logger.log(
          `Embedding généré pour section ${canonicalId} (${embedding.length} dimensions)`
        );
      } catch (error) {
        this.logger.error(
          `Erreur lors de la génération d'embedding pour section ${section.id}:`,
          error
        );
        // Continuer avec les autres sections même en cas d'erreur
      }
    }

    this.logger.log('Embeddings générés avec succès pour les sections');
    return results;
  }
}
