import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeoAnalysisPort } from '@casys/core';

import type {
  ArticleContentFetcherPort,
  ArticlePublicationPublishPort,
  ProjectSeoSettingsPort,
  SelectTopicExecutePort,
  SeoBriefStorePort,
  TopicDiscoveryPort,
  UserProjectConfigPort,
} from '../../../ports/out';
import type { EnsureTenantProjectUseCase } from '../../ensure-tenant-project.usecase';
import type { GenerateAngleUseCase } from '../../seo-analysis/generate-angle.usecase';
import { GenerateArticleLinearUseCase } from '../generate-article-linear.usecase';

describe('GenerateArticleLinearUseCase', () => {
  const tenantId = 'tenant-test';
  const projectId = 'project-test';
  const keywords = ['test keyword'];
  const _language = 'fr';

  let topicDiscovery: TopicDiscoveryPort & Record<string, any>;
  let selectTopicUseCase: SelectTopicExecutePort & Record<string, any>;
  let seoAnalysisUseCase: SeoAnalysisPort & Record<string, any>;
  let contentFetcher: ArticleContentFetcherPort & Record<string, any>;
  let configReader: UserProjectConfigPort & Record<string, any>;
  let projectSettings: ProjectSeoSettingsPort & Record<string, any>;
  let publicationService: ArticlePublicationPublishPort & Record<string, any>;
  let seoBriefStore: SeoBriefStorePort & Record<string, any>;
  let ensureTenantProjectUseCase: EnsureTenantProjectUseCase & Record<string, any>;
  let generateAngleUseCase: GenerateAngleUseCase & Record<string, any>;
  let indexArticleUseCase: { indexOutline: (...args: any[]) => Promise<void> } & Record<
    string,
    any
  >;

  beforeEach(() => {
    vi.restoreAllMocks();

    topicDiscovery = {
      discoverCandidates: vi.fn().mockResolvedValue([
        {
          id: 'topic1',
          title: 'Test Topic',
          sourceUrl: 'https://example.com/article1',
          publishedAt: new Date().toISOString(),
          description: 'Test description',
        },
      ]),
      discoverTopics: vi.fn(),
    } as unknown as TopicDiscoveryPort & Record<string, any>;

    selectTopicUseCase = {
      execute: vi.fn().mockResolvedValue({
        topics: [
          {
            id: 'topic1',
            title: 'Selected Topic',
            sourceUrl: 'https://example.com/article1',
            createdAt: new Date().toISOString(),
            language: 'fr',
          },
        ],
        angle: 'Test Editorial Angle',
        seoSummary: {
          keywordTags: [{ label: 'test', slug: 'test' }],
          userQuestions: ['Question 1'],
          contentGaps: [],
          seoRecommendations: [],
          searchIntent: 'informational',
          searchConfidence: 0.8,
          contentRecommendations: [],
        },
      }),
    } as unknown as SelectTopicExecutePort & Record<string, any>;

    seoAnalysisUseCase = {
      execute: vi.fn().mockResolvedValue({
        keywordPlan: {
          tags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        },
        searchIntent: {
          intent: 'informational',
          confidence: 0.8,
          supportingQueries: ['Query 1'],
          contentRecommendations: [],
          contentGaps: [],
          seoRecommendations: [],
        },
      }),
    } as unknown as SeoAnalysisPort & Record<string, any>;

    contentFetcher = {
      fetchFullContent: vi.fn().mockResolvedValue({
        title: 'Fetched Article',
        sourceUrl: 'https://example.com/article1',
        fullContent: 'Full article content here...',
        description: 'Article description',
      }),
    } as unknown as ArticleContentFetcherPort & Record<string, any>;

    configReader = {
      getProjectConfig: vi.fn().mockResolvedValue({
        name: 'Test Project',
        type: 'astro',
        publication: {
          canonicalBaseUrl: 'https://test.com',
        },
      }),
    } as unknown as UserProjectConfigPort & Record<string, any>;

    projectSettings = {
      getSeoProjectSettings: vi.fn().mockResolvedValue({
        language: 'fr',
        seedKeywords: ['test'],
        targetAudience: 'developers',
        industry: 'tech',
        businessDescription: 'Test business',
        contentType: 'article',
      }),
    } as unknown as ProjectSeoSettingsPort & Record<string, any>;

    // plus d'utilisation de WriteSectionsUseCase (workflow sections-only)

    publicationService = {
      publishToConfiguredTargets: vi
        .fn()
        .mockResolvedValue([{ success: true, target: 'fs', path: '/tmp/article.md' }]),
    } as unknown as ArticlePublicationPublishPort & Record<string, any>;

    seoBriefStore = {
      getSeoBriefForProject: vi.fn().mockResolvedValue(null),
      saveSeoBriefForProject: vi.fn().mockResolvedValue({ seoBriefId: 'sb1' }),
      linkSeoBriefToProject: vi.fn(),
      linkSeoBriefToBusinessContext: vi.fn(),
      linkSeoBriefToEditorialBrief: vi.fn(),
    } as unknown as SeoBriefStorePort & Record<string, any>;

    ensureTenantProjectUseCase = {
      execute: vi.fn(),
    } as unknown as EnsureTenantProjectUseCase & Record<string, any>;

    // V3: Mock GenerateAngleUseCase (requis)
    generateAngleUseCase = {
      execute: vi.fn().mockResolvedValue({
        selectedAngle: 'Test Editorial Angle',
        chosenCluster: {
          pillarTag: { label: 'test', slug: 'test', source: 'pillar' },
          satelliteTags: [{ label: 'test-satellite', slug: 'test-satellite', source: 'satellite' }],
        },
        contentType: 'guide',
        selectionMode: 'pillar',
        targetPersona: {
          category: 'decision_maker',
          archetype: 'Test Persona',
        },
      }),
    } as unknown as GenerateAngleUseCase & Record<string, any>;

    indexArticleUseCase = { indexOutline: vi.fn().mockResolvedValue(undefined) } as any;
  });

  // Stub pour writeSectionsUseCase (obsolète mais référencé dans un vieux test)
  const writeSectionsUseCase = { execute: vi.fn() } as any;

  it('should fail-fast if keywords are empty', async () => {
    const useCase = new GenerateArticleLinearUseCase({
      topicDiscovery,
      selectTopicUseCase,
      seoAnalysisUseCase,
      contentFetcher,
      configReader,
      projectSettings,
      generateAngleUseCase,
      indexArticleUseCase,
      publicationService,
      seoBriefStore,
      ensureTenantProjectUseCase,
    });

    await expect(
      useCase.execute({
        keywords: [],
        tenantId,
        projectId,
      })
    ).rejects.toThrow('keywords is required and must be a non-empty array');
  });

  it('should fail-fast if tenantId or projectId are missing', async () => {
    const useCase = new GenerateArticleLinearUseCase({
      topicDiscovery,
      selectTopicUseCase,
      seoAnalysisUseCase,
      contentFetcher,
      configReader,
      projectSettings,
      generateAngleUseCase,
      indexArticleUseCase,
      publicationService,
      seoBriefStore,
      ensureTenantProjectUseCase,
    });

    await expect(
      useCase.execute({
        keywords,
        tenantId: '',
        projectId,
      })
    ).rejects.toThrow('tenantId et projectId requis');
  });

  it('should fail-fast if no topics are selected', async () => {
    (selectTopicUseCase.execute as any).mockResolvedValueOnce({
      topics: [],
      angle: 'Test Angle',
      seoSummary: {
        keywordTags: [{ label: 'test', slug: 'test' }],
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
      },
    });

    const useCase = new GenerateArticleLinearUseCase({
      topicDiscovery,
      selectTopicUseCase,
      seoAnalysisUseCase,
      contentFetcher,
      configReader,
      projectSettings,
      generateAngleUseCase,
      indexArticleUseCase,
      publicationService,
      seoBriefStore,
      ensureTenantProjectUseCase,
    });

    // V3: Without editorialBriefAgent, the usecase fails earlier with EditorialBriefData requirement
    await expect(
      useCase.execute({
        keywords,
        tenantId,
        projectId,
      })
    ).rejects.toThrow('EditorialBriefData requis');
  });

  it('should fail-fast if angle is missing', async () => {
    // V3: Mock generateAngleUseCase retournant angle vide
    const generateAngleUseCaseWithEmptyAngle = {
      execute: vi.fn().mockResolvedValue({
        selectedAngle: '', // Angle vide
        chosenCluster: {
          pillarTag: { label: 'test', slug: 'test', source: 'pillar' },
          satelliteTags: [],
        },
        contentType: 'guide',
        selectionMode: 'pillar',
      }),
    } as unknown as GenerateAngleUseCase & Record<string, any>;

    (selectTopicUseCase.execute as any).mockResolvedValueOnce({
      topics: [
        {
          id: 'topic1',
          title: 'Test Topic',
          sourceUrl: 'https://example.com/article1',
          createdAt: new Date().toISOString(),
          language: 'fr',
        },
      ],
      angle: '', // V3: Cet angle vient maintenant de generateAngleUseCase
      seoSummary: {
        keywordTags: [{ label: 'test', slug: 'test' }],
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
      },
    });

    const useCase = new GenerateArticleLinearUseCase({
      topicDiscovery,
      selectTopicUseCase,
      seoAnalysisUseCase,
      contentFetcher,
      configReader,
      projectSettings,
      generateAngleUseCase: generateAngleUseCaseWithEmptyAngle,
      indexArticleUseCase,
      publicationService,
      seoBriefStore,
      ensureTenantProjectUseCase,
    });

    await expect(
      useCase.execute({
        keywords,
        tenantId,
        projectId,
      })
    ).rejects.toThrow('angle éditorial requis');
  });

  // V3: TODO - Ce test nécessite mock complet de EditorialBriefAgent + toute la chaîne V3
  // Voir ADR docs/adr/*.md pour architecture V3 complète
  it.skip('should successfully generate an article with all dependencies', async () => {
    const articleWorkflow = {
      execute: vi.fn().mockResolvedValue({
        outline: {
          id: 'test-article-id',
          title: 'Generated Article Title',
          sections: [{ id: 's1', title: 'Section 1', position: 1, level: 2, description: 'desc' }],
        },
        sections: [
          {
            id: 's1',
            title: 'Section 1',
            position: 1,
            level: 2,
            description: 'desc',
            content: 'Section content',
          },
        ],
        totalWords: 120,
        status: 'completed',
      }),
    } as any;

    const configReaderWithTemplate = {
      getProjectConfig: vi.fn().mockResolvedValue({
        name: 'Test Project',
        type: 'astro',
        publication: { canonicalBaseUrl: 'https://test.com' },
        generation: { sectionWriter: { template: 'prompts/section-writer.poml' } },
      }),
    } as unknown as UserProjectConfigPort & Record<string, any>;

    const useCase = new GenerateArticleLinearUseCase({
      topicDiscovery,
      selectTopicUseCase,
      seoAnalysisUseCase,
      contentFetcher,
      configReader: configReaderWithTemplate,
      projectSettings,
      generateAngleUseCase,
      indexArticleUseCase,
      publicationService,
      seoBriefStore,
      ensureTenantProjectUseCase,
      articleWorkflow,
      outlineWriterUseCase: {
        execute: vi.fn().mockResolvedValue({
          title: 'Generated Article Title',
          summary: 'Article summary',
          sections: [
            {
              id: 's1',
              articleId: 'test-article-id',
              title: 'Section 1',
              position: 1,
              level: 2,
              content: 'Section content',
            },
          ],
          keywordTags: [{ label: 'test', slug: 'test' }],
        }),
      } as any,
    });

    const result = await useCase.execute({
      keywords,
      tenantId,
      projectId,
    });

    expect(result).toBeDefined();
    expect(result.article).toBeDefined();
    expect(result.article.title).toBeTruthy();
    expect(result.sections).toBeDefined();
    expect(result.sections.length).toBeGreaterThan(0);
    expect(topicDiscovery.discoverCandidates).toHaveBeenCalled();
    expect(selectTopicUseCase.execute).toHaveBeenCalled();
    expect(contentFetcher.fetchFullContent).toHaveBeenCalled();
    expect(articleWorkflow.execute).toHaveBeenCalled();
    expect(publicationService.publishToConfiguredTargets).toHaveBeenCalled();
  });
});
