import type { ApplicationEventHandler } from '@casys/shared';
import type { ArticleSearchResult, ArticleStructure, SectionNode } from '@casys/core';

export interface GenerateArticleInput {
  articles: ArticleSearchResult[];
  keywords: string[];
  // language supprimé : sera récupéré depuis ProjectConfig.language
  tenantId?: string;
  projectId?: string;
}

export interface GenerateArticleOptions {
  onEvent?: ApplicationEventHandler;
  // TODO hook: callback optionnel pour post-évaluation SEO finale (à implémenter)
  // Permettra d'évaluer le contenu généré (title/description/keywords/tags/sections)
  // et de calculer un score/rapport SEO final. Non utilisé pour l'instant.
  onPostSeoEvaluate?: (input: {
    article: ArticleStructure['article'];
    sections: SectionNode[];
    language: string;
  }) => Promise<void> | void;
}

/** Port: Generate Article Linear - action: execute */
export interface GenerateArticleLinearExecutePort {
  execute(input: GenerateArticleInput, options?: GenerateArticleOptions): Promise<ArticleStructure>;
}

export type IGenerateArticleLinearExecutePort = GenerateArticleLinearExecutePort;
