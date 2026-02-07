import type { KeywordTagSearchResult } from '@casys/core';

import type { TagRepositoryPort } from '../ports/out';

/**
 * Use case: Suggestion de tags via RAG Vector
{{ ... }}
 * - Méthode: Vector similarity search sur les embeddings de tags
 * - Usage: Suggérer des tags à réutiliser (éviter duplication, maillage interne)
 */
export class SuggestArticleTagsUseCase {
  constructor(private readonly repo: TagRepositoryPort) {}

  /**
   * Recherche RAG Vector : Trouve des tags existants sémantiquement similaires
   * Utilisé pour suggérer des tags à réutiliser (éviter duplication, maillage interne)
   */
  async searchSimilar(params: {
    queryText: string;
    tenantId: string;
    projectId: string;
    limit?: number;
    threshold?: number;
  }): Promise<KeywordTagSearchResult[]> {
    // Fail-fast
    if (!params?.queryText?.trim()) {
      throw new Error('[SuggestArticleTagsUseCase.searchSimilar] queryText requis');
    }
    if (!params.tenantId?.trim()) {
      throw new Error('[SuggestArticleTagsUseCase.searchSimilar] tenantId requis');
    }
    if (!params.projectId?.trim()) {
      throw new Error('[SuggestArticleTagsUseCase.searchSimilar] projectId requis');
    }

    const { queryText, tenantId, projectId, limit = 10, threshold = 0.65 } = params;

    // Utiliser searchSimilarTags si disponible (RAG Vector)
    if (typeof this.repo.searchSimilarTags === 'function') {
      try {
        return await this.repo.searchSimilarTags({
          queryText,
          projectId,
          tenantId,
          limit,
          threshold,
        });
      } catch {
        // Si RAG échoue, fallback vers liste vide (pas de blocage)
        return [];
      }
    }

    // Fallback: retourner tous les tags du projet (sans RAG, convertis en SearchResult)
    const tags = await this.repo.getProjectTags({ projectId, tenantId });
    return tags.map((tag): KeywordTagSearchResult => ({
      label: tag.label,
      slug: tag.slug ?? tag.label.toLowerCase().replace(/\s+/g, '-'),
      source: tag.source ?? 'seed',
      weight: tag.weight,
      score: 0.5,
      usageCount: 0,
    }));
  }
}
