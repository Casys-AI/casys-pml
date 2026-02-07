import type { TextFragment } from '@casys/core';
import type { EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour la génération d'embeddings de fragments de texte
 * Construit le texte à partir du contenu du fragment
 */
export class TextFragmentEmbeddingAdapter {
  private readonly logger = createLogger('TextFragmentEmbeddingAdapter');

  /**
   * Génère les embeddings pour une liste de fragments de texte
   * @param textFragments Liste des fragments pour lesquels générer les embeddings
   * @param embeddingService Service d'embedding
   * @returns Array d'embeddings enrichis avec fragmentId
   */
  async generateBatch(
    textFragments: TextFragment[],
    embeddingService: EmbeddingPort
  ): Promise<Array<{ fragmentId: string; embedding: number[]; embeddingText: string }>> {
    this.logger.log(`Génération d'embeddings pour ${textFragments.length} fragments de texte...`);

    const results: Array<{ fragmentId: string; embedding: number[]; embeddingText: string }> = [];

    for (const fragment of textFragments) {
      try {
        const textForEmbedding = fragment.content?.trim();

        if (!textForEmbedding) {
          this.logger.warn(`Fragment ${fragment.id} vide, embedding ignoré`);
          continue;
        }

        // Générer l'embedding pour le fragment seul
        const embedding = await embeddingService.generateEmbedding(textForEmbedding);

        // Fail-fast: vérifier la dimension attendue
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          this.logger.error(
            `Embedding TextFragment dimension invalide: attendu 1536, reçu ${Array.isArray(embedding) ? embedding.length : '∅'}`
          );
          continue;
        }

        results.push({
          fragmentId: fragment.id,
          embedding,
          embeddingText: textForEmbedding.substring(0, 500),
        });

        this.logger.log(
          `Embedding généré pour fragment ${fragment.id} (${embedding.length} dimensions)`
        );
      } catch (error) {
        this.logger.error(
          `Erreur lors de la génération d'embedding pour fragment ${fragment.id}:`,
          error
        );
      }
    }

    this.logger.log('Embeddings générés avec succès pour les fragments de texte');
    return results;
  }
}
