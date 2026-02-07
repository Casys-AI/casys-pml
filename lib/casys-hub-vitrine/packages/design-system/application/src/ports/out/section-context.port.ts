import type { SectionGraphContextDTO } from '@casys/shared';

export interface SectionContextPort {
  getContext(params: {
    articleId: string;
    sectionId: string;
    tenantId?: string;
    projectId?: string;
    maxAncestors?: number;
  }): Promise<SectionGraphContextDTO>;
}
