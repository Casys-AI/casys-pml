import { describe, it, expect, vi } from 'vitest';
import { CreateEditorialBriefUseCase } from '../create-editorial-brief.usecase';
import type { EditorialBriefAgentPort } from '../../ports/out';

describe('CreateEditorialBriefUseCase', () => {
  it('creates an EditorialBrief without agent enrichment (reverse engineering mode)', async () => {
    const usecase = new CreateEditorialBriefUseCase();

    const brief = await usecase.execute({
      tenantId: 't1',
      projectId: 'p1',
      language: 'fr',
      angle: 'Test angle',
      businessContext: {
        targetAudience: 'pros btp',
        industry: 'btp',
        businessDescription: 'desc',
        contentType: 'article',
      },
      corpusTopicIds: ['topic-1', 'topic-2'],
      // V3: No agent params → reverse engineering mode (enriched fields undefined)
    } as any);

    // V3: EditorialBrief without agent enrichment has undefined enriched fields
    const obj = brief.toObject();
    expect(obj.keywordTags).toBeUndefined();
    expect(obj.relevantQuestions).toBeUndefined();
    expect(obj.priorityGaps).toBeUndefined();
    expect(obj.guidingRecommendations).toBeUndefined();
    expect(obj.angle).toBe('Test angle');
    expect(obj.corpusTopicIds).toEqual(['topic-1', 'topic-2']);
  });

  it('creates an EditorialBrief with agent enrichment (full generation mode)', async () => {
    // Mock agent port
    const mockAgent: EditorialBriefAgentPort = {
      generateBrief: vi.fn().mockResolvedValue({
        keywordTags: [
          { label: 'SEO', slug: 'seo', source: 'editorial' },
          { label: 'Content', slug: 'content', source: 'editorial' },
        ],
        relevantQuestions: ['Question 1', 'Question 2'],
        priorityGaps: [
          { gapDescription: 'Gap 1', priority: 'high', suggestedAngle: 'Angle 1' },
        ],
        guidingRecommendations: ['Rec 1', 'Rec 2'],
        corpusSummary: 'Summary of corpus',
        competitorAngles: ['Competitor angle 1'],
      }),
    };

    const usecase = new CreateEditorialBriefUseCase(mockAgent);

    const brief = await usecase.execute({
      tenantId: 't1',
      projectId: 'p1',
      language: 'fr',
      angle: 'Guide SEO complet',
      businessContext: {
        targetAudience: 'Developers',
        industry: 'Tech',
        businessDescription: 'Company',
        contentType: 'guide',
      },
      corpusTopicIds: ['topic-1', 'topic-2'],
      // V3: Agent params présents → génération complète (requis: chosenCluster, contentType, seoBriefData, selectedTopics)
      chosenCluster: {
        pillarTag: { label: 'SEO', slug: 'seo', source: 'pillar' },
        satelliteTags: [{ label: 'Keywords', slug: 'keywords', source: 'satellite' }],
      },
      contentType: 'guide',
      seoBriefData: {
        keywordTags: [{ label: 'SEO', slug: 'seo', source: 'seed' }],
      },
      selectedTopics: [],
      sourceArticles: [],
    } as any);

    // Vérifier que l'agent a été appelé
    expect(mockAgent.generateBrief).toHaveBeenCalled();

    // V3: EditorialBrief with agent enrichment has populated enriched fields
    const obj = brief.toObject();
    expect(obj.keywordTags).toHaveLength(2);
    expect(obj.keywordTags![0].label).toBe('SEO');
    expect(obj.relevantQuestions).toHaveLength(2);
    expect(obj.priorityGaps).toHaveLength(1);
    expect(obj.guidingRecommendations).toHaveLength(2);
    expect(obj.angle).toBe('Guide SEO complet');
  });

  it('executes successfully in both modes (logs are called)', async () => {
    // Test de régression: s'assurer que les logs stratégiques n'empêchent pas l'exécution
    const usecase1 = new CreateEditorialBriefUseCase();
    const usecase2 = new CreateEditorialBriefUseCase({
      generateBrief: vi.fn().mockResolvedValue({
        keywordTags: [],
        relevantQuestions: [],
        priorityGaps: [],
        guidingRecommendations: [],
      }),
    });

    // Mode reverse engineering
    const brief1 = await usecase1.execute({
      tenantId: 't1',
      projectId: 'p1',
      language: 'fr',
      angle: 'Angle 1',
      businessContext: {
        targetAudience: 'Audience',
        industry: 'Industry',
        businessDescription: 'Description',
        contentType: 'article',
      },
      corpusTopicIds: ['topic-1'],
    } as any);

    // Mode génération complète
    const brief2 = await usecase2.execute({
      tenantId: 't1',
      projectId: 'p1',
      language: 'fr',
      angle: 'Angle 2',
      businessContext: {
        targetAudience: 'Audience',
        industry: 'Industry',
        businessDescription: 'Description',
        contentType: 'article',
      },
      corpusTopicIds: ['topic-1'],
      chosenCluster: {
        pillarTag: { label: 'SEO', slug: 'seo', source: 'pillar' },
        satelliteTags: [],
      },
      contentType: 'article',
      seoBriefData: {
        keywordTags: [],
      },
      selectedTopics: [],
      sourceArticles: [],
    } as any);

    // Les deux devraient réussir sans crash
    expect(brief1).toBeDefined();
    expect(brief2).toBeDefined();
  });
});
