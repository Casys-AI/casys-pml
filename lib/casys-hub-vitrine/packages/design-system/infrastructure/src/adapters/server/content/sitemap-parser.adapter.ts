import Sitemapper from 'sitemapper';

import type { SitemapPage, SitemapParserPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

/**
 * Adaptateur pour parser les sitemaps XML
 */
export class SitemapParserAdapter implements SitemapParserPort {
  private readonly logger = createLogger('SitemapParserAdapter');
  private readonly sitemap: Sitemapper;

  constructor() {
    this.sitemap = new Sitemapper({
      timeout: 15000,
      requestHeaders: {
        'User-Agent': 'Mozilla/5.0 (compatible; CasysBot/1.0)',
      },
    });
  }

  async parseSitemap(domain: string): Promise<SitemapPage[]> {
    const sitemapUrls = [
      `https://${domain}/sitemap.xml`,
      `https://${domain}/sitemap_index.xml`,
      `https://www.${domain}/sitemap.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        this.logger.debug?.(`Parsing sitemap: ${sitemapUrl}`);
        const { sites } = await this.sitemap.fetch(sitemapUrl);

        if (sites && sites.length > 0) {
          this.logger.debug?.(`Found ${sites.length} pages in sitemap`);

          return sites.map(url => ({
            url,
            priority: this.inferPriority(url),
          }));
        }
      } catch (error) {
        this.logger.debug?.(`Sitemap not found at ${sitemapUrl}`);
        continue;
      }
    }

    throw new Error(`No sitemap found for domain: ${domain}`);
  }

  async hasSitemap(domain: string): Promise<boolean> {
    try {
      await this.parseSitemap(domain);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Infère la priorité d'une URL basée sur sa structure
   */
  private inferPriority(url: string): number {
    const urlLower = url.toLowerCase();

    // Homepage
    if (/\/(index\.(html|php|asp))?$/.exec(urlLower)) return 1.0;

    // Pages importantes
    if (urlLower.includes('/about')) return 0.9;
    if (urlLower.includes('/services')) return 0.9;
    if (urlLower.includes('/products')) return 0.9;
    if (urlLower.includes('/solutions')) return 0.8;
    if (urlLower.includes('/pricing')) return 0.8;
    if (urlLower.includes('/contact')) return 0.7;

    // Pages moins importantes
    if (urlLower.includes('/blog/')) return 0.4;
    if (urlLower.includes('/category/')) return 0.3;
    if (urlLower.includes('/tag/')) return 0.3;

    return 0.5; // Défaut
  }
}
