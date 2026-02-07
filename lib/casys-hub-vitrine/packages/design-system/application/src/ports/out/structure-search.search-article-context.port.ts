export interface ArticleContextSectionDTO {
  id: string;
  content: string;
}

export interface ArticleContextResultDTO {
  primaryContext: {
    sections: ArticleContextSectionDTO[];
  };
}

export interface StructureSearchArticleContextPort {
  searchContextForComment(input: {
    commentContent: string;
    tenantId?: string;
  }): Promise<ArticleContextResultDTO>;
}

export type IStructureSearchArticleContextPort = StructureSearchArticleContextPort;
