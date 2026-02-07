import { JinaClient } from '@agentic/jina';

import type { TopicCandidate } from '@casys/core';

import { createLogger } from '../../../../utils/logger';
import type { ContentExtractionStrategy, RawContent } from './types';

/**
 * Stratégie utilisant l'API Jina Reader pour extraction de contenu
 * https://jina.ai/reader/ - Spécialisée dans l'extraction de contenu web
 * Utilise @agentic/jina SDK pour typage et gestion automatique
 */
export class JinaReaderStrategy implements ContentExtractionStrategy {
  readonly name = 'jina-reader';
  readonly priority = 3; // Priorité élevée si API disponible

  private readonly logger = createLogger('JinaReaderStrategy');
  private readonly jina: JinaClient;
  private readonly hasApiKey: boolean;

  constructor(jinaApiKey?: string) {
    this.hasApiKey = Boolean(jinaApiKey);
    this.jina = new JinaClient({ 
      apiKey: jinaApiKey,
      timeoutMs: 20000
    });
  }

  canHandle(url: string): boolean {
    // Peut traiter toute URL si API key disponible
    return this.hasApiKey && 
           (url.startsWith('http://') || url.startsWith('https://'));
  }

  async extract(url: string, article?: TopicCandidate): Promise<RawContent> {
    if (!this.hasApiKey) {
      throw new Error('Jina API key not configured');
    }

    this.logger.debug(`🤖 Jina Reader extraction: ${url}`);

    let response;
    try {
      // Appel via SDK avec mode JSON structuré
      response = await this.jina.readUrl({
        url,
        json: true, // Retourne objet structuré
        returnFormat: 'markdown',
        withLinksSummary: false,
        withImagesSummary: false,
        noCache: false
      });
    } catch (error) {
      // Fallback: essayer avec www. si le domaine racine échoue
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (!urlObj.hostname.startsWith('www.')) {
        const wwwUrl = `https://www.${urlObj.hostname}${urlObj.pathname}${urlObj.search}`;
        this.logger.debug(`🤖 Jina Reader fallback with www: ${wwwUrl}`);
        
        response = await this.jina.readUrl({
          url: wwwUrl,
          json: true,
          returnFormat: 'markdown',
          withLinksSummary: false,
          withImagesSummary: false,
          noCache: false
        });
      } else {
        throw error;
      }
    }

    try {
      const data = response.data;
      
      return {
        content: data.content, // Jina retourne déjà du Markdown propre
        title: data.title ?? article?.title,
        author: article?.author, // Jina ne fournit pas l'auteur
        publishedAt: data.publishedTime ? new Date(data.publishedTime) : 
                     article?.createdAt ? new Date(String(article.createdAt)) : undefined,
        confidence: this.calculateConfidence(data),
        strategy: this.name,
        metadata: {
          source: 'jina_reader',
          originalFormat: 'markdown',
          url: data.url,
          description: data.description,
          favicon: data.favicon,
          contentLength: data.content.length
        }
      };

    } catch (error) {
      // Log détaillé pour HTTPError (Got)
      const statusCode = (error as any)?.response?.statusCode;
      const statusMessage = (error as any)?.response?.statusMessage;
      const body = (error as any)?.response?.body;
      
      this.logger.warn(`⚠️ Jina Reader extraction failed for ${url}`, {
        statusCode,
        statusMessage,
        body: typeof body === 'string' ? body.substring(0, 200) : body,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error; // Laisser les autres stratégies prendre le relais
    }
  }


  private calculateConfidence(data: { content: string; title?: string; description?: string }): number {
    let confidence = 0.85; // Base élevée pour Jina Reader (API fiable)

    // Bonus si title et description présents
    if (data.title && data.title.length > 5) confidence += 0.05;
    if (data.description && data.description.length > 20) confidence += 0.05;

    // Bonus pour contenu long et structuré
    if (data.content.length > 2000) confidence += 0.05;

    // Malus si contenu très court (probablement échec extraction)
    if (data.content.length < 100) confidence -= 0.6;

    return Math.min(Math.max(confidence, 0), 1);
  }
}
