// MarkdownArticleRepository is deprecated - use MdxArticleStructureRepository instead

import {
  type AITextModelPort,
  type EditorialBriefStorePort,
  type EmbeddingPort,
  type FrontmatterGeneratorPort,
  type FrontmatterService as AppFrontmatterService,
  type FrontmatterTarget,
  type ImageFetcherPort,
  type PageScraperPort,
  type PromptTemplatePort,
  type SitemapParserPort,
  type UserProjectConfigPort,
} from '@casys/application';

// Type imports pour le registry (dynamic imports runtime)
import type { MdxParserService } from './adapters/server/parsers/mdx-parser.adapter';
import type { Neo4jConnection } from './adapters/server/persistence/graph/neo4j/neo4j-connection';

// Placeholder types for future DB adapters (ex-Kuzu), to keep the container extensible
type KuzuConnection = unknown;
type KuzuComponentUsageStoreAdapter = unknown;

/**
 * Services Infrastructure - approche Hono-native
 * Adapters concrets (RSS, NewsAPI, OpenAI, etc.)
 */
export interface InfrastructureServices {
  // Configuration
  openaiApiKey?: string;
  newsApiKey?: string;
  // Base directory du repo (CASYS_PROJECT_ROOT)
  configBaseDir?: string;
  // Configuration des sources d'articles
  rssSources?: {
    url: string;
    name?: string;
    enabled?: boolean;
  }[];
  newsApiSources?: {
    name: string;
    params?: Record<string, unknown>;
  }[];
  // Configuration des repositories
  articlesOutputDir?: string;
  topicsDataDir?: string;
  // Configuration Kuzu
  kuzuDbPath?: string;
}

/**
 * Factory pour créer les services Infrastructure
 */
