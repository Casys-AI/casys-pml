import type { TopicCandidate } from '@casys/core';

import { createLogger } from '../../../../utils/logger';
import type { ContentQualificationAgent, ContentQualificationResult } from '../../ai/agents/content-qualification.agent';
import { DirectScrapingStrategy } from '../strategies/direct-scraping.strategy';
import { JinaReaderStrategy } from '../strategies/jina-reader.strategy';
import { RssContentStrategy } from '../strategies/rss-content.strategy';
import type { ContentExtractionStrategy, QualifiedContent, RawContent } from '../strategies/types';

/**
 * Configuration pour le service d'extraction
 */
export interface ContentExtractionConfig {
  maxRetries: number;
  timeout: number;
  enabledStrategies: string[];
  jinaApiKey?: string;
  firecrawlApiKey?: string;
}

/**
 * Service d'orchestration pour l'extraction de contenu
 * Gère les stratégies multiples, le cache et la qualification IA
 */
export class ContentExtractionService {
  private readonly logger = createLogger('ContentExtractionService');
  private readonly strategies: ContentExtractionStrategy[] = [];
  private readonly cache = new Map<string, QualifiedContent>();
  private readonly config: ContentExtractionConfig;

  constructor(
    private readonly qualificationAgent: ContentQualificationAgent,
    config: Partial<ContentExtractionConfig> = {}
  ) {
    this.config = {
      maxRetries: 3,
      timeout: 30000,
      enabledStrategies: ['rss-content', 'jina-reader', 'direct-scraping'],
      ...config
    };

    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    const { enabledStrategies, jinaApiKey } = this.config;

    // RSS Content (priorité maximale - pas de requête HTTP)
    if (enabledStrategies.includes('rss-content')) {
      this.strategies.push(new RssContentStrategy());
      this.logger.debug('✅ RSS Content strategy enabled');
    }

    // Jina Reader (priorité haute si disponible)
    if (enabledStrategies.includes('jina-reader') && jinaApiKey) {
      this.strategies.push(new JinaReaderStrategy(jinaApiKey));
      this.logger.debug('✅ Jina Reader strategy enabled');
    }

    // Direct Scraping (toujours disponible comme fallback)
    if (enabledStrategies.includes('direct-scraping')) {
      this.strategies.push(new DirectScrapingStrategy());
      this.logger.debug('✅ Direct Scraping strategy enabled');
    }

    // Trier par priorité décroissante
    this.strategies.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`📋 ${this.strategies.length} strategies loaded:`, 
      this.strategies.map(s => `${s.name}(${s.priority})`));
  }

  async extractContent(url: string, article?: TopicCandidate): Promise<QualifiedContent> {
    // Vérifier le cache
    const cached = this.cache.get(url);
    if (cached) {
      this.logger.debug(`📁 Cache hit: ${url}`);
      return cached;
    }

    try {
      // 1. Extraction multi-stratégies
      const rawContents = await this.extractWithMultipleStrategies(url, article);
      
      if (rawContents.length === 0) {
        throw new Error('All extraction strategies failed');
      }

      // 2. Qualification IA du meilleur contenu
      const qualified = await this.qualifyContent(rawContents, url, article?.title);
      
      // 3. Cache et retour
      this.cache.set(url, qualified);
      return qualified;

    } catch (error) {
      this.logger.error(`❌ Content extraction failed for ${url}:`, error);
      throw error;
    }
  }

  private async extractWithMultipleStrategies(
    url: string, 
    article?: TopicCandidate
  ): Promise<RawContent[]> {
    const results: RawContent[] = [];
    const applicableStrategies = this.strategies.filter(s => s.canHandle(url));

    this.logger.debug(`🎯 Trying ${applicableStrategies.length} strategies for: ${url}`);

    for (const strategy of applicableStrategies) {
      try {
        this.logger.debug(`⚡ Attempting strategy: ${strategy.name}`);
        const content = await strategy.extract(url, article);
        results.push(content);
        
        // Si on a un contenu avec bonne confiance, on peut s'arrêter
        if (content.confidence > 0.8) {
          this.logger.debug(`✅ High confidence result from ${strategy.name}`);
          break;
        }
      } catch (error) {
        this.logger.warn(`⚠️ Strategy ${strategy.name} failed:`, error);
        continue;
      }
    }

    return results;
  }

  private async qualifyContent(
    rawContents: RawContent[], 
    url: string,
    title?: string
  ): Promise<QualifiedContent> {
    // Prendre le contenu avec la meilleure confiance
    const bestContent = rawContents.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    try {
      // Appeler l'agent de qualification
      const input = JSON.stringify({
        content: bestContent.content,
        title: title || bestContent.title,
        url
      });

      const agentResponse = await this.qualificationAgent._call(input);
      const result = JSON.parse(agentResponse);

      if (!result.success) {
        throw new Error(result.error || 'Qualification failed');
      }

      const qualification: ContentQualificationResult = result.result;

      return {
        ...bestContent,
        cleanedContent: qualification.cleanedContent,
        summary: qualification.summary,
        keyPoints: qualification.keyPoints,
        contentType: qualification.contentType,
        qualityScore: qualification.qualityScore,
      };

    } catch (aiError) {
      this.logger.warn('⚠️ AI qualification failed, using raw content:', aiError);
      
      // Fallback sans IA
      return {
        ...bestContent,
        cleanedContent: bestContent.content,
        contentType: 'other',
        qualityScore: bestContent.confidence,
        keyPoints: [],
      };
    }
  }

  /**
   * Vider le cache (utile pour tests)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Obtenir statistiques cache
   */
  getCacheStats(): { size: number; urls: string[] } {
    return {
      size: this.cache.size,
      urls: Array.from(this.cache.keys()),
    };
  }
}
