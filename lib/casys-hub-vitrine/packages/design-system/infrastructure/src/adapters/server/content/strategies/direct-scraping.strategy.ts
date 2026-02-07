import { Readability } from '@mozilla/readability';
import axios from 'axios';
import { JSDOM } from 'jsdom';

import type { TopicCandidate } from '@casys/core';

import { createLogger } from '../../../../utils/logger';
import type { ContentExtractionStrategy, RawContent } from './types';

/**
 * Stratégie d'extraction directe (scraping avec Readability)
 * Version améliorée de l'ancien ArticleContentFetcher
 */
export class DirectScrapingStrategy implements ContentExtractionStrategy {
  readonly name = 'direct-scraping';
  readonly priority = 1; // Priorité basse (fallback)

  private readonly logger = createLogger('DirectScrapingStrategy');
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  canHandle(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  async extract(url: string, article?: TopicCandidate): Promise<RawContent> {
    this.logger.debug(`🌐 Direct scraping: ${url}`);

    try {
      // 1) Essayer d'utiliser RSS content si disponible
      if (article?.metadata?.content && 
          typeof article.metadata.content === 'string' && 
          article.metadata.content.length > 200) {
        return {
          content: article.metadata.content,
          title: article.title,
          author: article.author,
          publishedAt: article.createdAt ? new Date(article.createdAt) : undefined,
          confidence: 0.8,
          strategy: this.name,
          metadata: { source: 'rss_content' }
        };
      }

      // 2) Fetch HTML avec User-Agent rotatif
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      
      const response = await axios.get<string>(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout: 15000,
        maxRedirects: 5,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      // 3) Extraction avec Readability
      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const parsed = reader.parse();

      if (parsed?.content) {
        const cleanText = this.cleanHtmlToText(parsed.content);
        
        return {
          content: cleanText,
          title: parsed.title || article?.title,
          author: parsed.byline || article?.author,
          publishedAt: article?.createdAt ? new Date(article.createdAt) : undefined,
          confidence: this.calculateConfidence(cleanText, parsed),
          strategy: this.name,
          metadata: {
            originalLength: response.data.length,
            cleanedLength: cleanText.length,
            readabilityScore: parsed.length || 0
          }
        };
      }

      // 4) Fallback extraction basique
      const basicContent = this.extractBasicContent(response.data);
      return {
        content: basicContent,
        title: article?.title,
        author: article?.author,
        publishedAt: article?.createdAt ? new Date(article.createdAt) : undefined,
        confidence: 0.3, // Faible confiance pour extraction basique
        strategy: this.name,
        metadata: { source: 'basic_extraction' }
      };

    } catch (error) {
      this.logger.warn(`⚠️ Direct scraping failed for ${url}:`, error);
      
      // Dernière tentative : contenu RSS ou description
      const fallbackContent = article?.description || 'Contenu non disponible';
      return {
        content: fallbackContent,
        title: article?.title,
        author: article?.author,
        publishedAt: article?.createdAt ? new Date(article.createdAt) : undefined,
        confidence: 0.1, // Très faible confiance
        strategy: this.name,
        metadata: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private cleanHtmlToText(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ') // Supprimer balises HTML
      .replace(/\s+/g, ' ') // Normaliser espaces
      .replace(/&nbsp;/g, ' ') // Non-breaking spaces
      .replace(/&amp;/g, '&') // HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'") // Apostrophes
      .replace(/&hellip;/g, '...') // Ellipses
      .trim();
  }

  private extractBasicContent(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Supprimer pubs
      .replace(/<div[^>]*class="[^"]*sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Sidebar
      .replace(/<div[^>]*class="[^"]*comment[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Commentaires
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateConfidence(content: string, parsed: any): number {
    let confidence = 0.5;
    
    // Bonus pour contenu long
    if (content.length > 1000) confidence += 0.2;
    if (content.length > 3000) confidence += 0.1;
    
    // Bonus si Readability a trouvé titre/auteur
    if (parsed.title) confidence += 0.1;
    if (parsed.byline) confidence += 0.1;
    
    // Malus si contenu très court
    if (content.length < 200) confidence -= 0.3;
    
    return Math.min(Math.max(confidence, 0), 1);
  }
}
