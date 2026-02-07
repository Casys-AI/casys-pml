import type { SectionNode } from '@casys/core';

import type {
  ArticleGenerationOutline,
  ArticleGenerationWorkflowConfig,
  ArticleGenerationWorkflowInput,
} from '@casys/core';

export interface ArticleGenerationWorkflowResult {
  outline: ArticleGenerationOutline;
  sections: SectionNode[];
  totalWords: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ArticleGenerationWorkflowPort {
  execute(
    input: ArticleGenerationWorkflowInput,
    config: ArticleGenerationWorkflowConfig
  ): Promise<ArticleGenerationWorkflowResult>;
}
