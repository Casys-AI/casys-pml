import { describe, it, expect, vi } from 'vitest';

import type { PromptTemplatePort } from '../../ports/out';
import { buildTopicSelectorPoml } from '../topic-selector.prompt';

const TEMPLATE = `
<poml>
  <p>HEADER</p>
  <p if="seoBriefData">SEO: {{seoBriefData.searchIntent}}</p>
  <p if="existingBriefsCount">EXISTING({{existingBriefsCount}})</p>
  <p if="feedback">FEEDBACK: {{feedback}}</p>
</poml>
`;

describe('buildTopicSelectorPoml (integration of conditional blocks)', () => {
  const templatePort: PromptTemplatePort = {
    loadTemplate: vi.fn().mockResolvedValue(TEMPLATE),
  } as any;

  const baseParams = {
    maxTopics: 3,
    angle: 'Test editorial angle for construction regulations', // ✨ V3: Requis
    chosenCluster: { // ✨ V3: Requis
      pillarTag: { label: 'BTP', slug: 'btp', source: 'opportunity' },
      satelliteTags: [{ label: 'Réglementation', slug: 'reglementation', source: 'opportunity' }],
    },
    tagLabels: ['reglementation', 'btp'],
    articlesJson: JSON.stringify([{ id: 'a1', title: 'Article 1' }]),
  } as any;

  it('renders seoBriefData and existingBriefs blocks on initial run (no feedback)', async () => {
    const params = {
      ...baseParams,
      seoBriefData: { searchIntent: 'informational', keywordTags: [{ label: 'btp' }] },
      existingBriefsJson: JSON.stringify([{ id: 'b1', angle: 'Angle 1' }]),
      existingBriefsCount: '2',
      // no feedback
    } as any;

    const rendered = await buildTopicSelectorPoml(templatePort, 'dummy.poml', params);

    expect(rendered).toContain('HEADER');
    expect(rendered).toContain('SEO: informational');
    expect(rendered).toContain('EXISTING(2)');
    expect(rendered).not.toContain('FEEDBACK:');
  });

  // ✨ V3: Obsolète - le reangle/feedback est maintenant géré par GenerateAngleUseCase, pas TopicSelector
  it.skip('renders feedback only on reangle (no seoBriefData nor existingBriefs)', async () => {
    const params = {
      ...baseParams,
      // explicitly omit seoBriefData and existingBriefs* on reangle
      feedback: 'Angles à éviter: A, B, C. Explore un sous-cluster différent.',
    } as any;

    const rendered = await buildTopicSelectorPoml(templatePort, 'dummy.poml', params);

    expect(rendered).toContain('HEADER');
    expect(rendered).toContain('FEEDBACK: Angles à éviter: A, B, C');
    expect(rendered).not.toContain('SEO:');
    expect(rendered).not.toContain('EXISTING(');
  });
});
