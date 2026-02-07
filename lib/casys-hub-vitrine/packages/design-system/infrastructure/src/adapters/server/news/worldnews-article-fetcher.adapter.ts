import axios from 'axios';
import { config } from 'dotenv';

import { mapLanguageToNewsLanguage, type TopicCandidate, type TopicFetchQuery } from '@casys/core';
import { type TopicDiscoveryPort } from '@casys/application';

import { ProviderKeywordSelector } from '../../../services/provider-keyword-selector';
import { createLogger } from '../../../utils/logger';

// Charger le .env root du projet
config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });

/**
 * Adaptateur pour World News API
 * https://worldnewsapi.com/docs/#Search-News
 */
// Typage minimal de la réponse World News API (scope module)
interface WorldNewsItem {
  id?: string;
  title?: string;
  text?: string;
  summary?: string;
  url: string;
  source?: string;
  author?: string;
  image?: string;
  publish_time?: string; // ISO date-time
}

interface WorldNewsResponse {
  news?: WorldNewsItem[];
  code?: string;
  message?: string;
}
export class WorldNewsArticleFetcherAdapter implements TopicDiscoveryPort {
  private readonly logger = createLogger('WorldNewsAPI');
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.worldnewsapi.com';
  private readonly keywordSelector = new ProviderKeywordSelector();

  constructor() {
    this.apiKey = process.env.WORLD_NEWS_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('WORLD_NEWS_API_KEY environment variable is required');
    }
  }

  async discoverCandidates(query: TopicFetchQuery): Promise<TopicCandidate[]> {
    try {
      this.logger.log(
        `🌍 World News API - Recherche: ${query.seoKeywords?.join(', ') ?? 'global'}`
      );

      // Fail-fast: mots-clés requis pour éviter 400/422 de l'API
      if (!query.seoKeywords || query.seoKeywords.length === 0) {
        throw new Error('[WorldNewsAPI] seoKeywords is required (fail-fast)');
      }

      const { query: textQuery } = this.keywordSelector.select('worldnews', query.seoKeywords);
      const searchParams = new URLSearchParams({
        'api-key': this.apiKey,
        text: textQuery,
        // Préférer le ciblage par pays de la source (évite le sur-filtrage par langue)
        'source-countries': mapLanguageToNewsLanguage(query.language ?? 'fr'),
        'sort-by': 'publish-time',
        'sort-direction': 'DESC',
        number: '20', // Récupérer 20 articles max
      });

      // Log compact de diagnostic (sans clé)
      this.logger.debug('WorldNews query details:', {
        processedQuery: textQuery,
        queryLength: textQuery.length,
        encodedLength: encodeURIComponent(textQuery).length,
        fullUrl: `${this.baseUrl}/search-news?${new URLSearchParams({
          'api-key': '[HIDDEN]',
          text: textQuery,
          'source-countries': mapLanguageToNewsLanguage(query.language ?? 'fr'),
          'sort-by': 'publish-time',
          'sort-direction': 'DESC',
          number: '20',
        }).toString()}`,
      });

      // Pas de fenêtre de dates : toujours utiliser les dernières actualités

      const response = await axios.get<WorldNewsResponse>(`${this.baseUrl}/search-news`, {
        params: searchParams,
        timeout: 15000,
        headers: {
          'User-Agent': 'CaSys World News Bot 1.0',
        },
      });

      if (response.status !== 200) {
        throw new Error(`World News API error: ${response.status}`);
      }

      const data = response.data;

      if (!data.news || !Array.isArray(data.news)) {
        this.logger.warn('⚠️ Format de réponse inattendu de World News API');
        return [];
      }

      const topics: TopicCandidate[] = data.news.map((article: WorldNewsItem) => ({
        id: `worldnews-${article.id ?? Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: article.title ?? 'Titre non disponible',
        description: article.text ?? article.summary ?? 'Description non disponible',
        sourceUrl: article.url,
        sourceTitle: article.source ?? 'Source inconnue',
        publishedAt: article.publish_time ? new Date(article.publish_time) : new Date(),
        language: query.language,
        author: article.author,
        imageUrls: article.image ? [article.image] : [],
        relevanceScore: this.calculateRelevance(article, query.seoKeywords ?? []),
        metadata: {
          publishDate: article.publish_time,
          apiSource: 'worldnews',
          content: article.text, // Contenu complet si disponible
        },
      }));

      this.logger.log(`✅ World News: ${topics.length} articles trouvés`);
      return topics;
    } catch (error) {
      if (axios.isAxiosError<WorldNewsResponse>(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        // Détection spécifique des problèmes de clé API WorldNews
        const errorMessage = typeof errorData?.message === 'string' ? errorData.message : undefined;

        if (status === 401) {
          this.logger.warn(
            '⚠️  [WorldNews] CLÉ API INVALIDE - Vérifiez votre clé WORLD_NEWS_API_KEY'
          );
        } else if (status === 403) {
          this.logger.warn(
            '⚠️  [WorldNews] ACCÈS REFUSÉ - Clé API invalide ou permissions insuffisantes'
          );
        } else if (status === 429) {
          this.logger.warn(
            '⚠️  [WorldNews] QUOTA ÉPUISÉ - Limite de requêtes atteinte pour cette période'
          );
        } else if (status === 402) {
          this.logger.warn(
            '⚠️  [WorldNews] PAIEMENT REQUIS - Plan gratuit épuisé, upgrade nécessaire'
          );
        } else if (errorMessage?.includes('API key')) {
          this.logger.warn(
            '⚠️  [WorldNews] PROBLÈME CLÉ API - Vérifiez votre clé WORLD_NEWS_API_KEY'
          );
        } else if (errorMessage?.includes('rate limit')) {
          this.logger.warn('⚠️  [WorldNews] RATE LIMIT - Trop de requêtes par minute');
        } else if (errorMessage?.includes('quota')) {
          this.logger.warn('⚠️  [WorldNews] QUOTA ÉPUISÉ - Limite journalière/mensuelle atteinte');
        } else {
          this.logger.error(`[WorldNews] Erreur HTTP ${status}: ${error.message}`);
        }

        if (typeof errorData !== 'undefined') {
          this.logger.debug('[WorldNews] Détails erreur:', errorData);
        }
      } else {
        this.logger.error('[WorldNews] Erreur inattendue:', error);
      }
      return [];
    }
  }

  private calculateRelevance(article: WorldNewsItem, keywords: string[]): number {
    const title = (article.title ?? '').toLowerCase();
    const description = (article.text ?? article.summary ?? '').toLowerCase();
    const searchTerms = keywords.map(k => k.toLowerCase());

    let score = 0;

    // Score basé sur la présence des mots-clés
    searchTerms.forEach(term => {
      // Titre = poids 3, description = poids 1
      if (title.includes(term)) score += 3;
      if (description.includes(term)) score += 1;
    });

    // Bonus pour articles récents (dernières 24h)
    if (article.publish_time) {
      const pubDate = new Date(article.publish_time);
      const hoursSincePublished = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
      if (hoursSincePublished < 24) score += 1;
    }

    // Normaliser entre 0 et 1
    const maxPossibleScore = searchTerms.length * 4 + 1; // +1 pour bonus récent
    return Math.min(score / maxPossibleScore, 1);
  }
}
