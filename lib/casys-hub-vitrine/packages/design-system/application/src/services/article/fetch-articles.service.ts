import type { TopicCandidate } from '@casys/core';

import type { ArticleContentFetcherPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

export interface EnrichedArticle {
  title: string;
  sourceUrl: string;
  content: string;
  summary: string;
}

export class FetchArticlesService {
  constructor(private readonly contentFetcher: ArticleContentFetcherPort) {}

  async execute(candidates: TopicCandidate[]): Promise<EnrichedArticle[]> {
    const outputs: EnrichedArticle[] = [];
    for (const article of candidates) {
      const enrichedContent = await this.contentFetcher.fetchFullContent(article);
      outputs.push({
        title: enrichedContent.title,
        sourceUrl: enrichedContent.sourceUrl,
        content: enrichedContent.fullContent,
        summary: enrichedContent.description,
      });
      logger.log('[FetchArticles] Article enrichi', {
        title: enrichedContent.title,
        contentLength: enrichedContent.fullContent.length,
      });
    }
    return outputs;
  }
}
