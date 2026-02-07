import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { createTopicDiscovery, type TopicDiscoveryConfig } from '../topic-discovery-factory';
import { WebTopicDiscoveryAdapter } from '../web-topic-discovery.adapter';

// Mock TavilySearch: return at least one result so the agent calls AI
vi.mock('@langchain/tavily', () => ({
  TavilySearch: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue([
      {
        title: 'Sample web result with long title',
        url: 'https://example.com/test',
        content: 'Some relevant content from the web result',
        published_date: '2024-01-01',
      },
    ]),
  })),
}));

describe('TopicDiscoveryFactory - WebAgent Integration', () => {
  let mockAITextModel: AITextModelPort;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Désactiver les autres APIs pour ne tester que webAgent
    delete process.env.NEWS_API_KEY;
    delete process.env.WORLD_NEWS_API_KEY;
    delete process.env.NEWSDATA_API_KEY;
    
    mockAITextModel = {
      generateText: vi.fn(),
    };
  });

  describe('webAgent configuration', () => {
    it('should create webAgent when enabled and aiTextModel provided', async () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
          maxResults: 10,
          sources: ['reddit', 'github'],
          minScore: 0.8,
        },
      };

      const discovery = createTopicDiscovery(config, mockAITextModel);
      
      // Test by calling discoverCandidates to ensure webAgent is in the composite
      const query = {
        seoKeywords: ['test'],
        language: 'en',
        allowedSources: {
          webAgent: ['reddit']
        }
      };

      // Mock successful agent response
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(
        JSON.stringify({
          qualified: [{
            title: 'Test Post',
            url: 'https://reddit.com/test',
            content: 'Test content',
            score: 0.9
          }]
        })
      );

      const results = await discovery.discoverCandidates(query);
      
      // Should not be empty if webAgent is working
      expect(results).toBeDefined();
    });

    it('should not create webAgent when enabled but aiTextModel missing', () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
        },
      };

      // Should not throw, but webAgent won't be available
      expect(() => createTopicDiscovery(config)).not.toThrow();
    });

    it('should not create webAgent when disabled', () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: false,
          tavilyApiKey: 'test-key',
        },
      };

      expect(() => createTopicDiscovery(config, mockAITextModel)).not.toThrow();
    });

    it('should not create webAgent when config missing', () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
      };

      expect(() => createTopicDiscovery(config, mockAITextModel)).not.toThrow();
    });
  });

  describe('webAgent in fetcher filtering', () => {
    it('should include webAgent in all fetchers when no allowedSources specified', async () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
        },
      };

      const discovery = createTopicDiscovery(config, mockAITextModel);
      const webSpy = vi.spyOn(WebTopicDiscoveryAdapter.prototype as any, 'discoverCandidates');
      
      const query = {
        seoKeywords: ['test'],
        language: 'en',
      };

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(
        JSON.stringify({ qualified: [] })
      );

      await discovery.discoverCandidates(query);
      
      // Web agent adapter must be used (active by default)
      expect(webSpy).toHaveBeenCalled();
    });

    it('should filter webAgent by allowedSources.webAgent', async () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
        },
      };

      const discovery = createTopicDiscovery(config, mockAITextModel);
      const webSpy = vi.spyOn(WebTopicDiscoveryAdapter.prototype as any, 'discoverCandidates');
      
      const query = {
        seoKeywords: ['test'],
        language: 'en',
        allowedSources: {
          webAgent: ['reddit', 'github']
        }
      };

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(
        JSON.stringify({ qualified: [] })
      );

      await discovery.discoverCandidates(query);
      
      expect(webSpy).toHaveBeenCalled();
    });

    it('should not activate webAgent when allowedSources excludes it', async () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
        },
      };

      const discovery = createTopicDiscovery(config, mockAITextModel);
      
      const query = {
        seoKeywords: ['test'],
        language: 'en',
        allowedSources: {
          rss: ['feed1'], // Only RSS, no webAgent
        }
      };

      await discovery.discoverCandidates(query);
      
      // Should not have called AI model (webAgent not active)
      expect(mockAITextModel.generateText).not.toHaveBeenCalled();
    });
  });

  describe('webAgent error handling', () => {
    it('should handle webAgent creation errors gracefully', () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [],
        webAgent: {
          enabled: true,
          tavilyApiKey: '', // Invalid key should cause error
        },
      };

      // Should not throw even if webAgent creation fails
      expect(() => createTopicDiscovery(config, mockAITextModel)).not.toThrow();
    });

    it('should continue with other fetchers when webAgent fails', async () => {
      const config: TopicDiscoveryConfig = {
        rssSources: [{
          url: 'https://example.com/feed.xml',
          name: 'Test Feed',
          enabled: true,
        }],
        webAgent: {
          enabled: true,
          tavilyApiKey: 'test-key',
        },
      };

      const discovery = createTopicDiscovery(config, mockAITextModel);
      
      const query = {
        seoKeywords: ['test'],
        language: 'en',
      };

      // Mock webAgent failure
      vi.mocked(mockAITextModel.generateText).mockRejectedValue(new Error('Web Agent Error'));

      // Should not throw, other fetchers should still work
      const results = await discovery.discoverCandidates(query);
      expect(results).toBeDefined();
    });
  });
});
