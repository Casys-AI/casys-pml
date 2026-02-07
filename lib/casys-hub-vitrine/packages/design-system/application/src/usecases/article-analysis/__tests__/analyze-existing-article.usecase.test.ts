import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  AnalyzeExistingArticlePort,
  ArticleKeywordsMetricsPort,
  IndexArticleFromRepoPort,
  SeoAnalysisPort,
  SeoKeywordsMetricsPort,
} from '@casys/core';
import type {
  ArticleIndexingUpsertPort,
  ArticleParserPort,
  ArticleReadPort,
  EditorialAngleAgentPort,
  EditorialBriefStorePort,
  KeywordPlanRepositoryPort,
  ProjectSeoSettingsPort,
  SeoBriefStorePort,
  TagRepositoryPort,
  TopicDiscoveryPort,
  TopicRelationsPort,
  TopicRepositoryPort,
} from '../../../ports/out';
import { AnalyzeExistingArticleUseCase } from '../analyze-existing-article.usecase';

interface EnsureTenantProjectUseCase {
  execute: (p: { tenantId: string; projectId: string }) => Promise<void>;
}
interface SyncArticlesFromGithubUseCase {
  execute: (tenantId: string, projectId: string) => Promise<{ success: boolean }>;
}

function makeArticleStructure(params?: {
  id?: string;
  title?: string;
  keywords?: string[];
  sources?: string[];
}) {
  const id = params?.id ?? 'a1';
  const title = params?.title ?? 'Test Article';
  const keywords = params?.keywords ?? ['alpha', 'beta'];
  const sources = params?.sources ?? ['https://example.com/source1'];

  return {
    article: {
      id,
      title,
      description: 'Test description',
      language: 'en',
      createdAt: new Date().toISOString(),
      tenantId: 'tenant-x',
      projectId: 'project-y',
      keywords,
      sources,
      tags: ['test'],
      agents: [],
    },
    sections: [
      {
        id: 's1',
        articleId: id,
        title: 'Section 1',
        content: 'Test content with link',
        order: 1,
      },
    ],
    componentUsages: [],
    textFragments: [],
    comments: [],
  } as const;
}

