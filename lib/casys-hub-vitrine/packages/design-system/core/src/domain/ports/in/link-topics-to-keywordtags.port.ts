import type { LinkTopicsToKeywordTagsCommand, LinkTopicsToKeywordTagsResult } from '../../types/link-topics-to-keywordtags.types';

export interface LinkTopicsToKeywordTagsPort {
  execute(command: LinkTopicsToKeywordTagsCommand): Promise<LinkTopicsToKeywordTagsResult>;
}
