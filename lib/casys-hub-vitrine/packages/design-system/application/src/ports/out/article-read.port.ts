import type { ArticleStructure } from '@casys/core';

export interface ArticleReadPort {
  findById(id: string): Promise<ArticleStructure | null>;
  findAll(): Promise<ArticleStructure[]>;
  findByTenant(tenantId: string): Promise<ArticleStructure[]>;
  findByProject(tenantId: string, projectId: string): Promise<ArticleStructure[]>;
}

export type IArticleReadPort = ArticleReadPort;
