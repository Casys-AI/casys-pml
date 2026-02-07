import type { ArticleStructure } from '../entities/article-structure.entity';

/**
 * Commande unifiée d'indexation d'article (agnostique GitHub/FS)
 * - kind: 'parsed' → l'article est déjà lu/parsé (ArticleStructure)
 * - kind: 'fs'     → parser un fichier local (filePath)
 */
export type IndexArticleFromRepoCommand =
  | {
      kind: 'parsed';
      tenantId: string;
      projectId: string;
      article: ArticleStructure;
      dryRun?: boolean;
    }
  | {
      kind: 'fs';
      tenantId: string;
      projectId: string;
      filePath: string;
      dryRun?: boolean;
    };

export interface IndexArticleFromRepoResult {
  success: boolean;
  articleId: string;
  sectionsUpserted: number;
  tagsUpserted: number;
}
