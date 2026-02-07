import type {
  AnalyzeExistingArticlePort,
  GenerateArticlePort,
  IndexArticleFromRepoPort,
  OutlineWriterPort,
  SeoAnalysisPort,
} from '@casys/core';

import {
  type AITextModelPort,
  type AngleSelectionWorkflowPort,
  type ArticleContentFetcherPort,
  type ArticleParserPort,
  type ArticlePublisherPort,
  type ArticleStructureRepositoryPort,
  type ArticleStructureSearchPort,
  type ArticleStructureStorePort,
  type BusinessContextAnalysisAgentPort,
  type ComponentCatalogPort,
  type ComponentGeneratorAgentPort,
  type ComponentListingReadPort,
  type ComponentSearchPort,
  type ComponentUsageStorePort,
  type ComponentVectorStorePort,
  type CoverImageGenerateForArticlePort,
  type DomainAnalysisPort,
  type GoogleScrapingPort,
  type GoogleTrendsPort,
  type ImageGeneratorPort,
  type ImageUploaderPort,
  type KeywordDiscoveryPort,
  type KeywordEnrichmentPort,
  type KeywordPlanRepositoryPort,
  type LeadAnalysisStorePort,
  type OutlineWriterGenerateOutlinePort,
  type PageScraperPort,
  type PodcastGeneratorPort,
  type ProjectSeoSettingsPort,
  type PromptTemplatePort,
  type SectionContextPort,
  type SectionSummarizerSummarizeSectionPort,
  type SectionWriterWriteSectionPort,
  type SelectTopicExecutePort,
  type SeoAnalysisAgentPort,
  type SeoBriefStorePort,
  type SiteKeywordsPort,
  type TagRepositoryPort,
  type TenantProjectStorePort,
  type TopicClusterStorePort,
  type TopicDiscoveryPort,
  type TopicRelationsPort,
  type TopicRepositoryPort,
  type TopicSelectorWorkflowPort,
  type UserProjectConfigPort,
} from './ports/out';
import { FetchArticlesService } from './services/article/fetch-articles.service';
import { ArticleIndexingService } from './services/article-indexing.service';
import { ArticlePublicationService } from './services/article-publication.service';
import { ComponentIndexingService } from './services/component-indexing.service';
import { ComponentListingService } from './services/component-listing.service';
import { ComponentUsageService } from './services/component-usage.service';
import { ComponentVectorSearchService } from './services/component-vector-search.service';
import { PrepareContextService } from './services/generate/prepare-context.service';
import { SeoDataEnrichmentService } from './services/seo/seo-data-enrichment.service';
import { TrendScoreService } from './services/seo/trend-score.service';
import { AnalyzeExistingArticleUseCase } from './usecases/article-analysis';
import { IndexArticleFromRepoUseCase } from './usecases/article-analysis/index-article-from-repo.usecase';
// import { createGenerateArticleUseCase } from './usecases/generate-article.usecase'; // Temporairement commenté - fichier exclu du build
import { SyncArticlesFromGithubUseCase } from './usecases/article-analysis/sync-articles-from-github.usecase';
import { BuildTopicsFromFetchResultsUseCase } from './usecases/build-topics-from-fetch-results.usecase';
import { DiscoverTopicsUseCase } from './usecases/discover-topics.usecase';
import { EnsureTenantProjectUseCase } from './usecases/ensure-tenant-project.usecase';
import { GenerateArticleLinearUseCase } from './usecases/generate-article/generate-article-linear.usecase';
import { GenerateComponentFromCommentUseCase } from './usecases/generate-component-from-comment.usecase';
import { GenerateCoverImageUseCase } from './usecases/generate-cover-image.usecase';
import { IndexArticleProgressivelyUseCase } from './usecases/index-article-progressively.usecase';
import { IndexArticlesUseCaseImpl } from './usecases/index-articles.usecase';
import { IndexComponentsUseCaseImpl } from './usecases/index-components.usecase';
import { LeadAnalysisStreamingUseCase } from './usecases/lead';
import { LinkSelectedTopicsUseCase } from './usecases/link-selected-topics.usecase';
import { ListArticlesUseCaseImpl } from './usecases/list-articles.usecase';
import { ListComponentsUseCaseImpl } from './usecases/list-components.usecase';
import { OutlineWriterUseCase } from './usecases/outline-writer.usecase';
import { SelectTopicUseCase } from './usecases/select-topic.usecase';
import { ArticleKeywordsMetricsUseCase } from './usecases/seo-analysis/article-keywords-metrics.usecase';
import { GenerateAngleUseCase } from './usecases/seo-analysis/generate-angle.usecase';
import { SeoAnalysisUseCase } from './usecases/seo-analysis/seo-analysis.usecase';
import { SeoKeywordsMetricsUseCase } from './usecases/seo-analysis/seo-keywords-metrics.usecase';
import { UpsertArticleTagsUseCase } from './usecases/upsert-article-tags.usecase';
// RSS Subscriptions use cases
import { SubscribeToFeedUseCase } from './usecases/rss/subscribe-to-feed.usecase';
import { ListSubscriptionsUseCase } from './usecases/rss/list-subscriptions.usecase';
import { ManageSubscriptionUseCase } from './usecases/rss/manage-subscription.usecase';
// RSS Subscriptions ports (IN)
import type {
  SubscribeToFeedPort,
  ListSubscriptionsPort,
  ManageSubscriptionPort,
} from '@casys/core';
// Core in-ports (importés inline ci-dessus)
// Application out-ports
import { type Logger } from './utils/logger';

