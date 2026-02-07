import axios from 'axios';
import { config } from 'dotenv';

import { mapLanguageToNewsLanguage, type TopicCandidate, type TopicFetchQuery } from '@casys/core';
import { type TopicDiscoveryPort } from '@casys/application';

import { ProviderKeywordSelector } from '../../../services/provider-keyword-selector';
import { createLogger } from '../../../utils/logger';

// Charger le .env root du projet
config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

/**
 * Adaptateur pour NewsData.io API
 * https://newsdata.io/docs
 */
export class NewsDataArticleFetcherAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('NewsDataAPI');
  private readonly apiKey: string;
  private readonly baseUrl = 'https://newsdata.io/api/1';
  private readonly keywordSelector = new ProviderKeywordSelector();

  constructor() {
    this.apiKey = process.env.NEWSDATA_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('NEWSDATA_API_KEY environment variable is required');
    }
  }

  /**
   * Implémentation de TopicDiscoveryPort
   */
  async discoverCandidates(query: TopicFetchQuery): Promise<TopicCandidate[]> {
    try {
      this.logger.log(`🗞️ NewsData API - Recherche: ${query.seoKeywords?.join(', ') ?? 'global'}`);

      // Fail-fast: mots-clés requis pour éviter 400/422 de l'API
      if (!query.seoKeywords || query.seoKeywords.length === 0) {
        throw new Error('[NewsDataAPI] seoKeywords is required (fail-fast)');
      }

      const { query: textQuery } = this.keywordSelector.select('newsdata', query.seoKeywords);

      // Logs détaillés pour diagnostiquer (sans fallback de langue)
      const debugParams: Record<string, string> = {
        apikey: '[HIDDEN]',
        q: textQuery,
        size: '10',
      };
      if (query.language) {
        debugParams.language = mapLanguageToNewsLanguage(query.language);
      }
      this.logger.debug('NewsData query details:', {
        originalKeywords: query.seoKeywords,
        processedQuery: textQuery,
        queryLength: textQuery.length,
        encodedLength: encodeURIComponent(textQuery).length,
        fullUrl: `${this.baseUrl}/news?${new URLSearchParams(debugParams).toString()}`,
      });

      const searchParams = new URLSearchParams();
      searchParams.set('apikey', this.apiKey);
      searchParams.set('q', textQuery);
      searchParams.set('size', '10');
      // Ajouter language uniquement si fourni (pas de fallback)
      if (query.language) {
        searchParams.set('language', mapLanguageToNewsLanguage(query.language));
      }

      // Pas de fenêtre de dates : toujours utiliser les dernières actualités

      // Toujours utiliser l'endpoint /news (latest) même avec des dates
      const endpoint = '/news';
      const response = await axios.get<NewsDataResponse>(`${this.baseUrl}${endpoint}`, {
        params: searchParams,
        headers: {
          'User-Agent': 'Casys-Bot/1.0 (Content Analysis System)',
        },
        timeout: 10000,
      });

      const { data } = response;

      // Valider le statut de la réponse
      if (data?.status !== 'success' || !Array.isArray(data?.results)) {
        this.logger.warn('NewsData response structure:', {
          status: data?.status,
          hasResults: Array.isArray(data?.results),
          dataKeys: Object.keys(data || {}),
          responseData: data,
        });
        throw new Error('Malformed NewsData response');
      }

      const articles = data.results;
      this.logger.log(`✅ NewsData: ${articles.length} candidats trouvés`);

      // Succès avec 0 résultats : message clair sans fallback (fail-fast XP)
      if (articles.length === 0) {
        this.logger.log('NewsData: Aucun résultat trouvé pour cette requête', {
          query: textQuery,
          endpoint,
          totalResults: data.totalResults ?? 0,
        });
        // Retourner un tableau vide avec succès (pas d'erreur)
        return [];
      }

      return articles.map(article =>
        this.mapToTopicCandidate(article, query.seoKeywords ?? [], query.language)
      );
    } catch (error) {
      if (axios.isAxiosError<NewsDataResponse>(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        const errorResult =
          errorData && !Array.isArray(errorData.results) ? errorData.results : undefined;

        // Détection spécifique des problèmes de clé API NewsData
        if (status === 401) {
          this.logger.warn('⚠️  [NewsData] CLÉ API INVALIDE - Vérifiez votre clé NEWSDATA_API_KEY');
        } else if (status === 403) {
          this.logger.warn(
            '⚠️  [NewsData] ACCÈS REFUSÉ - Clé API invalide ou permissions insuffisantes'
          );
        } else if (status === 429) {
          this.logger.warn(
            '⚠️  [NewsData] QUOTA ÉPUISÉ - Limite de requêtes atteinte pour cette période'
          );
        } else if (status === 422) {
          this.logger.warn(
            '⚠️  [NewsData] PARAMÈTRES INVALIDES - Vérifiez la requête (possible quota épuisé)'
          );
          // Alignement tests: rejeter explicitement en 422
          throw new Error('NewsData fetch failed: 422');
        } else if (errorResult?.code === 'ParameterInvalid') {
          this.logger.warn('⚠️  [NewsData] PARAMÈTRES INVALIDES - Requête malformée');
        } else if (errorResult?.code === 'ApiKeyInvalid') {
          this.logger.warn('⚠️  [NewsData] CLÉ API INVALIDE - Clé manquante ou incorrecte');
        } else if (errorResult?.code === 'ApiKeyMissing') {
          this.logger.warn('⚠️  [NewsData] CLÉ API MANQUANTE - Aucune clé fournie');
        } else if (errorResult?.code === 'RateLimitExceeded') {
          this.logger.warn('⚠️  [NewsData] RATE LIMIT - Trop de requêtes par minute');
        } else {
          this.logger.error(`[NewsData] Erreur HTTP ${status}: ${error.message}`);
        }

        if (error.response?.data) {
          this.logger.debug('[NewsData] Détails erreur:', errorData);
        }
      } else {
        this.logger.error('[NewsData] Erreur inattendue:', error);
      }
      return [];
    }
  }

  /**
   * Mappe un article NewsData vers TopicCandidate
   */
  private mapToTopicCandidate(
    article: NewsDataItem,
    keywords: string[],
    language?: string
  ): TopicCandidate {
    return {
      id: article.article_id ?? String(Date.now()),
      title: article.title ?? 'Sans titre',
      description: article.description ?? article.content?.substring(0, 200) ?? '',
      sourceUrl: article.link ?? '',
      sourceTitle: article.source_id ?? '',
      language: language,
      publishedAt: article.pubDate
        ? new Date(article.pubDate).toISOString()
        : new Date().toISOString(),
      author: article.creator?.[0], // NewsData retourne un array
      imageUrls: article.image_url ? [article.image_url] : [],
      relevanceScore: this.calculateRelevance(article, keywords),
      metadata: {
        publishDate: article.pubDate,
        apiSource: 'newsdata',
        content: article.content, // Contenu complet si disponible
        category: article.category,
        country: article.country,
      },
    };
  }

  /**
   * Calcule le score de pertinence d'un article
   */
  private calculateRelevance(article: NewsDataItem, keywords: string[]): number {
    const title = (article.title ?? '').toLowerCase();
    const description = (article.description ?? article.content ?? '').toLowerCase();
    const searchTerms = keywords.map(k => k.toLowerCase());

    let score = 0;

    // Score basé sur la présence des mots-clés
    searchTerms.forEach(term => {
      // Titre = poids 3, description = poids 1
      if (title.includes(term)) score += 3;
      if (description.includes(term)) score += 1;
    });

    // Bonus pour articles récents (dernières 24h)
    if (article.pubDate) {
      const pubDate = new Date(article.pubDate);
      const hoursSincePublished = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
      if (hoursSincePublished < 24) score += 1;
    }

    // Normaliser entre 0 et 1
    const maxPossibleScore = searchTerms.length * 4 + 1; // +1 pour bonus récent
    return Math.min(score / maxPossibleScore, 1);
  }
}

// Typage minimal de l'élément NewsData
interface NewsDataItem {
  article_id?: string;
  title?: string;
  description?: string;
  content?: string;
  link?: string;
  source_id?: string;
  pubDate?: string;
  creator?: string[];
  image_url?: string;
  category?: string[] | string;
  country?: string[] | string;
}

interface NewsDataErrorResult {
  code?: string;
  message?: string;
}

interface NewsDataResponse {
  status?: 'success' | 'error';
  results?: NewsDataItem[] | NewsDataErrorResult;
  message?: string;
  totalResults?: number;
}
