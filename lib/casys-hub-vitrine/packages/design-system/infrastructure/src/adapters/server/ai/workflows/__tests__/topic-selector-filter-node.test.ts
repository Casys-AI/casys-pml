import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AITextModelPort, PromptTemplatePort } from '@casys/application';
import { filterTopicsNode, type TopicSelectorNodeDeps } from '../topic-selector.nodes';
import type { TopicSelectorState } from '../topic-selector.types';

describe('TopicSelectorWorkflow - filterTopicsNode (V3)', () => {
  let mockAIModel: AITextModelPort;
  let mockPromptTemplate: PromptTemplatePort;
  let mockLogger: any;
  let baseDeps: TopicSelectorNodeDeps;
  let baseState: TopicSelectorState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAIModel = {
      generateText: vi.fn(),
    } as any;

    mockPromptTemplate = {
      build: vi.fn(),
      getFile: vi.fn(),
      loadTemplate: vi.fn().mockResolvedValue('mock template content'),
    } as any;

    mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };

    baseDeps = {
      aiModel: mockAIModel,
      promptTemplate: mockPromptTemplate,
      logger: mockLogger,
    };

    baseState = {
      tenantId: 'tenant-123',
      projectId: 'blog-pro',
      language: 'fr',
      articles: [
        {
          id: 'art-1',
          title: 'Documents obligatoires chantier BTP',
          sourceUrl: 'https://example.com/1',
          publishedAt: new Date('2025-01-15'),
        },
        {
          id: 'art-2',
          title: 'Plan de prévention PPSPS',
          sourceUrl: 'https://example.com/2',
          publishedAt: new Date('2025-01-16'),
        },
      ],
      angle: 'Guide réglementation BTP 2025',
      contentType: 'guide',
      selectionMode: 'pillar',
      tags: [
        { label: 'guide réglementation btp 2025', slug: 'guide-reglementation-btp-2025', source: 'seed' },
        { label: 'documents obligatoires chantier btp', slug: 'documents-obligatoires-chantier-btp', source: 'seed' },
      ],
      chosenCluster: {
        pillarTag: {
          label: 'guide réglementation btp 2025',
          slug: 'guide-reglementation-btp-2025',
          source: 'seed',
          searchVolume: 1200,
          difficulty: 45,
          clusterType: 'pillar',
        },
        satelliteTags: [
          {
            label: 'documents obligatoires chantier btp',
            slug: 'documents-obligatoires-chantier-btp',
            source: 'seed',
            searchVolume: 800,
            difficulty: 38,
            clusterType: 'cluster',
          },
        ],
      },
      seoBriefData: {
        keywordTags: [
          { label: 'guide réglementation btp 2025', slug: 'guide-reglementation-btp-2025', source: 'seed' },
          { label: 'documents obligatoires chantier btp', slug: 'documents-obligatoires-chantier-btp', source: 'seed' },
        ],
        searchIntent: {
          intent: 'informational',
          confidence: 0.85,
          supportingQueries: ['guide réglementation btp', 'documents obligatoires chantier'],
        },
        contentStrategy: {
          format: 'guide',
          targetWordCount: 2500,
          suggestedSections: ['Introduction', 'Réglementation', 'Documents obligatoires', 'Conclusion'],
        },
        competitiveAnalysis: {
          topCompetitors: ['https://example.com/concurrent-1'],
          averageContentLength: 2200,
          commonTopics: ['réglementation', 'documents', 'PPSPS'],
        },
      } as any,
      maxTopics: 5,
      templatePath: './prompts/topic-selector.poml',
      status: 'pending',
    };
  });

  describe('filterTopicsNode - cas nominal', () => {
    it('devrait filtrer les topics avec angle et chosenCluster fournis', async () => {
      // Mock réponse IA
      const mockAIResponse = JSON.stringify({
        topics: [
          {
            id: 'art-1',
            title: 'Documents obligatoires chantier BTP',
            sourceUrl: 'https://example.com/1',
            createdAt: '2025-01-15T00:00:00.000Z',
            language: 'fr',
          },
        ],
      });

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockAIResponse);

      // Exécuter le node
      const result = await filterTopicsNode(baseState, baseDeps);

      // Vérifications
      expect(result.status).toBe('completed');
      expect(result.topics).toHaveLength(1);
      expect(result.topics?.[0].title).toBe('Documents obligatoires chantier BTP');
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Filtrage des topics'),
        expect.objectContaining({
          angle: 'Guide réglementation BTP 2025',
        })
      );
    });

    it('devrait limiter le nombre de topics au maxTopics configuré', async () => {
      // Mock réponse IA avec 10 topics
      const mockAIResponse = JSON.stringify({
        topics: Array.from({ length: 10 }, (_, i) => ({
          id: `art-${i + 1}`,
          title: `Article ${i + 1}`,
          sourceUrl: `https://example.com/${i + 1}`,
          createdAt: '2025-01-15T00:00:00.000Z',
          language: 'fr',
        })),
      });

      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockAIResponse);

      // maxTopics = 5
      const result = await filterTopicsNode(baseState, baseDeps);

      // Vérifier limite
      expect(result.topics).toHaveLength(5);
    });
  });

  describe('filterTopicsNode - validations fail-fast', () => {
    it('devrait échouer si angle est manquant', async () => {
      const stateWithoutAngle = { ...baseState, angle: '' };

      await expect(filterTopicsNode(stateWithoutAngle, baseDeps)).rejects.toThrow(
        'angle manquant'
      );
    });

    it('devrait échouer si chosenCluster est manquant', async () => {
      const stateWithoutCluster = { ...baseState, chosenCluster: undefined as any };

      await expect(filterTopicsNode(stateWithoutCluster, baseDeps)).rejects.toThrow(
        'chosenCluster manquant'
      );
    });

    it('devrait échouer si l\'IA retourne aucun topic', async () => {
      const mockAIResponse = JSON.stringify({ topics: [] });
      vi.mocked(mockAIModel.generateText).mockResolvedValue(mockAIResponse);

      await expect(filterTopicsNode(baseState, baseDeps)).rejects.toThrow(
        'IA a retourné aucun topic'
      );
    });
  });
});
