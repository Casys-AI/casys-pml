// Port IN (Hexagonal) pour générer un article de façon linéaire
// Stable pour les adaptateurs entrants (API/CLI/jobs)

import type { ArticleStructure } from '../../entities/article-structure.entity';

export interface GenerateArticleCommand {
  tenantId: string;
  projectId: string;
  keywords: string[];
}

export interface GenerateArticlePort {
  execute(command: GenerateArticleCommand, options?: unknown): Promise<ArticleStructure>;
}
