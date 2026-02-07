import type { Domain } from '@casys/core';
import type { KeywordTagDTO } from '@casys/shared';

import type { PageContent } from './page-scraper.port';

/**
 * Port pour découverte de keywords SEO (Infrastructure)
 * Responsabilité: Extraire keywords depuis le contenu via AI
 * Retourne des KeywordTagDTO AI-only (sans enrichissement DataForSEO)
 */
export interface KeywordDiscoveryPort {
  /**
   * Découvre les keywords pertinents depuis le contenu du site
   * Retourne 20-30 keywords avec enrichissement AI (category, intent, description)
   *
   * @param domain Domaine du site
   * @param input Pages content + ranked keywords + business context
   * @param language Code langue détecté (fr, en, etc.)
   * @returns Liste des keywords AI-only (sans métriques DataForSEO)
   */
  discoverKeywords(
    domain: Domain,
    input: {
      pages: PageContent[];
      rankedKeywords: { keyword: string; position: number; searchVolume: number }[];
      businessContext: {
        industry?: string;
        targetAudience?: string;
        contentType?: string;
        businessDescription?: string;
      };
    },
    language: string
  ): Promise<KeywordTagDTO[]>;
}
