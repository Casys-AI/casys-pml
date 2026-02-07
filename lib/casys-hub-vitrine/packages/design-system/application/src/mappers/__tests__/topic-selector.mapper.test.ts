import { describe, expect,it } from 'vitest';

import type { KeywordTag, SelectTopicCommand, TopicCandidate } from '@casys/core';

import { mapCommandToTopicSelectorPromptDTO, mapTopicCandidatesToInputDTOs } from '../topic-selector.mapper';

function makeCommand(partial?: Partial<SelectTopicCommand>): SelectTopicCommand {
  const base: SelectTopicCommand = {
    tenantId: 't',
    projectId: 'p',
    language: 'fr',
    tags: [
      { label: 'enhanced1', slug: 'enhanced1', source: 'ai' } as KeywordTag,
      { label: 'enhanced2', slug: 'enhanced2', source: 'ai' } as KeywordTag,
    ],
    articles: [
      {
        id: 'a1',
        title: 'T1',
        description: 'D1',
        sourceUrl: 'https://x/a1',
        sourceTitle: 'S1',
        publishedAt: '2025-08-25T00:00:00.000Z',
        relevanceScore: 0.9,
        categories: ['c1'],
      },
      {
        id: 'invalid',
        title: '', // sera filtré
        sourceUrl: '', // sera filtré
      },
    ],
    seoBriefData: {
      keywordTags: [{ label: 'kw1' }] as any,
      userQuestions: ['q1'],
      competitorTitles: [],
      contentGaps: ['gap1'],
      seoRecommendations: ['rec1'],
      searchIntent: 'informational',
      searchConfidence: 0.7,
      contentRecommendations: ['format1']
    },
    // V3: Angle éditorial et métadonnées (fournis par GenerateAngleUseCase)
    angle: 'Test editorial angle',
    chosenCluster: {
      pillarTag: { label: 'test-pillar', slug: 'test-pillar' } as any,
      satelliteTags: [],
    },
    contentType: 'article',
    selectionMode: 'strategic',
  };
  return { ...base, ...partial };
}

