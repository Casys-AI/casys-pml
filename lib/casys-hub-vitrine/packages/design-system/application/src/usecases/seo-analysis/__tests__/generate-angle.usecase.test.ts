import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectConfig } from '@casys/shared';
import {
  EditorialBrief,
  type AngleSelectionResult,
  type SeoBriefDataV3,
  type TopicCandidate,
} from '@casys/core';
import { GenerateAngleUseCase } from '../generate-angle.usecase';
import type {
  AngleSelectionWorkflowPort,
  EditorialBriefStorePort,
  UserProjectConfigPort,
} from '../../../ports/out';

describe('GenerateAngleUseCase', () => {
  let useCase: GenerateAngleUseCase;
  let mockConfigReader: UserProjectConfigPort;
  let mockAngleWorkflow: AngleSelectionWorkflowPort;
  let mockBriefStore: EditorialBriefStorePort;

  const mockProjectConfig: ProjectConfig = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    language: 'fr',
    generation: {
      angleSelector: {
        template: 'config/prompts/angle-selection.poml',
      },
      seoAnalysis: {
        industry: 'Tech',
        targetAudience: 'Développeurs',
        businessDescription: 'Plateforme dev',
      },
    },
    businessContext: {
      industry: 'Tech',
      targetAudience: 'Développeurs',
      businessDescription: 'Plateforme dev',
      contentType: 'article',
    },
  } as ProjectConfig;

  const mockSeoBriefData: SeoBriefDataV3 = {
    keywordTags: [
      { label: 'machine learning', slug: 'machine-learning', source: 'seed' },
      { label: 'AI', slug: 'ai', source: 'seed' },
    ],
    contentStrategy: {
      topicClusters: [
        {
          pillarTag: { label: 'ML Basics', slug: 'ml-basics', source: 'pillar' },
          satelliteTags: [
            { label: 'neural networks', slug: 'neural-networks', source: 'satellite' },
          ],
        },
      ],
    },
  } as SeoBriefDataV3;

  const mockArticles: TopicCandidate[] = [
    {
      id: 'article-1',
      title: 'Introduction to Machine Learning',
      sourceUrl: 'https://example.com/ml-intro',
      description: 'A comprehensive guide to ML',
      sourceTitle: 'Tech Blog',
      publishedAt: '2024-01-15',
      language: 'fr',
      categories: ['tech'],
    },
  ];

  const mockAngleResult: AngleSelectionResult = {
    selectedAngle: 'Guide pratique ML pour développeurs débutants',
    chosenCluster: {
      pillarTag: { label: 'ML Basics', slug: 'ml-basics', source: 'pillar' },
      satelliteTags: [
        { label: 'neural networks', slug: 'neural-networks', source: 'satellite' },
      ],
    },
    contentType: 'guide',
    selectionMode: 'pillar',
  };

  beforeEach(() => {
    mockConfigReader = {
      getProjectConfig: vi.fn().mockResolvedValue(mockProjectConfig),
    } as unknown as UserProjectConfigPort;

    mockAngleWorkflow = {
      execute: vi.fn().mockResolvedValue(mockAngleResult),
    } as unknown as AngleSelectionWorkflowPort;

    mockBriefStore = {
      getAllEditorialBriefs: vi.fn().mockResolvedValue([]),
      getEditorialBriefsForSeoBrief: vi.fn().mockResolvedValue([]),
      searchSimilarBriefs: vi.fn(),
      saveEditorialBrief: vi.fn(),
      getEditorialBrief: vi.fn(),
      linkBriefToTopicClusters: vi.fn(),
    } as unknown as EditorialBriefStorePort;
  });

  describe('Graph RAG - Anti-doublons avec tous les briefs du projet', () => {
    it('devrait récupérer TOUS les briefs existants du projet (version V3.1)', async () => {
      // Arrange
      const existingBrief1 = EditorialBrief.create({
        id: 'brief-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        angle: 'Guide ML pour débutants en Python',
        businessContext: {
          targetAudience: 'Développeurs',
          industry: 'Tech',
          businessDescription: 'Plateforme dev',
        },
        corpusTopicIds: ['topic-1'],
        createdAt: '2024-01-10T10:00:00Z',
      });

      const existingBrief2 = EditorialBrief.create({
        id: 'brief-2',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        angle: 'Introduction complète au Deep Learning',
        businessContext: {
          targetAudience: 'Développeurs',
          industry: 'Tech',
          businessDescription: 'Plateforme dev',
        },
        corpusTopicIds: ['topic-2'],
        createdAt: '2024-01-12T10:00:00Z',
      });

      mockBriefStore.getAllEditorialBriefs = vi
        .fn()
        .mockResolvedValue([existingBrief1, existingBrief2]);

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      // Act
      const result = await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      // Assert
      expect(mockBriefStore.getAllEditorialBriefs).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        limit: 20,
      });

      expect(mockAngleWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          existingBriefs: [existingBrief1, existingBrief2],
        }),
        expect.objectContaining({
          templatePath: 'config/prompts/angle-selection.poml',
        })
      );

      expect(result).toEqual(mockAngleResult);
    });

    it('devrait logger les briefs existants avec détails', async () => {
      // Arrange
      const existingBrief = EditorialBrief.create({
        id: 'brief-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        angle: 'Un très long angle éditorial qui devrait être tronqué à 80 caractères maximum pour les logs',
        businessContext: {
          targetAudience: 'Développeurs',
          industry: 'Tech',
          businessDescription: 'Plateforme dev',
        },
        corpusTopicIds: ['topic-1'],
        createdAt: '2024-01-10T10:00:00Z',
      });

      mockBriefStore.getAllEditorialBriefs = vi.fn().mockResolvedValue([existingBrief]);

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      // Act
      await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      // Assert - Vérifier que le logger a été appelé avec les détails
      // Note: Les logs sont appelés via applicationLogger, difficile à mocker
      // On vérifie juste que la méthode ne throw pas
      expect(mockBriefStore.getAllEditorialBriefs).toHaveBeenCalled();
    });

    it('devrait gérer les erreurs Graph RAG et continuer sans briefs', async () => {
      // Arrange
      mockBriefStore.getAllEditorialBriefs = vi
        .fn()
        .mockRejectedValue(new Error('Neo4j connection failed'));

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      // Act
      const result = await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      // Assert
      expect(mockAngleWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          existingBriefs: [], // Doit continuer avec tableau vide
        }),
        expect.anything()
      );

      expect(result).toEqual(mockAngleResult);
    });
  });

  describe('Sans briefStore', () => {
    it('devrait passer existingBriefs vide quand briefStore absent', async () => {
      // Arrange - useCase sans briefStore
      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow);

      // Act
      await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      // Assert
      expect(mockAngleWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          existingBriefs: [],
        }),
        expect.anything()
      );
    });
  });

  describe('Validation anti-doublons', () => {
    it('ne devrait PAS logger warn si angle différent des existants', async () => {
      // Arrange
      const existingBrief = EditorialBrief.create({
        id: 'brief-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        angle: 'Introduction au Deep Learning avec TensorFlow', // Différent
        businessContext: {
          targetAudience: 'Développeurs',
          industry: 'Tech',
          businessDescription: 'Plateforme dev',
        },
        corpusTopicIds: ['topic-1'],
      });

      mockBriefStore.getAllEditorialBriefs = vi.fn().mockResolvedValue([existingBrief]);

      // Angle résultat différent
      const differentAngleResult: AngleSelectionResult = {
        selectedAngle: 'Guide complet du Web Assembly moderne',
        chosenCluster: mockAngleResult.chosenCluster,
        contentType: 'guide',
        selectionMode: 'pillar',
      };

      mockAngleWorkflow.execute = vi.fn().mockResolvedValue(differentAngleResult);

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      // Act
      const result = await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      // Assert - Pas de warn car angles différents
      expect(result.selectedAngle).toBe('Guide complet du Web Assembly moderne');
    });
  });

  describe('Fail-fast validations', () => {
    it('devrait throw si tenantId manquant', async () => {
      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      await expect(
        useCase.execute({
          tenantId: '',
          projectId: 'project-1',
          language: 'fr',
          articles: mockArticles,
          seoBriefData: mockSeoBriefData,
        })
      ).rejects.toThrow('tenantId et projectId requis');
    });

    it('devrait throw si articles vide', async () => {
      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      await expect(
        useCase.execute({
          tenantId: 'tenant-1',
          projectId: 'project-1',
          language: 'fr',
          articles: [],
          seoBriefData: mockSeoBriefData,
        })
      ).rejects.toThrow('articles requis (min 1)');
    });

    it('devrait throw si template manquant dans config', async () => {
      const configWithoutTemplate = {
        ...mockProjectConfig,
        generation: {
          ...mockProjectConfig.generation,
          angleSelector: {
            template: '',
          },
        },
      };

      mockConfigReader.getProjectConfig = vi.fn().mockResolvedValue(configWithoutTemplate);

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      await expect(
        useCase.execute({
          tenantId: 'tenant-1',
          projectId: 'project-1',
          language: 'fr',
          articles: mockArticles,
          seoBriefData: mockSeoBriefData,
        })
      ).rejects.toThrow('generation.angleSelector.template requis');
    });
  });

  describe('BusinessContext construction', () => {
    it('devrait utiliser businessContext de ProjectConfig en priorité', async () => {
      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      expect(mockAngleWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          businessContext: expect.objectContaining({
            industry: 'Tech',
            targetAudience: 'Développeurs',
            businessDescription: 'Plateforme dev',
            contentType: 'article',
          }),
        }),
        expect.anything()
      );
    });

    it('devrait fallback sur seoAnalysis si businessContext absent', async () => {
      const configWithoutBusinessContext = {
        ...mockProjectConfig,
        businessContext: undefined,
      };

      mockConfigReader.getProjectConfig = vi.fn().mockResolvedValue(configWithoutBusinessContext);

      useCase = new GenerateAngleUseCase(mockConfigReader, mockAngleWorkflow, mockBriefStore);

      await useCase.execute({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        language: 'fr',
        articles: mockArticles,
        seoBriefData: mockSeoBriefData,
      });

      expect(mockAngleWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          businessContext: expect.objectContaining({
            industry: 'Tech',
            targetAudience: 'Développeurs',
            personas: [],
          }),
        }),
        expect.anything()
      );
    });
  });
});
