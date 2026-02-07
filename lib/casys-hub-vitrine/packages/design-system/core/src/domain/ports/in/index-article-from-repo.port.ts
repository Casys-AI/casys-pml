// Port IN (Hexagonal) pour indexer un article depuis un fichier du repo
// Stable pour les adaptateurs entrants (API/CLI/jobs)

import type {
  IndexArticleFromRepoCommand,
  IndexArticleFromRepoResult,
} from '../../types/index-article-from-repo.types';

export interface IndexArticleFromRepoPort {
  execute(command: IndexArticleFromRepoCommand): Promise<IndexArticleFromRepoResult>;
}