export async function createInfrastructureServices(
  config: InfrastructureServices,
  logger?: {
    log: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    debug?: (msg: string, ...args: unknown[]) => void;
  }
) {
  const services: Record<string, unknown> = {};

  logger?.log('Début de la création des services infrastructure...');

  // Config reader (fail-fast si base non fournie)
  if (!config.configBaseDir) {
    throw new Error(
      'CASYS_PROJECT_ROOT non défini. Fournir config.configBaseDir à createInfrastructureServices.'
    );
  }
  // Fail-fast: toutes les fonctionnalités IA nécessitent OPENAI_API_KEY
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY manquant. Les services IA (aiTextModel, imageGenerator, agents, content extraction) sont requis et ne peuvent pas fonctionner sans clé.'
    );
  }

  // Point d'extension DB futur: aujourd'hui, on désactive complètement l'ancien backend.
  const _isKuzuActive = (_cfg: InfrastructureServices) => false;
  // Backend actif: Neo4j par défaut
  const graphBackend = 'neo4j';

  // ESM-friendly installers registry to reduce churn (single add-point)
  interface LoggerLike {
    log: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    debug?: (msg: string, ...args: unknown[]) => void;
  }
  interface Installer {
    id: string;
    enabled: (cfg: InfrastructureServices) => boolean;
    dependencies?: string[]; // ← Déclaration explicite des dépendances
    install: (
      cfg: InfrastructureServices,
      svcs: Record<string, unknown>,
      log?: LoggerLike
    ) => Promise<void> | void;
  }

  // Narrowed runtime services surface used by Neo4j installers to avoid 'any'
  interface InfraRuntimeServices extends Record<string, unknown> {
    // Core config
    configReader?: UserProjectConfigPort;
    promptTemplate?: PromptTemplatePort;
    // Neo4j
    neo4jConnection?: Neo4jConnection;
    embeddingService?: EmbeddingPort;
    // Stores/Repos
    tenantProjectStore?: unknown;
    seoBriefStore?: import('@casys/application').SeoBriefStorePort;
    topicClusterStore?: import('@casys/application').TopicClusterStorePort;
    editorialBriefStore?: EditorialBriefStorePort;
    briefStore?: EditorialBriefStorePort;
    keywordPlanRepo?: import('@casys/application').KeywordPlanRepositoryPort;
    topicRepository?: import('@casys/application').TopicRepositoryPort;
    topicRelations?: import('@casys/application').TopicRelationsPort;
    tagRepository?: import('@casys/application').TagRepositoryPort;
    articleStructureStore?: import('@casys/application').ArticleStructureStorePort;
    articleStructureSearch?: import('@casys/application').ArticleStructureSearchPort;
    sectionContext?: import('@casys/application').SectionContextPort;
    sectionHierarchyAdapter?: import('./adapters/server/persistence/graph/neo4j/neo4j-section-hierarchy.adapter').Neo4jSectionHierarchyAdapter;
    componentVectorStore?: import('@casys/application').ComponentVectorStorePort;
    componentSearch?: import('@casys/application').ComponentSearchPort;
    componentUsageStore?: import('@casys/application').ComponentUsageStorePort;
  }

  const installers: readonly Installer[] = [
    {
      id: 'configReader',
      enabled: cfg => !!cfg.configBaseDir,
      dependencies: [], // Service racine
      install: async (cfg, svcs, log) => {
        const { FsYamlUserProjectConfigAdapter } = await import(
          './config/fs-yaml-user-project-config.adapter'
        );
        if (!cfg.configBaseDir) throw new Error('configBaseDir manquant');
        const baseDir = cfg.configBaseDir;
        svcs.configReader = new FsYamlUserProjectConfigAdapter(baseDir);
        log?.debug?.('✅ FsYamlUserProjectConfigAdapter créé via registry');
      },
    },
    // Neo4j backend (activé via GRAPH_BACKEND=neo4j)
    {
      id: 'neo4jConnection',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: [], // Service racine - pas de dépendances
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        const uri = process.env.NEO4J_URI;
        const user = process.env.NEO4J_USER;
        const password = process.env.NEO4J_PASSWORD;
        const database = process.env.NEO4J_DB ?? 'neo4j';
        if (!uri || !user || !password) {
          throw new Error();
        }
        const { Neo4jConnection } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-connection'
        );
        const { Neo4jSchema } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-schema'
        );
        const conn = Neo4jConnection.getInstance({ uri, user, password, database });
        await conn.initialize();
        const schema = new Neo4jSchema(conn);
        await schema.initializeSchema();
        svc.neo4jConnection = conn;
        log?.debug?.('✅ Neo4jConnection initialisée + schéma assuré');
      },
    },
    {
      id: 'neo4jTenantProjectStore',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.tenantProjectStore) return;
        const { Neo4jTenantProjectStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-tenant-project-store.adapter'
        );
        const adapter = new Neo4jTenantProjectStoreAdapter(svc.neo4jConnection!);
        svc.tenantProjectStore = adapter;
        log?.debug?.('✅ Neo4jTenantProjectStoreAdapter (registry)');
      },
    },
    {
      id: 'neo4jSeoBriefStore',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        const { resolveLogConfig } = await import('./config/logging.config');
        const { createLogAdapter } = await import('./adapters/server/logging/log.adapter');
        const { Neo4jSeoBriefStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-seo-brief-store.adapter'
        );
        const logger = createLogAdapter(resolveLogConfig(), 'SeoBriefStore');
        svc.seoBriefStore = new Neo4jSeoBriefStoreAdapter(svc.neo4jConnection!, logger);
        log?.debug?.('✅ Neo4jSeoBriefStoreAdapter (registry)');
      },
    },
    {
      id: 'neo4jTopicClusterStore',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        const { resolveLogConfig } = await import('./config/logging.config');
        const { createLogAdapter } = await import('./adapters/server/logging/log.adapter');
        const { Neo4jTopicClusterStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-topic-cluster-store.adapter'
        );
        const logger = createLogAdapter(resolveLogConfig(), 'TopicClusterStore');
        svc.topicClusterStore = new Neo4jTopicClusterStoreAdapter(svc.neo4jConnection!, logger);
        log?.debug?.('✅ Neo4jTopicClusterStoreAdapter (registry)');
      },
    },
    {
      id: 'neo4jEmbeddingService',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: [], // Service racine - OpenAI direct
      install: async (cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.embeddingService) return;
        const { OpenAIEmbeddingAdapter } = await import(
          './adapters/server/ai/openai-embedding.adapter'
        );
        svc.embeddingService = new OpenAIEmbeddingAdapter(cfg.openaiApiKey);
        log?.debug?.('✅ Neo4j Embedding service (OpenAI)');
      },
    },
    {
      id: 'neo4jEditorialBriefStore',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        const { Neo4jEditorialBriefStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-editorial-brief-store.adapter'
        );
        const editorialBriefStore = new Neo4jEditorialBriefStoreAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        svc.editorialBriefStore = editorialBriefStore;
        // Application boot expects infra.briefStore (see app.singleton.ts)
        svc.briefStore = editorialBriefStore;
        log?.debug?.('✅ Neo4jEditorialBriefStoreAdapter with embeddings (registry)');
      },
    },
    {
      id: 'neo4jKeywordPlanRepo',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.keywordPlanRepo) return;
        const { Neo4jKeywordPlanRepositoryAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-keyword-plan-repository.adapter'
        );
        svc.keywordPlanRepo = new Neo4jKeywordPlanRepositoryAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        log?.debug?.('✅ Neo4jKeywordPlanRepositoryAdapter (registry)');
      },
    },
    {
      id: 'neo4jTopicRepository',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.topicRepository) return;
        const { Neo4jTopicRepositoryAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-topic-repository.adapter'
        );
        svc.topicRepository = new Neo4jTopicRepositoryAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        log?.debug?.('✅ Neo4jTopicRepositoryAdapter (registry)');
      },
    },
    {
      id: 'neo4jTopicRelations',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.topicRelations) return;
        const { Neo4jTopicRelationsAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-topic-relations.adapter'
        );
        svc.topicRelations = new Neo4jTopicRelationsAdapter(svc.neo4jConnection!);
        log?.debug?.('✅ Neo4jTopicRelationsAdapter (registry)');
      },
    },
    {
      id: 'neo4jTagRepository',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.tagRepository) return;
        const { Neo4jTagRepositoryAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-tag-repository.adapter'
        );
        svc.tagRepository = new Neo4jTagRepositoryAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        log?.debug?.('✅ Neo4jTagRepositoryAdapter (registry)');
      },
    },
    {
      id: 'neo4jRssFeedRepository',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if ((svc as any).rssFeedRepository) return;
        const { Neo4jRssFeedRepository } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-rss-feed.repository'
        );
        (svc as any).rssFeedRepository = new Neo4jRssFeedRepository(
          svc.neo4jConnection!
        );
        log?.debug?.('✅ Neo4jRssFeedRepository (unified repository)');
      },
    },
    {
      id: 'neo4jArticleStructureAdapters',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.articleStructureStore) return;
        const { Neo4jArticleStructureAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-article-structure.adapter'
        );
        const { Neo4jArticleStructureSearchAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-article-structure-search.adapter'
        );
        const { Neo4jSectionHierarchyAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-section-hierarchy.adapter'
        );
        const { Neo4jTextFragmentAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-text-fragment.adapter'
        );
        const { Neo4jCommentAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-comment.adapter'
        );

        // Créer les adapters dédiés d'abord
        svc.sectionHierarchyAdapter = new Neo4jSectionHierarchyAdapter(svc.neo4jConnection!);
        const textFragmentAdapter = new Neo4jTextFragmentAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        const commentAdapter = new Neo4jCommentAdapter(svc.neo4jConnection!, svc.embeddingService);

        // Puis les passer à articleStructureStore
        svc.articleStructureStore = new Neo4jArticleStructureAdapter(
          svc.neo4jConnection!,
          svc.embeddingService,
          svc.sectionHierarchyAdapter,
          textFragmentAdapter,
          commentAdapter
        );
        svc.articleStructureSearch = new Neo4jArticleStructureSearchAdapter(
          svc.neo4jConnection!,
          svc.embeddingService
        );
        log?.debug?.(
          '✅ Neo4jArticleStructureAdapter & SearchAdapter & SectionHierarchy (registry)'
        );
      },
    },
    {
      id: 'neo4jSectionContext',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.sectionContext) return;
        const { Neo4jSectionContextAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-section-context.adapter'
        );
        svc.sectionContext = new Neo4jSectionContextAdapter(svc.neo4jConnection!);
        log?.debug?.('✅ Neo4jSectionContextAdapter (context)');
      },
    },
    {
      id: 'neo4jComponentStores',
      enabled: _cfg => graphBackend === 'neo4j',
      dependencies: ['neo4jConnection', 'neo4jEmbeddingService'],
      install: async (_cfg, svcs, log) => {
        const svc = svcs as InfraRuntimeServices;
        if (svc.componentVectorStore) return;
        const { Neo4jComponentStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-component-store.adapter'
        );
        const { Neo4jComponentSearchAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-component-search.adapter'
        );
        const { Neo4jComponentUsageStoreAdapter } = await import(
          './adapters/server/persistence/graph/neo4j/neo4j-component-usage-store.adapter'
        );
        const componentStore = new Neo4jComponentStoreAdapter(svc.neo4jConnection!);
        svc.componentVectorStore = componentStore;
        svc.componentUsageStore = new Neo4jComponentUsageStoreAdapter(svc.neo4jConnection!);
        // componentListing = componentStore (implémente ComponentListingReadPort pour ListComponentsUseCase)
        svc.componentListing = componentStore;
        // componentSearch pour recherche sémantique (nécessite embeddingService)
        if (svc.embeddingService) {
          svc.componentSearch = new Neo4jComponentSearchAdapter(
            svc.neo4jConnection!,
            svc.embeddingService
          );
        }
        log?.debug?.('✅ Neo4jComponentStores (VectorStore + UsageStore + Listing + Search)');
      },
    },
    // KuzuTenantProjectStore (supprimé)
    {
      id: 'leadAnalysisStore',
      enabled: cfg => !!cfg.configBaseDir,
      dependencies: [],
      install: async (cfg, svcs, log) => {
        const { FsLeadAnalysisStoreAdapter } = await import(
          './adapters/server/leads/fs-lead-analysis.store.adapter'
        );
        if (!cfg.configBaseDir) throw new Error('configBaseDir manquant');
        const baseDir = cfg.configBaseDir;
        svcs.leadAnalysisStore = new FsLeadAnalysisStoreAdapter(baseDir);
        log?.debug?.('✅ FsLeadAnalysisStoreAdapter (leadAnalysisStore) créé via registry');
      },
    },
    {
      id: 'frontmatterService',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { AstroFrontmatterAdapter } = await import(
          './adapters/server/frontmatter/astro-frontmatter.adapter'
        );
        const { HugoFrontmatterAdapter } = await import(
          './adapters/server/frontmatter/hugo-frontmatter.adapter'
        );
        const { FrontmatterService } = await import('@casys/application');
        const astroGen = new AstroFrontmatterAdapter();
        const hugoGen = new HugoFrontmatterAdapter();
        const genMap = new Map<FrontmatterTarget, FrontmatterGeneratorPort>([
          ['astro', astroGen],
          ['hugo', hugoGen],
        ]);
        svcs.frontmatterService = new FrontmatterService(genMap);
        log?.debug?.('✅ FrontmatterService initialisé (registry)');
      },
    },
    {
      id: 'promptTemplate',
      enabled: cfg => !!cfg.configBaseDir,
      dependencies: [], // Service racine
      install: async (cfg, svcs, log) => {
        const { FsPromptTemplateAdapter } = await import('./config/fs-prompt-template.adapter');
        const { default: nodePath } = await import('node:path');
        if (!cfg.configBaseDir) throw new Error('configBaseDir manquant');
        const base = nodePath.resolve(cfg.configBaseDir, 'config/blueprints');
        svcs.promptTemplate = new FsPromptTemplateAdapter(base);
        log?.debug?.('✅ FsPromptTemplateAdapter (registry)');
      },
    },
    {
      id: 'aiTextModel',
      enabled: cfg => !!cfg.openaiApiKey,
      dependencies: [], // Service racine
      install: async (cfg, svcs, log) => {
        if (svcs.aiTextModel) return;
        const { OpenAIAdapter } = await import('./adapters/server/ai/openai.adapter');
        svcs.aiTextModel = new OpenAIAdapter(cfg.openaiApiKey);
        log?.debug?.('✅ OpenAIAdapter (aiTextModel) créé via registry');
      },
    },
    {
      id: 'imageGenerator',
      enabled: cfg => !!cfg.openaiApiKey,
      dependencies: [],
      install: async (cfg, svcs, log) => {
        const { GenericImageAdapter } = await import('./adapters/server/ai/generic-image.adapter');
        svcs.imageGenerator = new GenericImageAdapter(cfg.openaiApiKey);
        log?.debug?.('✅ GenericImageAdapter (registry)');
      },
    },
    {
      id: 'imageFetcher',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { HttpImageFetcherAdapter } = await import(
          './adapters/server/images/http-image-fetcher.adapter'
        );
        svcs.imageFetcher = new HttpImageFetcherAdapter();
        log?.debug?.('✅ HttpImageFetcherAdapter (registry)');
      },
    },
    {
      id: 'imageUploaderFs',
      enabled: _cfg => true,
      dependencies: ['configReader'],
      install: async (_cfg, svcs, log) => {
        const { FsImageUploaderAdapter } = await import(
          './adapters/server/images/fs-image-uploader.adapter'
        );
        svcs.imageUploaderFs = new FsImageUploaderAdapter(
          svcs.configReader as UserProjectConfigPort
        );
        log?.debug?.('✅ FsImageUploaderAdapter (registry)');
      },
    },
    {
      id: 'imageUploaderGithub',
      enabled: _cfg => true,
      dependencies: ['configReader'],
      install: async (_cfg, svcs, log) => {
        const { GithubImageUploaderAdapter } = await import(
          './adapters/server/images/github-image-uploader.adapter'
        );
        svcs.imageUploaderGithub = new GithubImageUploaderAdapter(
          svcs.configReader as UserProjectConfigPort
        );
        log?.debug?.('✅ GithubImageUploaderAdapter (registry)');
      },
    },
    {
      id: 'articlePublisherFs',
      enabled: _cfg => true,
      dependencies: ['configReader', 'frontmatterService', 'imageFetcher'],
      install: async (_cfg, svcs, log) => {
        const { FsArticlePublisherAdapter } = await import(
          './adapters/server/publishers/fs-article-publisher.adapter'
        );
        svcs.articlePublisher = new FsArticlePublisherAdapter(
          svcs.configReader as UserProjectConfigPort,
          svcs.frontmatterService as AppFrontmatterService,
          svcs.imageFetcher as ImageFetcherPort
        );
        log?.debug?.('✅ FsArticlePublisherAdapter (registry)');
      },
    },
    {
      id: 'articlePublisherGithub',
      enabled: _cfg => true,
      dependencies: ['configReader', 'frontmatterService', 'imageFetcher'],
      install: async (_cfg, svcs, log) => {
        const { GithubArticlePublisherAdapter } = await import(
          './adapters/server/publishers/github-article-publisher.adapter'
        );
        svcs.articlePublisherGithub = new GithubArticlePublisherAdapter(
          svcs.configReader as UserProjectConfigPort,
          svcs.frontmatterService as AppFrontmatterService,
          svcs.imageFetcher as ImageFetcherPort
        );
        log?.debug?.('✅ GithubArticlePublisherAdapter (registry)');
      },
    },
    {
      id: 'googleScraping',
      enabled: _cfg => {
        const e = process.env;
        const hasKey = (e.DATAFORSEO_API_KEY ?? '').trim().length > 0;
        const hasBasic =
          (e.DATAFORSEO_LOGIN ?? '').trim().length > 0 &&
          (e.DATAFORSEO_PASSWORD ?? '').trim().length > 0;
        return hasKey || hasBasic;
      },
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { DataForSeoSerpAdapter } = await import(
          './adapters/server/seo/dataforseo-serp.adapter'
        );
        svcs.googleScraping = new DataForSeoSerpAdapter(process.env);
        log?.debug?.('✅ GoogleScraping (DataForSEO SERP) installé');
      },
    },
    {
      id: 'googleTrends',
      enabled: _cfg => {
        const e = process.env;
        const hasKey = (e.DATAFORSEO_API_KEY ?? '').trim().length > 0;
        const hasBasic =
          (e.DATAFORSEO_LOGIN ?? '').trim().length > 0 &&
          (e.DATAFORSEO_PASSWORD ?? '').trim().length > 0;
        return hasKey || hasBasic;
      },
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { DataForSeoTrendsAdapter } = await import(
          './adapters/server/seo/dataforseo-trends.adapter'
        );
        svcs.googleTrends = new DataForSeoTrendsAdapter(process.env);
        log?.debug?.('✅ GoogleTrends (DataForSEO Trends) installé');
      },
    },
    {
      id: 'keywordEnrichment',
      enabled: _cfg => {
        const e = process.env;
        const hasKey = (e.DATAFORSEO_API_KEY ?? '').trim().length > 0;
        const hasBasic =
          (e.DATAFORSEO_LOGIN ?? '').trim().length > 0 &&
          (e.DATAFORSEO_PASSWORD ?? '').trim().length > 0;
        return hasKey || hasBasic;
      },
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { DataForSeoKeywordsAdapter } = await import(
          './adapters/server/seo/dataforseo-keywords.adapter'
        );
        svcs.keywordEnrichment = new DataForSeoKeywordsAdapter(process.env);
        log?.debug?.('✅ KeywordEnrichment (DataForSEO Keywords) installé');
      },
    },
    {
      id: 'domainAnalysis',
      enabled: _cfg => {
        const e = process.env;
        const hasKey = (e.DATAFORSEO_API_KEY ?? '').trim().length > 0;
        const hasBasic =
          (e.DATAFORSEO_LOGIN ?? '').trim().length > 0 &&
          (e.DATAFORSEO_PASSWORD ?? '').trim().length > 0;
        return hasKey || hasBasic;
      },
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { DataForSeoDomainAdapter } = await import(
          './adapters/server/seo/dataforseo-domain.adapter'
        );
        svcs.domainAnalysis = new DataForSeoDomainAdapter(process.env);
        log?.debug?.('✅ DomainAnalysis (DataForSEO Domain) installé');
      },
    },
    {
      id: 'siteKeywords',
      enabled: _cfg => {
        const e = process.env;
        const hasKey = (e.DATAFORSEO_API_KEY ?? '').trim().length > 0;
        const hasBasic =
          (e.DATAFORSEO_LOGIN ?? '').trim().length > 0 &&
          (e.DATAFORSEO_PASSWORD ?? '').trim().length > 0;
        return hasKey || hasBasic;
      },
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { DataForSeoSiteKeywordsAdapter } = await import(
          './adapters/server/seo/dataforseo-site-keywords.adapter'
        );
        svcs.siteKeywords = new DataForSeoSiteKeywordsAdapter(process.env);
        log?.debug?.('✅ SiteKeywords (DataForSEO Labs) installé');
      },
    },
    {
      id: 'mdxParser',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { MdxParserService } = await import('./adapters/server/parsers/mdx-parser.adapter');
        if (!svcs.mdxParser) {
          svcs.mdxParser = new MdxParserService();
          log?.debug?.('✅ MdxParserService (registry)');
        }
      },
    },
    {
      id: 'articleStructureRepositoryMdx',
      enabled: _cfg => true,
      dependencies: ['mdxParser'],
      install: async (cfg, svcs, log) => {
        const { MdxArticleStructureRepository } = await import(
          './adapters/server/persistence/repositories/mdx-article-structure.repository'
        );
        const parser = svcs.mdxParser as MdxParserService | undefined;
        if (!svcs.articleStructureRepository && parser) {
          const articlesDir = cfg.articlesOutputDir ?? './public/generated';
          svcs.articleStructureRepository = new MdxArticleStructureRepository(articlesDir, parser);
          log?.debug?.('✅ MdxArticleStructureRepository (registry)');
        }
      },
    },
    {
      id: 'githubArticleRepository',
      enabled: _cfg => true,
      dependencies: ['configReader', 'mdxParser'],
      install: async (_cfg, svcs, log) => {
        const { GithubArticleStructureRepository } = await import(
          './adapters/server/persistence/repositories/github-article-structure.repository'
        );
        if (!svcs.githubArticleRepository && svcs.configReader && svcs.mdxParser) {
          svcs.githubArticleRepository = new GithubArticleStructureRepository(
            svcs.configReader as unknown as UserProjectConfigPort,
            svcs.mdxParser as MdxParserService
          );
          log?.debug?.('✅ GithubArticleStructureRepository (registry)');
        }
      },
    },
    {
      id: 'projectSeoSettings',
      enabled: _cfg => true,
      dependencies: ['configReader'],
      install: async (_cfg, svcs, log) => {
        const { ProjectSeoSettingsAdapter } = await import('./config/project-seo-settings.adapter');
        if (!svcs.projectSeoSettings && svcs.configReader) {
          svcs.projectSeoSettings = new ProjectSeoSettingsAdapter(
            svcs.configReader as unknown as UserProjectConfigPort
          );
          log?.debug?.('✅ ProjectSeoSettingsAdapter (registry)');
        }
      },
    },
    {
      id: 'contentExtraction',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (!svcs.aiTextModel || svcs.articleFetcher) return;
        const { createContentExtractionService } = await import(
          './adapters/server/content/services/content-extraction.factory'
        );
        const { ContentExtractionAdapter } = await import(
          './adapters/server/content/content-extraction.adapter'
        );
        const contentService = createContentExtractionService(svcs.aiTextModel as AITextModelPort, {
          jinaApiKey: process.env.JINA_API_KEY,
          firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
          enabledStrategies: ['rss-content', 'jina-reader', 'direct-scraping'],
        });
        svcs.articleFetcher = new ContentExtractionAdapter(contentService);
        log?.debug?.('✅ ContentExtractionAdapter (registry)');
      },
    },
    {
      id: 'pageScraper',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        if (svcs.pageScraper) return;
        const { PageScraperAdapter } = await import(
          './adapters/server/content/page-scraper.adapter'
        );
        svcs.pageScraper = new PageScraperAdapter(process.env.JINA_API_KEY);
        log?.debug?.('✅ PageScraperAdapter initialisé (registry)');
      },
    },
    {
      id: 'sitemapParser',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        if (svcs.sitemapParser) return;
        const { SitemapParserAdapter } = await import(
          './adapters/server/content/sitemap-parser.adapter'
        );
        svcs.sitemapParser = new SitemapParserAdapter();
        log?.debug?.('✅ SitemapParserAdapter initialisé (registry)');
      },
    },
    {
      id: 'pageDiscovery',
      enabled: _cfg => true,
      dependencies: ['sitemapParser', 'pageScraper'],
      install: async (_cfg, svcs, log) => {
        if (svcs.pageDiscovery || !svcs.sitemapParser || !svcs.pageScraper) return;
        const { PageDiscoveryAdapter } = await import(
          './adapters/server/content/page-discovery.adapter'
        );
        svcs.pageDiscovery = new PageDiscoveryAdapter(
          svcs.sitemapParser as SitemapParserPort,
          svcs.pageScraper as PageScraperPort
        );
        log?.debug?.('✅ PageDiscoveryAdapter initialisé (registry)');
      },
    },
    {
      id: 'topicDiscovery',
      enabled: _cfg => true,
      dependencies: ['configReader', 'aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (!svcs.configReader || !svcs.aiTextModel || svcs.topicDiscovery) return;
        const { createTenantAwareTopicDiscovery } = await import(
          './adapters/server/news/tenant-aware-topic-discovery'
        );
        svcs.topicDiscovery = createTenantAwareTopicDiscovery(
          svcs.configReader as unknown as UserProjectConfigPort,
          svcs.aiTextModel as AITextModelPort
        );
        log?.debug?.('✅ TopicDiscovery tenant-aware (registry)');
      },
    },
    {
      id: 'componentCatalog',
      enabled: _cfg => true,
      dependencies: [],
      install: async (_cfg, svcs, log) => {
        const { FileComponentCatalogAdapter } = await import('./config/component-catalog.adapter');
        if (!svcs.componentCatalog) {
          svcs.componentCatalog = new FileComponentCatalogAdapter();
          log?.debug?.('✅ FileComponentCatalogAdapter (registry)');
        }
      },
    },
    {
      id: 'componentGeneratorAgent',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.componentGeneratorAgent || !svcs.aiTextModel) return;
        const { ComponentGeneratorAgent } = await import(
          './adapters/server/ai/agents/component-generator.agent'
        );
        svcs.componentGeneratorAgent = new ComponentGeneratorAgent(
          svcs.aiTextModel as AITextModelPort
        );
        log?.debug?.('✅ ComponentGeneratorAgent (registry)');
      },
    },
    {
      id: 'businessContextAgent',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.businessContextAgent || !svcs.aiTextModel) return;
        const { BusinessContextAnalysisAgent } = await import(
          './adapters/server/ai/agents/business-context-analysis.agent'
        );
        svcs.businessContextAgent = new BusinessContextAnalysisAgent(
          svcs.aiTextModel as AITextModelPort
        );
        log?.debug?.('✅ BusinessContextAnalysisAgent (registry)');
      },
    },
    {
      id: 'keywordDiscovery',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.keywordDiscovery || !svcs.aiTextModel) return;
        const { KeywordDiscoveryAgent } = await import(
          './adapters/server/ai/agents/keyword-discovery.agent'
        );
        svcs.keywordDiscovery = new KeywordDiscoveryAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ KeywordDiscoveryAgent (registry)');
      },
    },
    {
      id: 'seoAnalysisAgent',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.seoAnalysisAgent || !svcs.aiTextModel) return;
        const { SeoAnalysisAgent } = await import('./adapters/server/ai/agents/seo-analysis.agent');
        svcs.seoAnalysisAgent = new SeoAnalysisAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ SeoAnalysisAgent (registry)');
      },
    },
    {
      id: 'sectionSummarizer',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.sectionSummarizer || !svcs.aiTextModel) return;
        const { SectionSummarizerAgent } = await import(
          './adapters/server/ai/agents/section-summarizer.agent'
        );
        svcs.sectionSummarizer = new SectionSummarizerAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ SectionSummarizerAgent (registry)');
      },
    },
    {
      id: 'articleGenerationWorkflow',
      enabled: _cfg => true,
      dependencies: ['aiTextModel', 'promptTemplate'],
      install: async (_cfg, svcs, log) => {
        // Crée le workflow ArticleGeneration avec les deps disponibles
        const { createArticleGenerationWorkflow } = await import(
          './adapters/server/ai/workflows/article-generation/article-generation.workflow'
        );
        const { resolveLogConfig } = await import('./config/logging.config');
        const { createLogAdapter } = await import('./adapters/server/logging/log.adapter');

        const wfLogger = createLogAdapter(resolveLogConfig(), 'ArticleGenerationWorkflow');
        // sectionSummarizer must be available (installed above)
        (svcs as any).articleGenerationWorkflow = createArticleGenerationWorkflow({
          aiModel: svcs.aiTextModel as AITextModelPort,
          promptTemplate: svcs.promptTemplate as PromptTemplatePort,
          sectionContext: (svcs as any).sectionContext,
          sectionSummarizer: (svcs as any).sectionSummarizer,
          indexArticleUseCase: (svcs as any).indexArticleUseCase,
          logger: wfLogger,
        });
        // Exposer aussi le port applicatif pour le use case GenerateArticleLinear
        (svcs as any).articleWorkflow = (svcs as any).articleGenerationWorkflow;
        log?.debug?.('✅ ArticleGenerationWorkflow initialisé (registry)');
      },
    },
    {
      id: 'outlineWriter',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.outlineWriter || !svcs.aiTextModel) return;
        const { OutlineWriterAgent } = await import(
          './adapters/server/ai/agents/outline-writer.agent'
        );
        svcs.outlineWriter = new OutlineWriterAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ OutlineWriterAgent (registry)');
      },
    },
    {
      id: 'editorialAngleAgent',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.editorialAngleAgent || !svcs.aiTextModel) return;
        const { createEditorialAngleAgent } = await import(
          './adapters/server/ai/agents/editorial-angle.agent'
        );
        svcs.editorialAngleAgent = createEditorialAngleAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ EditorialAngleAgent (registry)');
      },
    },
    {
      id: 'editorialBriefAgent',
      enabled: _cfg => true,
      dependencies: ['aiTextModel', 'promptTemplate'],
      install: async (_cfg, svcs, log) => {
        if (svcs.editorialBriefAgent || !svcs.aiTextModel || !svcs.promptTemplate) return;
        const { createEditorialBriefAgent } = await import(
          './adapters/server/ai/agents/editorial-brief.agent'
        );
        svcs.editorialBriefAgent = createEditorialBriefAgent(
          svcs.aiTextModel as AITextModelPort,
          svcs.promptTemplate as PromptTemplatePort
        );
        log?.debug?.('✅ EditorialBriefAgent (registry)');
      },
    },
    {
      id: 'sectionWriter',
      enabled: _cfg => true,
      dependencies: ['aiTextModel'],
      install: async (_cfg, svcs, log) => {
        if (svcs.sectionWriter || !svcs.aiTextModel) return;
        const { SectionWriterAgent } = await import(
          './adapters/server/ai/agents/section-writer.agent'
        );
        svcs.sectionWriter = new SectionWriterAgent(svcs.aiTextModel as AITextModelPort);
        log?.debug?.('✅ SectionWriterAgent (registry)');
      },
    },
    // Tous les installers Kuzu supprimés
    {
      id: 'angleSelectionWorkflow',
      enabled: _cfg => true,
      dependencies: ['aiTextModel', 'neo4jEditorialBriefStore', 'promptTemplate'],
      install: async (_cfg, svcs, log) => {
        if (
          (svcs as any).angleSelectionWorkflow ||
          !svcs.aiTextModel ||
          !svcs.briefStore ||
          !svcs.promptTemplate
        )
          return;
        const { createAngleSelectionWorkflow } = await import(
          './adapters/server/ai/workflows/angle-selection/angle-selection.workflow'
        );
        (svcs as any).angleSelectionWorkflow = createAngleSelectionWorkflow(
          svcs.briefStore as EditorialBriefStorePort,
          svcs.aiTextModel as AITextModelPort,
          svcs.promptTemplate as PromptTemplatePort,
          (await import('./adapters/server/logging/log.adapter')).createLogAdapter(
            (await import('./config/logging.config')).resolveLogConfig(),
            'AngleSelectionWorkflow'
          )
        );
        log?.debug?.('✅ AngleSelectionWorkflow initialisé (registry)');
      },
    },
    {
      id: 'topicSelectorWorkflowLangGraph',
      enabled: _cfg => true,
      dependencies: ['aiTextModel', 'promptTemplate'],
      install: async (_cfg, svcs, log) => {
        if (
          svcs.topicSelectorWorkflow ||
          !svcs.aiTextModel ||
          !svcs.briefStore ||
          !svcs.promptTemplate
        )
          return;
        const { createTopicSelectorWorkflow } = await import(
          './adapters/server/ai/workflows/topic-selector.workflow'
        );
        // TopicSelectorWorkflow (v2 refactoré) - n'a plus besoin de briefStore
        svcs.topicSelectorWorkflow = createTopicSelectorWorkflow(
          svcs.aiTextModel as AITextModelPort,
          svcs.promptTemplate as PromptTemplatePort,
          (await import('./adapters/server/logging/log.adapter')).createLogAdapter(
            (await import('./config/logging.config')).resolveLogConfig(),
            'TopicSelectorWorkflow'
          )
        );
        log?.debug?.('✅ TopicSelectorWorkflow (v2 refactoré - sans briefStore)');
      },
    },
    // Bootstrap seeds Kuzu (supprimé)
  ];

  // ✅ Dependency-graph: tri topologique automatique
  const { DepGraph } = await import('dependency-graph');

  // Filtrer les installers activés
  const enabledInstallers = installers.filter(it => it.enabled(config));

  // Construire le graphe de dépendances
  const graph = new DepGraph<Installer>();
  enabledInstallers.forEach(it => graph.addNode(it.id, it));
  enabledInstallers.forEach(it => {
    it.dependencies?.forEach(depId => {
      try {
        graph.addDependency(it.id, depId);
      } catch (e) {
        logger?.error(
          `❌ Impossible d'ajouter dépendance ${it.id} → ${depId}: ${e instanceof Error ? e.message : String(e)}`
        );
        throw e;
      }
    });
  });

  // Résoudre l'ordre d'installation (tri topologique)
  const orderedIds = graph.overallOrder();
  logger?.debug?.(`📋 Ordre d'installation résolu: ${orderedIds.length} services`);

  // Exécuter dans l'ordre résolu
  for (const id of orderedIds) {
    const installer = graph.getNodeData(id);
    try {
      logger?.debug?.(`▶️  Installing ${id}`);
      await installer.install(config, services, logger);
      logger?.debug?.(`✅ Installed ${id}`);
    } catch (e) {
      logger?.error(`❌ Installer ${id} a échoué:`, e);
      // Strict boot: any installer failure is fatal to surface issues early
      throw e;
    }
  }

  return services;
}
