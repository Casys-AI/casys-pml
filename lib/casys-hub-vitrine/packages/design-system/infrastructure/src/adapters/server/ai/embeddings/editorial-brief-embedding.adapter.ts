import { EditorialBrief } from '@casys/core';
import type { EmbeddingPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour la génération d'embeddings d'EditorialBrief V3
 * Construit un texte compact à partir de l'angle, des keywordTags,
 * relevantQuestions et corpusSummary (champs directs V3).
 */
export class EditorialBriefEmbeddingAdapter {
  private readonly logger = createLogger('EditorialBriefEmbeddingAdapter');

  /**
   * V3: Génère l'embedding pour un brief éditorial avec champs directs
   * @param brief EditorialBrief (aggregate) ou plain object équivalent
   * @param embeddingService Service d'embedding
   * @returns Embedding et texte source, ou null si données insuffisantes
   */
  async generate(
    brief: EditorialBrief | {
      angle: string;
      corpusTopicIds: string[];
      keywordTags?: Array<{ label: string }>;
      relevantQuestions?: string[];
      corpusSummary?: string;
    },
    embeddingService: EmbeddingPort
  ): Promise<{ embedding: number[]; embeddingText: string } | null> {
    try {
      const data = brief instanceof EditorialBrief ? brief.toObject() : brief;

      const angle = (data as any).angle as string | undefined;
      const topics = Array.isArray((data as any).corpusTopicIds)
        ? ((data as any).corpusTopicIds as string[])
        : [];

      // V3: Utiliser les champs directs (pas de wrapper enrichedData/seoSummary)
      const keywords = Array.isArray((data as any)?.keywordTags)
        ? ((data as any).keywordTags as Array<{ label: string }>)
            .map(t => String(t.label).trim())
            .filter(Boolean)
        : [];

      const questions = Array.isArray((data as any)?.relevantQuestions)
        ? ((data as any).relevantQuestions as string[])
            .map(q => String(q).trim())
            .filter(Boolean)
            .slice(0, 3) // Max 3 questions pour ne pas surcharger
        : [];

      const summary = String((data as any)?.corpusSummary ?? '').trim();

      // Construire le texte pour embedding: angle + keywords + questions + summary (sans corpus topics)
      const textForEmbedding = [
        angle ?? '',
        keywords.join(' '),
        questions.join(' '),
        summary,
      ]
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .join(' ');

      if (!textForEmbedding) {
        this.logger.warn("Données insuffisantes pour générer l'embedding du brief éditorial");
        return null;
      }

      const embedding = await embeddingService.generateEmbedding(textForEmbedding);

      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        this.logger.error(
          `Embedding EditorialBrief dimension invalide: attendu 1536, reçu ${
            Array.isArray(embedding) ? embedding.length : '∅'
          }`
        );
        return null;
      }

      return {
        embedding,
        embeddingText: textForEmbedding.substring(0, 500),
      };
    } catch (error) {
      this.logger.error("Erreur lors de la génération d'embedding pour l'EditorialBrief:", error);
      return null;
    }
  }
}
