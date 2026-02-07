import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectTopicUseCase } from '../select-topic.usecase';
import type {
  UserProjectConfigPort,
  AngleSelectionWorkflowPort,
  TopicSelectorWorkflowPort,
  EditorialBriefStorePort,
} from '../../ports/out';
import type {
  AngleSelectionResult,
  SelectTopicResult,
  TopicCandidate,
  SeoBriefDataV3,
} from '@casys/core';
import type { ProjectConfig } from '@casys/shared';

/**
 * ✨ V3: Tests obsolètes - Architecture changée
 *
 * V2: SelectTopicUseCase orchestrait AngleSelection → TopicSelector
 * V3: Responsabilités séparées
 *   - GenerateAngleUseCase: génère angle + chosenCluster (appelle AngleSelectionWorkflow)
 *   - SelectTopicUseCase: filtre topics EN FONCTION de l'angle fourni (appelle TopicSelectorWorkflow)
 *
 * TODO: Réécrire ces tests pour V3
 *   - Tester SelectTopicUseCase avec angle/chosenCluster fournis en input
 *   - Créer tests séparés pour GenerateAngleUseCase
 *   - Vérifier que SelectTopicUseCase valide presence de angle/chosenCluster
 */
describe.skip('SelectTopicUseCase - Integration (V2 obsolète)', () => {
  let mockConfigReader: UserProjectConfigPort;
  let mockAngleSelectionWorkflow: AngleSelectionWorkflowPort;
  let mockTopicSelectorWorkflow: TopicSelectorWorkflowPort;
  let mockBriefStore: EditorialBriefStorePort;

  const validProjectConfig: ProjectConfig = {
    name: 'Test Project',
    type: 'astro',
    language: 'fr',
    generation: {
      angleSelector: {
        template: 'prompts/angle-selection.poml',
      },
      topicSelector: {
        template: 'prompts/topic-selector.poml',
        maxTopics: 3,
      },
      seoAnalysis: {
        targetAudience: 'PME BTP',
        industry: 'construction',
        businessDescription: 'Conformité chantier',
      },
    },
    businessContext: {
      targetAudience: 'PME BTP',
      industry: 'construction',
      businessDescription: 'Solutions conformité réglementaire BTP',
      contentType: 'guide',
      siteType: 'b2b_blog',
      personas: [],
    },
  };

  const validSeoBriefData: SeoBriefDataV3 = {
    searchIntent: {
      intent: 'informational',
      confidence: 0.85,
      supportingQueries: ['Comment se conformer PPSPS 2025?'],
      contentRecommendations: {
        articleTypes: ['guide', 'tutoriel'],
        contentAngles: ['Guide pratique'],
      },
    },
    contentStrategy: {
      topicClusters: [
        {
          pillarTag: { label: 'PPSPS 2025', slug: 'ppsps-2025', source: 'pillar' },
          satelliteTags: [
            { label: 'Conformité chantier', slug: 'conformite-chantier', source: 'satellite' },
            { label: 'Sanctions BTP', slug: 'sanctions-btp', source: 'satellite' },
          ],
        },
      ],
      recommendations: {
        seo: ['Optimiser title'],
        editorial: ['Angle actionnable'],
        technical: ['2500 mots'],
      },
    },
    competitiveAnalysis: {
      contentGaps: [
        {
          keyword: { label: 'Check-list PPSPS', slug: 'checklist-ppsps', source: 'gap' },
          gap: 'Aucun concurrent ne propose check-list',
          opportunityScore: 9,
          type: 'cluster',
        },
      ],
      competitorTitles: ['Guide conformité BTP'],
    },
  };

  const validCandidates: TopicCandidate[] = [
    {
      id: 'topic-1',
      title: 'Guide conformité PPSPS 2024',
      sourceUrl: 'https://example.com/conformite-ppsps',
      publishedAt: new Date('2024-01-15'),
      description: 'Guide pratique conformité chantier',
    },
    {
      id: 'topic-2',
      title: 'Sanctions réglementaires BTP',
      sourceUrl: 'https://example.com/sanctions-btp',
      publishedAt: new Date('2024-01-10'),
      description: 'Pénalités non-conformité',
    },
    {
      id: 'topic-3',
      title: 'Check-list chantier conforme',
      sourceUrl: 'https://example.com/checklist-chantier',
      publishedAt: new Date('2024-01-20'),
      description: 'Outil conformité pratique',
    },
  ];

  beforeEach(() => {
    mockConfigReader = {
      getProjectConfig: vi.fn().mockResolvedValue(validProjectConfig),
    } as unknown as UserProjectConfigPort;

    // Mock AngleSelectionWorkflow avec réponse JSON
    const angleResult: AngleSelectionResult = {
      selectedAngle: 'Guide pratique conformité PPSPS 2025 pour PME BTP',
      chosenCluster: {
        pillarTag: { label: 'PPSPS 2025', slug: 'ppsps-2025', source: 'pillar' },
        satelliteTags: [
          { label: 'Conformité chantier', slug: 'conformite-chantier', source: 'satellite' },
          { label: 'Sanctions BTP', slug: 'sanctions-btp', source: 'satellite' },
        ],
      },
      contentType: 'guide',
      targetPersona: {
        category: 'decision_maker',
        archetype: 'Chef de chantier',
        emoji: '👷',
      },
      selectionMode: 'pillar',
    };

    mockAngleSelectionWorkflow = {
      execute: vi.fn().mockResolvedValue(angleResult),
    } as unknown as AngleSelectionWorkflowPort;

    // Mock TopicSelectorWorkflow avec réponse JSON
    const topicResult: SelectTopicResult = {
      topics: [
        {
          id: 'topic-1',
          title: 'Guide conformité PPSPS 2024',
          sourceUrl: 'https://example.com/conformite-ppsps',
          createdAt: '2024-01-15T10:00:00Z',
          language: 'fr',
        },
        {
          id: 'topic-3',
          title: 'Check-list chantier conforme',
          sourceUrl: 'https://example.com/checklist-chantier',
          createdAt: '2024-01-20T10:00:00Z',
          language: 'fr',
        },
      ],
      angle: '', // Sera override par result complet
      chosenCluster: undefined,
      contentType: undefined,
      selectionMode: undefined,
    };

    mockTopicSelectorWorkflow = {
      execute: vi.fn().mockResolvedValue(topicResult),
    } as unknown as TopicSelectorWorkflowPort;

    mockBriefStore = {
      getExistingAngles: vi.fn().mockResolvedValue([]),
    } as unknown as EditorialBriefStorePort;
  });

  describe('Workflow complet : AngleSelection → TopicSelector → Result', () => {
    it('devrait orchestrer les deux workflows et retourner résultat complet', async () => {
      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      const result = await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        articles: validCandidates,
        tags: [
          { label: 'PPSPS', slug: 'ppsps', source: 'seed' },
          { label: 'Conformité', slug: 'conformite', source: 'seed' },
        ],
        seoBriefData: validSeoBriefData,
      });

      // Vérifier AngleSelectionWorkflow appelé
      expect(mockAngleSelectionWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          seoBriefData: validSeoBriefData,
          businessContext: expect.objectContaining({
            industry: 'construction',
            targetAudience: 'PME BTP',
          }),
          existingBriefs: [],
        }),
        expect.objectContaining({
          templatePath: 'prompts/angle-selection.poml',
        })
      );

      // Vérifier TopicSelectorWorkflow appelé avec angle/cluster
      expect(mockTopicSelectorWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          articles: validCandidates,
          seoBriefData: validSeoBriefData,
        }),
        expect.objectContaining({
          angle: 'Guide pratique conformité PPSPS 2025 pour PME BTP',
          chosenCluster: expect.objectContaining({
            pillarTag: expect.objectContaining({ label: 'PPSPS 2025' }),
          }),
          maxTopics: 3,
          templatePath: 'prompts/topic-selector.poml',
        })
      );

      // Vérifier résultat complet combiné
      expect(result.topics).toHaveLength(2);
      expect(result.topics[0].title).toBe('Guide conformité PPSPS 2024');
      expect(result.angle).toBe('Guide pratique conformité PPSPS 2025 pour PME BTP');
      expect(result.chosenCluster?.pillarTag?.label).toBe('PPSPS 2025');
      expect(result.chosenCluster?.satelliteTags).toHaveLength(2);
      expect(result.contentType).toBe('guide');
      expect(result.targetPersona?.archetype).toBe('Chef de chantier');
      expect(result.selectionMode).toBe('pillar');
    });

    it('devrait charger businessContext depuis ProjectConfig', async () => {
      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        articles: validCandidates,
        tags: [],
        seoBriefData: validSeoBriefData,
      });

      // Vérifier config chargée
      expect(mockConfigReader.getProjectConfig).toHaveBeenCalledWith('tenant-test', 'proj-test');

      // Vérifier businessContext passé à AngleSelection
      expect(mockAngleSelectionWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          businessContext: expect.objectContaining({
            industry: 'construction',
            targetAudience: 'PME BTP',
            businessDescription: 'Solutions conformité réglementaire BTP',
            contentType: 'guide',
            siteType: 'b2b_blog',
          }),
        }),
        expect.any(Object)
      );
    });

    it('devrait fallback vers seoAnalysis si businessContext absent', async () => {
      const configWithoutBusinessContext = {
        ...validProjectConfig,
        businessContext: undefined,
      };

      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
        configWithoutBusinessContext
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        articles: validCandidates,
        tags: [],
        seoBriefData: validSeoBriefData,
      });

      // Vérifier fallback vers seoAnalysis
      expect(mockAngleSelectionWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          businessContext: expect.objectContaining({
            industry: 'construction',
            targetAudience: 'PME BTP',
            businessDescription: 'Conformité chantier',
            personas: [],
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Validation anti-doublons avec existing briefs', () => {
    it('devrait charger existing briefs pour Graph RAG', async () => {
      (mockBriefStore!.getExistingAngles as ReturnType<typeof vi.fn>).mockResolvedValue([
        'Guide conformité BTP 2024',
        'Check-list réglementaire chantier',
      ]);

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        articles: validCandidates,
        tags: [],
        seoBriefData: validSeoBriefData,
      });

      // Vérifier chargement des existing angles
      expect(mockBriefStore!.getExistingAngles).toHaveBeenCalledWith({
        projectId: 'proj-test',
        tenantId: 'tenant-test',
        limit: 20,
      });

      // Vérifier propagation à AngleSelection
      expect(mockAngleSelectionWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          existingBriefs: [
            expect.objectContaining({ angle: 'Guide conformité BTP 2024' }),
            expect.objectContaining({ angle: 'Check-list réglementaire chantier' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('devrait continuer malgré erreur briefStore (non bloquant)', async () => {
      (mockBriefStore!.getExistingAngles as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Neo4j connection failed')
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      const result = await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        articles: validCandidates,
        tags: [],
        seoBriefData: validSeoBriefData,
      });

      // Workflow continue avec existingBriefs vide
      expect(result.topics).toBeDefined();
      expect(mockAngleSelectionWorkflow.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          existingBriefs: [],
        }),
        expect.any(Object)
      );
    });
  });

  describe('Fail-fast validations', () => {
    it('devrait rejeter si tenantId manquant', async () => {
      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: '',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] tenantId et projectId requis');
    });

    it('devrait rejeter si projectId manquant', async () => {
      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: '',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] tenantId et projectId requis');
    });

    it('devrait rejeter si project.language absent dans config', async () => {
      const configWithoutLanguage = {
        ...validProjectConfig,
        language: '',
      };

      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
        configWithoutLanguage
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] project.language requis dans ProjectConfig');
    });

    it('devrait rejeter si angleSelector.template absent', async () => {
      const configWithoutTemplate = {
        ...validProjectConfig,
        generation: {
          ...validProjectConfig.generation,
          angleSelector: {
            template: '',
          },
        },
      };

      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
        configWithoutTemplate
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] generation.angleSelector.template requis');
    });

    it('devrait rejeter si topicSelector.template absent', async () => {
      const configWithoutTemplate = {
        ...validProjectConfig,
        generation: {
          ...validProjectConfig.generation,
          topicSelector: {
            ...validProjectConfig.generation!.topicSelector,
            template: '',
          },
        },
      };

      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
        configWithoutTemplate
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] generation.topicSelector.template requis');
    });

    it('devrait rejeter si topicSelector.maxTopics invalide', async () => {
      const configWithInvalidMaxTopics = {
        ...validProjectConfig,
        generation: {
          ...validProjectConfig.generation,
          topicSelector: {
            ...validProjectConfig.generation!.topicSelector,
            maxTopics: 0,
          },
        },
      };

      (mockConfigReader.getProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
        configWithInvalidMaxTopics
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] generation.topicSelector.maxTopics requis (>0)');
    });

    it('devrait rejeter si TopicSelector retourne aucun topic', async () => {
      (mockTopicSelectorWorkflow.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        topics: [],
        angle: '',
        chosenCluster: undefined,
        contentType: undefined,
        selectionMode: undefined,
      });

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('[SelectTopicUseCase] TopicSelector a retourné aucun topic');
    });
  });

  describe('Gestion des erreurs workflow', () => {
    it('devrait propager erreur AngleSelectionWorkflow', async () => {
      (mockAngleSelectionWorkflow.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('AI model rate limit exceeded')
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('AI model rate limit exceeded');
    });

    it('devrait propager erreur TopicSelectorWorkflow', async () => {
      (mockTopicSelectorWorkflow.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('LangGraph execution failed')
      );

      const useCase = new SelectTopicUseCase(
        mockConfigReader,
        mockAngleSelectionWorkflow,
        mockTopicSelectorWorkflow,
        mockBriefStore
      );

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          articles: validCandidates,
          tags: [],
          seoBriefData: validSeoBriefData,
        })
      ).rejects.toThrow('LangGraph execution failed');
    });
  });
});