describe('topic-selector.mapper', () => {
  it('should map seoBriefData.keywordTags -> tagLabels', () => {
    const command = makeCommand({ seoBriefData: {
      keywordTags: [
        { label: 'seo1', slug: 'seo1', source: 'ai' } as any,
        { label: 'seo2', slug: 'seo2', source: 'ai' } as any,
      ],
      userQuestions: ['q1'],
      competitorTitles: [],
      contentGaps: [],
      seoRecommendations: [],
      searchIntent: 'informational',
      searchConfidence: 0.7,
      contentRecommendations: []
    } as any });
    const dto = mapCommandToTopicSelectorPromptDTO(command, { maxTopics: 3 });
    expect(dto.tagLabels).toEqual(['seo1', 'seo2']);
  });

  it('should require maxTopics > 0', () => {
    const cmd = makeCommand();
    expect(() => {
      mapCommandToTopicSelectorPromptDTO(cmd, { maxTopics: 0 });
    }).toThrow('maxTopics requis (>0)');

    expect(() => {
      mapCommandToTopicSelectorPromptDTO(cmd, { maxTopics: -1 as any });
    }).toThrow('maxTopics requis (>0)');
  });

  it('should require keywordTags (keywordPlan.tags) and non-empty labels', () => {
    expect(() => {
      mapCommandToTopicSelectorPromptDTO(makeCommand({ seoBriefData: { keywordTags: [] } as any }), { maxTopics: 3 });
    }).toThrow('seoBriefData.keywordTags requis (labels)');

    expect(() => {
      mapCommandToTopicSelectorPromptDTO(
        makeCommand({ seoBriefData: { keywordTags: [{ label: '', slug: '', source: 'ai' } as any] } as any }),
        { maxTopics: 3 }
      );
    }).toThrow('seoBriefData.keywordTags requis (labels)');
  });

  it('should fail-fast if no valid articles', () => {
    expect(() => {
      mapCommandToTopicSelectorPromptDTO(
        makeCommand({
          articles: [
            { id: 'x', title: '', sourceUrl: '' } as any,
            { id: 'y', title: 'ok', sourceUrl: '' } as any,
          ],
        }),
        { maxTopics: 3 }
      );
    }).toThrow(/Aucun article valide/);
  });

  it('should normalize articles in JSON format', () => {
    const command = makeCommand();
    const dto = mapCommandToTopicSelectorPromptDTO(command, { maxTopics: 3 });
    const parsed = JSON.parse(dto.articlesJson);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      title: 'T1',
      description: 'D1',
      url: 'https://x/a1',
      source: 'S1',
      publishedAt: '2025-08-25T00:00:00.000Z'
    });
  });

  it('should include seoBriefData with keywordTags when provided', () => {
    const command = makeCommand({
      seoBriefData: {
        keywordTags: [{ label: 'kw-test', slug: 'kw-test' }] as any,
        userQuestions: ['q1'],
        contentGaps: ['gap1', 'gap2'],
        seoRecommendations: ['rec1'],
        searchIntent: 'commercial',
        searchConfidence: 0.5,
        contentRecommendations: ['format']
      } as any,
    });
    const dto = mapCommandToTopicSelectorPromptDTO(command, { maxTopics: 3 });
    expect(dto.seoBriefData).toBeDefined();
    expect(dto.seoBriefData?.keywordTags).toBeDefined();
    expect(dto.seoBriefData?.keywordTags?.map(t => t.label)).toEqual(['kw-test']);
    expect(dto.seoBriefData?.userQuestions).toEqual(['q1']);
    expect(dto.seoBriefData?.contentGaps).toEqual(['gap1', 'gap2']);
  });

  it('should fail-fast when seoBriefData not provided (keywordTags required)', () => {
    const command = makeCommand({ seoBriefData: undefined });
    expect(() => mapCommandToTopicSelectorPromptDTO(command, { maxTopics: 3 }))
      .toThrow('seoBriefData.keywordTags requis (labels)');
  });

  it('should fail-fast when seoBriefData is an empty object', () => {
    const command = makeCommand({ seoBriefData: {} as any });
    expect(() => mapCommandToTopicSelectorPromptDTO(command, { maxTopics: 3 }))
      .toThrow('seoBriefData.keywordTags requis (labels)');
  });

  it('should filter and map TopicCandidates correctly', () => {
    const candidates: TopicCandidate[] = [
      {
        id: 'c1',
        title: 'C1',
        sourceUrl: 'https://x/c1',
        description: 'desc',
        sourceTitle: 'src',
        publishedAt: '2025-01-01T00:00:00.000Z',
        relevanceScore: 0.5,
        categories: ['a'],
      } as any,
      {
        id: 'skip',
        title: '',
        sourceUrl: '',
      } as any,
    ];

    const out = mapTopicCandidatesToInputDTOs(candidates);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'c1',
      title: 'C1',
      sourceUrl: 'https://x/c1',
      description: 'desc',
      sourceTitle: 'src',
      publishedAt: '2025-01-01T00:00:00.000Z',
      relevanceScore: 0.5,
      categories: ['a'],
    });
  });

  it('should filter out invalid TopicCandidates', () => {
    const candidates: TopicCandidate[] = [
      {
        id: 'invalid1',
        title: '',
        sourceUrl: 'https://example.com',
      } as any,
      {
        id: 'invalid2',
        title: 'Valid Title',
        sourceUrl: '',
      } as any,
      {
        id: 'valid',
        title: 'Valid Title',
        sourceUrl: 'https://example.com',
        description: 'Valid description',
        sourceTitle: 'Source',
        publishedAt: '2025-01-01T00:00:00.000Z',
        relevanceScore: 0.8,
      } as any,
    ];

    const out = mapTopicCandidatesToInputDTOs(candidates);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('valid');
  });
});