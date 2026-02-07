import type { KeywordTagDTO } from '@casys/shared';
import { createLogger, type Logger } from '../utils/logger';

/**
 * Mapper pour enrichir les KeywordTagDTO AI-only avec les ranked keywords
 * Responsabilité: Ajouter searchVolume depuis les ranked keywords DataForSEO
 */
export class KeywordDiscoveryMapper {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('KeywordDiscoveryMapper');
  }

  /**
   * Enrichit les keywords AI-only avec les métriques des ranked keywords
   *
   * @param aiKeywords Keywords extraits par l'AI (source: 'ai')
   * @param rankedKeywords Keywords rankés depuis DataForSEO
   * @returns Liste de KeywordTagDTO enrichis avec searchVolume
   */
  enrichWithRankedKeywords(
    aiKeywords: KeywordTagDTO[],
    rankedKeywords: { keyword: string; position: number; searchVolume: number }[]
  ): KeywordTagDTO[] {
    this.logger.debug('Starting Phase 1 enrichment with ranked keywords', {
      aiKeywordsCount: aiKeywords.length,
      rankedKeywordsCount: rankedKeywords.length,
    });

    const rankedMap = new Map(
      rankedKeywords.map((kw) => [kw.keyword.toLowerCase(), kw])
    );

    let matchedCount = 0;
    let unmatchedCount = 0;

    const enriched = aiKeywords.map((kw) => {
      const ranked = rankedMap.get(kw.label.toLowerCase());

      // Si trouvé dans ranked keywords, enrichir avec position + searchVolume basique
      if (ranked) {
        matchedCount++;
        return {
          ...kw,
          searchVolume: ranked.searchVolume,
          // Note: On ne stocke pas 'position' dans KeywordTagDTO actuellement
          // Si besoin, ajouter ce champ au DTO
          source: 'serp_discovered', // Source correcte pour ranked keywords
          sources: [...(kw.sources ?? []), 'serp_discovered'],
          updatedAt: new Date().toISOString(),
        };
      }

      // Sinon retourner tel quel (AI-only)
      unmatchedCount++;
      return kw;
    });

    const matchRate = aiKeywords.length > 0
      ? ((matchedCount / aiKeywords.length) * 100).toFixed(1)
      : '0.0';

    this.logger.debug('Phase 1 enrichment matching results', {
      matchedCount,
      unmatchedCount,
      matchRate: `${matchRate}%`,
    });

    const withSearchVolume = enriched.filter((kw) => kw.searchVolume !== undefined).length;

    this.logger.log('Phase 1 enrichment complete', {
      totalEnriched: enriched.length,
      withSearchVolume,
      sourcesUpdated: matchedCount,
    });

    return enriched;
  }
}