/**
 * Logger applicatif optionnel
 */
// Logger applicatif: on utilise directement LoggerPort pour rester port-aware

/**
 * Dépendances transverses disponibles pour construire les use cases/agents.
 * Toutes optionnelles ici; des interfaces ciblées détaillent les requis par use case.
 */
export interface ApplicationDependencies {
  // Agents / IA
  aiTextModel?: AITextModelPort;

  // Workflows
  angleSelectionWorkflow?: AngleSelectionWorkflowPort;
  topicSelectorWorkflow?: TopicSelectorWorkflowPort;
  articleWorkflow?: import('./ports/out').ArticleGenerationWorkflowPort;

  // Repos / Stores / Catalogs
  articleStructureRepository?: ArticleStructureRepositoryPort;
  githubArticleRepository?: ArticleStructureRepositoryPort;
  articleStructureStore?: ArticleStructureStorePort;
  componentStore?: ComponentVectorStorePort;
  componentListing?: ComponentListingReadPort;
  componentCatalog?: ComponentCatalogPort;

  // Ports in (Core) nécessaires pour construire les services de domaine en interne
  componentSearch?: ComponentSearchPort;
  componentUsageStore?: ComponentUsageStorePort;
  articleStructureSearch?: ArticleStructureSearchPort;
  articlePublicationService?: ArticlePublicationService;
  articlePublisher?: ArticlePublisherPort;
  articlePublisherGithub?: ArticlePublisherPort;

  // Ports supplémentaires
  imageGenerator?: ImageGeneratorPort;
  podcastGenerator?: PodcastGeneratorPort;
  topicDiscovery?: TopicDiscoveryPort;
  configReader?: UserProjectConfigPort;
  promptTemplate?: PromptTemplatePort;
  imageUploaderFs?: ImageUploaderPort;
  imageUploaderGithub?: ImageUploaderPort;

  // SEO ports
  seoAnalysisAgent?: SeoAnalysisAgentPort;
  editorialAngleAgent?: import('./ports/out').EditorialAngleAgentPort;
  editorialBriefAgent?: import('./ports/out').EditorialBriefAgentPort;
  businessContextAgent?: BusinessContextAnalysisAgentPort;
  keywordDiscovery?: KeywordDiscoveryPort;
  pageScraper?: PageScraperPort;
  googleScraping?: GoogleScrapingPort;
  googleTrends?: GoogleTrendsPort;
  keywordEnrichment?: KeywordEnrichmentPort;
  domainAnalysis?: DomainAnalysisPort;
  siteKeywords?: SiteKeywordsPort;
  keywordPlanRepo?: KeywordPlanRepositoryPort;
  // Project/Tenant persistence & SeoBrief persistence
  tenantProjectStore?: TenantProjectStorePort;
  seoBriefStore?: SeoBriefStorePort;
  editorialBriefStore?: import('./ports/out').EditorialBriefStorePort;
  // Lead analysis durable store
  leadAnalysisStore?: LeadAnalysisStorePort;
  // Project SEO settings (VO domaine)
  projectSeoSettings?: ProjectSeoSettingsPort;
  // Tag repository (graph)
  tagRepository?: TagRepositoryPort;
  // Relations graphe (Article->Topic, Topic->SeoKeyword)
  topicRelations?: TopicRelationsPort;
  // TopicClusters store (graph)
  topicClusterStore?: TopicClusterStorePort;

