import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort, PromptTemplatePort } from '@casys/application';
import type { SeoBriefDataV3, TopicCluster } from '@casys/core';

import { createEditorialBriefAgent } from '../editorial-brief.agent';

describe('EditorialBriefAgent', () => {
  let mockAITextModel: AITextModelPort;
  let mockTemplateReader: PromptTemplatePort;

  beforeEach(() => {
    mockAITextModel = {
      generateText: vi.fn(),
    };
    mockTemplateReader = {
      loadTemplate: vi.fn(),
    };
  });

  const createMockParams = () => ({
    angle: 'Guide pratique pour débutants en SEO',
    contentType: 'how-to-guide',
    selectionMode: 'new',
    targetPersona: undefined,
    chosenCluster: {
      pillarTag: {
        label: 'seo basics',
        slug: 'seo-basics',
        source: 'pillar' as const,
        searchVolume: 5000,
        difficulty: 45,
      },
      satelliteTags: [
        {
          label: 'keyword research',
          slug: 'keyword-research',
          source: 'pillar' as const,
          searchVolume: 3000,
          difficulty: 40,
        },
      ],
    } as TopicCluster,
    seoBriefData: {
      keywordTags: [
        {
          label: 'seo basics',
          slug: 'seo-basics',
          source: 'pillar' as const,
          searchVolume: 5000,
          difficulty: 45,
        },
      ],
      searchIntent: {
        intent: 'informational',
        confidence: 0.9,
        supportingQueries: ['What is SEO?', 'How to start with SEO?'],
      },
      contentStrategy: {
        recommendations: {
          seo: ['Use H1 tags properly'],
          editorial: ['Add practical examples'],
          technical: ['Implement structured data'],
        },
      },
      competitiveAnalysis: {
        contentGaps: [
          { keyword: 'technical seo', gap: 'Missing technical details', priority: 8 },
        ],
        competitorTitles: ['SEO Guide for Beginners', 'Learn SEO in 30 Days'],
      },
    } as SeoBriefDataV3,
    businessContext: {
      industry: 'Digital Marketing',
      targetAudience: 'Small business owners',
      businessDescription: 'SEO tools and training',
    },
    selectedTopics: [
      {
        id: 'topic-1',
        title: 'Understanding Search Engines',
        sourceUrl: 'https://example.com/article1',
        createdAt: '2024-01-01T00:00:00Z',
        language: 'en',
      },
    ],
    sourceArticles: [
      {
        title: 'SEO Fundamentals',
        summary:
          'This article covers the fundamental concepts of search engine optimization...',
        url: 'https://example.com/article1',
      },
    ],
    language: 'en',
  });

  describe('generateBrief', () => {
    it('should successfully generate editorial brief from valid input', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      // Mock template loading
      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue(
        '<poml>Mock template</poml>'
      );

      // Mock AI response
      const mockAIResponse = JSON.stringify({
        keywordTags: [
          { label: 'seo basics', slug: 'seo-basics', source: 'pillar' },
          { label: 'keyword research', slug: 'keyword-research', source: 'pillar' },
          { label: 'on-page seo', slug: 'on-page-seo', source: 'opportunity' },
        ],
        relevantQuestions: [
          'What is SEO?',
          'How to start with SEO?',
          'What are SEO best practices?',
        ],
        priorityGaps: [
          { keyword: 'technical seo', gap: 'Missing technical details', priority: 8 },
          { keyword: 'local seo', gap: 'No local optimization tips', priority: 7 },
        ],
        guidingRecommendations: {
          seo: ['Use H1 tags properly', 'Optimize meta descriptions'],
          editorial: ['Add practical examples', 'Include case studies'],
          technical: ['Implement structured data'],
        },
        corpusSummary:
          'The corpus covers fundamental SEO concepts and practical implementation strategies.',
        competitorAngles: [
          'Beginner-friendly approach',
          'Step-by-step tutorial format',
          'Tool-based methodology',
        ],
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      // Assertions
      expect(result.keywordTags).toHaveLength(3);
      expect(result.keywordTags[0].label).toBe('seo basics');
      expect(result.keywordTags[0].source).toBe('pillar');

      expect(result.relevantQuestions).toHaveLength(3);
      expect(result.relevantQuestions[0]).toBe('What is SEO?');

      expect(result.priorityGaps).toHaveLength(2);
      expect(result.priorityGaps[0].keyword).toBe('technical seo');
      expect(result.priorityGaps[0].priority).toBe(8);

      expect(result.guidingRecommendations.seo).toContain('Use H1 tags properly');
      expect(result.guidingRecommendations.editorial).toContain('Add practical examples');

      expect(result.corpusSummary).toBeTruthy();
      expect(result.corpusSummary.length).toBeGreaterThan(10);

      expect(result.competitorAngles).toHaveLength(3);
    });

    it('should load template with correct path', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(
        JSON.stringify({
          keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
          relevantQuestions: ['Q1'],
          priorityGaps: [],
          guidingRecommendations: { seo: [], editorial: [], technical: [] },
          corpusSummary: 'Summary',
        })
      );

      const params = createMockParams();
      await agent.generateBrief(params);

      expect(mockTemplateReader.loadTemplate).toHaveBeenCalledWith('prompts/editorial-brief.poml');
    });

    it('should limit keywords to max 10', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      // Mock AI response with 15 keywords
      const mockAIResponse = JSON.stringify({
        keywordTags: Array.from({ length: 15 }, (_, i) => ({
          label: `keyword ${i + 1}`,
          slug: `keyword-${i + 1}`,
          source: 'opportunity',
        })),
        relevantQuestions: ['Q1'],
        priorityGaps: [],
        guidingRecommendations: { seo: [], editorial: [], technical: [] },
        corpusSummary: 'Summary',
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      expect(result.keywordTags).toHaveLength(10); // Should be limited to 10
    });

    it('should limit questions to max 5', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      // Mock AI response with 8 questions
      const mockAIResponse = JSON.stringify({
        keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        relevantQuestions: Array.from({ length: 8 }, (_, i) => `Question ${i + 1}`),
        priorityGaps: [],
        guidingRecommendations: { seo: [], editorial: [], technical: [] },
        corpusSummary: 'Summary',
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      expect(result.relevantQuestions).toHaveLength(5); // Should be limited to 5
    });

    it('should limit priority gaps to max 3', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      // Mock AI response with 6 gaps
      const mockAIResponse = JSON.stringify({
        keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        relevantQuestions: ['Q1'],
        priorityGaps: Array.from({ length: 6 }, (_, i) => ({
          keyword: `gap ${i + 1}`,
          gap: `Description ${i + 1}`,
          priority: 10 - i,
        })),
        guidingRecommendations: { seo: [], editorial: [], technical: [] },
        corpusSummary: 'Summary',
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      expect(result.priorityGaps).toHaveLength(3); // Should be limited to 3
    });

    it('should throw error if keywordTags is empty', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      const mockAIResponse = JSON.stringify({
        keywordTags: [], // Empty!
        relevantQuestions: ['Q1'],
        priorityGaps: [],
        guidingRecommendations: { seo: [], editorial: [], technical: [] },
        corpusSummary: 'Summary',
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();

      await expect(agent.generateBrief(params)).rejects.toThrow('keywordTags cannot be empty');
    });

    it('should throw error if corpusSummary is empty', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      const mockAIResponse = JSON.stringify({
        keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        relevantQuestions: ['Q1'],
        priorityGaps: [],
        guidingRecommendations: { seo: [], editorial: [], technical: [] },
        corpusSummary: '', // Empty!
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();

      await expect(agent.generateBrief(params)).rejects.toThrow('corpusSummary is required');
    });

    it('should throw error if AI returns no JSON', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');
      vi.mocked(mockAITextModel.generateText).mockResolvedValue('This is plain text, no JSON');

      const params = createMockParams();

      await expect(agent.generateBrief(params)).rejects.toThrow('No JSON found in model response');
    });

    it('should throw error if AI returns invalid JSON', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');
      vi.mocked(mockAITextModel.generateText).mockResolvedValue('{ invalid json }');

      const params = createMockParams();

      await expect(agent.generateBrief(params)).rejects.toThrow(
        'Invalid JSON in model response'
      );
    });

    it('should handle AI model errors gracefully', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');
      vi.mocked(mockAITextModel.generateText).mockRejectedValue(
        new Error('AI service unavailable')
      );

      const params = createMockParams();

      await expect(agent.generateBrief(params)).rejects.toThrow('AI service unavailable');
    });

    it('should fill default values for missing optional fields', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      // Mock AI response with minimal data
      const mockAIResponse = JSON.stringify({
        keywordTags: [
          { label: 'test keyword', slug: 'test-keyword' }, // Missing source
        ],
        relevantQuestions: [],
        priorityGaps: [],
        guidingRecommendations: {},
        corpusSummary: 'Summary',
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      // Should fill defaults
      expect(result.keywordTags[0].source).toBe('opportunity');
      expect(result.keywordTags[0].searchVolume).toBe(0);
      expect(result.keywordTags[0].difficulty).toBe(0);
      expect(result.keywordTags[0].priority).toBe(0);

      expect(result.guidingRecommendations.seo).toEqual([]);
      expect(result.guidingRecommendations.editorial).toEqual([]);
      expect(result.guidingRecommendations.technical).toEqual([]);

      expect(result.competitorAngles).toEqual([]);
    });

    it('should sanitize and trim all string values', async () => {
      const agent = createEditorialBriefAgent(mockAITextModel, mockTemplateReader);

      vi.mocked(mockTemplateReader.loadTemplate).mockResolvedValue('<poml>Template</poml>');

      const mockAIResponse = JSON.stringify({
        keywordTags: [
          { label: '  test keyword  ', slug: '  Test-Keyword  ', source: 'opportunity' },
        ],
        relevantQuestions: ['  Question 1  ', '', '  Question 2  '],
        priorityGaps: [
          { keyword: '  gap keyword  ', gap: '  Gap description  ', priority: 8 },
        ],
        guidingRecommendations: {
          seo: ['  Recommendation 1  ', '', '  Recommendation 2  '],
          editorial: [],
          technical: [],
        },
        corpusSummary: '  Summary text  ',
        competitorAngles: ['  Angle 1  ', '', '  Angle 2  '],
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);

      const params = createMockParams();
      const result = await agent.generateBrief(params);

      // Should trim and sanitize
      expect(result.keywordTags[0].label).toBe('test keyword');
      expect(result.keywordTags[0].slug).toBe('test-keyword'); // lowercase

      expect(result.relevantQuestions).toHaveLength(2); // Empty strings filtered
      expect(result.relevantQuestions[0]).toBe('Question 1');

      expect(result.priorityGaps[0].keyword).toBe('gap keyword');
      expect(result.priorityGaps[0].gap).toBe('Gap description');

      expect(result.guidingRecommendations.seo).toHaveLength(2);
      expect(result.guidingRecommendations.seo[0]).toBe('Recommendation 1');

      expect(result.corpusSummary).toBe('Summary text');

      expect(result.competitorAngles).toHaveLength(2);
      expect(result.competitorAngles![0]).toBe('Angle 1');
    });
  });
});
