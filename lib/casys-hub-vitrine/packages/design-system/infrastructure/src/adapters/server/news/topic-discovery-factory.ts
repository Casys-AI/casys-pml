import { config } from 'dotenv';

import { type TopicCandidate, type TopicFetchQuery } from '@casys/core';
import { type AITextModelPort, type TopicDiscoveryPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';
import { createWebTopicDiscoveryAgent } from '../ai/agents/web-topic-discovery.agent';
import { NewsApiArticleFetcherAdapter } from './newsapi-article-fetcher.adapter';
import { NewsDataArticleFetcherAdapter } from './newsdata-article-fetcher.adapter';
import { RssArticleFetcherAdapter } from './rss-article-fetcher.adapter';
import { createWebTopicDiscoveryAdapter, WebTopicDiscoveryAdapter } from './web-topic-discovery.adapter';
import { WorldNewsArticleFetcherAdapter } from './worldnews-article-fetcher.adapter';

// Charger le .env root du projet
config({ path: '/home/ubuntu/CascadeProjects/casys/.env' });
export interface TopicDiscoveryConfig {
  rssSources: {
    url: string;
    name?: string;
    enabled?: boolean;
  }[];
  newsApiKey?: string;
  newsApiSources?: {
    name: string;
    params?: Record<string, unknown>;
  }[];
  // Explicit activation flags (preferred). If undefined, factory falls back to process.env
  enableWorldNews?: boolean;
  enableNewsData?: boolean;
  // Web Agent configuration
  webAgent?: {
    enabled: boolean;
    tavilyApiKey?: string;
    maxResults?: number;
    sources?: ('reddit' | 'github' | 'stackoverflow' | 'medium' | 'blogs' | 'news')[];
    minScore?: number;
  };
}

/**
 * Crée un TopicDiscoveryPort configuré avec les sources fournies
 */
export function createTopicDiscovery(
  config: TopicDiscoveryConfig,
  aiTextModel?: AITextModelPort
): TopicDiscoveryPort {
  const logger = createLogger('TopicDiscoveryFactory');
  const fetchers: TopicDiscoveryPort[] = [];

  // Initialiser l'adaptateur RSS
  // Utiliser uniquement les sources RSS configurées
  logger.debug(
    `[DEBUG] config.rssSources type: ${typeof config.rssSources}, value: ${JSON.stringify(config.rssSources)}`
  );
  const rssSources = config.rssSources || [];
  logger.debug(
    `[DEBUG] rssSources after assignment type: ${typeof rssSources}, value: ${JSON.stringify(rssSources)}`
  );

  // Ne plus ajouter de source par défaut, utiliser uniquement les sources configurées
  logger.debug(`Sources RSS configurées: ${JSON.stringify(rssSources, null, 2)}`);

  if (rssSources.length > 0) {
    const rssFetcher = new RssArticleFetcherAdapter(
      rssSources
        .filter(source => source.enabled !== false) // Filtrer les sources désactivées
        .map((source, index) => {
          // Utiliser le nom comme ID pour faciliter le filtrage par nom
          const name = source.name ?? `RSS Source ${index + 1}`;
          return {
            id: name, // Utiliser le nom comme ID
            type: 'rss' as const,
            name: name,
            url: source.url,
            enabled: true,
          };
        })
    );
    fetchers.push(rssFetcher);
  }

  // Initialiser l'adaptateur NewsAPI si une clé est fournie
  if (config.newsApiKey) {
    // Préparer les sources NewsAPI
    let newsApiSources = config.newsApiSources ?? [];

    // Si aucune source n'est configurée, ajouter une source par défaut
    if (newsApiSources.length === 0) {
      newsApiSources = [
        {
          name: 'NewsAPI',
          params: {
            language: 'en',
            sortBy: 'publishedAt',
          },
        },
      ];
    }

    const newsApiFetcher = new NewsApiArticleFetcherAdapter(
      config.newsApiKey,
      newsApiSources.map((source, index) => {
        // Utiliser le nom comme ID pour faciliter le filtrage par nom
        const name = source.name || `NewsAPI Source ${index + 1}`;
        return {
          id: name, // Utiliser le nom comme ID
          type: 'newsapi' as const,
          name: name,
          enabled: true,
          params: source.params ?? {
            language: 'en',
            sortBy: 'publishedAt',
          },
        };
      })
    );
    fetchers.push(newsApiFetcher);
  }

  // (Bing supprimé)

  // Ajouter World News et NewsData APIs si explicitement activées (ou via ENV en fallback)
  try {
    const useWorldNews =
      typeof config.enableWorldNews === 'boolean'
        ? config.enableWorldNews
        : Boolean(process.env.WORLD_NEWS_API_KEY);
    if (useWorldNews) {
      const worldNewsAdapter = new WorldNewsArticleFetcherAdapter();
      fetchers.push(worldNewsAdapter);
      logger.log('✅ World News API intégré');
    }

    const useNewsData =
      typeof config.enableNewsData === 'boolean'
        ? config.enableNewsData
        : Boolean(process.env.NEWSDATA_API_KEY);
    if (useNewsData) {
      const newsDataAdapter = new NewsDataArticleFetcherAdapter();
      fetchers.push(newsDataAdapter);
      logger.log('✅ NewsData API intégré');
    }
  } catch (error) {
    logger.warn('⚠️ Erreur initialisation APIs externes:', error);
  }

  // Ajouter Web Agent si configuré et aiTextModel disponible
  if (config.webAgent?.enabled && aiTextModel) {
    try {
      const webAgent = createWebTopicDiscoveryAgent(aiTextModel, {
        tavilyApiKey: config.webAgent.tavilyApiKey,
        maxResults: config.webAgent.maxResults,
        minScore: config.webAgent.minScore
      });
      const webAdapter = createWebTopicDiscoveryAdapter(webAgent);
      fetchers.push(webAdapter);
      logger.log('✅ Web Topic Discovery Agent intégré');
    } catch (error) {
      logger.warn('⚠️ Erreur initialisation Web Agent:', error);
    }
  } else if (config.webAgent?.enabled && !aiTextModel) {
    logger.warn('⚠️ Web Agent configuré mais aiTextModel manquant - agent non initialisé');
  }

  // Créer un composite des adaptateurs disponibles
  return {
    discoverCandidates: async (query: TopicFetchQuery) => {
      const { allowedSources } = query;
      const activeFetchers: TopicDiscoveryPort[] = [];

      // Identifier les fetchers par type pour un accès facile
      const rssFetcher = fetchers.find(f => f instanceof RssArticleFetcherAdapter);
      const newsApiFetcher = fetchers.find(f => f instanceof NewsApiArticleFetcherAdapter);
      const worldNewsFetcher = fetchers.find(f => f instanceof WorldNewsArticleFetcherAdapter);
      const newsDataFetcher = fetchers.find(f => f instanceof NewsDataArticleFetcherAdapter);
      const webAgentFetcher = fetchers.find(f => f instanceof WebTopicDiscoveryAdapter);

      // Si aucune source n'est spécifiée, utiliser tous les fetchers
      if (
        !allowedSources ||
        ((!allowedSources.rss || allowedSources.rss.length === 0) &&
          (!allowedSources.newsApi || allowedSources.newsApi.length === 0) &&
          (!allowedSources.worldNews || allowedSources.worldNews.length === 0) &&
          (!allowedSources.newsData || allowedSources.newsData.length === 0) &&
          (!allowedSources.webAgent || allowedSources.webAgent.length === 0))
      ) {
        activeFetchers.push(...fetchers);
      } else {
        // Sinon, filtrer les fetchers selon les sources demandées
        if (allowedSources.rss && allowedSources.rss.length > 0 && rssFetcher) {
          activeFetchers.push(rssFetcher);
        }

        if (allowedSources.newsApi && allowedSources.newsApi.length > 0 && newsApiFetcher) {
          activeFetchers.push(newsApiFetcher);
        }

        // (Bing supprimé)

        if (allowedSources.worldNews && allowedSources.worldNews.length > 0 && worldNewsFetcher) {
          activeFetchers.push(worldNewsFetcher);
        }

        if (allowedSources.newsData && allowedSources.newsData.length > 0 && newsDataFetcher) {
          activeFetchers.push(newsDataFetcher);
        }

        if (allowedSources.webAgent && allowedSources.webAgent.length > 0 && webAgentFetcher) {
          activeFetchers.push(webAgentFetcher);
        }
      }

      if (activeFetchers.length === 0) {
        return [];
      }

      const results = await Promise.all(
        activeFetchers.map(fetcher =>
          fetcher.discoverCandidates(query).catch(error => {
            logger.error(
              `Error in fetcher: ${error instanceof Error ? error.message : String(error)}`
            );
            return [];
          })
        )
      );

      // Fusionner et dédupliquer les résultats
      const merged: TopicCandidate[] = results.flat();
      const uniqueUrls = new Set<string>();

      return merged.filter((candidate: TopicCandidate) => {
        if (uniqueUrls.has(candidate.sourceUrl)) {
          return false;
        }
        uniqueUrls.add(candidate.sourceUrl);
        return true;
      });
    },
  };
}
