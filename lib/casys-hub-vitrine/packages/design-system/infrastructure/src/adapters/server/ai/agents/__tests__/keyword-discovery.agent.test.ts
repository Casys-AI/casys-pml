import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Domain } from '@casys/core';
import type { AITextModelPort, PageContent } from '@casys/application';
import { KeywordDiscoveryAgent } from '../keyword-discovery.agent';

describe('KeywordDiscoveryAgent', () => {
  let agent: KeywordDiscoveryAgent;
  let mockAIModel: AITextModelPort;

  beforeEach(() => {
    mockAIModel = {
      generateText: vi.fn(),
    };
    agent = new KeywordDiscoveryAgent(mockAIModel);
  });

  describe('discoverKeywords', () => {
    it('should parse JSONL response and return KeywordTagDTO array (AI-only)', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Example Site',
          description: 'Marketing automation platform',
          content: 'We provide marketing automation tools and email campaigns.',
          language: 'en',
        },
      ];
      const rankedKeywords = [
        { keyword: 'marketing automation', position: 5, searchVolume: 1200 },
      ];

      // Mock AI response (JSONL format)
      const mockResponse = `{"keyword":"marketing automation","category":"service","description":"Automated marketing workflows","intent":"transactional","relatedKeywords":["email-marketing","crm"],"relevance":9,"priority":8}
{"keyword":"email campaigns","category":"feature","description":"Send targeted emails","intent":"transactional","relatedKeywords":["marketing-automation"],"relevance":8,"priority":7}
{"keyword":"marketing ROI","category":"benefit","description":"Measure return on investment","intent":"informational","relatedKeywords":["analytics"],"relevance":7,"priority":6}`;

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.discoverKeywords(
        domain,
        {
          pages,
          rankedKeywords,
          businessContext: {},
        },
        'en'
      );

      // Assert
      expect(mockAIModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('<poml version="1.0">')
      );
      expect(mockAIModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('marketing automation')
      );

      expect(result).toHaveLength(3);

      // First keyword
      expect(result[0].label).toBe('marketing automation');
      expect(result[0].slug).toBe('marketing-automation');
      expect(result[0].source).toBe('ai'); // AI-only (pas encore enrichi avec DataForSEO)
      expect(result[0].sources).toEqual(['ai']);
      expect(result[0].priority).toBe(8);
      expect(result[0].weight).toBe(0.9); // relevance 9 → 0.9
      expect(result[0].aiEnrichment).toBeDefined();
      expect(result[0].aiEnrichment?.category?.type).toBe('service');
      expect(result[0].aiEnrichment?.description?.text).toBe('Automated marketing workflows');
      expect(result[0].aiEnrichment?.intent?.type).toBe('transactional');
      expect(result[0].aiEnrichment?.relatedKeywords).toHaveLength(2);
      expect(result[0].createdAt).toBeDefined();

      // Second keyword
      expect(result[1].label).toBe('email campaigns');
      expect(result[1].slug).toBe('email-campaigns');
      expect(result[1].priority).toBe(7);
      expect(result[1].weight).toBe(0.8); // relevance 8 → 0.8

      // Third keyword
      expect(result[2].label).toBe('marketing ROI');
      expect(result[2].aiEnrichment?.intent?.type).toBe('informational');
    });

    it('should handle JSONL wrapped in markdown code blocks', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];

      // Mock AI response with markdown code blocks
      const mockResponse = `\`\`\`jsonl
{"keyword":"seo tools","category":"product","description":"SEO software","intent":"transactional","relatedKeywords":[],"relevance":9,"priority":8}
\`\`\``;

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords: [], businessContext: {} },
        'en'
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('seo tools');
    });

    it('should skip invalid JSON lines and continue parsing', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];

      // Mock AI response with one invalid line
      const mockResponse = `{"keyword":"valid keyword 1","category":"service","description":"Valid","intent":"informational","relatedKeywords":[],"relevance":8,"priority":7}
this is not valid json
{"keyword":"valid keyword 2","category":"product","description":"Also valid","intent":"transactional","relatedKeywords":[],"relevance":9,"priority":8}`;

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords: [], businessContext: {} },
        'en'
      );

      // Assert
      expect(result).toHaveLength(2); // Should skip invalid line
      expect(result[0].label).toBe('valid keyword 1');
      expect(result[1].label).toBe('valid keyword 2');
    });

    it('should skip keywords with missing or empty "keyword" field', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];

      // Mock AI response with invalid keywords
      const mockResponse = `{"keyword":"","category":"service","description":"Empty keyword","intent":"informational","relatedKeywords":[],"relevance":8,"priority":7}
{"category":"product","description":"Missing keyword field","intent":"transactional","relatedKeywords":[],"relevance":9,"priority":8}
{"keyword":"valid keyword","category":"service","description":"Valid","intent":"informational","relatedKeywords":[],"relevance":8,"priority":7}`;

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords: [], businessContext: {} },
        'en'
      );

      // Assert
      expect(result).toHaveLength(1); // Only the valid keyword
      expect(result[0].label).toBe('valid keyword');
    });

    it('should handle empty AI response gracefully', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];

      vi.mocked(mockAIModel.generateText).mockResolvedValue('');

      // Act
      const result = await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords: [], businessContext: {} },
        'en'
      );

      // Assert
      expect(result).toEqual([]);
    });

    it('should use default values for missing optional fields', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];

      // Mock AI response without optional fields
      const mockResponse = `{"keyword":"minimal keyword","relevance":5,"priority":5}`;

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords: [], businessContext: {} },
        'en'
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('minimal keyword');
      expect(result[0].priority).toBe(5);
      expect(result[0].weight).toBe(0.5); // relevance 5 → 0.5
      expect(result[0].aiEnrichment).toBeUndefined(); // Pas d'enrichissement car tous les champs optionnels absents
    });

    it('should include ranked keywords in the prompt for AI context', async () => {
      // Arrange
      const domain = Domain.create('example.com');
      const pages: PageContent[] = [
        {
          url: 'https://example.com',
          title: 'Test',
          description: 'Test',
          content: 'Test content',
          language: 'en',
        },
      ];
      const rankedKeywords = [
        { keyword: 'marketing automation', position: 5, searchVolume: 1200 },
        { keyword: 'email campaigns', position: 12, searchVolume: 800 },
      ];

      vi.mocked(mockAIModel.generateText).mockResolvedValue(
        '{"keyword":"test","relevance":5,"priority":5}'
      );

      // Act
      await agent.discoverKeywords(
        domain,
        { pages, rankedKeywords, businessContext: {} },
        'en'
      );

      // Assert
      const promptArg = vi.mocked(mockAIModel.generateText).mock.calls[0][0];
      expect(promptArg).toContain('marketing automation');
      expect(promptArg).toContain('vol: 1200');
      expect(promptArg).toContain('pos: 5');
      expect(promptArg).toContain('<ranked_keywords>');
    });
  });
});
