import axios, { AxiosError, type AxiosInstance } from 'axios';

import {
  mapLanguageToNewsLanguage,
  type TopicCandidate,
  type TopicFetchQuery,
  type TopicSource,
} from '@casys/core';
import { type TopicDiscoveryPort } from '@casys/application';

import { ProviderKeywordSelector } from '../../../services/provider-keyword-selector';
import { createLogger } from '../../../utils/logger';

// Types minimalistes pour NewsAPI (module scope)
interface NewsApiSourceRef {
  id?: string | null;
  name?: string | null;
}

interface NewsApiArticle {
  source?: NewsApiSourceRef;
  author?: string | null;
  title: string;
  description?: string | null;
  url: string;
  urlToImage?: string | null;
  publishedAt: string; // ISO date
  content?: string | null;
}

interface NewsApiResponse {
  status: 'ok' | 'error';
  totalResults?: number;
  articles?: NewsApiArticle[];
  code?: string;
  message?: string;
}

interface NewsApiErrorResponse {
  status: 'error';
  code?: string;
  message?: string;
}

export class NewsApiArticleFetcherAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('NewsApiArticleFetcherAdapter');
  private client: AxiosInstance;
  private sources: Map<string, TopicSource>;
  private apiKey: string;
  private readonly keywordSelector = new ProviderKeywordSelector();

  constructor(apiKey: string, initialSources: TopicSource[] = []) {
    if (!apiKey) {
      throw new Error('API key is required for NewsAPI');
    }
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://newsapi.org/v2',
      headers: {
        'X-Api-Key': this.apiKey,
      },
    });

    this.sources = new Map();
    initialSources.forEach(source => {
      this.addSource(source);
    });
  }

  // Gestion des sources
  addSource(source: TopicSource): void {
    if (!source.id) {
      source.id = `newsapi-${Date.now()}`;
    }
    if (!source.type) {
      source.type = 'newsapi';
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
    // Fail-fast: éviter requêtes ambiguës (NewsAPI exige q/sources)
    if (!query.seoKeywords?.length) {
      throw new Error('[NewsAPI] seoKeywords is required (fail-fast)');
    }
    // Utiliser les sources spécifiées dans la requête, si disponibles
    const sources = this.getFilteredSources(query.sources);
    const results: TopicCandidate[] = [];

    if (sources.length === 0) {
      return [];
    }

    for (const source of sources) {
      if (source.type !== 'newsapi') {
        continue;
      }

      try {
        const articles = await this.fetchFromNewsApi(query, source);
        results.push(...articles);
      } catch (error) {
        this.logger.error(
          `Error fetching from NewsAPI (source: ${source.id}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.logger.log(`${results.length} articles NewsAPI récupérés au total.`);
    return this.sortAndLimit(results, query);
  }

  // Méthodes privées
  private async fetchFromNewsApi(
    query: TopicFetchQuery,
    source: TopicSource
  ): Promise<TopicCandidate[]> {
    const { query: qString } = this.keywordSelector.select('newsapi', query.seoKeywords);
    // IMPORTANT: ne pas laisser source.params écraser q/language/pageSize par défaut.
    const params: Record<string, unknown> = {
      ...source.params,
      q: qString,
      from: query.since?.toISOString().split('T')[0],
      to: query.until?.toISOString().split('T')[0],
      language: mapLanguageToNewsLanguage(query.language ?? 'fr'),
      pageSize: Math.min(query.limit ?? 50, 100), // Augmenter la limite par défaut à 50
    };
    if (!('sortBy' in params)) {
      params.sortBy = 'publishedAt';
    }

    // Supprimer les paramètres vides
    Object.keys(params).forEach(key => {
      if (params[key] === undefined || params[key] === '') {
        delete params[key];
      }
    });

    // Log de diagnostic détaillé (sans clé API) à la manière de NewsData/WorldNews
    try {
      const toStringParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        toStringParams[k] = String(v);
      }
      const fullUrl = `${this.client.defaults.baseURL}/everything?${new URLSearchParams(
        toStringParams
      ).toString()}`;
      this.logger.debug('NewsAPI query details:', {
        processedQuery: qString,
        queryLength: qString.length,
        encodedLength: encodeURIComponent(qString).length,
        fullUrl,
        headers: { 'X-Api-Key': '[HIDDEN]' },
      });
    } catch (_e) {
      // noop
    }

    let response;
    try {
      response = await this.client.get<NewsApiResponse>('/everything', { params });
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const errorData = error.response?.data as NewsApiErrorResponse;

        // Détection spécifique des problèmes de clé API
        if (status === 401) {
          this.logger.warn('⚠️  [NewsAPI] CLÉ API INVALIDE - Vérifiez votre clé NEWS_API_KEY');
        } else if (status === 429) {
          this.logger.warn(
            '⚠️  [NewsAPI] QUOTA ÉPUISÉ - Limite de requêtes atteinte pour cette période'
          );
        } else if (status === 426) {
          this.logger.warn(
            '⚠️  [NewsAPI] PLAN GRATUIT ÉPUISÉ - Upgrade requis vers un plan payant'
          );
        } else if (errorData?.code === 'rateLimited') {
          this.logger.warn('⚠️  [NewsAPI] RATE LIMIT - Trop de requêtes par minute');
        } else if (errorData?.code === 'apiKeyInvalid') {
          this.logger.warn('⚠️  [NewsAPI] CLÉ API INVALIDE - Clé manquante ou incorrecte');
        } else if (errorData?.code === 'apiKeyDisabled') {
          this.logger.warn(
            '⚠️  [NewsAPI] CLÉ API DÉSACTIVÉE - Compte suspendu ou problème de facturation'
          );
        } else {
          this.logger.error(`[NewsAPI] Erreur HTTP ${status}: ${error.message}`);
        }

        if (error.response?.data) {
          this.logger.debug('[NewsAPI] Détails erreur:', error.response.data);
        }
      } else {
        this.logger.error('[NewsAPI] Erreur inattendue:', error);
      }
      return [];
    }

    if (response.data.status !== 'ok') {
      throw new Error(`NewsAPI error: ${response.data.message ?? 'Unknown error'}`);
    }

    // Filtrer et mapper les articles valides
    const validArticles = (response.data.articles ?? [])
      .map<TopicCandidate | null>((article: NewsApiArticle, index: number) => {
        try {
          // Vérifier les champs obligatoires
          if (!article.url) {
            throw new Error(`Article à l'index ${index} ignoré: champ 'url' manquant`);
          }

          if (!article.title) {
            throw new Error(`Article à l'index ${index} ignoré: champ 'title' manquant`);
          }

          if (!article.publishedAt) {
            throw new Error(`Article '${article.title}' ignoré: champ 'publishedAt' manquant`);
          }

          // Construire l'objet article avec les champs requis
          return {
            id: `newsapi-${article.url}`,
            title: article.title,
            description: article.description ?? '',
            sourceUrl: article.url,
            sourceTitle: article.source?.name ?? source.name ?? 'Source inconnue',
            publishedAt: new Date(article.publishedAt),
            author: article.author ?? undefined,
            imageUrls: article.urlToImage ? [article.urlToImage] : [],
            categories: [],
            language: query.language,
            metadata: {
              sourceId: source.id,
              sourceType: 'newsapi',
              originalSource: article.source,
              ...source.metadata,
            },
          } satisfies TopicCandidate;
        } catch (error) {
          this.logger.debug(
            `[NewsAPI] Article ignoré: ${error instanceof Error ? error.message : String(error)}`
          );
          return null;
        }
      })
      .filter((article): article is TopicCandidate => article !== null);

    this.logger.log(
      `[NewsAPI] ${validArticles.length}/${response.data.articles?.length ?? 0} articles valides après filtrage`
    );
    return validArticles;
  }

  private getFilteredSources(sourceIds?: string[]): TopicSource[] {
    const sources = Array.from(this.sources.values());
    this.logger.debug(
      `NewsAPI getFilteredSources - Toutes les sources: ${JSON.stringify(sources, null, 2)}`
    );
    this.logger.debug(
      `NewsAPI getFilteredSources - sourceIds: ${JSON.stringify(sourceIds, null, 2)}`
    );

    let filteredSources;
    if (sourceIds && sourceIds.length > 0) {
      filteredSources = sources.filter(s => sourceIds.includes(s.id));
      this.logger.debug(
        `NewsAPI getFilteredSources - Filtrage par IDs: ${sourceIds.map(id => `'${id}'`).join(', ')}`
      );
    } else {
      filteredSources = sources.filter(s => s.enabled !== false);
      this.logger.debug('NewsAPI getFilteredSources - Filtrage par enabled=true');
    }

    this.logger.debug(
      `NewsAPI getFilteredSources - Sources filtrées: ${JSON.stringify(filteredSources, null, 2)}`
    );
    return filteredSources;
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
