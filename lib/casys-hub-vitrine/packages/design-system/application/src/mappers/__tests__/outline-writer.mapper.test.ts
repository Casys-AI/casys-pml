import { describe, expect, it } from 'vitest';

import type { OutlineWriterCommandDTO } from '@casys/shared';

import { mapCommandToOutlineWriterPromptDTO } from '../outline-writer.mapper';

function makeCommand(partial?: Partial<OutlineWriterCommandDTO>): OutlineWriterCommandDTO {
  const base: OutlineWriterCommandDTO = {
    language: 'fr',
    articleId: 'art-1',
    topics: [
      {
        id: 't1',
        title: 'Sujet 1',
        sourceUrl: 'https://example.com/a',
        createdAt: '2025-01-01T00:00:00.000Z',
        language: 'fr',
        keywords: ['k1', 'k2'],
      },
    ],
    angle: 'Angle éditorial test',
    contentType: 'article',
    // ✨ V3: editorialBriefData remplace seoSummary
    editorialBriefData: {
      keywordTags: [
        { label: 'ek1', slug: 'ek1', source: 'opportunity' } as any,
        { label: 'ek2', slug: 'ek2', source: 'opportunity' } as any,
      ],
      relevantQuestions: ['q1'], // ✨ V3: Rename from supportingQueries
      priorityGaps: [
        { keyword: { label: 'ek1' } as any, gap: 'gap1' }
      ], // ✨ V3: ContentGapDTO format
      guidingRecommendations: {
        seo: [],
        editorial: [],
      },
    } as any,
    sourceArticles: [
      {
        title: 'A1',
        sourceUrl: 'https://example.com/a1',
        content: 'full content',
        summary: 'sum',
      },
    ],
  };
  return { ...base, ...partial };
}

