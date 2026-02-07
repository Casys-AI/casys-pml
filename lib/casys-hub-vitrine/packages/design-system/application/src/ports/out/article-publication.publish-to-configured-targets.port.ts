import { type ArticleStructure } from '@casys/core';

export type PublicationTarget = 'file_system' | 'github';

export interface PublicationResult {
  target: PublicationTarget;
  url: string;
  path: string;
  success: boolean;
  commitSha?: string;
}

/** Port: Article Publication - action: publish to configured targets */
export interface ArticlePublicationPublishPort {
  publishToConfiguredTargets(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<PublicationResult[]>;
}

export type IArticlePublicationPublishPort = ArticlePublicationPublishPort;
