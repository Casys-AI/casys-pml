export interface SiteKeywordsPort {
  /**
   * Retourne une liste de mots-clés pertinents pour un site donné (DataForSEO Labs keywords_for_site).
   * - region: code pays (ex: 'FR', 'US')
   * - language: code langue ISO-2 (ex: 'fr', 'en')
   * - limit: nombre max de mots-clés
   */
  getKeywordsForSite(domain: string, region: string, language: string, limit?: number): Promise<string[]>;
}
