import { v4 as uuidv4 } from 'uuid';

import type { TopicCandidate, TopicFetchQuery } from '@casys/core';
import type { TopicDiscoveryPort, TrendAnalysisOptions } from '@casys/application';

import { createLogger } from '../../../utils/logger';
import {
  type WebSearchResult,
  type WebTopicDiscoveryAgent
} from '../ai/agents/web-topic-discovery.agent';

/**
 * Adapter qui implémente TopicDiscoveryPort en utilisant WebTopicDiscoveryAgent
 * Transforme les résultats bruts de l'agent en TopicCandidate
 */
export class WebTopicDiscoveryAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('WebTopicDiscoveryAdapter');

  constructor(private readonly agent: WebTopicDiscoveryAgent) {}

  async discoverCandidates(
    query: TopicFetchQuery,
    options?: Partial<TrendAnalysisOptions>
  ): Promise<TopicCandidate[]> {
    this.logger.debug('WebTopicDiscoveryAdapter: découverte de candidats via agent web');

    try {
      // Préférer supportingQueries (questions complètes) pour Tavily, fallback sur seoKeywords
      const searchQueries = query.supportingQueries && query.supportingQueries.length > 0
        ? query.supportingQueries
        : query.seoKeywords;

      // Validation des inputs
      if (!searchQueries || searchQueries.length === 0) {
        this.logger.warn('Aucune query (supportingQueries ou seoKeywords) fournie pour la recherche web');
        return [];
      }

      // Préparer la requête pour l'agent (Tavily préfère les questions complètes)
      const agentRequest = {
        keywords: searchQueries,
        language: query.language ?? options?.language ?? 'en'
      };

      // Appeler l'agent web via l'interface Tool standard
      const agentResponse = await this.agent.invoke(JSON.stringify(agentRequest));
      const parsed = JSON.parse(agentResponse);

      if (!parsed.success) {
        this.logger.error('Échec agent web:', parsed.error);
        return [];
      }

      // Log des résultats bruts Tavily
      this.logger.log(`🔍 Tavily a trouvé ${parsed.results?.length ?? 0} résultats bruts`);
      if (parsed.results && parsed.results.length > 0) {
        this.logger.debug('📄 Premiers résultats Tavily:', 
          parsed.results.slice(0, 3).map((r: WebSearchResult) => ({
            title: r.title,
            url: r.url,
            score: r.score
          }))
        );
      }

      // Transformer les résultats en TopicCandidate
      const candidates = this.transformToTopicCandidates(
        parsed.results,
        query,
        options
      );

      this.logger.log(`WebTopicDiscoveryAdapter: ${candidates.length} candidats découverts via web`);
      return candidates;

    } catch (error) {
      this.logger.error('Erreur dans WebTopicDiscoveryAdapter:', error);
      return [];
    }
  }

  /**
   * Transforme WebSearchResult[] en TopicCandidate[]
   */
  private transformToTopicCandidates(
    webResults: WebSearchResult[],
    query: TopicFetchQuery,
    options?: Partial<TrendAnalysisOptions>
  ): TopicCandidate[] {
    const maxResults = options?.maxTopics || query.limit || 50;

    this.logger.debug(`🔍 WebResults reçus de Tavily: ${webResults.length} résultats`);
    
    const candidates = webResults
      .slice(0, maxResults)
      .map(result => this.webResultToTopicCandidate(result, query));
    
    this.logger.debug(`🔄 Candidats après transformation: ${candidates.length}`);
    
    const validCandidates = candidates.filter(candidate => {
      const isValid = this.isValidCandidate(candidate);
      if (!isValid) {
        this.logger.debug(`❌ Candidat rejeté: "${candidate.title}" (score: ${candidate.relevanceScore}, url: ${candidate.sourceUrl})`);
      }
      return isValid;
    });

    this.logger.debug(`✅ Candidats valides finaux: ${validCandidates.length}`);
    return validCandidates;
  }

  /**
   * Convertit un WebSearchResult en TopicCandidate
   */
  private webResultToTopicCandidate(
    result: WebSearchResult,
    query: TopicFetchQuery
  ): TopicCandidate {
    // Génération ID unique
    const id = uuidv4();

    // Parsing de la date de publication
    let publishedAt: Date;
    try {
      publishedAt = result.publishedDate
        ? new Date(result.publishedDate)
        : new Date(); // Fallback: maintenant
    } catch {
      publishedAt = new Date();
    }

    // Extraction d'images depuis le contenu (simple regex)
    const imageUrls = this.extractImageUrls(result.content);

    // Catégorisation basée sur la source
    const categories = this.categorizeBySource(result.source);

    return {
      id,
      title: result.title.trim(),
      description: this.generateDescription(result.content),
      content: result.content,
      sourceUrl: result.url,
      sourceTitle: result.source || this.extractDomainFromUrl(result.url),
      publishedAt,
      imageUrls,
      language: query.language || 'en',
      categories,
      relevanceScore: result.score || 0.7,
      metadata: {
        source: 'web-agent',
        originalSource: result.source,
        searchKeywords: query.seoKeywords,
        webAgentScore: result.score
      }
    };
  }

  /**
   * Génère une description à partir du contenu
   */
  private generateDescription(content: string): string {
    if (!content) return '';

    // Nettoyer et tronquer le contenu
    const cleaned = content
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,!?;:()\[\]]/g, '')
      .trim();

    // Limiter à 200 caractères avec coupure propre
    if (cleaned.length <= 200) return cleaned;

    const truncated = cleaned.substring(0, 200);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 150
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  /**
   * Extrait les URLs d'images du contenu
   */
  private extractImageUrls(content: string): string[] {
    const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg))/gi;
    const matches = content.match(imageRegex);
    return matches ? [...new Set(matches)].slice(0, 3) : [];
  }

  /**
   * Catégorise selon la source
   */
  private categorizeBySource(source?: string): string[] {
    if (!source) return ['web'];

    const categories: string[] = ['web'];

    if (source.includes('reddit')) categories.push('discussion', 'community');
    else if (source.includes('github')) categories.push('development', 'opensource');
    else if (source.includes('stackoverflow')) categories.push('qa', 'technical');
    else if (source.includes('medium')) categories.push('blog', 'article');
    else if (source.includes('news')) categories.push('news');
    else categories.push('blog');

    return categories;
  }

  /**
   * Extrait le domaine depuis une URL
   */
  private extractDomainFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('www.', '');
    } catch {
      return 'web';
    }
  }

  /**
   * Valide qu'un candidat est acceptable
   */
  private isValidCandidate(candidate: TopicCandidate): boolean {
    return !!(
      candidate.title &&
      candidate.sourceUrl &&
      candidate.title.length > 10 &&
      candidate.sourceUrl.startsWith('http') &&
      (candidate.relevanceScore || 0) >= 0.5
    );
  }
}

/**
 * Factory pour créer l'adapter web topic discovery
 */
export function createWebTopicDiscoveryAdapter(
  agent: WebTopicDiscoveryAgent
): WebTopicDiscoveryAdapter {
  return new WebTopicDiscoveryAdapter(agent);
}
