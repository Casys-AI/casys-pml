import { describe, expect, it, vi } from 'vitest';

import type { AITextModelPort } from '@casys/application';

import { SeoAnalysisAgent } from '../seo-analysis.agent';

describe('SeoAnalysisAgent - Blog Strategy Integration (v2)', () => {
  it('should parse blog strategy fields: priority, clusterType, topicClusters, structured recommendations', async () => {
    // Mock AI response with blog strategy v2 fields
    const mockAIResponse = JSON.stringify({
      keywordPlan: {
        tags: [
          { label: 'Guide BTP 2025', priority: 9, clusterType: 'pillar' },
          { label: 'Réglementation chantier', priority: 8, clusterType: 'cluster' },
          { label: 'Sanctions PPSPS', priority: 7, clusterType: 'cluster' },
        ],
      },
      contentStrategy: {
        topicClusters: [
          {
            pillarKeyword: 'Guide BTP 2025',
            clusterKeywords: ['Réglementation chantier', 'Sanctions PPSPS'],
          },
        ],
        recommendations: {
          seo: ['Optimiser meta descriptions', 'Internal linking vers piliers'],
          editorial: ['Angle actionnable: Guide pas-à-pas', 'Inclure exemples concrets'],
          technical: ['Longueur cible: 2500 mots', 'Structure H2/H3 claire'],
        },
      },
      searchIntent: {
        intent: 'informational',
        confidence: 0.85,
        supportingQueries: ['Comment se mettre en conformité BTP 2025?'],
        contentRecommendations: {
          articleTypes: ['guide', 'tutoriel', 'check-list'],
          contentAngles: ['Guide complet avec exemples', 'Tutoriel pas-à-pas'],
        },
      },
      competitiveAnalysis: {
        contentGaps: [
          {
            keyword: 'Check-list conformité 2025',
            gap: 'Aucun concurrent ne propose de liste téléchargeable',
            type: 'cluster',
            opportunityScore: 8,
          },
        ],
      },
    });

    const mockAIModel: AITextModelPort = {
      generateText: vi.fn().mockResolvedValue(mockAIResponse),
    };

    const agent = new SeoAnalysisAgent(mockAIModel);
    const result = await agent.analyze('<poml>test</poml>');

    // Verify keywordPlan.tags have blog strategy fields
    expect(result.keywordPlan.tags).toHaveLength(3);
    expect(result.keywordPlan.tags[0]).toMatchObject({
      label: 'Guide BTP 2025',
      priority: 9,
      clusterType: 'pillar',
    });
    expect(result.keywordPlan.tags[1]).toMatchObject({
      label: 'Réglementation chantier',
      priority: 8,
      clusterType: 'cluster',
    });

    // Verify topicClusters
    expect(result.contentStrategy?.topicClusters).toHaveLength(1);
    expect(result.contentStrategy?.topicClusters![0]).toMatchObject({
      pillarKeyword: 'Guide BTP 2025',
      clusterKeywords: ['Réglementation chantier', 'Sanctions PPSPS'],
    });

    // Verify structured recommendations
    expect(result.contentStrategy?.recommendations).toBeDefined();
    expect((result.contentStrategy?.recommendations as any).seo).toContain(
      'Optimiser meta descriptions'
    );
    expect((result.contentStrategy?.recommendations as any).editorial).toContain(
      'Angle actionnable: Guide pas-à-pas'
    );

    // Verify typed content gaps
    expect(result.competitiveAnalysis?.contentGaps).toHaveLength(1);
    expect(result.competitiveAnalysis?.contentGaps![0]).toMatchObject({
      keyword: 'Check-list conformité 2025',
      type: 'cluster',
      opportunityScore: 8,
    });

    // Verify structured contentRecommendations
    expect(result.searchIntent.contentRecommendations).toBeDefined();
    const contentRecs = result.searchIntent.contentRecommendations as any;
    expect(contentRecs.articleTypes).toContain('guide');
    expect(contentRecs.contentAngles).toContain('Guide complet avec exemples');
  });

  it('should support legacy format (backward compatibility)', async () => {
    // Mock AI response with old format (no blog strategy fields)
    const mockAIResponse = JSON.stringify({
      keywordPlan: {
        tags: [
          { label: 'BTP 2025', priority: 5 }, // priority without clusterType
        ],
      },
      searchIntent: {
        intent: 'informational',
        confidence: 0.8,
        supportingQueries: ['question 1'],
        contentRecommendations: ['reco 1', 'reco 2'], // old array format
      },
      competitiveAnalysis: {
        contentGaps: [
          { keyword: 'gap1', gap: 'opportunity' }, // no type/opportunityScore
        ],
      },
    });

    const mockAIModel: AITextModelPort = {
      generateText: vi.fn().mockResolvedValue(mockAIResponse),
    };

    const agent = new SeoAnalysisAgent(mockAIModel);
    const result = await agent.analyze('<poml>test</poml>');

    // Should parse successfully
    expect(result.keywordPlan.tags).toHaveLength(1);
    expect(result.keywordPlan.tags[0]).toMatchObject({
      label: 'BTP 2025',
      priority: 5,
      clusterType: undefined, // no clusterType in old format
    });

    // Legacy recommendations should be undefined (not parsed as structured)
    expect(result.keywordPlan.recommendations).toBeUndefined();

    // Legacy contentRecommendations should pass through
    expect(result.searchIntent.contentRecommendations).toEqual(['reco 1', 'reco 2']);

    // Legacy contentGaps should be parsed from competitiveAnalysis
    expect(result.competitiveAnalysis?.contentGaps).toHaveLength(1);
  });
});