  // Topics repository (graph)
  topicRepository?: TopicRepositoryPort;

  // RSS Feed repository (graph - unified: discovered + subscriptions)
  rssFeedRepository?: import('./ports/out').RssFeedRepositoryPort;

  // Content fetcher (full article content)
  articleContentFetcher?: ArticleContentFetcherPort;
  // Content parser (frontmatter + contenu + sections) - nom infra: mdxParser
  articleParser?: ArticleParserPort;

  // Writers (ports) fournis par l'infrastructure
  outlineWriter?: OutlineWriterGenerateOutlinePort;
  sectionWriter?: SectionWriterWriteSectionPort;
  topicSelector?: SelectTopicExecutePort;

  // Agent générateur de props de composants (infrastructure via port appli)
  componentGeneratorAgent?: ComponentGeneratorAgentPort;

  // Résumé de sections (pour contexte voisins)
  sectionSummarizer?: SectionSummarizerSummarizeSectionPort;
  // Section context from Neo4j (DTO thin)
  sectionContext?: SectionContextPort;

  // Logger infrastructure injectable (optionnel)
  logger?: Logger;
}

// Interfaces ciblées par use case (documentation vivante des requis)
export interface IndexComponentsDeps {
  componentStore: ComponentVectorStorePort;
  componentCatalog?: ComponentCatalogPort;
}

export interface IndexArticlesDeps {
  articleStructureStore: ArticleStructureStorePort;
  articleStructureRepository?: ArticleStructureRepositoryPort;
}

export interface ListArticlesDeps {
  articleStructureRepository: ArticleStructureRepositoryPort;
}

export interface ListComponentsDeps {
  componentStore: ComponentVectorStorePort;
}

export interface GenerateComponentFromCommentDeps {
  componentVectorSearchService: ComponentVectorSearchService;
  componentUsageService: ComponentUsageService;
  articleStructureSearchService?: ArticleStructureSearchPort;
  aiTextModel?: AITextModelPort; // pour l'agent componentGeneratorAgent
}

export interface AgentsDeps {
  aiTextModel: AITextModelPort;
}

export interface GenerateCoverImageDeps {
  configReader: UserProjectConfigPort;
  promptTemplate: PromptTemplatePort;
  imageGenerator: ImageGeneratorPort;
}

export interface SelectTopicDeps {
  configReader: UserProjectConfigPort;
  promptTemplate: PromptTemplatePort;
  aiTextModel: AITextModelPort;
}

export interface SeoAnalysisDeps {
  configReader: UserProjectConfigPort;
  promptTemplate: PromptTemplatePort;
  aiTextModel: AITextModelPort;
  googleScraping: GoogleScrapingPort;
  googleTrends: GoogleTrendsPort;
  keywordPlanRepo: KeywordPlanRepositoryPort;
}

export interface GenerateArticleLinearDeps {
  articleStructureSearchService: ArticleStructureSearchPort;
  topicDiscovery: TopicDiscoveryPort;

  articlePublicationService: ArticlePublicationService;
  // Optionnels/compléments
  articleStructureStore?: ArticleStructureStorePort;
  articleStructureRepository?: ArticleStructureRepositoryPort;
  // Dépend de services construits en amont
  selectTopicUseCase?: SelectTopicUseCase;
  seoAnalysisUseCase?: SeoAnalysisPort;
  outlineWriter?: OutlineWriterGenerateOutlinePort;
  sectionWriter?: SectionWriterWriteSectionPort;
  generateCoverImageUseCase?: GenerateCoverImageUseCase;
}

