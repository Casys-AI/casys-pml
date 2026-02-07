import type { DomainAnalysisDTO, KeywordMetricsDTO, SerpAnalysisDTO } from '@casys/shared';

/**
 * Port pour l'enrichissement de mots-clés avec métriques SEO réelles
 * Implémenté par : DataForSeoKeywordsAdapter (Infrastructure)
 */
export interface KeywordEnrichmentPort {
  /**
   * Enrichit une liste de mots-clés avec métriques SEO réelles
   * @param keywords - Liste des mots-clés à enrichir
   * @param region - Code région (ex: 'FR', 'US')
   * @returns Métriques SEO pour chaque mot-clé
   */
  enrichKeywords(keywords: string[], region?: string): Promise<KeywordMetricsDTO[]>;

  /**
   * Récupère les mots-clés liés via DataForSEO Related Keywords API
   * Plus efficace que le SERP scraping pour découvrir de nouveaux keywords
   * @param keywords - Liste des seed keywords
   * @param region - Code région (ex: 'FR', 'US')
   * @param options - Configuration (limit, depth, etc.)
   * @returns Mots-clés liés avec leurs métriques SEO
   */
  getRelatedKeywords(
    keywords: string[],
    region?: string,
    options?: { limit?: number; depth?: number }
  ): Promise<KeywordMetricsDTO[]>;
}

/**
 * Port pour l'analyse SERP enrichie (PAA + Related Searches)
 * Implémenté par : DataForSeoSerpAdapter (Infrastructure) - extension
 */
export interface SerpAnalysisPort {
  /**
   * Analyse le SERP pour extraire questions et recherches associées
   * @param keywords - Liste des mots-clés à analyser
   * @param region - Code région (ex: 'FR', 'US')
   * @returns Analyse SERP avec PAA et related searches
   */
  analyzeSerp(keywords: string[], region?: string): Promise<SerpAnalysisDTO[]>;
}

/**
 * Port pour l'analyse de domaines concurrents
 * Implémenté par : DataForSeoDomainAdapter (Infrastructure)
 */
export interface DomainAnalysisPort {
  /**
   * Analyse un ou plusieurs domaines concurrents
   * @param domains - Liste des domaines à analyser
   * @returns Métriques pour chaque domaine
   */
  analyzeDomains(domains: string[]): Promise<DomainAnalysisDTO[]>;
}
