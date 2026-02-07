import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateEditorialBriefUseCase } from '../create-editorial-brief.usecase';
import type { EditorialBriefAgentPort } from '../../ports/out';
import type { BusinessContext, EditorialBriefData } from '@casys/core';

/**
 * Tests d'intégration pour CreateEditorialBriefUseCase
 *
 * Pattern: Mock AITextModelPort avec JSON.stringify pour simuler réponse agent
 * Scope: Workflow complet de création brief éditorial avec/sans agent
 */
describe('CreateEditorialBriefUseCase - Integration', () => {
  let mockEditorialBriefAgent: EditorialBriefAgentPort;

  const validBusinessContext: BusinessContext = {
    targetAudience: 'pros BTP',
    industry: 'construction',
    businessDescription: 'Entreprise spécialisée conformité chantier',
    contentType: 'guide',
    siteType: 'b2b_blog',
    personas: [
      {
        category: 'decision_maker',
        archetype: 'Chef de chantier',
        emoji: '👷',
        profile: {
          demographics: 'Homme 35-50 ans, chef chantier PME BTP',
          psychographics: 'Pragmatique, orienté résultats',
          techSavviness: 'Intermédiaire',
        },
        painPoints: ['Conformité réglementaire complexe', 'Risque sanctions'],
        motivations: ['Éviter amendes', 'Sécuriser chantier'],
        messagingAngle: 'Guide pratique conformité 2025',
      },
    ],
  };

  beforeEach(() => {
    // Mock EditorialBriefAgent avec réponse JSON structurée
    const mockAgentResponse: EditorialBriefData = {
      keywordTags: [
        { label: 'PPSPS 2025', slug: 'ppsps-2025', source: 'editorial' },
        { label: 'Conformité chantier', slug: 'conformite-chantier', source: 'editorial' },
        { label: 'Sanctions BTP', slug: 'sanctions-btp', source: 'editorial' },
      ],
      relevantQuestions: [
        'Comment rédiger un PPSPS conforme 2025?',
        'Quelles sanctions en cas de non-conformité?',
      ],
      priorityGaps: [
        {
          keyword: { label: 'Check-list PPSPS', slug: 'checklist-ppsps', source: 'gap' },
          gap: 'Aucun concurrent ne propose check-list téléchargeable',
          opportunityScore: 9,
          type: 'cluster',
        },
      ],
      guidingRecommendations: {
        seo: ['Optimiser title avec "Guide PPSPS 2025"', 'Internal linking vers piliers'],
        editorial: ['Angle actionnable: Guide pas-à-pas', 'Inclure exemples concrets chantiers'],
        technical: ['Longueur: 2500 mots', 'Structure H2/H3 claire', 'PDF téléchargeable'],
      },
      corpusSummary:
        'Corpus de 3 articles: Guide conformité BTP (3500 mots), Sanctions réglementaires (2000 mots), PPSPS pratique (1800 mots). Ton pragmatique, exemples terrain, focus PME BTP.',
      competitorAngles: [
        'Guide généraliste conformité (manque exemples concrets)',
        'Checklist administrative (trop technique, peu actionnable)',
      ],
    };

    mockEditorialBriefAgent = {
      generateBrief: vi.fn().mockResolvedValue(mockAgentResponse),
    };
  });

  describe('Workflow complet avec EditorialBriefAgent (génération enrichie)', () => {
    it('devrait créer brief enrichi avec données agent pour nouvel article', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      const result = await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        angle: 'Guide pratique conformité PPSPS 2025',
        businessContext: validBusinessContext,
        corpusTopicIds: ['topic-1', 'topic-2', 'topic-3'],
        // Params agent fournis → génération complète
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
        seoBriefData: {
          searchIntent: {
            intent: 'informational',
            confidence: 0.85,
            supportingQueries: ['Comment se mettre en conformité PPSPS?'],
            contentRecommendations: {
              articleTypes: ['guide', 'tutoriel'],
              contentAngles: ['Guide complet avec exemples'],
            },
          },
          contentStrategy: {
            topicClusters: [
              {
                pillarTag: { label: 'PPSPS 2025', slug: 'ppsps-2025', source: 'pillar' },
                satelliteTags: [
                  { label: 'Conformité chantier', slug: 'conformite-chantier', source: 'satellite' },
                ],
              },
            ],
            recommendations: {
              seo: ['Optimiser meta'],
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
        },
        selectedTopics: [
          {
            id: 'topic-1',
            title: 'Guide conformité BTP 2024',
            sourceUrl: 'https://example.com/conformite',
            createdAt: '2024-01-15T10:00:00Z',
            language: 'fr',
          },
        ],
        sourceArticles: [
          {
            title: 'Guide conformité BTP 2024',
            sourceUrl: 'https://example.com/conformite',
            content: 'Contenu article conformité...',
            summary: 'Synthèse conformité',
          },
        ],
      });

      // Vérifier que l'agent a été appelé avec les bons params
      expect(mockEditorialBriefAgent.generateBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          angle: 'Guide pratique conformité PPSPS 2025',
          chosenCluster: expect.objectContaining({
            pillarTag: expect.objectContaining({ label: 'PPSPS 2025' }),
          }),
          contentType: 'guide',
          targetPersona: expect.objectContaining({ archetype: 'Chef de chantier' }),
          businessContext: expect.objectContaining({
            targetAudience: 'pros BTP',
            industry: 'construction',
          }),
        })
      );

      // Vérifier l'aggregate créé avec spread des données agent
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe('tenant-test');
      expect(result.projectId).toBe('proj-test');
      expect(result.language).toBe('fr');
      expect(result.angle.value).toBe('Guide pratique conformité PPSPS 2025');

      // Vérifier spread des données agent
      expect(result.keywordTags).toHaveLength(3);
      expect(result.keywordTags?.[0].label).toBe('PPSPS 2025');
      expect(result.relevantQuestions).toHaveLength(2);
      expect(result.priorityGaps).toHaveLength(1);
      expect(result.priorityGaps?.[0].opportunityScore).toBe(9);
      expect(result.guidingRecommendations?.editorial).toContain('Angle actionnable: Guide pas-à-pas');
      expect(result.corpusSummary).toContain('Corpus de 3 articles');
      expect(result.competitorAngles).toHaveLength(2);

      // Vérifier businessContext complet
      expect(result.businessContext.targetAudience).toBe('pros BTP');
      expect(result.businessContext.industry).toBe('construction');
      expect(result.businessContext.siteType).toBe('b2b_blog');
      expect(result.businessContext.personas).toHaveLength(1);
      expect(result.businessContext.personas?.[0].archetype).toBe('Chef de chantier');
    });

    it('devrait filtrer questions PAA et prioriser gaps via agent', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      const result = await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        angle: 'Test angle',
        businessContext: validBusinessContext,
        corpusTopicIds: ['topic-1'],
        chosenCluster: {
          pillarTag: { label: 'Test', slug: 'test', source: 'pillar' },
          satelliteTags: [],
        },
        contentType: 'guide',
        seoBriefData: {
          searchIntent: {
            intent: 'informational',
            confidence: 0.8,
            supportingQueries: [
              'Question pertinente?',
              'Question hors sujet très longue qui dépasse largement le contexte?',
            ],
            contentRecommendations: { articleTypes: ['guide'], contentAngles: [] },
          },
          contentStrategy: {
            topicClusters: [],
            recommendations: { seo: [], editorial: [], technical: [] },
          },
          competitiveAnalysis: {
            contentGaps: [],
            competitorTitles: [],
          },
        },
        selectedTopics: [],
        sourceArticles: [],
      });

      // L'agent a été appelé (filtrage et priorisation déléguée à l'agent)
      expect(mockEditorialBriefAgent.generateBrief).toHaveBeenCalled();

      // Vérifier que relevantQuestions retourné par agent (filtré)
      expect(result.relevantQuestions).toBeDefined();
      // Dans le mock, on a seulement 2 questions filtrées
      expect(result.relevantQuestions?.length).toBe(2);
    });
  });

  describe('Workflow reverse engineering (sans agent params)', () => {
    it('devrait créer brief minimal sans appeler agent', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      const result = await useCase.execute({
        tenantId: 'tenant-test',
        projectId: 'proj-test',
        language: 'fr',
        angle: 'Angle article existant',
        businessContext: validBusinessContext,
        corpusTopicIds: ['existing-topic-1'],
        // PAS de params agent → reverse engineering
      });

      // L'agent NE doit PAS être appelé
      expect(mockEditorialBriefAgent.generateBrief).not.toHaveBeenCalled();

      // Brief créé avec données minimales
      expect(result.id).toBeDefined();
      expect(result.angle.value).toBe('Angle article existant');
      expect(result.businessContext.targetAudience).toBe('pros BTP');

      // Données agent undefined
      expect(result.keywordTags).toBeUndefined();
      expect(result.relevantQuestions).toBeUndefined();
      expect(result.priorityGaps).toBeUndefined();
      expect(result.guidingRecommendations).toBeUndefined();
      expect(result.corpusSummary).toBeUndefined();
      expect(result.competitorAngles).toBeUndefined();
    });
  });

  describe('Fail-fast validations', () => {
    it('devrait rejeter si tenantId manquant', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: '',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] tenantId requis');
    });

    it('devrait rejeter si projectId manquant', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: '',
          language: 'fr',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] projectId requis');
    });

    it('devrait rejeter si language manquant', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: '',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] language requis');
    });

    it('devrait rejeter si angle manquant', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: '',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] angle requis');
    });

    it('devrait rejeter si corpusTopicIds non-array', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: null as any,
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] corpusTopicIds requis (tableau)');
    });

    it('devrait rejeter si businessContext manquant', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: null as any,
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] businessContext requis');
    });

    it('devrait rejeter si businessContext.targetAudience vide', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: {
            ...validBusinessContext,
            targetAudience: '',
          },
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] businessContext.targetAudience requis');
    });

    it('devrait rejeter si businessContext.industry vide', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: {
            ...validBusinessContext,
            industry: '',
          },
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] businessContext.industry requis');
    });

    it('devrait rejeter si businessContext.businessDescription vide', async () => {
      const useCase = new CreateEditorialBriefUseCase(mockEditorialBriefAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: {
            ...validBusinessContext,
            businessDescription: '',
          },
          corpusTopicIds: ['topic-1'],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] businessContext.businessDescription requis');
    });

    it('devrait rejeter si agent manquant mais params fournis', async () => {
      const useCase = new CreateEditorialBriefUseCase(); // Pas d'agent

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
          // Params agent fournis mais agent absent → fail-fast
          chosenCluster: {
            pillarTag: { label: 'Test', slug: 'test', source: 'pillar' },
            satelliteTags: [],
          },
          contentType: 'guide',
          seoBriefData: {} as any,
          selectedTopics: [],
        })
      ).rejects.toThrow('[CreateEditorialBriefUseCase] EditorialBriefAgent requis pour génération complète');
    });
  });

  describe('Gestion des erreurs agent', () => {
    it('devrait propager erreur si agent échoue', async () => {
      const failingAgent: EditorialBriefAgentPort = {
        generateBrief: vi.fn().mockRejectedValue(new Error('AI model timeout')),
      };

      const useCase = new CreateEditorialBriefUseCase(failingAgent);

      await expect(
        useCase.execute({
          tenantId: 'tenant-test',
          projectId: 'proj-test',
          language: 'fr',
          angle: 'Test',
          businessContext: validBusinessContext,
          corpusTopicIds: ['topic-1'],
          chosenCluster: {
            pillarTag: { label: 'Test', slug: 'test', source: 'pillar' },
            satelliteTags: [],
          },
          contentType: 'guide',
          seoBriefData: {} as any,
          selectedTopics: [],
          sourceArticles: [],
        })
      ).rejects.toThrow('AI model timeout');
    });
  });
});
