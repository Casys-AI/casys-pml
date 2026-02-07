import type {
  CompetitorDataDTO,
  ContentStrategyDTO,
  CompetitiveAnalysisDTO,
  KeywordTagDTO,
  SearchIntentDataDTO,
  TrendDataDTO,
} from '@casys/shared';
import type { CompetitorData, ContentStrategy, CompetitiveAnalysis, KeywordTag, SearchIntentData, TrendData } from '@casys/core';

export function mapKeywordTagDTOToCore(t: KeywordTagDTO): KeywordTag {
  return {
    label: t.label,
    slug: t.slug,
    source: t.source,
    weight: t.weight,
    searchVolume: t.searchVolume,
    difficulty: t.difficulty,
    cpc: t.cpc,
    competition: t.competition,
    lowTopOfPageBid: t.lowTopOfPageBid,
    highTopOfPageBid: t.highTopOfPageBid,
    monthlySearches: t.monthlySearches,
  };
}

export function mapSearchIntentDTOToCore(s: SearchIntentDataDTO): SearchIntentData {
  return {
    intent: s.intent,
    confidence: s.confidence,
    supportingQueries: s.supportingQueries ?? [],
    contentGaps: s.contentGaps ?? [],
    seoRecommendations: s.seoRecommendations ?? [],
    contentRecommendations: s.contentRecommendations ?? [],
  };
}

export function mapCompetitorDTOToCore(c: CompetitorDataDTO): CompetitorData {
  return {
    title: c.title,
    description: c.description,
    url: c.url,
    keywords: c.keywords,
  };
}

export function mapTrendDTOToCore(t: TrendDataDTO): TrendData {
  return {
    keyword: t.keyword,
    trend: t.trend,
    relatedQueries: t.relatedQueries,
    searchVolume: t.searchVolume,
  };
}

export function sanitizeCompetitors(list: CompetitorDataDTO[]): CompetitorDataDTO[] {
  return list.map((c) => ({
    ...c,
    title: c.title ?? 'Untitled',
  }));
}

export function mapContentStrategyDTOToCore(dto: ContentStrategyDTO | undefined): ContentStrategy {
  return {
    topicClusters: (dto?.topicClusters ?? []).map(tc => ({
      pillarTag: tc.pillarTag ? mapKeywordTagDTOToCore(tc.pillarTag) : undefined,
      satelliteTags: (tc.satelliteTags ?? []).map(mapKeywordTagDTOToCore),
    })),
    recommendations: dto?.recommendations,
  };
}

export function mapCompetitiveAnalysisDTOToCore(dto: CompetitiveAnalysisDTO | undefined): CompetitiveAnalysis {
  return {
    contentGaps: (dto?.contentGaps ?? []).map(gapDTO => ({
      keyword: mapKeywordTagDTOToCore(gapDTO.keyword),
      gap: gapDTO.gap,
      reason: gapDTO.reason,
      details: gapDTO.details,
      type: gapDTO.type,
      opportunityScore: gapDTO.opportunityScore,
    })),
    competitorTitles: (dto?.competitors ?? []).map(c => c.title ?? 'Untitled'),
  };
}
