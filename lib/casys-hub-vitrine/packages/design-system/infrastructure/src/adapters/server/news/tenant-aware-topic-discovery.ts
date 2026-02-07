import type { TopicFetchQuery } from '@casys/core';
import type { TopicDiscoveryPort, UserProjectConfigPort, AITextModelPort } from '@casys/application';

import { createTopicDiscovery, type TopicDiscoveryConfig } from './topic-discovery-factory';

/**
 * Resolver tenant-aware pour TopicDiscovery.
 * - Réutilise la factory existante (createTopicDiscovery)
 * - Construit dynamiquement la config depuis UserProjectConfigPort par (tenantId, projectId)
 * - Cache léger par couple (tenant, project) pour éviter les reconstructions systématiques
 * - Fail-fast si tenantId/projectId manquants
 */
export function createTenantAwareTopicDiscovery(
  configReader: UserProjectConfigPort,
  aiTextModel?: AITextModelPort
): TopicDiscoveryPort {
  if (!configReader) throw new Error('[TenantAwareTopicDiscovery] configReader requis');

  const cache = new Map<string, TopicDiscoveryPort>();

  const cacheKey = (tenantId: string, projectId: string) => `${tenantId}::${projectId}`;

  const resolveConfig = async (
    tenantId: string,
    projectId: string
  ): Promise<TopicDiscoveryConfig> => {
    const project = await configReader.getProjectConfig(tenantId, projectId);

    const rssSources = (project.sources?.rss ?? []).map(r => ({
      url: r.url,
      name: r.tags?.[0] ?? undefined,
      enabled: r.priority !== 0, // si priority=0 on peut considérer désactivé; sinon true par défaut
    }));

    // Activer les sources API si les clés sont présentes dans l'environnement
    const newsApiKey = process.env.NEWS_API_KEY;
    const enableWorldNews = Boolean(process.env.WORLD_NEWS_API_KEY);
    const enableNewsData = Boolean(process.env.NEWSDATA_API_KEY);

    // Configuration Web Agent - activé automatiquement si TAVILY_API_KEY présent
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    const webAgentConfig = project.sources?.webAgent;
    
    const cfg: TopicDiscoveryConfig = {
      rssSources,
      ...(newsApiKey ? { newsApiKey } : {}),
      enableWorldNews,
      enableNewsData,
      // Activer webAgent si clé Tavily disponible (pattern identique aux autres APIs)
      ...(tavilyApiKey ? {
        webAgent: {
          enabled: true,
          tavilyApiKey,
          maxResults: webAgentConfig?.maxResults ?? 3,  // Top 3 résultats par query (comme première page Google)
          sources: webAgentConfig?.sources ?? ['reddit', 'github', 'stackoverflow', 'medium', 'blogs'],
          minScore: webAgentConfig?.minScore ?? 0.6
        }
      } : {})
    } as TopicDiscoveryConfig;

    return cfg;
  };

  return {
    discoverCandidates: async (query: TopicFetchQuery) => {
      const { tenantId, projectId } = query as TopicFetchQuery & {
        tenantId?: string;
        projectId?: string;
      };
      if (!tenantId || !projectId) {
        throw new Error(
          '[TenantAwareTopicDiscovery] tenantId et projectId sont requis dans TopicFetchQuery'
        );
      }

      const key = cacheKey(tenantId, projectId);
      let discovery = cache.get(key);
      if (!discovery) {
        const cfg = await resolveConfig(tenantId, projectId);
        const created = createTopicDiscovery(cfg, aiTextModel);
        cache.set(key, created);
        discovery = created;
      }

      if (!discovery) {
        // Défensif: ne devrait jamais arriver, mais fail-fast explicite
        throw new Error('[TenantAwareTopicDiscovery] Discovery indisponible après initialisation');
      }
      return discovery.discoverCandidates(query);
    },
  };
}
