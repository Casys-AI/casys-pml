import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { SectionWriterAgent } from '../section-writer.agent';

describe('SectionWriterAgent', () => {
  let agent: SectionWriterAgent;
  let mockAITextModel: AITextModelPort;

  beforeEach(() => {
    mockAITextModel = {
      generateText: vi.fn(),
    };
    agent = new SectionWriterAgent(mockAITextModel);
  });

  describe('Tool interface', () => {
    it('should have correct name and description', () => {
      expect(agent.name).toBe('section_writer');
      expect(agent.description).toContain("section d'article");
    });
  });

  describe('Input validation', () => {
    it('should reject empty POML prompt', async () => {
      await expect(agent._call('')).rejects.toThrow('prompt POML requis');
    });

    it('should accept valid POML and forward response', async () => {
      const mockResponse = JSON.stringify({
        content: 'Generated content',
        reasoning: 'Test reasoning',
        suggestions: ['suggestion 1'],
        confidence: 0.9,
        metadata: {
          estimatedReadTime: 2,
          keyTopics: ['test'],
          componentsUsed: [],
        },
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      const poml = '<poml><user>Generate section</user></poml>';
      const result = await agent._call(poml);
      const parsed = JSON.parse(result);

      expect(parsed.content).toBe('Generated content');
      expect(parsed.confidence).toBe(0.9);
    });
  });

  describe('Section generation', () => {
    const mockAIResponse = JSON.stringify({
      content: '## Introduction\n\nThis is a test section content with **markdown** formatting.',
      reasoning: 'Generated an introduction section with proper structure',
      suggestions: ['Add examples', 'Include visuals'],
      confidence: 0.85,
      metadata: {
        estimatedReadTime: 2,
        keyTopics: ['introduction', 'testing'],
        componentsUsed: [],
      },
    });

    beforeEach(() => {
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);
    });

    it('should generate content for introduction section', async () => {
      const poml = '<poml><user>Intro section</user></poml>';
      const out = await agent._call(poml);
      const result = JSON.parse(out);

      expect(result.content).toContain('Introduction');
      expect(result.reasoning).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.metadata.keyTopics).toContain('introduction');
    });

    it('should call model once and return content (components handling out of scope)', async () => {
      const poml = '<poml><user>Section with extra context</user></poml>';
      const out = await agent._call(poml);
      expect(mockAITextModel.generateText).toHaveBeenCalledTimes(1);
      const result = JSON.parse(out);
      expect(result.content).toBeTruthy();
    });

    // Les paramètres tone/targetLength ont été retirés de l'API: suppression des tests associés.
  });

  describe('Error handling', () => {
    it('should surface AI model errors', async () => {
      vi.mocked(mockAITextModel.generateText).mockRejectedValue(new Error('AI model error'));
      await expect(agent._call('<poml/>')).rejects.toThrow('AI model error');
    });
  });

  describe('Read time passthrough', () => {
    it('should pass through estimated read time from model output', async () => {
      const content = 'word '.repeat(250);
      const mockResponse = JSON.stringify({
        content,
        reasoning: 'Test',
        suggestions: [],
        confidence: 0.8,
        metadata: {
          estimatedReadTime: 1,
          keyTopics: ['test'],
          componentsUsed: [],
        },
      });
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);
      const out = await agent._call('<poml><user>Any</user></poml>');
      const result = JSON.parse(out);
      expect(result.metadata.estimatedReadTime).toBe(1);
    });
  });
});