describe('outline-writer.mapper', () => {
  it('maps command to prompt with topicsJson and counters', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
    expect(dto.language).toBe('fr');
    expect(dto.articleId).toBe('art-1');
    expect(dto.topicsCount).toBe(1);
    const topics = JSON.parse(dto.topicsJson);
    expect(Array.isArray(topics)).toBe(true);
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      id: 't1',
      title: 'Sujet 1',
      sourceUrl: 'https://example.com/a',
      createdAt: '2025-01-01T00:00:00.000Z',
      language: 'fr',
      keywords: ['k1', 'k2'],
    });
  });

  it('includes sourceArticlesJson when provided', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
    expect(dto.sourceArticlesJson).toBeDefined();
    const articles = JSON.parse(dto.sourceArticlesJson!);
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: 'A1',
      sourceUrl: 'https://example.com/a1',
      content: 'full content',
      summary: 'sum',
    });
  });

  // ✨ V3: Renommer le test pour refléter editorialBriefData
  it('propagates editorialBriefData arrays (V3)', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
    expect(dto.keywordTags?.map(t => t.label)).toEqual(['ek1', 'ek2']);
    expect(dto.userQuestions).toEqual(['q1']);
    // ✨ V3: contentGaps combine keyword + gap → "ek1: gap1"
    expect(dto.contentGaps).toEqual(['ek1: gap1']);
  });

  it('defaults contentType to article when missing', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand({ contentType: undefined }));
    expect(dto.contentType).toBe('article');
  });

  it('fail-fast: requires language, articleId, and at least one topic', () => {
    expect(() => mapCommandToOutlineWriterPromptDTO(makeCommand({ language: '' as any }))).toThrow(
      /language requis/
    );
    expect(() => mapCommandToOutlineWriterPromptDTO(makeCommand({ articleId: '' as any }))).toThrow(
      /articleId requis/
    );
    expect(() => mapCommandToOutlineWriterPromptDTO(makeCommand({ topics: [] }))).toThrow(
      /topics requis/
    );
  });

  it('passes maxSections from options to the DTO', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), { maxSections: 5 });
    expect(dto.maxSections).toBe(5);
  });

  it('defaults maxSections to undefined when not provided in options', () => {
    const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
    expect(dto.maxSections).toBeUndefined();
  });

  // V3.1: Section Constraints Tests
  describe('V3.1 Section Constraints', () => {
    it('passes targetSectionsCount from options to the DTO', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), { targetSectionsCount: 7 });
      expect(dto.targetSectionsCount).toBe(7);
    });

    it('passes targetCharsPerSection from options to the DTO', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), { targetCharsPerSection: 1200 });
      expect(dto.targetCharsPerSection).toBe(1200);
    });

    it('passes both section constraints from options to the DTO', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        targetSectionsCount: 7,
        targetCharsPerSection: 1200,
      });
      expect(dto.targetSectionsCount).toBe(7);
      expect(dto.targetCharsPerSection).toBe(1200);
    });

    it('defaults targetSectionsCount to undefined when not provided in options', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
      expect(dto.targetSectionsCount).toBeUndefined();
    });

    it('defaults targetCharsPerSection to undefined when not provided in options', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());
      expect(dto.targetCharsPerSection).toBeUndefined();
    });

    it('handles targetSectionsCount independently of targetCharsPerSection', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        targetSectionsCount: 5,
      });
      expect(dto.targetSectionsCount).toBe(5);
      expect(dto.targetCharsPerSection).toBeUndefined();
    });

    it('handles targetCharsPerSection independently of targetSectionsCount', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        targetCharsPerSection: 1500,
      });
      expect(dto.targetCharsPerSection).toBe(1500);
      expect(dto.targetSectionsCount).toBeUndefined();
    });

    it('can combine V3.1 constraints with deprecated maxSections', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        maxSections: 10, // deprecated
        targetSectionsCount: 7, // V3.1
        targetCharsPerSection: 1200, // V3.1
      });
      expect(dto.maxSections).toBe(10);
      expect(dto.targetSectionsCount).toBe(7);
      expect(dto.targetCharsPerSection).toBe(1200);
    });
  });

  it('handles topics without keywords gracefully', () => {
    const cmd = makeCommand({
      topics: [
        {
          id: 't1',
          title: 'Topic sans keywords',
          sourceUrl: 'https://example.com',
          createdAt: '2025-01-01T00:00:00.000Z',
          language: 'fr',
          keywords: undefined as any,
        },
      ],
    });
    const dto = mapCommandToOutlineWriterPromptDTO(cmd);
    const topics = JSON.parse(dto.topicsJson);
    expect(topics[0].keywords).toEqual([]);
  });

  it('handles missing sourceArticles (undefined)', () => {
    const cmd = makeCommand({ sourceArticles: undefined });
    const dto = mapCommandToOutlineWriterPromptDTO(cmd);
    expect(dto.sourceArticlesJson).toBeUndefined();
  });

  it('handles empty sourceArticles array', () => {
    const cmd = makeCommand({ sourceArticles: [] });
    const dto = mapCommandToOutlineWriterPromptDTO(cmd);
    expect(dto.sourceArticlesJson).toBeDefined();
    const articles = JSON.parse(dto.sourceArticlesJson!);
    expect(articles).toHaveLength(0);
  });

  it('fail-fast: throws on invalid command object', () => {
    expect(() => mapCommandToOutlineWriterPromptDTO(null as any)).toThrow(/Commande invalide/);
    expect(() => mapCommandToOutlineWriterPromptDTO(undefined as any)).toThrow(/Commande invalide/);
  });

  describe('relatedArticles (Graph RAG)', () => {
    it('maps relatedArticles with slug present and sectionSummary', () => {
      const relatedArticles = [
        {
          articleId: 'art-1',
          articleTitle: 'Article Related 1',
          articleSlug: 'article-related-1',
          sectionSummary: 'Summary 1',
          relevanceScore: 0.85,
        },
        {
          articleId: 'art-2',
          articleTitle: 'Article Related 2',
          articleSlug: 'article-related-2',
          sectionSummary: 'Summary 2',
          relevanceScore: 0.75,
        },
      ];

      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        relatedArticles: relatedArticles as any,
      });

      expect(dto.relatedArticles).toBeDefined();
      expect(dto.relatedArticles).toHaveLength(2);
      expect(dto.relatedArticles![0]).toMatchObject({
        id: 'art-1',
        title: 'Article Related 1',
        slug: 'article-related-1',
        sectionSummary: 'Summary 1',
        relevanceScore: 0.85,
      });
      expect(dto.relatedArticles![1].slug).toBe('article-related-2');
    });

    it('maps relatedArticles with slug undefined (no fallback)', () => {
      const relatedArticles = [
        {
          articleId: 'art-1',
          articleTitle: 'Article Sans Slug',
          articleSlug: undefined,
          sectionSummary: 'Summary',
          relevanceScore: 0.90,
        },
      ];

      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        relatedArticles: relatedArticles as any,
      });

      expect(dto.relatedArticles).toBeDefined();
      expect(dto.relatedArticles).toHaveLength(1);
      expect(dto.relatedArticles![0].slug).toBeUndefined();
      expect(dto.relatedArticles![0].id).toBe('art-1');
    });

    it('handles relatedArticles with empty sectionSummary (fallback to empty string)', () => {
      const relatedArticles = [
        {
          articleId: 'art-1',
          articleTitle: 'Article Title',
          articleSlug: 'article-slug',
          sectionSummary: undefined,
          relevanceScore: 0.70,
        },
      ];

      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        relatedArticles: relatedArticles as any,
      });

      expect(dto.relatedArticles![0].sectionSummary).toBe('');
    });

    it('handles empty relatedArticles array', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand(), {
        relatedArticles: [],
      });

      expect(dto.relatedArticles).toEqual([]);
    });

    it('handles undefined relatedArticles (no Graph RAG)', () => {
      const dto = mapCommandToOutlineWriterPromptDTO(makeCommand());

      expect(dto.relatedArticles).toBeUndefined();
    });
  });
});
