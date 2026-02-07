import type { ArticleComment, TextFragment } from '@casys/core';
import type { EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour la génération d'embeddings contextualisés de commentaires
 * Construit le texte à partir du contenu du fragment + commentaire
 */
export class CommentEmbeddingAdapter {
  private readonly logger = createLogger('CommentEmbeddingAdapter');

  /**
   * Génère les embeddings contextualisés pour une liste de commentaires
   * @param comments Liste des commentaires
   * @param textFragments Liste des fragments (pour récupérer le contexte)
   * @param embeddingService Service d'embedding
   * @returns Array d'embeddings enrichis avec commentId
   */
  async generateBatch(
    comments: ArticleComment[],
    textFragments: TextFragment[],
    embeddingService: EmbeddingPort
  ): Promise<Array<{ commentId: string; embedding: number[]; embeddingText: string }>> {
    this.logger.log(
      `Génération d'embeddings contextualisés pour ${comments.length} commentaires...`
    );

    const results: Array<{ commentId: string; embedding: number[]; embeddingText: string }> = [];

    // Créer une map des fragments pour un accès rapide
    const fragmentsMap = new Map(textFragments.map(f => [f.id, f]));

    for (const comment of comments) {
      try {
        const commentContent = comment.content?.trim();

        if (!commentContent) {
          this.logger.warn(`Commentaire ${comment.id} vide, embedding ignoré`);
          continue;
        }

        // Récupérer le fragment associé pour le contexte
        const associatedFragment = fragmentsMap.get(comment.textFragmentId);
        const fragmentContent = associatedFragment?.content?.trim() ?? '';

        // Construire le texte contextualisé : fragment + commentaire
        const textForEmbedding = fragmentContent
          ? `${fragmentContent} [COMMENT] ${commentContent}`
          : commentContent;

        // Générer l'embedding contextualisé
        const embedding = await embeddingService.generateEmbedding(textForEmbedding);

        // Fail-fast: vérifier la dimension attendue
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          this.logger.error(
            `Embedding Comment dimension invalide: attendu 1536, reçu ${Array.isArray(embedding) ? embedding.length : '∅'}`
          );
          continue;
        }

        results.push({
          commentId: comment.id,
          embedding,
          embeddingText: textForEmbedding.substring(0, 500),
        });

        this.logger.log(
          `Embedding contextualisé généré pour commentaire ${comment.id} (avec fragment: ${!!fragmentContent})`
        );
      } catch (error) {
        this.logger.error(
          `Erreur lors de la génération d'embedding pour commentaire ${comment.id}:`,
          error
        );
      }
    }

    this.logger.log('Embeddings contextualisés générés avec succès pour les commentaires');
    return results;
  }
}
