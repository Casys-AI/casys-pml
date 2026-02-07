import type { PageContent,PageScraperPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';
import { JinaReaderStrategy } from './strategies/jina-reader.strategy';
import { LanguageDetectorAdapter } from './language-detector.adapter';

/**
 * Adaptateur de scraping de pages web
 * Utilise JinaReaderStrategy + LanguageDetectorAdapter
 */
export class PageScraperAdapter implements PageScraperPort {
  private readonly jinaStrategy: JinaReaderStrategy;
  private readonly languageDetector: LanguageDetectorAdapter;
  private readonly logger = createLogger('PageScraperAdapter');

  constructor(jinaApiKey?: string) {
    this.jinaStrategy = new JinaReaderStrategy(jinaApiKey);
    this.languageDetector = new LanguageDetectorAdapter();
  }

  async scrapePage(url: string): Promise<PageContent> {
    const result = await this.jinaStrategy.extract(url);
    
    const language = this.languageDetector.detect(result.content);
    
    return {
      url: String(result.metadata?.url ?? url),
      title: String(result.title ?? ''),
      content: String(result.content ?? ''),
      description: result.metadata?.description as string | undefined,
      language,
      publishedTime: result.publishedAt?.toISOString(),
      favicon: result.metadata?.favicon as string | undefined,
    };
  }


  async scrapePages(urls: string[]): Promise<PageContent[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.scrapePage(url))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<PageContent> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(page => {
        // Filtre robuste contre pages d'erreur (ex: Vercel 404)
        const title = String(page.title ?? '');
        const content = String(page.content ?? '');
        const isShort = content.length <= 100;
        const is404Title = /(?:^|\b)(404|not\s*found)(?:\b|:)/i.test(title);
        // Heuristiques supplémentaires pour contenus d'erreur génériques
        const hasVercelError = content.includes('vercel.com/docs/errors') || /^404:\s*NOT_FOUND/i.test(content);
        const hasGeneric404 = /(page\s+not\s+found|the\s+page\s+you\s+(?:were\s+)?looking\s+for\s+(?:does(?:\s+not)?\s+exist|is\s+not\s+found))/i.test(content);
        const hasStatus404 = /\bstatus\s*code\s*[:=]?\s*404\b/i.test(content);
        const looksLikeErrorBoilerplate = /(error\s+\d{3}|application\s+error|something\s+went\s+wrong)/i.test(content) && content.length < 2000;
        if (isShort) {
          this.logger.debug?.('Filtered page (short content)', { url: page.url, reason: 'short' });
          return false;
        }
        if (is404Title || hasVercelError || hasGeneric404 || hasStatus404 || looksLikeErrorBoilerplate) {
          this.logger.debug?.('Filtered page (error/404)', { url: page.url, reason: is404Title ? '404-title' : (hasVercelError ? 'vercel-error' : (hasGeneric404 ? 'generic-404' : (hasStatus404 ? 'status-404' : 'error-boilerplate'))) });
          return false;
        }
        return true;
      }); // Filtrer pages vides/erreurs
  }

  canHandle(url: string): boolean {
    return this.jinaStrategy.canHandle(url);
  }
}
