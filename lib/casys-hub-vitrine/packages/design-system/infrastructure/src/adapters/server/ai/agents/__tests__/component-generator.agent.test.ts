import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import {
  type ComponentGeneratorAgent,
  createComponentGeneratorTool,
} from '../component-generator.agent';

// Mock AITextModelPort
const mockAITextModel: AITextModelPort = {
  generateText: vi.fn(),
};

describe('ComponentGeneratorAgent', () => {
  let agent: ComponentGeneratorAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = createComponentGeneratorTool(mockAITextModel);
  });

  describe('instantiation', () => {
    it('should be properly instantiated', () => {
      expect(agent).toBeDefined();
      expect(agent.name).toBe('component_props_generator');
      expect(agent.description).toContain('Generates intelligent props');
    });
  });

  describe('_call method (Tool interface)', () => {
    it('should generate props from valid input', async () => {
      // Arrange
      const input = JSON.stringify({
        comment: 'Show sales data in a scatter plot',
        component: {
          name: 'ScatterPlot',
          description: 'Interactive scatter plot visualization',
          category: 'visualization',
          subcategory: 'chart',
          props: {
            data: { type: 'Array', required: true },
            title: { type: 'string', required: false },
          },
        },
      });

      const mockResponse = JSON.stringify({
        props: {
          data: [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
          ],
          title: 'Sales Data Scatter Plot',
        },
        reasoning: 'Generated props based on sales data comment',
        confidence: 0.9,
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent._call(input);

      // Assert
      expect(result).toBeDefined();
      const parsedResult = JSON.parse(result);
      expect(parsedResult.props).toBeDefined();
      expect(parsedResult.reasoning).toBe('Generated props based on sales data comment');
      expect(parsedResult.confidence).toBe(0.9);

      // Vérifier l'appel au modèle IA
      expect(mockAITextModel.generateText).toHaveBeenCalledWith(
        expect.stringContaining('Show sales data in a scatter plot')
      );
    });

    it('should throw error for invalid JSON input', async () => {
      // Arrange
      const invalidInput = 'invalid json';

      // Act & Assert
      await expect(agent._call(invalidInput)).rejects.toThrow('Format JSON invalide');
    });

    it('should throw error for missing comment', async () => {
      // Arrange
      const input = JSON.stringify({
        component: {
          name: 'Button',
          description: 'Simple button',
          category: 'interactive',
          subcategory: 'input',
          props: {},
        },
      });

      // Act & Assert
      await expect(agent._call(input)).rejects.toThrow("Données d'entrée invalides");
    });

    it('should throw error for missing component fields', async () => {
      // Arrange
      const input = JSON.stringify({
        comment: 'Add a button',
        component: {
          name: 'Button',
          // Missing required fields
        },
      });

      // Act & Assert
      await expect(agent._call(input)).rejects.toThrow("Données d'entrée invalides");
    });
  });

  describe('generateProps method (direct)', () => {
    it('should generate props for visualization components', async () => {
      // Arrange
      const comment = 'Create a chart showing revenue trends';
      const component = {
        name: 'LineChart',
        description: 'Line chart for time series data',
        category: 'visualization',
        subcategory: 'chart',
        props: {
          data: { type: 'Array', required: true },
          xAxis: { type: 'string', required: true },
          yAxis: { type: 'string', required: true },
        },
      };

      const mockResponse = JSON.stringify({
        props: {
          data: [{ month: 'Jan', revenue: 1000 }],
          xAxis: 'month',
          yAxis: 'revenue',
        },
        reasoning: 'Generated chart props for revenue trends',
        confidence: 0.85,
      });

      vi.mocked(mockAITextModel.generateText).mockResolvedValue(mockResponse);

      // Act
      const result = await agent.generateProps(comment, component);

      // Assert
      expect(result.props.data).toBeDefined();
      expect(result.props.xAxis).toBe('month');
      expect(result.props.yAxis).toBe('revenue');
      expect(result.reasoning).toContain('revenue trends');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle AI text model errors gracefully', async () => {
      // Arrange
      const comment = 'Test comment';
      const component = {
        name: 'Test',
        description: 'Test',
        category: 'test',
        subcategory: 'test',
        props: {},
      };

      vi.mocked(mockAITextModel.generateText).mockRejectedValue(
        new Error('AI service unavailable')
      );

      // Act & Assert
      await expect(agent.generateProps(comment, component)).rejects.toThrow(
        'AI service unavailable'
      );
    });
  });

  describe('buildPrompt method', () => {
    it('should build proper prompt with component details', () => {
      // Utilisation de réflection pour tester la méthode privée
      const buildPrompt = (agent as any).buildPrompt.bind(agent);

      const comment = 'Show user data';
      const component = {
        name: 'DataTable',
        description: 'Table for displaying data',
        category: 'display',
        subcategory: 'table',
        props: {
          columns: { type: 'Array', required: true },
        },
      };

      const prompt = buildPrompt(comment, component);

      expect(prompt).toContain('Show user data');
      expect(prompt).toContain('DataTable');
      expect(prompt).toContain('Table for displaying data');
      expect(prompt).toContain('display / table');
      expect(prompt).toContain('columns');
      expect(prompt).toContain('JSON uniquement');
    });
  });
});
