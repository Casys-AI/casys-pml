import type { CompetitorData, KeywordTag, SearchIntentData, TrendData } from './seo.types';

export interface SeoAnalysisCommand {
  tenantId: string;
  projectId: string;
  language: string;
  keywords: string[];
  forceRegenerateKeywordPlans?: boolean; // Force la régénération des KeywordPlans même s'ils existent
}

export interface SeoAnalysisResult {
  id: string;
  language: string;
  createdAt: string;
  keywordPlan: { tags: KeywordTag[] };
  searchIntent: SearchIntentData;
  competitors: CompetitorData[];
  trends: TrendData[];
  competitionScore: number;
  trendScore: number;
  contentType: string;
  analysisDate: string;
  dataSource: string;
}
