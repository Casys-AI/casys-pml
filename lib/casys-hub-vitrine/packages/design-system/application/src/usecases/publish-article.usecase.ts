import { type ApplicationEventHandler, ApplicationEventTypes } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';

import type { ArticlePublicationPublishPort } from '../ports/out';

export class PublishArticleUseCase {
  constructor(private readonly publicationService: ArticlePublicationPublishPort) {}

  async execute(params: {
    structure: ArticleStructure;
    tenantId: string;
    projectId: string;
    onEvent?: ApplicationEventHandler;
  }): Promise<{ target: string; url?: string; path?: string; success: boolean }[]> {
    const { structure, tenantId, projectId, onEvent } = params;
    const results = await this.publicationService.publishToConfiguredTargets(
      structure,
      tenantId,
      projectId
    );
    await onEvent?.({ type: ApplicationEventTypes.ArticlePublished, payload: { results } });
    return results as { target: string; url?: string; path?: string; success: boolean }[];
  }
}
