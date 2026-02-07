import type { PageDiscoveryPort, PageScraperPort, SitemapParserPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

/**
 * Adaptateur pour découvrir les pages importantes d'un site
 * Stratégie hybride: sitemap + crawling homepage
 */
export class PageDiscoveryAdapter implements PageDiscoveryPort {
  private readonly logger = createLogger('PageDiscoveryAdapter');

  constructor(
    private readonly sitemapParser: SitemapParserPort,
    private readonly pageScraper: PageScraperPort
  ) {}

  async discoverPages(domain: string, maxPages: number = 10): Promise<string[]> {
    const candidates = new Map<string, number>(); // url -> score

    // Source 1: Sitemap (priorité haute)
    try {
      const sitemapPages = await this.sitemapParser.parseSitemap(domain);
      
      sitemapPages.forEach(page => {
        const score = (page.priority ?? 0.5) * 100;
        candidates.set(page.url, score);
      });
      
      this.logger.debug?.(`Found ${sitemapPages.length} pages from sitemap`);
    } catch (error) {
      this.logger.debug?.('No sitemap found, will use homepage crawling');
    }

    // Source 2: Homepage links (si sitemap vide ou insuffisant)
    if (candidates.size < maxPages) {
      try {
        const homepage = await this.pageScraper.scrapePage(`https://${domain}/`);
        const links = this.extractInternalLinks(homepage.content, domain);
        
        links.forEach(link => {
          if (!candidates.has(link)) {
            const score = this.calculateLinkScore(link);
            candidates.set(link, score);
          }
        });
        
        this.logger.debug?.(`Found ${links.length} links from homepage`);
      } catch (error) {
        this.logger.warn?.('Failed to crawl homepage', error);
      }
    }

    // Trier par score et limiter
    return Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1]) // Score décroissant
      .slice(0, maxPages)
      .map(([url]) => url);
  }

  extractInternalLinks(content: string, domain: string): string[] {
    const links = new Set<string>();
    
    // Regex pour extraire les liens markdown et HTML
    const markdownLinks = content.match(/\[.*?\]\((https?:\/\/[^\)]+)\)/g) || [];
    const htmlLinks = content.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
    
    const allLinks = [
      ...markdownLinks.map(m => m.match(/\((https?:\/\/[^\)]+)\)/)?.[1]),
      ...htmlLinks.map(m => m.match(/href=["'](https?:\/\/[^"']+)["']/)?.[1]),
    ].filter(Boolean) as string[];

    allLinks.forEach(link => {
      // Filtrer uniquement les liens internes
      if (link.includes(domain) && !this.isExcluded(link)) {
        links.add(link);
      }
    });

    return Array.from(links);
  }

  private calculateLinkScore(url: string): number {
    let score = 50; // Score de base
    
    const urlLower = url.toLowerCase();

    // Patterns importants (bonus)
    if (urlLower.includes('/about')) score += 40;
    if (urlLower.includes('/services')) score += 35;
    if (urlLower.includes('/products')) score += 35;
    if (urlLower.includes('/solutions')) score += 30;
    if (urlLower.includes('/pricing')) score += 25;
    if (urlLower.includes('/features')) score += 20;
    if (urlLower.includes('/contact')) score += 15;

    // Pénalités
    if (urlLower.includes('/blog/')) score -= 20; // Articles individuels
    if (urlLower.includes('/category/')) score -= 15;
    if (urlLower.includes('/tag/')) score -= 15;
    if (urlLower.includes('/author/')) score -= 20;
    if (urlLower.includes('?')) score -= 10; // Query params
    if (urlLower.includes('#')) score -= 10; // Anchors

    // Bonus pour URLs courtes (pages principales)
    const pathDepth = url.split('/').length - 3; // -3 pour https://domain/
    if (pathDepth === 1) score += 20;
    if (pathDepth === 2) score += 10;
    if (pathDepth > 3) score -= 10;

    return Math.max(score, 0);
  }

  private isExcluded(url: string): boolean {
    const excluded = [
      '/wp-admin',
      '/wp-content',
      '/wp-includes',
      '/admin',
      '/login',
      '/signup',
      '/register',
      '/cart',
      '/checkout',
      '.pdf',
      '.jpg',
      '.png',
      '.gif',
      '.zip',
    ];

    return excluded.some(pattern => url.toLowerCase().includes(pattern));
  }
}
