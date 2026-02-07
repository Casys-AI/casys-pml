import type { SeoBriefData } from './seo.types';

export interface AnalyzeExistingArticleCommand {
  articleId: string;
  tenantId: string;
  projectId: string;
  dryRun?: boolean;
  syncBefore?: boolean;
  skipGithubRead?: boolean;
}

export interface AnalyzeExistingArticleResult {
  success: boolean;
  articleId: string;
  analysis: {
    keywordSeeds: string[];
    enrichedKeywords: { keyword: string; searchVolume?: number; difficulty?: number }[];
    seoBriefData?: SeoBriefData;
    createdTopics: { id: string; title: string; url: string }[];
    sectionsAnalyzed: number;
  };
  created: {
    keywordPlansUpserted: number;
    topicsUpserted: number;
    sectionTopicLinks: number;
    sectionInternalLinks: number;
  };
  errors: string[];
}
