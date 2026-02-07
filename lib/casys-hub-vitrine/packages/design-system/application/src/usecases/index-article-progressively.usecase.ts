import type { ArticleNode, SectionNode } from '@casys/core';

import type { ArticleIndexingUpsertPort } from '../ports/out';

export class IndexArticleProgressivelyUseCase {
  constructor(private readonly indexingService: ArticleIndexingUpsertPort) {}

  async indexOutline(params: {
    article: ArticleNode;
    sections: SectionNode[];
    tenantId: string;
  }): Promise<void> {
    const { article, sections, tenantId } = params;
    await this.indexingService.indexOutlineProgressively(article, sections, tenantId);
  }

  async indexSectionContent(params: {
    sectionId: string;
    content: string;
    projectId: string;
    tenantId: string;
    summary?: string;
  }): Promise<void> {
    const { sectionId, content, projectId, tenantId, summary } = params;
    await this.indexingService.indexSectionContentProgressively(
      sectionId,
      content,
      projectId,
      tenantId,
      summary
    );
  }
}
