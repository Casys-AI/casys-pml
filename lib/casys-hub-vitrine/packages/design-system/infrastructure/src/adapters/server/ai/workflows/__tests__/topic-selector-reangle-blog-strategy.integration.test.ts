import { describe, expect, it, vi } from 'vitest';

import { filterTopicsNode } from '../topic-selector.nodes';
import type { TopicSelectorState } from '../topic-selector.types';

describe.skip('TopicSelector - Reangle Feedback Blog Strategy (v2)', () => {
  const mockLogger = {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const baseState: TopicSelectorState = {
    articles: [{ id: 'a1', title: 'Article 1', sourceUrl: 'http://test.com', publishedAt: new Date() }],
    tags: [{ label: 'BTP', slug: 'btp', source: 'seed' }],
    projectId: 'project1',
    tenantId: 'tenant1',
    language: 'fr',
    maxTopics: 3,
    templatePath: 'test.poml',
    attempts: 0,
    maxAttempts: 3,
    status: 'reangling',
    angle: 'Guide BTP 2025',
    conflictingBriefs: [
      {
        briefId: 'b1',
        angle: 'Guide complet BTP',
        similarityScore: 0.8,
      },
    ],
    existingAngles: ['Guide complet BTP', 'Réglementation BTP 2025'],
    contentGaps: ['Gap 1: Check-list conformité', 'Gap 2: Calendrier échéances'],
  };

  it('should include blog strategy fields in feedback: high priority keywords', async () => {
    const state: TopicSelectorState = {
      ...baseState,
      seoBriefData: {
        keywordTags: [
          { label: 'Guide BTP', slug: 'guide-btp', source: 'opportunity', priority: 9, clusterType: 'pillar' },
          { label: 'Réglementation', slug: 'reglementation', source: 'opportunity', priority: 8 },
          { label: 'Sanctions', slug: 'sanctions', source: 'opportunity', priority: 6 },
        ],
        userQuestions: ['Comment se conformer?'],
        contentGaps: ['gap1'],
        seoRecommendations: ['reco1'],
        searchIntent: 'informational',
        searchConfidence: 0.85,
        contentRecommendations: ['reco2'],
      } as any,
    };

    const result = await reangleNode(state, { logger: mockLogger });

    expect(result.feedback).toBeDefined();
    expect(result.feedback).toContain('🎯 Keywords haute priorité (blog)');
    expect(result.feedback).toContain('Guide BTP (priorité 9)');
    expect(result.feedback).toContain('Réglementation (priorité 8)');
    // Priority 6 should not appear (< 7 threshold)
    expect(result.feedback).not.toContain('Sanctions (priorité 6)');
  });

  it('should include blog strategy fields in feedback: topic clusters', async () => {
    const state: TopicSelectorState = {
      ...baseState,
      seoBriefData: {
        keywordTags: [{ label: 'BTP', slug: 'btp', source: 'opportunity' }],
        topicClusters: [
          {
            pillarKeyword: 'Guide BTP 2025',
            clusterKeywords: ['Réglementation chantier', 'Sanctions PPSPS', 'Certifications RGE'],
          },
          {
            pillarKeyword: 'ROI BTP',
            clusterKeywords: ['Rentabilité certifications', 'Amortissement investissements'],
          },
        ],
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
      } as any,
    };

    const result = await reangleNode(state, { logger: mockLogger });

    expect(result.feedback).toContain('📊 Clusters thématiques disponibles');
    expect(result.feedback).toContain('PILIER: "Guide BTP 2025"');
    expect(result.feedback).toContain('Satellites: Réglementation chantier, Sanctions PPSPS, Certifications RGE');
    expect(result.feedback).toContain('PILIER: "ROI BTP"');
  });

  it('should include blog strategy fields in feedback: editorial recommendations', async () => {
    const state: TopicSelectorState = {
      ...baseState,
      seoBriefData: {
        keywordTags: [{ label: 'BTP', slug: 'btp', source: 'opportunity' }],
        recommendations: {
          seo: ['SEO reco 1', 'SEO reco 2'],
          editorial: [
            'Angle actionnable: Guide pas-à-pas',
            'Inclure exemples concrets de chantiers',
            'Perspective financière: ROI certifications',
            'Format check-list téléchargeable',
            'Interview expert réglementation',
            'Cas d\'usage réel: PME du bâtiment', // 6th should not appear (limit 5)
          ],
          technical: ['Longueur: 2500 mots', 'Structure H2/H3'],
        },
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
      } as any,
    };

    const result = await reangleNode(state, { logger: mockLogger });

    expect(result.feedback).toContain('📝 Angles éditoriaux suggérés');
    expect(result.feedback).toContain('Angle actionnable: Guide pas-à-pas');
    expect(result.feedback).toContain('Inclure exemples concrets de chantiers');
    expect(result.feedback).toContain('Interview expert réglementation');
    // 6th should not appear (limit 5)
    expect(result.feedback).not.toContain('Cas d\'usage réel: PME du bâtiment');
  });

  it('should NOT include blog strategy sections when fields are absent', async () => {
    const state: TopicSelectorState = {
      ...baseState,
      seoBriefData: {
        keywordTags: [{ label: 'BTP', slug: 'btp', source: 'opportunity' }], // no priority
        userQuestions: ['question 1'],
        contentGaps: ['gap1'],
        seoRecommendations: ['reco1'],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: ['reco2'],
        // no topicClusters, no recommendations
      } as any,
    };

    const result = await reangleNode(state, { logger: mockLogger });

    expect(result.feedback).toBeDefined();
    // Should NOT contain blog strategy sections
    expect(result.feedback).not.toContain('🎯 Keywords haute priorité');
    expect(result.feedback).not.toContain('📊 Clusters thématiques');
    expect(result.feedback).not.toContain('📝 Angles éditoriaux suggérés');

    // Should still contain base feedback
    expect(result.feedback).toContain('🚨 ANGLE REJETÉ POUR DOUBLON');
    expect(result.feedback).toContain('Guide BTP 2025');
    expect(result.feedback).toContain('⛔ INTERDICTIONS ABSOLUES');
  });

  it('should handle all blog strategy fields together', async () => {
    const state: TopicSelectorState = {
      ...baseState,
      seoBriefData: {
        keywordTags: [
          { label: 'Guide BTP', slug: 'guide-btp', source: 'opportunity', priority: 9, clusterType: 'pillar' },
          { label: 'Sanctions', slug: 'sanctions', source: 'opportunity', priority: 7, clusterType: 'cluster' },
        ],
        topicClusters: [
          { pillarKeyword: 'Guide BTP', clusterKeywords: ['Sanctions', 'Contrôles'] },
        ],
        recommendations: {
          seo: ['SEO tip'],
          editorial: ['Angle actionnable'],
          technical: ['Format long'],
        },
        userQuestions: ['question'],
        contentGaps: ['gap'],
        seoRecommendations: ['reco'],
        searchIntent: 'informational',
        searchConfidence: 0.85,
        contentRecommendations: ['content reco'],
      } as any,
    };

    const result = await reangleNode(state, { logger: mockLogger });

    // All 3 blog strategy sections should be present
    expect(result.feedback).toContain('🎯 Keywords haute priorité (blog)');
    expect(result.feedback).toContain('📊 Clusters thématiques disponibles');
    expect(result.feedback).toContain('📝 Angles éditoriaux suggérés');
    
    // Verify order (priority → clusters → editorial)
    const priorityIndex = result.feedback!.indexOf('🎯 Keywords haute priorité');
    const clustersIndex = result.feedback!.indexOf('📊 Clusters thématiques');
    const editorialIndex = result.feedback!.indexOf('📝 Angles éditoriaux');
    
    expect(priorityIndex).toBeLessThan(clustersIndex);
    expect(clustersIndex).toBeLessThan(editorialIndex);
  });
});
