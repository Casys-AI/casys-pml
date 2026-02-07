import { describe, it, expect, vi } from 'vitest';
import { DiscoverTopicsUseCase } from '../discover-topics.usecase';
import type { TopicDiscoveryPort } from '../../ports/out';
import type { SeoStrategy, TopicCandidate, KeywordTag, TrendData } from '@casys/core';

describe('DiscoverTopicsUseCase', () => {
  it('should fail-fast when seoStrategy has no keywords', async () => {
    // Arrange
    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn(),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: { tags: [] },
      trends: [],
      searchIntent: { supportingQueries: [] },
    } as SeoStrategy;

    // Act & Assert
    await expect(
      useCase.execute({
        seoStrategy,
        tenantId: 't1',
        projectId: 'p1',
        language: 'fr',
      })
    ).rejects.toThrow('Aucun keyword SEO disponible');
  });

  it('should discover topics with keywords from tags only', async () => {
    // Arrange
    const mockCandidates: TopicCandidate[] = [
      {
        title: 'AI Revolution 2024',
        description: 'Latest AI trends',
        source: 'newsapi',
        url: 'https://example.com/ai-news',
        publishedAt: new Date('2024-01-15'),
        relevanceScore: 0.9,
      },
    ];

    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockResolvedValue(mockCandidates),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: {
        tags: [
          { label: 'artificial intelligence', slug: 'artificial-intelligence' } as KeywordTag,
          { label: 'machine learning', slug: 'machine-learning' } as KeywordTag,
        ],
      },
      trends: [],
      searchIntent: { supportingQueries: [] },
    } as SeoStrategy;

    // Act
    const result = await useCase.execute({
      seoStrategy,
      tenantId: 't1',
      projectId: 'p1',
      language: 'en',
    });

    // Assert
    expect(result).toEqual(mockCandidates);
    expect(mockTopicDiscovery.discoverCandidates).toHaveBeenCalledWith({
      seoKeywords: ['artificial intelligence', 'machine learning'],
      supportingQueries: undefined,
      language: 'en',
      tenantId: 't1',
      projectId: 'p1',
    });
  });

  it('should discover topics with keywords from trends only', async () => {
    // Arrange
    const mockCandidates: TopicCandidate[] = [];

    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockResolvedValue(mockCandidates),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: { tags: [] },
      trends: [
        { keyword: 'blockchain', searchVolume: 10000 } as TrendData,
        { keyword: 'cryptocurrency', searchVolume: 15000 } as TrendData,
      ],
      searchIntent: { supportingQueries: [] },
    } as SeoStrategy;

    // Act
    const result = await useCase.execute({
      seoStrategy,
      tenantId: 't1',
      projectId: 'p1',
      language: 'fr',
    });

    // Assert
    expect(result).toEqual(mockCandidates);
    expect(mockTopicDiscovery.discoverCandidates).toHaveBeenCalledWith({
      seoKeywords: ['blockchain', 'cryptocurrency'],
      supportingQueries: undefined,
      language: 'fr',
      tenantId: 't1',
      projectId: 'p1',
    });
  });

  it('should merge and deduplicate keywords from tags and trends', async () => {
    // Arrange
    const mockCandidates: TopicCandidate[] = [];

    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockResolvedValue(mockCandidates),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: {
        tags: [
          { label: 'seo', slug: 'seo' } as KeywordTag,
          { label: 'marketing', slug: 'marketing' } as KeywordTag,
        ],
      },
      trends: [
        { keyword: 'seo', searchVolume: 5000 } as TrendData, // duplicate
        { keyword: 'content', searchVolume: 8000 } as TrendData,
      ],
      searchIntent: { supportingQueries: [] },
    } as SeoStrategy;

    // Act
    await useCase.execute({
      seoStrategy,
      tenantId: 't1',
      projectId: 'p1',
      language: 'en',
    });

    // Assert
    const calledWith = vi.mocked(mockTopicDiscovery.discoverCandidates).mock.calls[0][0];
    expect(calledWith.seoKeywords).toHaveLength(3);
    expect(calledWith.seoKeywords).toContain('seo');
    expect(calledWith.seoKeywords).toContain('marketing');
    expect(calledWith.seoKeywords).toContain('content');
  });

  it('should include supportingQueries when available', async () => {
    // Arrange
    const mockCandidates: TopicCandidate[] = [];

    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockResolvedValue(mockCandidates),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: {
        tags: [{ label: 'react', slug: 'react' } as KeywordTag],
      },
      trends: [],
      searchIntent: {
        supportingQueries: [
          'How to learn React in 2024?',
          'Best React frameworks for beginners',
        ],
      },
    } as SeoStrategy;

    // Act
    await useCase.execute({
      seoStrategy,
      tenantId: 't1',
      projectId: 'p1',
      language: 'en',
    });

    // Assert
    expect(mockTopicDiscovery.discoverCandidates).toHaveBeenCalledWith({
      seoKeywords: ['react'],
      supportingQueries: ['How to learn React in 2024?', 'Best React frameworks for beginners'],
      language: 'en',
      tenantId: 't1',
      projectId: 'p1',
    });
  });

  it('should filter out empty or whitespace-only keywords', async () => {
    // Arrange
    const mockCandidates: TopicCandidate[] = [];

    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockResolvedValue(mockCandidates),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: {
        tags: [
          { label: 'valid keyword', slug: 'valid-keyword' } as KeywordTag,
          { label: '', slug: 'empty' } as KeywordTag, // empty
          { label: '   ', slug: 'spaces' } as KeywordTag, // whitespace
        ],
      },
      trends: [
        { keyword: 'valid trend', searchVolume: 1000 } as TrendData,
        { keyword: '', searchVolume: 2000 } as TrendData, // empty
      ],
      searchIntent: {
        supportingQueries: ['Valid query?', '', '   '], // mixed
      },
    } as SeoStrategy;

    // Act
    await useCase.execute({
      seoStrategy,
      tenantId: 't1',
      projectId: 'p1',
      language: 'en',
    });

    // Assert
    const calledWith = vi.mocked(mockTopicDiscovery.discoverCandidates).mock.calls[0][0];
    expect(calledWith.seoKeywords).toEqual(['valid keyword', 'valid trend']);
    expect(calledWith.supportingQueries).toEqual(['Valid query?']);
  });

  it('should propagate errors from topicDiscovery port', async () => {
    // Arrange
    const mockTopicDiscovery: TopicDiscoveryPort = {
      discoverCandidates: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
    };

    const useCase = new DiscoverTopicsUseCase(mockTopicDiscovery);

    const seoStrategy = {
      keywordPlan: {
        tags: [{ label: 'test', slug: 'test' } as KeywordTag],
      },
      trends: [],
      searchIntent: { supportingQueries: [] },
    } as SeoStrategy;

    // Act & Assert
    await expect(
      useCase.execute({
        seoStrategy,
        tenantId: 't1',
        projectId: 'p1',
        language: 'en',
      })
    ).rejects.toThrow('API rate limit exceeded');
  });
});
