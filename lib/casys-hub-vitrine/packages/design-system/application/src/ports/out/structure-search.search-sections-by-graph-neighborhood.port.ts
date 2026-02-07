import type { ArticleSearchResult } from '@casys/core';

/** Port: Structure Search - action: search sections by graph neighborhood */
export interface StructureSearchByGraphNeighborhoodPort {
  searchSectionsByGraphNeighborhood(
    articleId: string,
    position: number,
    opts: { tenantId?: string; projectId?: string; window?: number; limit?: number }
  ): Promise<ArticleSearchResult[]>;
}

export type IStructureSearchByGraphNeighborhoodPort = StructureSearchByGraphNeighborhoodPort;
