import { describe, expect, it, vi } from 'vitest';

import type { PromptTemplatePort } from '../../ports/out';
import { buildTopicSelectorPoml } from '../topic-selector.prompt';

const TEMPLATE = `
<poml>
  <p>HEADER</p>
  
  <!-- Blog strategy flags -->
  <p if="seoHasPriority">HIGH PRIORITY KEYWORDS DETECTED</p>
  <p if="seoHasTopicClusters">TOPIC CLUSTERS DETECTED</p>
  
  <!-- SEO context -->
  <p if="seoBriefData">SEO Context:</p>
  <list if="seoBriefData">
    <item if="seoHasPriority">Priority keywords available</item>
    <item if="seoHasTopicClusters">Clusters available</item>
  </list>
  
  <!-- Full JSON -->
  <p if="seoBriefData" syntax="json">{{seoBriefData}}</p>
</poml>
`;

describe('TopicSelector - Blog Strategy Integration (v2)', () => {
  const templatePort: PromptTemplatePort = {
    loadTemplate: vi.fn().mockResolvedValue(TEMPLATE),
  } as any;

  const baseParams = {
    maxTopics: 3,
    angle: 'Test editorial angle for construction safety regulations', // ✨ V3: Requis
    chosenCluster: { // ✨ V3: Requis
      pillarTag: { label: 'Guide BTP', slug: 'guide-btp', source: 'opportunity' },
      satelliteTags: [
        { label: 'Réglementation', slug: 'reglementation', source: 'opportunity' },
      ],
    },
    tagLabels: ['BTP', 'réglementation'],
    articlesJson: JSON.stringify([{ id: 'a1', title: 'Article 1' }]),
  } as any;

  it('should detect blog strategy fields and render conditional blocks', async () => {
    const params = {
      ...baseParams,
      seoBriefData: {
        keywordTags: [
          { label: 'Guide BTP', slug: 'guide-btp', source: 'opportunity', priority: 9, clusterType: 'pillar' },
          { label: 'Réglementation', slug: 'reglementation', source: 'opportunity', priority: 7, clusterType: 'cluster' },
        ],
        topicClusters: [
          { pillarKeyword: 'Guide BTP', clusterKeywords: ['Réglementation', 'Sanctions'] },
        ],
        recommendations: {
          seo: ['Meta optimization'],
          editorial: ['Actionable angle'],
          technical: ['2500 words target'],
        },
        userQuestions: ['Comment se conformer?'],
        contentGaps: ['gap1'],
        seoRecommendations: ['reco1'],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: ['reco2'],
      },
    } as any;

    const rendered = await buildTopicSelectorPoml(templatePort, 'dummy.poml', params);

    // Should render blog strategy flags
    expect(rendered).toContain('HIGH PRIORITY KEYWORDS DETECTED');
    expect(rendered).toContain('TOPIC CLUSTERS DETECTED');
    expect(rendered).toContain('Priority keywords available');
    expect(rendered).toContain('Clusters available');

    // Should include full JSON with blog strategy fields (POML encodes quotes as &quot;)
    expect(rendered).toContain('&quot;priority&quot;:9');
    expect(rendered).toContain('&quot;clusterType&quot;:&quot;pillar&quot;');
    expect(rendered).toContain('&quot;topicClusters&quot;');
    expect(rendered).toContain('&quot;pillarKeyword&quot;:&quot;Guide BTP&quot;');
    expect(rendered).toContain('&quot;recommendations&quot;');
    expect(rendered).toContain('&quot;editorial&quot;');
  });

  it('should NOT render blog strategy blocks when fields are absent', async () => {
    const params = {
      ...baseParams,
      seoBriefData: {
        keywordTags: [
          { label: 'BTP', slug: 'btp', source: 'opportunity' }, // no priority, no clusterType
        ],
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
        // no topicClusters, no recommendations
      },
    } as any;

    const rendered = await buildTopicSelectorPoml(templatePort, 'dummy.poml', params);

    // Should NOT render blog strategy flags
    expect(rendered).not.toContain('HIGH PRIORITY KEYWORDS DETECTED');
    expect(rendered).not.toContain('TOPIC CLUSTERS DETECTED');
    expect(rendered).not.toContain('Priority keywords available');
    expect(rendered).not.toContain('Clusters available');

    // Should still include JSON (without blog fields) - POML encodes as &quot;
    expect(rendered).toContain('&quot;keywordTags&quot;');
    expect(rendered).not.toContain('&quot;priority&quot;');
    expect(rendered).not.toContain('&quot;topicClusters&quot;');
  });

  it('should handle mixed scenario: priority present, clusters absent', async () => {
    const params = {
      ...baseParams,
      seoBriefData: {
        keywordTags: [
          { label: 'BTP', slug: 'btp', source: 'opportunity', priority: 8 }, // priority but no clusterType
        ],
        userQuestions: [],
        contentGaps: [],
        seoRecommendations: [],
        searchIntent: 'informational',
        searchConfidence: 0.8,
        contentRecommendations: [],
        // no topicClusters
      },
    } as any;

    const rendered = await buildTopicSelectorPoml(templatePort, 'dummy.poml', params);

    // Should render priority flag only
    expect(rendered).toContain('HIGH PRIORITY KEYWORDS DETECTED');
    expect(rendered).toContain('Priority keywords available');
    
    // Should NOT render clusters flag
    expect(rendered).not.toContain('TOPIC CLUSTERS DETECTED');
    expect(rendered).not.toContain('Clusters available');
  });
});