/**
 * Services construits par le container
 */
/**
 * Services construits par le container
 * Typés avec les ports IN (hexagonal) pour exposition stable vers l'infra
 */
export interface ApplicationServiceMap {
  // Use cases (typés avec ports IN quand disponibles)
  indexComponentsUseCase?: IndexComponentsUseCaseImpl;
  indexArticlesUseCase?: IndexArticlesUseCaseImpl;
  indexArticleFromRepoUseCase?: IndexArticleFromRepoPort;
  syncArticlesFromGithubUseCase?: SyncArticlesFromGithubUseCase;
  listArticlesUseCase?: ListArticlesUseCaseImpl;
  listComponentsUseCase?: ListComponentsUseCaseImpl;
  generateComponentFromCommentUseCase?: GenerateComponentFromCommentUseCase;
  generateCoverImageUseCase?: CoverImageGenerateForArticlePort;
  // V3: Génération d'angle éditorial (standalone, exposé pour route API)
  generateAngleUseCase?: GenerateAngleUseCase;
  selectTopicUseCase?: SelectTopicExecutePort;
  seoAnalysisUseCase?: SeoAnalysisPort;
  outlineWriterUseCase?: OutlineWriterPort;
  writeSectionsUseCase?: never;
  generateArticleLinearUseCase?: GenerateArticlePort;
  leadAnalysisUseCase?: LeadAnalysisStreamingUseCase;
  analyzeExistingArticleUseCase?: AnalyzeExistingArticlePort;
  // RSS Feed Discovery (built in API layer, typed here for middleware compatibility)
  discoverRssFeedsUseCase?: import('./usecases/topics/discover-rss-feeds.usecase').DiscoverRssFeedsUseCase;
  // RSS Subscriptions use cases (typed with IN ports)
  subscribeToFeedUseCase?: SubscribeToFeedPort;
  listSubscriptionsUseCase?: ListSubscriptionsPort;
  manageSubscriptionUseCase?: ManageSubscriptionPort;
}

/**
 * Container applicatif déclaratif et typé
 */
// Registry pour éviter de modifier plusieurs blocs lors de l'ajout de use cases simples
interface UseCaseReg {
  id: keyof ApplicationServiceMap;
  enabled: (deps: ApplicationDependencies) => boolean;
  build: (deps: ApplicationDependencies, services: ApplicationServiceMap) => void;
}

