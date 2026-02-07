/**
 * Port pour le scraping de pages web
 * Permet d'extraire le contenu structuré de pages HTML
 */

export interface PageContent {
  url: string;
  title: string;
  content: string;
  description?: string;
  language?: string; // Code ISO 639-1 (ex: 'fr', 'en')
  publishedTime?: string;
  favicon?: string;
}

export interface PageScraperPort {
  /**
   * Scrape une page web et retourne son contenu structuré
   * @param url URL de la page à scraper
   * @returns Contenu structuré de la page
   */
  scrapePage(url: string): Promise<PageContent>;

  /**
   * Scrape plusieurs pages en parallèle
   * @param urls URLs des pages à scraper
   * @returns Contenus structurés des pages (filtre les échecs)
   */
  scrapePages(urls: string[]): Promise<PageContent[]>;

  /**
   * Vérifie si le scraper peut traiter cette URL
   * @param url URL à vérifier
   * @returns true si le scraper peut traiter cette URL
   */
  canHandle(url: string): boolean;
}
