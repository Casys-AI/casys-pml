import {
  type LinkTopicsToKeywordTagsCommand,
  type LinkTopicsToKeywordTagsPort,
  type LinkTopicsToKeywordTagsResult,
} from '@casys/core';

import type { TopicRelationsPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

/**
 * DEPRECATED: Le linking Topic -> KeywordTag est maintenant fait automatiquement
 * dans Neo4jTopicRepositoryAdapter.linkTopicToKeywordTags() lors de l'upsert.
 * Ce use case ne fait plus rien et sera supprimé prochainement.
 */
export class LinkTopicsToKeywordTagsUseCase implements LinkTopicsToKeywordTagsPort {
  constructor(private readonly relations: TopicRelationsPort) {}

  execute(_cmd: LinkTopicsToKeywordTagsCommand): Promise<LinkTopicsToKeywordTagsResult> {
    // DEPRECATED: Linking is now automatic in adapter
    return Promise.resolve({ linksCreated: 0 });
  }
}