const useCaseRegistry: readonly UseCaseReg[] = [
  {
    id: 'indexComponentsUseCase',
    enabled: deps => !!deps.componentStore,
    build: (deps, services) => {
      const componentStore = deps.componentStore!;
      const indexing = new ComponentIndexingService(componentStore, deps.componentCatalog);
      services.indexComponentsUseCase = new IndexComponentsUseCaseImpl(indexing);
    },
  },
  {
    id: 'indexArticlesUseCase',
    enabled: deps => !!deps.articleStructureStore,
    build: (deps, services) => {
      const articleStructureStore = deps.articleStructureStore!;
      const indexing = new ArticleIndexingService(
        articleStructureStore,
        deps.articleStructureRepository
      );
      services.indexArticlesUseCase = new IndexArticlesUseCaseImpl(indexing);
    },
  },
  {
    id: 'indexArticleFromRepoUseCase',
    enabled: deps => !!deps.articleStructureStore,
    build: (deps, services) => {
      const indexing = new ArticleIndexingService(
        deps.articleStructureStore!,
        deps.articleStructureRepository
      );
      services.indexArticleFromRepoUseCase = new IndexArticleFromRepoUseCase(
        indexing,
        deps.articleParser
      );
    },
  },
  {
    id: 'listArticlesUseCase',
    enabled: deps => !!deps.articleStructureRepository,
    build: (deps, services) => {
      services.listArticlesUseCase = new ListArticlesUseCaseImpl(deps.articleStructureRepository!);
    },
  },
  {
    id: 'listComponentsUseCase',
    enabled: deps => !!deps.componentListing && !!deps.componentStore,
    build: (deps, services) => {
      const listing = new ComponentListingService(
        deps.componentListing!,
        deps.componentStore!
      );
      services.listComponentsUseCase = new ListComponentsUseCaseImpl(listing);
    },
  },
  {
    id: 'syncArticlesFromGithubUseCase',
    enabled: deps => !!deps.githubArticleRepository && !!deps.articleStructureRepository,
    build: (deps, services) => {
      if (!services.indexArticlesUseCase) return; // besoin de l'indexation d'articles construite avant
      services.syncArticlesFromGithubUseCase = new SyncArticlesFromGithubUseCase(
        deps.githubArticleRepository!,
        deps.articleStructureRepository!,
        services.indexArticlesUseCase
      );
    },
  },
  // RSS Subscriptions use cases
  {
    id: 'subscribeToFeedUseCase',
    enabled: deps => !!deps.rssFeedRepository,
    build: (deps, services) => {
      services.subscribeToFeedUseCase = new SubscribeToFeedUseCase(
        deps.rssFeedRepository!
      );
    },
  },
  {
    id: 'listSubscriptionsUseCase',
    enabled: deps => !!deps.rssFeedRepository,
    build: (deps, services) => {
      services.listSubscriptionsUseCase = new ListSubscriptionsUseCase(
        deps.rssFeedRepository!
      );
    },
  },
  {
    id: 'manageSubscriptionUseCase',
    enabled: deps => !!deps.rssFeedRepository,
    build: (deps, services) => {
      services.manageSubscriptionUseCase = new ManageSubscriptionUseCase(
        deps.rssFeedRepository!
      );
    },
  },
];

export class ApplicationContainer {
  constructor(private readonly deps: ApplicationDependencies) {}

