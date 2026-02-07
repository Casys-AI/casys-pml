import type { ApplicationEventHandler } from '@casys/shared';
import type { ArticleStructure, SectionNode } from '@casys/core';

export interface GenerateArticleOptions {
  onEvent?: ApplicationEventHandler;
  onPostSeoEvaluate?: (input: {
    article: ArticleStructure['article'];
    sections: SectionNode[];
    language: string;
  }) => Promise<void> | void;
}