describe('AnalyzeExistingArticleUseCase', () => {
  const tenantId = 'tenant-x';
  const projectId = 'project-y';
  const articleId = 'a1';

  let articleStore: ArticleIndexingUpsertPort & Record<string, any>;
  let articleReader: ArticleReadPort & Record<string, any>;
  let projectSettings: ProjectSeoSettingsPort & Record<string, any>;
  let articleParser: ArticleParserPort & Record<string, any>;
  let seoAnalysisUseCase: SeoAnalysisPort & Record<string, any>;
  let seoKeywordsMetricsUseCase: SeoKeywordsMetricsPort & Record<string, any>;
  let articleKeywordsMetricsUseCase: ArticleKeywordsMetricsPort & Record<string, any>;
  let keywordPlanRepo: KeywordPlanRepositoryPort & Record<string, any>;
  let tagRepository: TagRepositoryPort & Record<string, any>;
  let topicRepository: TopicRepositoryPort & Record<string, any>;
  let topicRelations: TopicRelationsPort & Record<string, any>;
  let ensureTenantProject: EnsureTenantProjectUseCase & Record<string, any>;
  let seoBriefStore: SeoBriefStorePort & Record<string, any>;
  let topicDiscovery: TopicDiscoveryPort & Record<string, any>;
  let syncGithub: SyncArticlesFromGithubUseCase & Record<string, any>;
  let angleAgent: EditorialAngleAgentPort & Record<string, any>;
  let editorialBriefStore: EditorialBriefStorePort & Record<string, any>;
  let indexArticleFromRepo: IndexArticleFromRepoPort & Record<string, any>;

  beforeEach(() => {
    vi.restoreAllMocks();

    articleStore = {
      indexOutlineProgressively: vi.fn(),
      indexSectionContentProgressively: vi.fn(),
      linkSectionToArticle: vi.fn(),
      indexArticles: vi.fn(),
      indexGlobalCatalog: vi.fn(),
      indexTenantCatalog: vi.fn(),
      indexProjectCatalog: vi.fn(),
      indexArticleCatalog: vi.fn(),
    } as unknown as ArticleIndexingUpsertPort & Record<string, any>;

    articleReader = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findByTenant: vi.fn(),
      findByProject: vi.fn(),
    } as unknown as ArticleReadPort & Record<string, any>;

    projectSettings = {
      getSeoProjectSettings: vi.fn(),
    } as unknown as ProjectSeoSettingsPort & Record<string, any>;

    articleParser = {
      extractLinksForArticle: vi.fn(),
    } as unknown as ArticleParserPort & Record<string, any>;

    seoAnalysisUseCase = {
      execute: vi.fn(),
    } as unknown as SeoAnalysisPort & Record<string, any>;

    seoKeywordsMetricsUseCase = {
      execute: vi.fn(),
    } as unknown as SeoKeywordsMetricsPort & Record<string, any>;

    articleKeywordsMetricsUseCase = {
      execute: vi.fn(),
    } as unknown as ArticleKeywordsMetricsPort & Record<string, any>;

    keywordPlanRepo = {
      createKeywordPlan: vi.fn(),
      getKeywordPlanById: vi.fn(),
      listKeywordPlans: vi.fn(),
    } as unknown as KeywordPlanRepositoryPort & Record<string, any>;

    tagRepository = {
      upsertArticleTags: vi.fn(),
      getProjectTags: vi.fn().mockResolvedValue([]),
    } as unknown as TagRepositoryPort & Record<string, any>;

    topicRepository = {
      upsertTopics: vi.fn(),
    } as unknown as TopicRepositoryPort & Record<string, any>;

    topicRelations = {
      linkSectionToTopic: vi.fn(),
      linkTopicToKeywordLabel: vi.fn(),
    } as unknown as TopicRelationsPort & Record<string, any>;

    ensureTenantProject = {
      execute: vi.fn(),
    } as unknown as EnsureTenantProjectUseCase & Record<string, any>;

    seoBriefStore = {
      getSeoBriefForProject: vi.fn().mockResolvedValue(null),
      saveSeoBriefForProject: vi.fn().mockResolvedValue({ seoBriefId: 'sb1' }),
      linkSeoBriefToProject: vi.fn(),
      linkSeoBriefToBusinessContext: vi.fn(),
      linkSeoBriefToEditorialBrief: vi.fn(),
    } as unknown as SeoBriefStorePort & Record<string, any>;

    topicDiscovery = {} as unknown as TopicDiscoveryPort & Record<string, any>;

    syncGithub = {
      execute: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as SyncArticlesFromGithubUseCase & Record<string, any>;

    angleAgent = {
      generateAngle: vi.fn().mockResolvedValue({ angle: 'Test Angle' }),
    } as unknown as EditorialAngleAgentPort & Record<string, any>;

    editorialBriefStore = {
      saveEditorialBrief: vi.fn(),
      linkBriefToArticle: vi.fn(),
      linkBriefToKeywordPlans: vi.fn(),
    } as unknown as EditorialBriefStorePort & Record<string, any>;

    indexArticleFromRepo = {
      execute: vi.fn().mockResolvedValue({ success: true, articleId: 'a1', sectionsUpserted: 1, tagsUpserted: 0 }),
    } as unknown as IndexArticleFromRepoPort & Record<string, any>;
  });

  it('should throw "Article introuvable" if article not found', async () => {
    articleReader.findById.mockResolvedValue(null);
    projectSettings.getSeoProjectSettings.mockResolvedValue({
      seedKeywords: ['kw1'],
      language: 'en',
    });

    const uc: AnalyzeExistingArticlePort = new AnalyzeExistingArticleUseCase(
      articleStore,
      articleReader,
      undefined,
      projectSettings,
      articleParser,
      seoAnalysisUseCase,
      undefined, // seoKeywordsMetricsUseCase
      undefined, // articleKeywordsMetricsUseCase
      keywordPlanRepo,
      tagRepository,
      topicRepository,
      topicRelations,
      ensureTenantProject,
      seoBriefStore,
      topicDiscovery,
      indexArticleFromRepo,
      syncGithub,
      angleAgent,
      editorialBriefStore
    );

    await expect(uc.execute({ articleId, tenantId, projectId, dryRun: false })).rejects.toThrow(
      'Article not found'
    );
  });

  it('should throw if seedKeywords are missing', async () => {
    articleReader.findById.mockResolvedValue(makeArticleStructure());
    projectSettings.getSeoProjectSettings.mockResolvedValue({
      seedKeywords: [],
      language: 'en',
    });

    const uc: AnalyzeExistingArticlePort = new AnalyzeExistingArticleUseCase(
      articleStore,
      articleReader,
      undefined,
      projectSettings,
      articleParser,
      seoAnalysisUseCase,
      undefined, // seoKeywordsMetricsUseCase
      undefined, // articleKeywordsMetricsUseCase
      keywordPlanRepo,
      tagRepository,
      topicRepository,
      topicRelations,
      ensureTenantProject,
      seoBriefStore,
      topicDiscovery,
      indexArticleFromRepo,
      syncGithub,
      angleAgent,
      editorialBriefStore
    );

    await expect(uc.execute({ articleId, tenantId, projectId, dryRun: false })).rejects.toThrow(
      'seedKeywords requis'
    );
  });

  it('should successfully analyze an article with all dependencies', async () => {
    const article = makeArticleStructure();
    articleReader.findById.mockResolvedValue(article);
    articleReader.findByProject.mockResolvedValue([article]);

    projectSettings.getSeoProjectSettings.mockResolvedValue({
      seedKeywords: ['kw1', 'kw2'],
      language: 'en',
      targetAudience: 'developers',
      industry: 'tech',
      businessDescription: 'test',
      contentType: 'article',
    });

    articleParser.extractLinksForArticle.mockReturnValue([
      { external: ['https://example.com'], internal: [] },
    ]);

    seoAnalysisUseCase.execute.mockResolvedValue({
      keywordPlan: {
        id: 'kp1',
        tags: [
          { label: 'alpha', slug: 'alpha' },
          { label: 'beta', slug: 'beta' },
        ],
      },
      searchIntent: { intent: 'informational', confidence: 0.9 },
    });

    seoKeywordsMetricsUseCase.execute.mockResolvedValue({
      planIds: ['kp1'],
      tags: [
        { label: 'alpha', slug: 'alpha', source: 'seo' },
        { label: 'beta', slug: 'beta', source: 'seo' },
      ],
    });

    keywordPlanRepo.getKeywordPlanById.mockResolvedValue({
      id: 'kp1',
      tenantId,
      projectId,
      tags: [
        { label: 'alpha', slug: 'alpha', source: 'seo' },
        { label: 'beta', slug: 'beta', source: 'seo' },
      ],
      createdAt: new Date().toISOString(),
    });

    const uc: AnalyzeExistingArticlePort = new AnalyzeExistingArticleUseCase(
      articleStore,
      articleReader,
      undefined,
      projectSettings,
      articleParser,
      seoAnalysisUseCase,
      seoKeywordsMetricsUseCase,
      undefined, // articleKeywordsMetricsUseCase
      keywordPlanRepo,
      tagRepository,
      topicRepository,
      topicRelations,
      ensureTenantProject,
      seoBriefStore,
      topicDiscovery,
      indexArticleFromRepo,
      syncGithub,
      angleAgent,
      editorialBriefStore
    );

    const result = await uc.execute({ articleId, tenantId, projectId, dryRun: false });

    expect(result.success).toBe(true);
    expect(result.articleId).toBe(articleId);
    expect(ensureTenantProject.execute).toHaveBeenCalledWith({ tenantId, projectId });
    expect(seoKeywordsMetricsUseCase.execute).toHaveBeenCalled();
    expect(angleAgent.generateAngle).toHaveBeenCalled();
    expect(editorialBriefStore.saveEditorialBrief).toHaveBeenCalled();
  });
});
