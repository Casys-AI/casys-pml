import type { KeywordTag } from '../types/seo.types';

export interface LinkTopicsToKeywordTagsCommand {
  tenantId: string;
  projectId: string;
  topics: { id: string; title: string }[];
  keywordTags: KeywordTag[];
  dryRun?: boolean;
}

export interface LinkTopicsToKeywordTagsResult {
  linksCreated: number;
}
