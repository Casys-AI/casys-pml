import axios, { type AxiosInstance } from 'axios';

import { type TopicCandidate, type TopicFetchQuery, type TopicSource } from '@casys/core';
import { type TopicDiscoveryPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';

interface BingSearchResult {
  name: string;
  url: string;
  snippet: string;
  datePublished?: string;
  provider?: { name: string }[];
  image?: { thumbnail?: { contentUrl: string } };
  about?: { name: string }[];
}

interface BingSearchResponse {
  webPages?: {
    value: BingSearchResult[];
  };
  news?: {
    value: BingSearchResult[];
  };
}

export class BingSearchAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('BingSearchAdapter');
  private client: AxiosInstance;
  private sources: Map<string, TopicSource>;
  private apiKey: string;

  constructor(apiKey: string, initialSources: TopicSource[] = []) {
    if (!apiKey) {
      throw new Error('API key is required for Bing Search API');
    }

    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.bing.microsoft.com/v7.0',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
    });

    this.sources = new Map();
    for (const source of initialSources) {
      void this.addSource(source);
    }
  }

  // Gestion des sources
  addSource(source: TopicSource): void {
    if (!source.id) {
      source.id = `bing-${Date.now()}`;
    }
    if (!source.type) {
      source.type = 'custom';
    }
    this.sources.set(source.id, { ...source, enabled: source.enabled ?? true });
  }

  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  updateSource(sourceId: string, updates: Partial<TopicSource>): void {
    const source = this.sources.get(sourceId);
    if (source) {
      this.sources.set(sourceId, { ...source, ...updates });
    }
  }

  listSources(): TopicSource[] {
    return Array.from(this.sources.values());
  }

  getSource(sourceId: string): TopicSource | undefined {
    return this.sources.get(sourceId);
  }

  // Récupération des articles
  async discoverCandidates(query: TopicFetchQuery): Promise<TopicCandidate[]> {
    const sources = this.getFilteredSources(query.sources);
    const results: TopicCandidate[] = [];

    if (sources.length === 0) {
      return [];
    }

    for (const source of sources) {
      try {
        // Recherche Web pour blogs/sites spécialisés
        const webArticles = await this.fetchFromWebSearch(query, source);
        results.push(...webArticles);

        // Recherche News pour actualité récente
        const newsArticles = await this.fetchFromNewsSearch(query, source);
        results.push(...newsArticles);
      } catch (error) {
        this.logger.error(
          `Error fetching from Bing Search (source: ${source.id}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.logger.log(`${results.length} articles Bing Search récupérés au total.`);
    return this.sortAndLimit(results, query);
  }

  // Méthodes privées
  private async fetchFromWebSearch(
    query: TopicFetchQuery,
    source: TopicSource
  ): Promise<TopicCandidate[]> {
    const searchQuery = this.buildSearchQuery(query, source);
    const params: Record<string, unknown> = {
      q: searchQuery,
      count: Math.min(query.limit ?? 20, 50),
      offset: 0,
      mkt: this.getMarketCode(query.language),
      safeSearch: 'Moderate',
      textFormat: 'HTML',
      ...source.params,
    };

    const response = await this.client.get<BingSearchResponse>('/search', { params });

    if (!response.data.webPages?.value) {
      return [];
    }

    return response.data.webPages.value
      .map(result => this.mapWebResultToCandidate(result, source))
      .filter((candidate): candidate is TopicCandidate => candidate !== null);
  }

  private async fetchFromNewsSearch(
    query: TopicFetchQuery,
    source: TopicSource
  ): Promise<TopicCandidate[]> {
    const searchQuery = this.buildSearchQuery(query, source);
    const params: Record<string, unknown> = {
      q: searchQuery,
      count: Math.min(query.limit ?? 20, 100),
      offset: 0,
      mkt: this.getMarketCode(query.language),
      safeSearch: 'Moderate',
      textFormat: 'HTML',
      freshness: 'Week',
      ...source.params,
    };

    const response = await this.client.get<BingSearchResponse>('/news/search', { params });

    if (!response.data.news?.value) {
      return [];
    }

    return response.data.news.value
      .map(result => this.mapNewsResultToCandidate(result, source))
      .filter((candidate): candidate is TopicCandidate => candidate !== null);
  }

  private buildSearchQuery(query: TopicFetchQuery, source: TopicSource): string {
    const keywords = query.seoKeywords?.join(' OR ') ?? '';
    const sourceSpecific = source.params?.searchModifier as string;

    if (sourceSpecific) {
      return `${keywords} ${sourceSpecific}`;
    }

    return keywords;
  }

  private getMarketCode(language?: string): string {
    switch (language?.toLowerCase()) {
      case 'fr':
        return 'fr-FR';
      case 'en':
        return 'en-US';
      case 'es':
        return 'es-ES';
      case 'de':
        return 'de-DE';
      default:
        return 'en-US';
    }
  }

  private mapWebResultToCandidate(
    result: BingSearchResult,
    source: TopicSource
  ): TopicCandidate | null {
    try {
      if (!result.url || !result.name) {
        throw new Error('Missing required fields: url or name');
      }

      return {
        id: `bing-web-${Buffer.from(result.url).toString('base64').slice(0, 16)}`,
        title: result.name,
        description: result.snippet ?? '',
        sourceUrl: result.url,
        sourceTitle: result.provider?.[0]?.name ?? source.name ?? 'Bing Search',
        publishedAt: result.datePublished ? new Date(result.datePublished) : new Date(),
        imageUrls: result.image?.thumbnail?.contentUrl ? [result.image.thumbnail.contentUrl] : [],
        language: (source.params?.language as string) ?? 'en',
        metadata: {
          sourceType: 'bing-web',
          sourceId: source.id,
          searchType: 'web',
          ...source.metadata,
        },
      };
    } catch (error) {
      this.logger.warn(
        `[Bing Web] Failed to map result: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  private mapNewsResultToCandidate(
    result: BingSearchResult,
    source: TopicSource
  ): TopicCandidate | null {
    try {
      if (!result.url || !result.name) {
        throw new Error('Missing required fields: url or name');
      }

      return {
        id: `bing-news-${Buffer.from(result.url).toString('base64').slice(0, 16)}`,
        title: result.name,
        description: result.snippet ?? '',
        sourceUrl: result.url,
        sourceTitle: result.provider?.[0]?.name ?? source.name ?? 'Bing News',
        publishedAt: result.datePublished ? new Date(result.datePublished) : new Date(),
        imageUrls: result.image?.thumbnail?.contentUrl ? [result.image.thumbnail.contentUrl] : [],
        language: (source.params?.language as string) ?? 'en',
        metadata: {
          sourceType: 'bing-news',
          sourceId: source.id,
          searchType: 'news',
          ...source.metadata,
        },
      };
    } catch (error) {
      this.logger.warn(
        `[Bing News] Failed to map result: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  private getFilteredSources(sourceIds?: string[]): TopicSource[] {
    const sources = Array.from(this.sources.values());
    return sourceIds
      ? sources.filter(s => sourceIds.includes(s.id))
      : sources.filter(s => s.enabled !== false);
  }

  private sortAndLimit(articles: TopicCandidate[], query: TopicFetchQuery): TopicCandidate[] {
    // Trier par date (plus récent d'abord)
    let result = [...articles].sort((a, b) => {
      const dateA = typeof a.publishedAt === 'string' ? new Date(a.publishedAt) : a.publishedAt;
      const dateB = typeof b.publishedAt === 'string' ? new Date(b.publishedAt) : b.publishedAt;
      return dateB.getTime() - dateA.getTime();
    });

    // Limiter le nombre de résultats
    if (query.limit && query.limit > 0) {
      result = result.slice(0, query.limit);
    }

    return result;
  }
}
