import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { createWebTopicDiscoveryAgent, WebTopicDiscoveryAgent } from '../web-topic-discovery.agent';

// Mock TavilySearch
vi.mock('@langchain/tavily', () => ({
  TavilySearch: vi.fn().mockImplementation(() => ({
    invoke: vi.fn(),
  })),
}));

describe('WebTopicDiscoveryAgent', () => {
  let mockAITextModel: AITextModelPort;
  let agent: WebTopicDiscoveryAgent;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAITextModel = {
      generateText: vi.fn(),
    };

    agent = createWebTopicDiscoveryAgent(mockAITextModel, {
      tavilyApiKey: 'test-key',
      maxResults: 10,
      sources: ['reddit', 'github'],
      minScore: 0.7,
    });

    // Mock the webSearchTool property directly
    const mockTavilyTool = {
      invoke: vi.fn(),
    };
    // @ts-ignore - accessing private property for testing
    agent['webSearchTool'] = mockTavilyTool;
    // @ts-ignore - accessing private property for testing
    agent['webSearchKind'] = 'tavily';
  });

  describe('searchAndQualifyTopics', () => {
    it('should return empty array when no web search tool available', async () => {
      const agentWithoutSearch = createWebTopicDiscoveryAgent(mockAITextModel);
      
      const result = await agentWithoutSearch.searchAndQualifyTopics(['javascript'], 'en');
      
      expect(result).toEqual([]);
    });

    it('should handle search and qualification successfully', async () => {
      const mockWebResults = [
        {
          title: 'JavaScript Tutorial',
          url: 'https://reddit.com/r/javascript/post1',
          content: 'Learn JavaScript basics',
          published_date: '2024-01-01'
        }
      ];

      const mockQualifiedResponse = JSON.stringify({
        qualified: [
          {
            title: 'JavaScript Tutorial',
            url: 'https://reddit.com/r/javascript/post1',
            content: 'Learn JavaScript basics with examples',
            publishedDate: '2024-01-01',
            source: 'reddit.com',
            score: 0.85
          }
        ]
      });

      // Mock Tavily search result
      const mockTavilyTool = agent['webSearchTool'];
      if (mockTavilyTool && 'invoke' in mockTavilyTool) {
        vi.mocked(mockTavilyTool.invoke).mockResolvedValue(mockWebResults);
      }

      // Mock AI qualification
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockQualifiedResponse);

      const result = await agent.searchAndQualifyTopics(['javascript'], 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: 'JavaScript Tutorial',
        url: 'https://reddit.com/r/javascript/post1',
        source: 'reddit.com',
        score: 0.85
      });
    });

    it('should fail-fast on AI qualification errors (no fallback)', async () => {
      const mockWebResults = [
        {
          title: 'Python Guide',
          url: 'https://github.com/facebook/react/issues/123',
          content: 'Python best practices',
          published_date: '2024-01-01'
        }
      ];

      // Mock Tavily search result
      const mockTavilyTool = agent['webSearchTool'];
      if (mockTavilyTool && 'invoke' in mockTavilyTool) {
        vi.mocked(mockTavilyTool.invoke).mockResolvedValue(mockWebResults);
      }

      // Mock AI error - devrait propager l'erreur (fail-fast)
      vi.mocked(mockAITextModel.generateText).mockRejectedValue(new Error('AI Error'));

      // On s'attend à ce que l'erreur soit propagée
      await expect(agent.searchAndQualifyTopics(['python'], 'fr')).rejects.toThrow('AI Error');
    });

    it('should filter results by minimum score', async () => {
      const mockQualifiedResponse = JSON.stringify({
        qualified: [
          {
            title: 'High Quality Post',
            url: 'https://example.com/high',
            content: 'Excellent content',
            score: 0.9
          },
          {
            title: 'Low Quality Post', 
            url: 'https://example.com/low',
            content: 'Poor content',
            score: 0.5 // Below minScore of 0.7
          }
        ]
      });

      const mockTavilyTool = agent['webSearchTool'];
      if (mockTavilyTool && 'invoke' in mockTavilyTool) {
        vi.mocked(mockTavilyTool.invoke).mockResolvedValue([{}]);
      }

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockQualifiedResponse);

      const result = await agent.searchAndQualifyTopics(['test'], 'en');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('High Quality Post');
    });
  });

  describe('buildSearchQueries', () => {
    it('should return direct keyword for generalist search', () => {
      const queries = agent['buildSearchQueries']('javascript', 'en');

      expect(queries).toEqual(['javascript']);
    });

    it('should use keyword as-is without language decoration', () => {
      const queries = agent['buildSearchQueries']('react', 'fr');

      expect(queries).toEqual(['react']);
    });
  });

  describe('deduplicateAndSort', () => {
    it('should remove duplicates and sort by score', () => {
      const results = [
        { title: 'Post 1', url: 'https://example.com/1', content: '', score: 0.8 },
        { title: 'Post 2', url: 'https://example.com/2', content: '', score: 0.9 },
        { title: 'Duplicate', url: 'https://example.com/1', content: '', score: 0.7 }, // duplicate URL
        { title: 'Post 3', url: 'https://example.com/3', content: '', score: 0.6 },
      ];

      const deduplicated = agent['deduplicateAndSort'](results);

      expect(deduplicated).toHaveLength(3);
      expect(deduplicated[0].score).toBe(0.9); // highest score first
      expect(deduplicated[1].score).toBe(0.8);
      expect(deduplicated[2].score).toBe(0.6);
    });
  });

  describe('tool interface', () => {
    it('should handle valid JSON input', async () => {
      const input = JSON.stringify({
        keywords: ['typescript'],
        language: 'en',
        sources: ['reddit']
      });

      const mockQualifiedResponse = JSON.stringify({
        qualified: []
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockQualifiedResponse);

      const result = await agent._call(input);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('results');
    });

    it('should handle invalid input gracefully', async () => {
      const result = await agent._call('invalid json');
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success', false);
      expect(parsed).toHaveProperty('error');
    });

    it('should require non-empty keywords', async () => {
      const input = JSON.stringify({
        keywords: [],
        language: 'en'
      });

      const result = await agent._call(input);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success', false);
      expect(parsed.error).toContain('Keywords requis');
    });
  });
});
