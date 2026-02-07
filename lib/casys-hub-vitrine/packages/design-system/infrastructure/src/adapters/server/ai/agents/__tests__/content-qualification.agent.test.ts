import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { ContentQualificationAgent } from '../content-qualification.agent';

describe('ContentQualificationAgent', () => {
  let agent: ContentQualificationAgent;
  let mockAITextModel: AITextModelPort;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAITextModel = {
      generateText: vi.fn().mockResolvedValue(JSON.stringify({
        cleanedContent: 'AI cleaned content',
        contentType: 'article',
        keyPoints: ['Point 1', 'Point 2'],
        qualityScore: 0.85,
        summary: 'AI generated summary',
      })),
    };

    agent = new ContentQualificationAgent(mockAITextModel);
  });

  describe('Tool interface', () => {
    it('should have correct name and description', () => {
      expect(agent.name).toBe('content_qualification');
      expect(agent.description).toContain('Qualifie et nettoie du contenu');
    });
  });

  describe('_call', () => {
    it('should qualify content successfully', async () => {
      const input = JSON.stringify({
        content: 'Raw content to be qualified',
        title: 'Test Article',
        url: 'https://example.com/article',
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.result).toBeDefined();
      expect(parsedResult.result.cleanedContent).toBe('AI cleaned content');
      expect(parsedResult.result.contentType).toBe('article');
      expect(parsedResult.result.keyPoints).toEqual(['Point 1', 'Point 2']);
      expect(parsedResult.result.qualityScore).toBe(0.85);
      expect(parsedResult.result.summary).toBe('AI generated summary');
    });

    it('should handle invalid JSON input', async () => {
      const result = await agent._call('invalid json');
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBeDefined();
    });

    it('should handle missing content', async () => {
      const input = JSON.stringify({
        title: 'Test Article',
        url: 'https://example.com/article',
        // content missing
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('Content requis');
    });

    it('should handle AI failure gracefully', async () => {
      mockAITextModel.generateText = vi.fn().mockRejectedValue(new Error('AI Error'));

      const input = JSON.stringify({
        content: 'Content to qualify',
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBeDefined();
    });

    it('should handle malformed AI response', async () => {
      mockAITextModel.generateText = vi.fn().mockResolvedValue('invalid json response');

      const input = JSON.stringify({
        content: 'Content to qualify',
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toBeDefined();
    });

    it('should work with minimal input (content only)', async () => {
      const input = JSON.stringify({
        content: 'Just content, no title or URL',
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.result.cleanedContent).toBe('AI cleaned content');
    });

    it('should truncate long content in prompt', async () => {
      const longContent = 'A'.repeat(5000); // > 4000 chars
      const input = JSON.stringify({
        content: longContent,
      });

      await agent._call(input);

      // Verify AI was called (content should be truncated)
      expect(mockAITextModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('...[tronqué]')
      );
    });

    it('should include title and URL in prompt when provided', async () => {
      const input = JSON.stringify({
        content: 'Test content',
        title: 'Test Title',
        url: 'https://example.com',
      });

      await agent._call(input);

      expect(mockAITextModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('TITRE: Test Title')
      );
      expect(mockAITextModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('URL: https://example.com')
      );
    });

    it('should use fallback values when AI response is incomplete', async () => {
      mockAITextModel.generateText = vi.fn().mockResolvedValue(JSON.stringify({
        cleanedContent: 'Cleaned content',
        // Missing other fields
      }));

      const input = JSON.stringify({
        content: 'Original content',
      });

      const result = await agent._call(input);
      const parsedResult = JSON.parse(result);

      expect(parsedResult.success).toBe(true);
      expect(parsedResult.result.cleanedContent).toBe('Cleaned content');
      expect(parsedResult.result.contentType).toBe('other'); // Fallback
      expect(parsedResult.result.keyPoints).toEqual([]); // Fallback
      expect(parsedResult.result.qualityScore).toBe(0.5); // Fallback
    });
  });
});
