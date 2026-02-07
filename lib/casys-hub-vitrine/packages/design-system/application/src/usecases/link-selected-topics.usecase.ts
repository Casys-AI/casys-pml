import type { KeywordTag, TopicCandidate } from '@casys/core';

import { applicationLogger as logger } from '../utils/logger';
import type { BuildTopicsFromFetchResultsUseCase } from './build-topics-from-fetch-results.usecase';

export interface LinkSelectedTopicsInput {
  tenantId: string;
  projectId: string;
  candidates: TopicCandidate[];
  keywordTags: KeywordTag[];
}

export class LinkSelectedTopicsUseCase {
  constructor(
    private readonly buildTopicsFromFetchResultsUseCase?: BuildTopicsFromFetchResultsUseCase
  ) {}

  async execute(input: LinkSelectedTopicsInput): Promise<void> {
    const { tenantId, projectId, candidates, keywordTags } = input;

    if (!this.buildTopicsFromFetchResultsUseCase) {
      logger.warn(
        '[LinkSelectedTopicsUseCase] BuildTopicsFromFetchResultsUseCase non fourni — skip link sélectionné'
      );
      return;
    }
    if (!Array.isArray(keywordTags) || keywordTags.length === 0) {
      throw new Error('[LinkSelectedTopicsUseCase] keywordTags requis (non vide)');
    }

    try {
      await this.buildTopicsFromFetchResultsUseCase.execute({
        tenantId,
        projectId,
        candidates,
        keywordTags,
        linkKeywords: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[LinkSelectedTopicsUseCase] Linking failed (non bloquant)', msg);
    }
  }
}
