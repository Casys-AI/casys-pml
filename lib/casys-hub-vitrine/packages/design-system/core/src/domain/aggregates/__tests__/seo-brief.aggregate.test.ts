import { describe, it, expect } from 'vitest';
import type { SeoBriefData, SeoBriefDataV3 } from '../../types/seo.types';
import { SeoBriefAggregate } from '../seo-brief.aggregate';

describe('SeoBriefAggregate', () => {
  const v3: SeoBriefDataV3 = {
    keywordTags: [
      { label: 'réglementation chantier', slug: 'reglementation-chantier', source: 'pillar' },
      { label: 'ppsps', slug: 'ppsps', source: 'satellite' },
    ],
    searchIntent: {
      intent: 'informational',
      confidence: 0.9,
      supportingQueries: ['comment faire le ppsps ?'],
      contentRecommendations: undefined,
    },
    contentStrategy: {
      topicClusters: [
        {
          pillarTag: { label: 'réglementation chantier', slug: 'reglementation-chantier', source: 'pillar' },
          satelliteTags: [{ label: 'ppsps', slug: 'ppsps', source: 'satellite' }],
        },
      ],
      recommendations: { seo: ['schema.org'], editorial: ['ton pédago'], technical: ['liens internes'] },
    },
    competitiveAnalysis: {
      contentGaps: [{ keyword: 'PPSPS', gap: 'peu de guides à jour 2025' } as any],
      competitorTitles: ['Guide PPSPS 2025 - INRS'],
    },
  };

  it('fromV3 -> toV2 preserves competitorTitles and topicClusters', () => {
    const agg = SeoBriefAggregate.fromV3(v3);
    const v2: SeoBriefData = agg.toV2();
    expect(v2.competitorTitles).toEqual(['Guide PPSPS 2025 - INRS']);
    expect(v2.topicClusters?.[0]?.pillarTag?.label).toBe('réglementation chantier');
    expect(v2.topicClusters?.[0]?.satelliteTags?.[0]?.label).toBe('ppsps');
  });

  it('fromV2 -> toV3 roundtrip keeps competitorTitles and clusters', () => {
    const agg = SeoBriefAggregate.fromV3(v3);
    const v2 = agg.toV2();
    const agg2 = SeoBriefAggregate.fromV2(v2);
    const v3b = agg2.toV3();
    expect(v3b.competitiveAnalysis.competitorTitles).toEqual(['Guide PPSPS 2025 - INRS']);
    expect(v3b.contentStrategy.topicClusters?.[0]?.pillarTag?.label).toBe('réglementation chantier');
  });
});