  build(): ApplicationServiceMap {
    const services: ApplicationServiceMap = {};

    // Construire d'abord les use cases simples via le registry
    for (const reg of useCaseRegistry) {
      if (reg.enabled(this.deps)) reg.build(this.deps, services);
    }
    if (
      this.deps.componentSearch &&
      this.deps.componentUsageStore &&
      this.deps.componentGeneratorAgent
    ) {
      const componentVectorSearchService = new ComponentVectorSearchService(
        this.deps.componentSearch
      );
      const componentUsageService = new ComponentUsageService(this.deps.componentUsageStore);

      services.generateComponentFromCommentUseCase = new GenerateComponentFromCommentUseCase(
        componentVectorSearchService,
        componentUsageService,
        this.deps.componentGeneratorAgent,
        undefined
      );
    } else {
      services.generateComponentFromCommentUseCase = undefined;
    }

    // Génération d'image de couverture (optionnel)
    if (this.deps.configReader && this.deps.promptTemplate && this.deps.imageGenerator) {
      services.generateCoverImageUseCase = new GenerateCoverImageUseCase(
        this.deps.configReader,
        this.deps.promptTemplate,
        this.deps.imageGenerator
      );
    } else {
      services.generateCoverImageUseCase = undefined;
    }

    // V3: Use case de génération d'angle éditorial (standalone, exposé pour route API)
    if (this.deps.configReader && this.deps.angleSelectionWorkflow) {
      services.generateAngleUseCase = new GenerateAngleUseCase(
        this.deps.configReader,
        this.deps.angleSelectionWorkflow,
        this.deps.editorialBriefStore // optionnel pour Graph RAG anti-doublons
      );
    }

    // V3: Use case de sélection de sujets (reçoit l'angle en input, ne le génère plus)
    if (this.deps.configReader && this.deps.topicSelectorWorkflow) {
      services.selectTopicUseCase = new SelectTopicUseCase(
        this.deps.configReader,
        this.deps.topicSelectorWorkflow
      );
    }

    // Use case d'écriture de sections (POML)
    // WriteSectionsUseCase supprimé (remplacé par workflow sections-only)

    // SeoAnalysisUseCase
    const {
      aiTextModel,
      configReader,
      promptTemplate,
      seoAnalysisAgent,
      googleScraping,
      googleTrends,
      projectSeoSettings,
      keywordEnrichment,
      domainAnalysis,
      keywordPlanRepo,
    } = this.deps;

    // Hoisted metrics-only use cases (initialized when deps are available)
    let seoKeywordsMetricsUseCase: SeoKeywordsMetricsUseCase | undefined;
    let articleKeywordsMetricsUseCase: ArticleKeywordsMetricsUseCase | undefined;

    if (
      aiTextModel &&
      configReader &&
      promptTemplate &&
      seoAnalysisAgent &&
      googleScraping &&
      googleTrends &&
      projectSeoSettings &&
      keywordEnrichment &&
      domainAnalysis &&
      keywordPlanRepo
    ) {
      // ✅ Utiliser la factory create() avec objet deps
      services.seoAnalysisUseCase = SeoAnalysisUseCase.create({
        aiTextModel: aiTextModel,
        promptTemplate: promptTemplate,
        googleScraping: googleScraping,
        googleTrends: googleTrends,
        keywordEnrichment: keywordEnrichment,
        domainAnalysis: domainAnalysis,
        configReader: configReader,
        projectSettings: projectSeoSettings,
        seoAnalysisAgent: seoAnalysisAgent,
        keywordPlanRepo: keywordPlanRepo,
        tagRepository: this.deps.tagRepository,
        seoBriefStore: this.deps.seoBriefStore,
        topicClusterStore: this.deps.topicClusterStore,
      });
      seoKeywordsMetricsUseCase =
        projectSeoSettings &&
        keywordEnrichment &&
        googleTrends &&
        googleScraping &&
        keywordPlanRepo &&
        this.deps.tagRepository
          ? new SeoKeywordsMetricsUseCase(
              projectSeoSettings,
              keywordEnrichment,
              googleTrends,
              googleScraping,
              keywordPlanRepo,
              this.deps.tagRepository
            )
          : undefined;
      articleKeywordsMetricsUseCase =
        projectSeoSettings &&
        keywordEnrichment &&
        googleTrends &&
        googleScraping &&
        this.deps.tagRepository
          ? new ArticleKeywordsMetricsUseCase(
              projectSeoSettings,
              keywordEnrichment,
              googleTrends,
              googleScraping,
              this.deps.tagRepository
            )
          : undefined;
    }

    // LeadAnalysisUseCase (éphémère, persistance durable par store FS)
    if (
      this.deps.leadAnalysisStore &&
      this.deps.domainAnalysis &&
      this.deps.keywordEnrichment &&
      this.deps.googleTrends &&
      this.deps.googleScraping &&
      this.deps.promptTemplate &&
      this.deps.seoAnalysisAgent &&
      this.deps.aiTextModel
    ) {
      if (!this.deps.businessContextAgent) {
        throw new Error('[ApplicationContainer] businessContextAgent manquant');
      }
      if (!this.deps.keywordDiscovery) {
        throw new Error('[ApplicationContainer] keywordDiscovery manquant');
      }
      if (!this.deps.pageScraper) {
        throw new Error('[ApplicationContainer] pageScraper manquant');
      }
      const consoleLogger = {
        debug: (...args: unknown[]) => console.debug('[LeadAnalysis]', ...args),
        log: (...args: unknown[]) => console.log('[LeadAnalysis]', ...args),
        warn: (...args: unknown[]) => console.warn('[LeadAnalysis]', ...args),
        error: (...args: unknown[]) => console.error('[LeadAnalysis]', ...args),
      } as const;
      services.leadAnalysisUseCase = new LeadAnalysisStreamingUseCase({
        store: this.deps.leadAnalysisStore,
        domainAnalysis: this.deps.domainAnalysis,
        keywordEnrichment: this.deps.keywordEnrichment,
        googleTrends: this.deps.googleTrends,
        googleScraping: this.deps.googleScraping,
        promptTemplate: this.deps.promptTemplate,
        seoAnalysisAgent: this.deps.seoAnalysisAgent,
        businessContextAgent: this.deps.businessContextAgent,
        keywordDiscovery: this.deps.keywordDiscovery,
        pageScraper: this.deps.pageScraper,
        siteKeywords: this.deps.siteKeywords,
        logger: consoleLogger,
      });
    }

    // LeadPreviewUseCase (fast 2-step preview without expensive operations)
    if (
      this.deps.domainAnalysis &&
      this.deps.pageScraper &&
      this.deps.businessContextAgent &&
      this.deps.siteKeywords
    ) {
      const consoleLogger = {
        debug: (...args: unknown[]) => console.debug('[LeadPreview]', ...args),
        log: (...args: unknown[]) => console.log('[LeadPreview]', ...args),
        warn: (...args: unknown[]) => console.warn('[LeadPreview]', ...args),
        error: (...args: unknown[]) => console.error('[LeadPreview]', ...args),
      } as const;
    }

    // OutlineWriterUseCase (POML)
    if (this.deps.configReader && this.deps.promptTemplate && this.deps.outlineWriter) {
      services.outlineWriterUseCase = new OutlineWriterUseCase(
        this.deps.configReader,
        this.deps.promptTemplate,
        this.deps.outlineWriter,
        undefined, // suggestTagsUseCase non injecté ici
        this.deps.articleStructureSearch // 🔗 permet Sections-first RAG dans Outline Writer
      );
    }

    // Construire ArticlePublicationService (requis par GenerateArticleLinearUseCase)
    if (this.deps.configReader) {
      const pubService = new ArticlePublicationService(
        this.deps.configReader,
        this.deps.articlePublisher,
        this.deps.articlePublisherGithub
      );
      Object.assign(this.deps, { articlePublicationService: pubService });
    }

    // Génération d'article linéaire (topic-only, fail-fast)
    // V3: Nécessite generateAngleUseCase (séparé de SelectTopicUseCase)
    if (
      services.generateAngleUseCase &&
      services.selectTopicUseCase &&
      services.seoAnalysisUseCase &&
      this.deps.topicDiscovery &&
      this.deps.articleContentFetcher &&
      this.deps.configReader &&
      this.deps.projectSeoSettings &&
      this.deps.articleWorkflow &&
      this.deps.articleStructureStore
    ) {
      const generateAngleUseCase = services.generateAngleUseCase;
      const selectTopicUseCase = services.selectTopicUseCase;
      const seoAnalysisUseCase = services.seoAnalysisUseCase;
      const topicDiscovery = this.deps.topicDiscovery;
      const contentFetcher = this.deps.articleContentFetcher;
      const configReader = this.deps.configReader;
      const projectSettings = this.deps.projectSeoSettings;

      // Optionnel: construire EnsureTenantProjectUseCase si les ports sont disponibles
      const ensureTenantProjectUseCase =
        this.deps.configReader && this.deps.projectSeoSettings && this.deps.tenantProjectStore
          ? new EnsureTenantProjectUseCase(
              this.deps.configReader,
              this.deps.projectSeoSettings,
              this.deps.tenantProjectStore
            )
          : undefined;

      const upsertArticleTagsUseCase = this.deps.tagRepository
        ? new UpsertArticleTagsUseCase(this.deps.tagRepository)
        : undefined;

      const buildTopicsFromFetchResultsUseCase =
        this.deps.topicRepository && this.deps.topicRelations
          ? new BuildTopicsFromFetchResultsUseCase(
              this.deps.topicRepository,
              this.deps.topicRelations
            )
          : undefined;

      const indexingSvc = new ArticleIndexingService(
        this.deps.articleStructureStore,
        this.deps.articleStructureRepository
      );
      services.generateArticleLinearUseCase = new GenerateArticleLinearUseCase({
        // V3: Génération d'angle éditorial (requis)
        generateAngleUseCase,
        topicDiscovery,
        selectTopicUseCase,
        seoAnalysisUseCase,
        contentFetcher,
        configReader,
        projectSettings,
        articleWorkflow: this.deps.articleWorkflow,
        publicationService: this.deps.articlePublicationService,
        coverImageUseCase: services.generateCoverImageUseCase,
        indexArticleUseCase: new IndexArticleProgressivelyUseCase(indexingSvc),
        upsertArticleTagsUseCase,
        topicRelations: this.deps.topicRelations,
        buildTopicsFromFetchResultsUseCase,
        editorialBriefStore: this.deps.editorialBriefStore,
        seoBriefStore: this.deps.seoBriefStore,
        ensureTenantProjectUseCase,
        outlineWriterUseCase: services.outlineWriterUseCase,
        discoverTopicsUseCase: new DiscoverTopicsUseCase(topicDiscovery),
        prepareContextService: new PrepareContextService(configReader, projectSettings),
        fetchArticlesService: new FetchArticlesService(contentFetcher),
        linkSelectedTopicsUseCase: new LinkSelectedTopicsUseCase(
          buildTopicsFromFetchResultsUseCase
        ),
        editorialBriefAgent: this.deps.editorialBriefAgent,
        logger: this.deps.logger, // ✅ Logger infrastructure injectable
      });
    }

    if (
      this.deps.articleStructureStore &&
      this.deps.articleStructureRepository &&
      this.deps.projectSeoSettings &&
      services.seoAnalysisUseCase &&
      this.deps.tagRepository &&
      this.deps.topicRepository &&
      this.deps.topicRelations &&
      this.deps.seoBriefStore &&
      this.deps.topicDiscovery &&
      this.deps.articleParser &&
      services.indexArticleFromRepoUseCase
    ) {
      const indexing = new ArticleIndexingService(
        this.deps.articleStructureStore,
        this.deps.articleStructureRepository
      );
      const ensureTenantProjectUseCase =
        this.deps.configReader && this.deps.projectSeoSettings && this.deps.tenantProjectStore
          ? new EnsureTenantProjectUseCase(
              this.deps.configReader,
              this.deps.projectSeoSettings,
              this.deps.tenantProjectStore
            )
          : undefined;
      if (ensureTenantProjectUseCase) {
        services.analyzeExistingArticleUseCase = new AnalyzeExistingArticleUseCase(
          indexing,
          this.deps.articleStructureRepository,
          this.deps.githubArticleRepository,
          this.deps.projectSeoSettings,
          this.deps.articleParser,
          services.seoAnalysisUseCase,
          seoKeywordsMetricsUseCase,
          articleKeywordsMetricsUseCase,
          this.deps.keywordPlanRepo!,
          this.deps.tagRepository,
          this.deps.topicRepository,
          this.deps.topicRelations,
          ensureTenantProjectUseCase,
          this.deps.seoBriefStore,
          this.deps.topicDiscovery,
          services.indexArticleFromRepoUseCase,
          services.syncArticlesFromGithubUseCase,
          this.deps.editorialAngleAgent,
          this.deps.editorialBriefStore
        );
        try {
          // eslint-disable-next-line no-console
          console.log('[ApplicationContainer][diag] AnalyzeExistingArticleUseCase construit ✅');
        } catch (_e) {
          /* noop */
        }
      }
    } else {
      try {
        // eslint-disable-next-line no-console
        console.log('[ApplicationContainer][diag] AnalyzeExistingArticleUseCase désactivé ❌');
        // eslint-disable-next-line no-console
        console.log('[ApplicationContainer][diag] Dépendances manquantes:', {
          articleStructureStore: !!this.deps.articleStructureStore,
          articleStructureRepository: !!this.deps.articleStructureRepository,
          projectSeoSettings: !!this.deps.projectSeoSettings,
          seoAnalysisUseCase: !!services.seoAnalysisUseCase,
          tagRepository: !!this.deps.tagRepository,
          topicRepository: !!this.deps.topicRepository,
          topicRelations: !!this.deps.topicRelations,
          seoBriefStore: !!this.deps.seoBriefStore,
          topicDiscovery: !!this.deps.topicDiscovery,
          articleParser: !!this.deps.articleParser,
          indexArticleFromRepoUseCase: !!services.indexArticleFromRepoUseCase,
          configReader: !!this.deps.configReader,
          tenantProjectStore: !!this.deps.tenantProjectStore,
        });
      } catch (_e) {
        /* noop */
      }
    }

    return services;
  }
}
