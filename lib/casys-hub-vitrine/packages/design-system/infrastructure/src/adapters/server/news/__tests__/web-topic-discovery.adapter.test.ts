import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicFetchQuery } from '@casys/core';
import type { TrendAnalysisOptions } from '@casys/application';

import { WebTopicDiscoveryAdapter } from '../web-topic-discovery.adapter';
import type { WebTopicDiscoveryAgent, WebSearchResult } from '../../ai/agents/web-topic-discovery.agent';

describe('WebTopicDiscoveryAdapter', () => {
  let adapter: WebTopicDiscoveryAdapter;
  let mockAgent: WebTopicDiscoveryAgent;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent with proper interface
    mockAgent = {
      invoke: vi.fn(),
      searchAndQualifyTopics: vi.fn(),
      name: 'web_topic_discovery',
      description: 'Mock agent',
    } as any;

    adapter = new WebTopicDiscoveryAdapter(mockAgent);
  });

  describe('discoverCandidates', () => {
    const baseQuery: TopicFetchQuery = {
      seoKeywords: ['javascript', 'react'],
      language: 'en',
      limit: 10
    };

    it('should return empty array when no keywords provided', async () => {
      const query = { ...baseQuery, seoKeywords: undefined };

      const result = await adapter.discoverCandidates(query);

      expect(result).toEqual([]);
    });

    it('should return empty array when empty keywords provided', async () => {
      const query = { ...baseQuery, seoKeywords: [] };

      const result = await adapter.discoverCandidates(query);

      expect(result).toEqual([]);
    });

    it('should transform web search results to TopicCandidate', async () => {
      const mockAgentResponse = JSON.stringify({
        success: true,
        results: [
          {
            title: 'React Best Practices',
            url: 'https://reddit.com/r/reactjs/post1',
            content: 'Learn React best practices for modern development. This comprehensive guide covers hooks, state management, and performance optimization.',
            publishedDate: '2024-01-15T10:00:00Z',
            source: 'reddit.com',
            score: 0.85
          },
          {
            title: 'JavaScript ES2024 Features',
            url: 'https://github.com/tc39/proposals/issues/123',
            content: 'New JavaScript features coming in ES2024',
            publishedDate: '2024-01-10T15:30:00Z',
            source: 'github.com',
            score: 0.9
          }
        ]
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const result = await adapter.discoverCandidates(baseQuery);

      expect(result).toHaveLength(2);

      // First result
      expect(result[0]).toMatchObject({
        title: 'React Best Practices',
        sourceUrl: 'https://reddit.com/r/reactjs/post1',
        sourceTitle: 'reddit.com',
        language: 'en',
        relevanceScore: 0.85,
        categories: expect.arrayContaining(['web', 'discussion', 'community']),
      });
      expect(result[0].description).toContain('Learn React best practices');
      expect(result[0].metadata?.source).toBe('web-agent');
      expect(result[0].metadata?.webAgentScore).toBe(0.85);

      // Second result
      expect(result[1]).toMatchObject({
        title: 'JavaScript ES2024 Features',
        sourceUrl: 'https://github.com/tc39/proposals/issues/123',
        sourceTitle: 'github.com',
        categories: expect.arrayContaining(['web', 'development', 'opensource']),
      });
    });

    it('should handle agent failures gracefully', async () => {
      const mockAgentResponse = JSON.stringify({
        success: false,
        error: 'API Error',
        results: []
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const result = await adapter.discoverCandidates(baseQuery);

      expect(result).toEqual([]);
    });

    it('should handle malformed agent response', async () => {
      vi.mocked(mockAgent.invoke).mockResolvedValue('invalid json');

      const result = await adapter.discoverCandidates(baseQuery);

      expect(result).toEqual([]);
    });

    it('should filter invalid candidates', async () => {
      const mockAgentResponse = JSON.stringify({
        success: true,
        results: [
          {
            title: 'Valid Post with Long Title',
            url: 'https://example.com/valid',
            content: 'This is a valid post with enough content',
            score: 0.8
          },
          {
            title: 'Short', // Too short title
            url: 'https://example.com/short',
            content: 'Short',
            score: 0.9
          },
          {
            title: 'Invalid URL Post',
            url: 'not-a-url', // Invalid URL
            content: 'This post has invalid URL',
            score: 0.7
          },
          {
            title: 'Low Score Post',
            url: 'https://example.com/low',
            content: 'This post has too low relevance score',
            score: 0.3 // Below 0.5 threshold - should be filtered out
          }
        ]
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const result = await adapter.discoverCandidates(baseQuery);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid Post with Long Title');
    });

    it('should respect maxTopics option', async () => {
      const mockAgentResponse = JSON.stringify({
        success: true,
        results: Array.from({ length: 10 }, (_, i) => ({
          title: `Post Number ${i + 1} with Long Title`,
          url: `https://example.com/${i + 1}`,
          content: `Content for post ${i + 1}`,
          score: 0.8
        }))
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const options: Partial<TrendAnalysisOptions> = { maxTopics: 3 };
      const result = await adapter.discoverCandidates(baseQuery, options);

      expect(result).toHaveLength(3);
    });

    it('should pass keywords and language to agent', async () => {
      const mockAgentResponse = JSON.stringify({
        success: true,
        results: []
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      await adapter.discoverCandidates(baseQuery);

      const callArg = vi.mocked(mockAgent.invoke).mock.calls[0][0];
      const parsedArg = JSON.parse(callArg);

      expect(parsedArg.keywords).toEqual(['javascript', 'react']);
      expect(parsedArg.language).toBe('en');
    });
  });

  describe('webResultToTopicCandidate', () => {
    it('should extract images from content', async () => {
      const mockResult: WebSearchResult = {
        title: 'Post with images',
        url: 'https://example.com/post',
        content: 'Here is an image https://example.com/image1.jpg and another https://example.com/image2.png',
        score: 0.8
      };

      const mockAgentResponse = JSON.stringify({
        success: true,
        results: [mockResult]
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const result = await adapter.discoverCandidates({
        seoKeywords: ['test'],
        language: 'en'
      });

      expect(result[0].imageUrls).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.png'
      ]);
    });

    it('should categorize by source correctly', async () => {
      const testCases = [
        { source: 'reddit.com', expectedCategories: ['web', 'discussion', 'community'] },
        { source: 'github.com', expectedCategories: ['web', 'development', 'opensource'] },
        { source: 'stackoverflow.com', expectedCategories: ['web', 'qa', 'technical'] },
        { source: 'medium.com', expectedCategories: ['web', 'blog', 'article'] },
        { source: 'unknown.com', expectedCategories: ['web', 'blog'] }
      ];

      for (const testCase of testCases) {
        const mockAgentResponse = JSON.stringify({
          success: true,
          results: [{
            title: 'Test Post with Long Title',
            url: 'https://example.com/test',
            content: 'Test content',
            source: testCase.source,
            score: 0.8
          }]
        });

        vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

        const result = await adapter.discoverCandidates({
          seoKeywords: ['test'],
          language: 'en'
        });

        expect(result[0].categories).toEqual(testCase.expectedCategories);

        vi.clearAllMocks();
      }
    });

    it('should generate proper description from content', async () => {
      const mockAgentResponse = JSON.stringify({
        success: true,
        results: [{
          title: 'Test Post with Long Title',
          url: 'https://example.com/test',
          content: 'This is a very long content that should be truncated properly. '.repeat(20),
          score: 0.8
        }]
      });

      vi.mocked(mockAgent.invoke).mockResolvedValue(mockAgentResponse);

      const result = await adapter.discoverCandidates({
        seoKeywords: ['test'],
        language: 'en'
      });

      expect(result[0].description?.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(result[0].description).toMatch(/\.{3}$/); // ends with "..."
    });
  });
});
