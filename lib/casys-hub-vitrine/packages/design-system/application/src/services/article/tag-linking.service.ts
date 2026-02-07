import type { KeywordTag } from '@casys/core';

import type { TagRepositoryPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

export class TagLinkingService {
  constructor(private readonly tagRepository: TagRepositoryPort) {}

  async upsertAndLinkKeywordTags(params: {
    tenantId: string;
    projectId: string;
    articleId: string;
    tags: KeywordTag[];
  }): Promise<void> {
    const { tenantId, projectId, articleId, tags } = params;
    const clean = (tags ?? []).filter(t => !!t?.label);
    if (clean.length === 0) return;

    try {
      await this.tagRepository.upsertArticleTags({
        articleId,
        projectId,
        tenantId,
        tags: clean,
        linkToKeywordPlan: true,
      });
    } catch (e) {
      logger.error?.('[TagLinkingService] Failed to upsert tags:', e);
      throw e;
    }
  }
}
