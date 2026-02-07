import type { OutlineWriterPromptDTO } from '@casys/shared';
import type { ArticleSearchResult, KeywordTagSearchResult, OutlineWriterCommand } from '@casys/core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[outline-writer.mapper] ${message}`);
}

/**
 * Mappe la commande Outline Writer vers les paramètres du template POML.
 */
export function mapCommandToOutlineWriterPromptDTO(
  cmd: OutlineWriterCommand,
  options?: {
    maxSections?: number; // DEPRECATED
    targetSectionsCount?: number; // V3.1
    targetCharsArticle?: number; // V3.1: Global article length (outline writer decides per-section)
    suggestedTags?: KeywordTagSearchResult[];
    relatedArticles?: ArticleSearchResult[];
  }
): OutlineWriterPromptDTO {
  assert(cmd && typeof cmd === 'object', 'Commande invalide');
  assert(typeof cmd.language === 'string' && cmd.language.trim().length > 0, 'language requis');
  assert(typeof cmd.articleId === 'string' && cmd.articleId.trim().length > 0, 'articleId requis');
  assert(Array.isArray(cmd.topics) && cmd.topics.length > 0, 'topics requis (min 1)');

  const topicsJson = JSON.stringify(
    (cmd.topics ?? []).map(t => ({
      id: t.id,
      title: t.title,
      sourceUrl: t.sourceUrl,
      createdAt: t.createdAt,
      language: t.language,
      keywords: Array.isArray(t.keywords) ? t.keywords : [],
    }))
  );

  const sourceArticlesJson = Array.isArray(cmd.sourceArticles)
    ? JSON.stringify(
        cmd.sourceArticles.map(a => ({
          title: a.title,
          sourceUrl: a.sourceUrl,
          content: a.content,
          summary: a.summary,
        }))
      )
    : undefined;
  const dto: OutlineWriterPromptDTO = {
    language: cmd.language,
    articleId: cmd.articleId,
    contentType: cmd.contentType ?? 'article',
    angle: cmd.angle,
    businessContext: cmd.businessContext,

    topicsJson,
    topicsCount: cmd.topics.length,

    // V3: Utiliser EditorialBriefData enrichi (filtré par l'agent)
    keywordTags: cmd.editorialBriefData?.keywordTags?.map(t => ({
      label: t.label,
      slug: t.slug ?? t.label.toLowerCase().replace(/\s+/g, '-'),
      source: t.source ?? ('opportunity' as const),
      weight: t.weight,
      searchVolume: t.searchVolume,
      difficulty: t.difficulty,
      cpc: t.cpc,
      competition: t.competition,
      lowTopOfPageBid: t.lowTopOfPageBid,
      highTopOfPageBid: t.highTopOfPageBid,
      monthlySearches: t.monthlySearches,
    })),

    // V3: Questions PAA filtrées par l'agent
    userQuestions: cmd.editorialBriefData?.relevantQuestions,

    // contentGaps: ContentGap[] → string[] (format: "keyword: gap")
    contentGaps: Array.isArray(cmd.editorialBriefData?.priorityGaps)
      ? cmd.editorialBriefData.priorityGaps.map((g: any) =>
          typeof g === 'string' ? g : `${g.keyword.label}: ${g.gap}`
        )
      : undefined,

    // V3: Recommendations SEO filtrées par l'agent
    seoRecommendations: cmd.editorialBriefData?.guidingRecommendations?.seo,

    // V3: Recommendations éditoriales de l'agent
    // EditorialBriefData.guidingRecommendations.editorial est déjà string[]
    contentRecommendations: cmd.editorialBriefData?.guidingRecommendations?.editorial,

    sourceArticlesJson,

    maxSections: options?.maxSections, // DEPRECATED: backward compat

    // V3.1: Contraintes structurelles effectives (depuis EditorialBrief ou ProjectConfig)
    targetSectionsCount: options?.targetSectionsCount,
    targetCharsArticle: options?.targetCharsArticle, // Global article length (outline writer calculates per-section)

    // RAG Vector: Tags existants suggérés pour réutilisation
    suggestedTags: options?.suggestedTags?.map(t => ({
      label: t.label,
      slug: t.slug,
      usageCount: t.usageCount,
      score: t.score,
    })),
    
    // Graph RAG: Articles internes pertinents (pour maillage interne)
    // sectionSummary: résumé court (pas la description métier)
    relatedArticles: options?.relatedArticles?.map(a => ({
      id: a.articleId,
      title: a.articleTitle,
      slug: a.articleSlug, // Slug pour construire l'URL (optionnel)
      sectionSummary: (a.sectionSummary ?? a.sectionDescription ?? ''),
      relevanceScore: a.relevanceScore,
    })),
  };

  return dto;
}
