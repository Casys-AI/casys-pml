import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { CommentAgent } from '../comment.agent';

describe('CommentAgent', () => {
  let agent: CommentAgent;
  let mockAITextModel: AITextModelPort;

  beforeEach(() => {
    mockAITextModel = {
      generateText: vi.fn(),
    };
    agent = new CommentAgent(mockAITextModel);
  });

  describe('Tool interface', () => {
    it('should have correct name and description', () => {
      expect(agent.name).toBe('comment_responder');
      expect(agent.description).toContain('conversational responses');
    });
  });

  describe('Input validation', () => {
    it('should reject empty originalComment', async () => {
      const input = JSON.stringify({
        originalComment: '',
        responseStyle: 'detailed' as const,
        includeActionSummary: false,
      });

      await expect(agent._call(input)).rejects.toThrow('originalComment');
    });

    it('should accept minimal valid input', async () => {
      const mockResponse = JSON.stringify({
        response: 'Thank you for your comment!',
        tone: 'helpful',
        actionsSummary: [],
        followUpSuggestions: [],
        confidence: 0.8,
        metadata: {
          responseLength: 26,
          complexity: 'simple',
          topics: ['general'],
          sentiment: 'positive',
        },
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      const input = JSON.stringify({
        originalComment: 'This is a test comment',
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      });

      const result = await agent._call(input);
      const parsed = JSON.parse(result);

      expect(parsed.response).toBe('Thank you for your comment!');
      expect(parsed.confidence).toBe(0.8);
    });
  });

  describe('Response generation', () => {
    const mockAIResponse = JSON.stringify({
      response:
        "Merci pour votre commentaire ! J'ai bien compris votre demande et j'ai généré le composant bouton avec les propriétés que vous avez spécifiées.",
      tone: 'helpful',
      actionsSummary: [
        'Génération du composant ButtonComponent',
        'Configuration des props personnalisées',
      ],
      followUpSuggestions: [
        'Tester le composant dans différents contextes',
        'Ajouter des variations de style',
      ],
      confidence: 0.9,
      metadata: {
        responseLength: 120,
        complexity: 'moderate',
        topics: ['component', 'generation'],
        sentiment: 'positive',
      },
    });

    beforeEach(() => {
      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockAIResponse);
    });

    it('should generate response with context awareness', async () => {
      const input = {
        originalComment: 'Can you create a button component?',
        context: {
          articleTitle: 'UI Components Guide',
          sectionContent: 'This section covers interactive elements...',
        },
        actionsPerformed: {
          componentsGenerated: [
            {
              name: 'ButtonComponent',
              props: { text: 'Submit', variant: 'primary' },
            },
          ],
        },
        responseStyle: 'helpful' as const,
        includeActionSummary: true,
      };

      const result = await agent.respondToComment(input);

      expect(result.response).toContain('composant');
      expect(result.actionsSummary.some(action => action.includes('ButtonComponent'))).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should include actions in context when includeActionSummary is true', async () => {
      const input = {
        originalComment: 'Please add a navigation menu',
        actionsPerformed: {
          componentsGenerated: [{ name: 'NavMenu', props: { items: ['Home', 'About'] } }],
          sectionsWritten: [
            { type: 'introduction', content: 'Welcome to our navigation guide...' },
          ],
        },
        responseStyle: 'helpful' as const,
        includeActionSummary: true,
      };

      await agent.respondToComment(input);

      const promptArg = vi.mocked(mockAITextModel.generateText).mock.calls[0][0];
      expect(promptArg).toContain('NavMenu');
      expect(promptArg).toContain('Actions effectuées');
      expect(promptArg).toContain('introduction');
    });

    it('should exclude actions when includeActionSummary is false', async () => {
      const input = {
        originalComment: 'Please add a navigation menu',
        actionsPerformed: {
          componentsGenerated: [{ name: 'NavMenu', props: { items: ['Home', 'About'] } }],
        },
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      await agent.respondToComment(input);

      const promptArg = vi.mocked(mockAITextModel.generateText).mock.calls[0][0];
      expect(promptArg).toContain('Ne mentionne pas spécifiquement les actions techniques');
    });

    it('should handle different response styles', async () => {
      const styles = ['helpful', 'detailed', 'concise', 'encouraging'] as const;
      const expectedDescriptions = {
        helpful: 'amical et serviable',
        detailed: 'détaillé et technique',
        concise: 'bref et direct',
        encouraging: 'motivant et positif',
      };

      for (let i = 0; i < styles.length; i++) {
        const responseStyle = styles[i];
        const input = {
          originalComment: 'Test comment',
          responseStyle,
          includeActionSummary: false,
        };

        await agent.respondToComment(input);

        const promptArg = vi.mocked(mockAITextModel.generateText).mock.calls[i][0];
        expect(promptArg).toContain(expectedDescriptions[responseStyle]);
      }
    });
  });

  describe('Context building', () => {
    it('should include article context when provided', async () => {
      const input = {
        originalComment: 'I need help with this section',
        context: {
          articleTitle: 'Advanced React Patterns',
          articleTopic: 'React hooks and state management',
          sectionContent: 'In this section we explore useState and useEffect...',
          previousComments: ['Great article!', 'Very helpful examples'],
        },
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      await agent.respondToComment(input);

      const promptArg = vi.mocked(mockAITextModel.generateText).mock.calls[0][0];
      expect(promptArg).toContain('Advanced React Patterns');
      expect(promptArg).toContain('React hooks');
      expect(promptArg).toContain('useState and useEffect');
      expect(promptArg).toContain('Great article!');
    });

    it('should handle multiple types of performed actions', async () => {
      const input = {
        originalComment: 'Can you improve this content?',
        actionsPerformed: {
          componentsGenerated: [{ name: 'Card', props: { title: 'Example' } }],
          sectionsWritten: [{ type: 'conclusion', content: 'In conclusion...' }],
          otherActions: ['Updated styling', 'Added accessibility features'],
        },
        responseStyle: 'helpful' as const,
        includeActionSummary: true,
      };

      await agent.respondToComment(input);

      const promptArg = vi.mocked(mockAITextModel.generateText).mock.calls[0][0];
      expect(promptArg).toContain('Card');
      expect(promptArg).toContain('conclusion');
      expect(promptArg).toContain('Updated styling');
      expect(promptArg).toContain('Added accessibility');
    });
  });

  describe('Error handling', () => {
    it('should handle AI model errors gracefully', async () => {
      vi.mocked(mockAITextModel.generateText).mockRejectedValue(
        new Error('AI service unavailable')
      );

      const input = {
        originalComment: 'Test comment',
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      await expect(agent.respondToComment(input)).rejects.toThrow(
        'Impossible de générer la réponse'
      );
    });

    it('should provide fallback response for malformed AI output', async () => {
      vi.mocked(mockAITextModel.generateText).mockResolvedValue('Invalid JSON');

      const input = {
        originalComment: 'Test comment',
        responseStyle: 'encouraging' as const,
        includeActionSummary: false,
      };

      const result = await agent.respondToComment(input);

      expect(result.response).toContain('Super commentaire');
      expect(result.tone).toBe('encouraging');
      expect(result.confidence).toBe(0.6);
      expect(result.metadata.complexity).toBe('simple');
    });
  });

  describe('Response metadata', () => {
    it('should calculate correct response length', async () => {
      const response = 'This is a test response';
      const mockResponse = JSON.stringify({
        response,
        tone: 'helpful',
        actionsSummary: [],
        followUpSuggestions: [],
        confidence: 0.8,
        metadata: {
          responseLength: response.length,
          complexity: 'simple',
          topics: ['test'],
          sentiment: 'positive',
        },
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      const input = {
        originalComment: 'Test',
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      const result = await agent.respondToComment(input);
      expect(result.metadata.responseLength).toBe(response.length);
    });

    it('should validate complexity values', async () => {
      const mockResponse = JSON.stringify({
        response: 'Test response',
        tone: 'helpful',
        actionsSummary: [],
        followUpSuggestions: [],
        confidence: 0.8,
        metadata: {
          responseLength: 13,
          complexity: 'invalid_complexity',
          topics: ['test'],
          sentiment: 'positive',
        },
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      const input = {
        originalComment: 'Test',
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      const result = await agent.respondToComment(input);
      expect(result.metadata.complexity).toBe('simple'); // Should fallback to default
    });

    it('should validate sentiment values', async () => {
      const mockResponse = JSON.stringify({
        response: 'Test response',
        tone: 'helpful',
        actionsSummary: [],
        followUpSuggestions: [],
        confidence: 0.8,
        metadata: {
          responseLength: 13,
          complexity: 'simple',
          topics: ['test'],
          sentiment: 'invalid_sentiment',
        },
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      const input = {
        originalComment: 'Test',
        responseStyle: 'helpful' as const,
        includeActionSummary: false,
      };

      const result = await agent.respondToComment(input);
      expect(result.metadata.sentiment).toBe('positive'); // Should fallback to default
    });
  });
});
