import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectTopicCommand } from '@casys/core';
import type { AITextModelPort, PromptTemplatePort, EditorialBriefStorePort } from '@casys/application';

import { TopicSelectorWorkflow } from '../topic-selector.workflow';

// ✨ V3: Tests obsolètes - TopicSelectorWorkflow ne fait plus de RAG ni génération d'angle
// TODO: Réécrire ces tests pour V3 (workflow simplifié qui filtre seulement les topics)
describe.skip('TopicSelectorWorkflow (LangGraph)', () => {
  let workflow: TopicSelectorWorkflow;
  let mockBriefStore: EditorialBriefStorePort;
  let mockAIModel: AITextModelPort;
  let mockPromptTemplate: PromptTemplatePort;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBriefStore = {
      saveEditorialBrief: vi.fn(),
      getEditorialBrief: vi.fn(),
      searchSimilarBriefs: vi.fn().mockResolvedValue([]),
      linkBriefToArticle: vi.fn(),
      getExistingAngles: vi.fn().mockResolvedValue([]),
    } as unknown as EditorialBriefStorePort;

    mockAIModel = {
      generateText: vi.fn().mockResolvedValue(
        JSON.stringify({
          topics: [
            {
              id: 't1',
              title: 'Topic Test',
              sourceUrl: 'http://example.com',
              createdAt: new Date().toISOString(),
              language: 'fr',
            },
          ],
          angle: 'Angle Test',
          seoSummary: { enrichedKeywords: ['test'] },
        })
      ),
    };

    mockPromptTemplate = {
      loadTemplate: vi.fn().mockResolvedValue('<poml></poml>'),
    };

    mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    workflow = new TopicSelectorWorkflow(
      mockBriefStore,
      mockAIModel,
      mockPromptTemplate,
      mockLogger
    );
  });

  it('execute - retourne topics + angle + seoSummary', async () => {
    const input: SelectTopicCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      articles: [
        { id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() },
      ],
      tags: [{ label: 'test', slug: 'test', source: 'seed' }],
      language: 'fr',
      seoBriefData: { keywordTags: [{ label: 'test' }] } as any,
    };

    const result = await workflow.execute(input, {
      maxTopics: 3,
      templatePath: 'test.poml',
      maxAttempts: 3,
    });

    expect(result).toBeDefined();
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].title).toBe('Topic Test');
    expect(result.angle).toBe('Angle Test');
    // seoSummary structure is provider-specific; avoid strict field assertions here
    expect(mockAIModel.generateText).toHaveBeenCalled();
  });

  it('execute - appelle briefStore.searchSimilarBriefs pour validation', async () => {
    const input: SelectTopicCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() }],
      tags: [{ label: 'test', slug: 'test', source: 'seed' }],
      language: 'fr',
      seoBriefData: { keywordTags: [{ label: 'test' }] } as any,
    };

    await workflow.execute(input, {
      maxTopics: 3,
      templatePath: 'test.poml',
      maxAttempts: 3,
    });

    expect(mockBriefStore.searchSimilarBriefs).toHaveBeenCalled();
  });

  it('execute - fail-fast si topics vide dans la réponse AI', async () => {
    (mockAIModel.generateText as any).mockResolvedValue(
      JSON.stringify({
        topics: [],
        angle: 'Test',
        seoSummary: {},
      })
    );

    const input: SelectTopicCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() }],
      tags: [{ label: 'test', slug: 'test', source: 'seed' }],
      language: 'fr',
      seoBriefData: { keywordTags: [{ label: 'test' }] } as any,
    };

    await expect(
      workflow.execute(input, {
        maxTopics: 3,
        templatePath: 'test.poml',
        maxAttempts: 3,
      })
    ).rejects.toThrow(/IA a retourné aucun topic/i);
  });

  it('execute - limite les topics à maxTopics', async () => {
    (mockAIModel.generateText as any).mockResolvedValue(
      JSON.stringify({
        topics: [
          { id: 't1', title: 'Topic 1', sourceUrl: 'http://a.com', createdAt: new Date().toISOString(), language: 'fr' },
          { id: 't2', title: 'Topic 2', sourceUrl: 'http://b.com', createdAt: new Date().toISOString(), language: 'fr' },
          { id: 't3', title: 'Topic 3', sourceUrl: 'http://c.com', createdAt: new Date().toISOString(), language: 'fr' },
          { id: 't4', title: 'Topic 4', sourceUrl: 'http://d.com', createdAt: new Date().toISOString(), language: 'fr' },
        ],
        angle: 'Test',
        seoSummary: {},
      })
    );

    const input: SelectTopicCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() }],
      tags: [{ label: 'test', slug: 'test', source: 'seed' }],
      language: 'fr',
      seoBriefData: { keywordTags: [{ label: 'test' }] } as any,
    };

    const result = await workflow.execute(input, {
      maxTopics: 2,
      templatePath: 'test.poml',
    });

    expect(result.topics).toHaveLength(2);
  });

  it('execute - reangle si conflit détecté (score > 0.85) avec RAG des angles existants', async () => {
    let callCount = 0;
    
    // Mock briefStore avec conflit au 1er appel, puis OK au 2ème
    (mockBriefStore.searchSimilarBriefs as any).mockImplementation(async ({ queryText }: any) => {
      callCount++;
      
      if (callCount === 1) {
        // 1er appel (validateAngle) : conflit détecté !
        return [
          {
            brief: {
              id: 'brief-123',
              angle: { value: 'Guide PPSPS BTP complet 2024' },
            },
            similarityScore: 0.92, // > 0.85 → reangle !
          },
        ];
      }
      
      // 2ème appel (après reangle) : pas de conflit
      return [];
    });

    // Mock getExistingAngles pour analyzeGaps
    (mockBriefStore.getExistingAngles as any).mockResolvedValue([
      'Guide PPSPS BTP complet 2024',
      'Suivi de chantier Excel',
      'Obligations RE2020 pour artisans',
      'Gestion des déchets avec Trackdéchets',
      'DOE vs DIUO : différences pratiques',
    ]);

    // Mock AI : 1er angle conflit, 2ème angle OK
    let aiCallCount = 0;
    (mockAIModel.generateText as any).mockImplementation(async (poml: string) => {
      aiCallCount++;
      
      if (aiCallCount === 1) {
        // 1ère génération (sans feedback)
        return JSON.stringify({
          topics: [
            {
              id: 't1',
              title: 'PPSPS pour chantiers BTP',
              sourceUrl: 'http://example.com',
              createdAt: new Date().toISOString(),
              language: 'fr',
            },
          ],
          angle: 'Guide PPSPS pour professionnels du BTP', // ← Conflit !
          seoSummary: { keywordTags: [{ label: 'ppsps', slug: 'ppsps', source: 'opportunity' }] },
        });
      }
      
      // 2ème génération (AVEC feedback des angles existants)
      // Détendre l'assertion sur le contenu POML pour éviter la fragilité liée aux templates
      // On vérifie le comportement global via appels mocks et résultat final
      
      return JSON.stringify({
        topics: [
          {
            id: 't2',
            title: 'Tableau KPI chantier BTP',
            sourceUrl: 'http://example.com',
            createdAt: new Date().toISOString(),
            language: 'fr',
          },
        ],
        angle: 'KPI essentiels pour piloter un chantier BTP', // ← Angle différent !
        seoSummary: { keywordTags: [{ label: 'kpi', slug: 'kpi', source: 'opportunity' }] },
      });
    });

    const input: SelectTopicCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://a.com', publishedAt: new Date() }],
      tags: [{ label: 'ppsps', slug: 'ppsps', source: 'seed' }],
      language: 'fr',
      seoBriefData: { keywordTags: [{ label: 'ppsps' }] } as any,
    };

    const result = await workflow.execute(input, {
      maxTopics: 3,
      templatePath: 'test.poml',
      maxAttempts: 3,
    });

    // Vérifications
    expect(result).toBeDefined();
    expect(result.angle).toBe('KPI essentiels pour piloter un chantier BTP');
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].title).toBe('Tableau KPI chantier BTP');
    
    // Vérifier que searchSimilarBriefs a été appelé 2 fois (validate 1er + validate 2ème)
    expect(mockBriefStore.searchSimilarBriefs).toHaveBeenCalledTimes(2);
    
    // Vérifier que getExistingAngles a été appelé (analyzeGaps)
    expect(mockBriefStore.getExistingAngles).toHaveBeenCalledWith({
      projectId: 'project1',
      tenantId: 'tenant1',
      limit: 50,
    });
    
    // Vérifier que le LLM a été appelé 2 fois (generate 1er + generate après reangle)
    expect(mockAIModel.generateText).toHaveBeenCalledTimes(2);
  });
});
