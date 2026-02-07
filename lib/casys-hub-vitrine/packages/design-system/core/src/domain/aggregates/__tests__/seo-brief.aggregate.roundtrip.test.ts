import { describe, it, expect } from 'vitest';
import type { SeoBriefDataV3 } from '../../types/seo.types';
import { toV2SeoBriefData, toV3SeoBriefData } from '../../types/seo.types';

describe('SeoBrief v2/v3 conversion - No data loss', () => {
  const v3Complete: SeoBriefDataV3 = {
    keywordTags: [
      { label: 'test keyword', slug: 'test-keyword', source: 'opportunity', weight: 0.9 },
    ],
    searchIntent: {
      intent: 'informational',
      confidence: 0.85,
      supportingQueries: ['how to test'],
      contentRecommendations: undefined,
    },
    contentStrategy: {
      topicClusters: [
        {
          pillarTag: { label: 'test', slug: 'test', source: 'pillar' },
          satelliteTags: [{ label: 'sub-test', slug: 'sub-test', source: 'satellite' }],
        },
      ],
      recommendations: {
        seo: ['use schema.org'],
        editorial: ['write clearly'],
        technical: ['optimize images'],
      },
    },
    competitiveAnalysis: {
      contentGaps: [{ keyword: 'gap1', gap: 'missing content', opportunityScore: 0.8 } as any],
      competitorTitles: ['Competitor Guide 2025'],
    },
  };

  it('should preserve competitorTitles in v3 → v2 → v3 roundtrip', () => {
    const v2 = toV2SeoBriefData(v3Complete);
    const v3Back = toV3SeoBriefData(v2);

    expect(v3Back.competitiveAnalysis.competitorTitles).toEqual(['Competitor Guide 2025']);
  });

  it('should preserve topicClusters in v3 → v2 → v3 roundtrip', () => {
    const v2 = toV2SeoBriefData(v3Complete);
    const v3Back = toV3SeoBriefData(v2);

    expect(v3Back.contentStrategy.topicClusters).toHaveLength(1);
    expect(v3Back.contentStrategy.topicClusters?.[0]?.pillarTag?.label).toBe('test');
    expect(v3Back.contentStrategy.topicClusters?.[0]?.satelliteTags?.[0]?.label).toBe('sub-test');
  });

  it('should preserve recommendations structure in v3 → v2 → v3 roundtrip', () => {
    const v2 = toV2SeoBriefData(v3Complete);
    const v3Back = toV3SeoBriefData(v2);

    expect(v3Back.contentStrategy.recommendations?.seo).toEqual(['use schema.org']);
    expect(v3Back.contentStrategy.recommendations?.editorial).toEqual(['write clearly']);
    expect(v3Back.contentStrategy.recommendations?.technical).toEqual(['optimize images']);
  });
});
