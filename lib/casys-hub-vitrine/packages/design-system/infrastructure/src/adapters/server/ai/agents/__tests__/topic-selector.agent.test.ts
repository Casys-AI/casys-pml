import { Tool } from '@langchain/core/tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { createTopicSelectorAgent, TopicSelectorAgent } from '../topic-selector.agent';

describe('TopicSelectorAgent', () => {
  let mockAITextModel: AITextModelPort;
  let agent: TopicSelectorAgent;

  const testDate = new Date('2025-06-24T00:00:00Z');

  const mockArticles = [
    {
      id: '1',
      title: 'Test Article 1',
      description: 'Summary 1',
      sourceUrl: 'https://example.com/1',
      sourceTitle: 'Test Source',
      publishedAt: testDate,
      relevanceScore: 0.9,
      categories: ['technology', 'ai'],
    },
    {
      id: '2',
      title: 'Test Article 2',
      description: 'Summary 2',
      sourceUrl: 'https://example.com/2',
      sourceTitle: 'Test Source',
      publishedAt: testDate,
      relevanceScore: 0.8,
      categories: ['science', 'research'],
    },
  ];

  const _mockSelectedTopic = {
    id: '1',
    title: 'Test Article 1',
    url: 'https://example.com/1',
    summary: 'Summary of test article 1',
    relevanceScore: 0.9,
    keywords: ['technology', 'ai'],
    createdAt: testDate.toISOString(),
    updatedAt: testDate.toISOString(),
    metadata: {
      hasTrendingKeyword: true,
      matchesUserInterests: true,
    },
  };

  beforeEach(() => {
    mockAITextModel = {
      generateText: vi.fn(),
    } as any;

    agent = new TopicSelectorAgent(mockAITextModel);
    vi.clearAllMocks();
  });

  it('should be an instance of Tool', () => {
    expect(agent).toBeInstanceOf(Tool);
  });

  it('should have the correct name and description', () => {
    expect(agent.name).toBe('topic_selector');
    expect(agent.description).toContain('POML');
    expect(agent.description).toContain('texte brut');
  });

  describe('_call', () => {
    it('should forward POML to the AI model and return raw text', async () => {
      const inputPOML = `<prompt>
  <system>Tu es un assistant pour sélectionner des sujets</system>
  <user>Articles: ${mockArticles.map(a => a.title).join(', ')}</user>
</prompt>`;

      const mockAIResponse = 'RAW_MODEL_TEXT_OUTPUT';
      (mockAITextModel.generateText as any).mockResolvedValue(mockAIResponse);

      const result = await agent.invoke(inputPOML);

      expect(result).toBe(mockAIResponse);
      expect(mockAITextModel.generateText).toHaveBeenCalledWith(inputPOML);
    });

    it('should failfast on empty or whitespace input', async () => {
      await expect(agent.invoke('')).rejects.toThrow('TopicSelectorAgent: prompt POML requis');
      await expect(agent.invoke('   ')).rejects.toThrow('TopicSelectorAgent: prompt POML requis');
    });

    it('should throw an error when AI model fails', async () => {
      // Simuler une erreur du modèle IA
      (mockAITextModel.generateText as any).mockRejectedValue(new Error('AI Model Error'));

      const input = JSON.stringify({
        articles: mockArticles,
        options: { maxTopics: 1 },
      });

      await expect(agent.invoke(input)).rejects.toThrow('AI Model Error');
    });

    // Pas de parsing structuré ici: l'agent renvoie le texte brut du modèle
  });

  describe('createTopicSelectorAgent', () => {
    it('should create a new instance of TopicSelectorAgent', () => {
      const newAgent = createTopicSelectorAgent(mockAITextModel);
      expect(newAgent).toBeInstanceOf(TopicSelectorAgent);
    });
  });
});
