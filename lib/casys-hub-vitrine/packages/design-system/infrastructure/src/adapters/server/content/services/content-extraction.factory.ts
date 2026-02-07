import type { AITextModelPort } from '@casys/application';

import { ContentQualificationAgent } from '../../ai/agents/content-qualification.agent';
import { ContentExtractionService, type ContentExtractionConfig } from './content-extraction.service';

/**
 * Options simplifiées pour la factory
 */
export interface ContentExtractionOptions {
  jinaApiKey?: string;
  firecrawlApiKey?: string;
  maxRetries?: number;
  timeout?: number;
  enabledStrategies?: string[];
}

/**
 * Factory pour créer un ContentExtractionService complet
 */
export function createContentExtractionService(
  aiTextModel: AITextModelPort,
  options: ContentExtractionOptions = {}
): ContentExtractionService {
  // Configuration par défaut
  const config: ContentExtractionConfig = {
    maxRetries: 3,
    timeout: 30000,
    enabledStrategies: ['rss-content', 'direct-scraping'], // Par défaut sans Jina
    jinaApiKey: process.env.JINA_API_KEY,
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
    ...options
  };

  // Activer Jina si clé API disponible
  if (config.jinaApiKey && !config.enabledStrategies.includes('jina-reader')) {
    config.enabledStrategies = ['rss-content', 'jina-reader', 'direct-scraping'];
  }

  // Créer l'agent de qualification
  const qualificationAgent = new ContentQualificationAgent(aiTextModel);

  // Créer le service complet
  return new ContentExtractionService(qualificationAgent, config);
}
