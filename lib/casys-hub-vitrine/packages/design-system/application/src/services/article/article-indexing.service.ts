import type { ArticleStructure } from '@casys/core';

import type { ArticleIndexingUpsertPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

export class ArticleIndexingService {
  constructor(private readonly articleStore: ArticleIndexingUpsertPort) {}

  async execute(params: { article: ArticleStructure; tenantId: string }): Promise<void> {
    const { article, tenantId } = params;

    // Indexer l'Article et ses Sections dans le store (création des noeuds + HAS_SECTION)
    try {
      await this.articleStore.indexOutlineProgressively(
        article.article,
        article.sections ?? [],
        tenantId
      );
    } catch (e) {
      logger.warn?.('[IndexArticleStructureUseCase] indexOutlineProgressively: échec (non bloquant)', e);
    }

    // Indexer le contenu des sections (embeddings sectionnels)
    try {
      for (const s of article.sections ?? []) {
        if (!s?.content) continue;
        const canonicalId = `${article.article.id}::${s.position}`;
        await this.articleStore.indexSectionContentProgressively(
          canonicalId,
          s.content,
          article.article.projectId,
          tenantId,
          s.summary
        );
      }
    } catch (e) {
      logger.warn?.('[IndexArticleStructureUseCase] indexSectionContentProgressively: échec (non bloquant)', e);
    }
  }
}
