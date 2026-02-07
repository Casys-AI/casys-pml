import type { OutlineWriterCommand } from './outline-writer.types';
import type { ArticleNode, SectionNode } from '../entities/article-structure.entity';

export type ArticleGenerationContentFormat = 'mdx' | 'markdown';

/**
 * Structure d'outline pour le workflow de génération d'article.
 * Réutilise les entités DDD (ArticleNode, SectionNode) pour éviter les duplications.
 */
export interface ArticleGenerationOutline {
  /** Métadonnées minimales de l'article (id et titre) */
  article: Pick<ArticleNode, 'id' | 'title'>;
  /** Sections complètes avec tous les champs DDD (relatedArticles, suggestedTopics, etc.) */
  sections: SectionNode[];
}

export interface ArticleGenerationWorkflowInput {
  tenantId: string;
  projectId: string;
  language: string;
  outline?: ArticleGenerationOutline;
  outlineCommand?: OutlineWriterCommand;
}

export interface ArticleGenerationWorkflowConfig {
  templatePath: string;
  contentFormat: ArticleGenerationContentFormat;
  maxAttempts?: number;
}

export interface ArticleGenerationSectionResult {
  id: string;
  title: string;
  position: number;
  level?: number;
  description?: string;
  content: string;
  summary?: string;
}

export interface ArticleGenerationWorkflowResult {
  outline: ArticleGenerationOutline;
  sections: ArticleGenerationSectionResult[];
  totalWords: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
