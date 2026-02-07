/**
 * Port pour parser les sitemaps XML
 */

export interface SitemapPage {
  url: string;
  priority?: number;
  changefreq?: string;
  lastmod?: string;
}

export interface SitemapParserPort {
  /**
   * Parse le sitemap.xml d'un domaine
   * @param domain Nom du domaine (sans https://)
   * @returns Liste des pages du sitemap
   */
  parseSitemap(domain: string): Promise<SitemapPage[]>;

  /**
   * Vérifie si un sitemap existe pour ce domaine
   * @param domain Nom du domaine
   * @returns true si sitemap existe
   */
  hasSitemap(domain: string): Promise<boolean>;
}
