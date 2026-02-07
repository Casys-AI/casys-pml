// Port IN (Hexagonal) pour analyser un article existant
// Stable pour les adaptateurs entrants (API/CLI/jobs)

import type {
  AnalyzeExistingArticleCommand,
  AnalyzeExistingArticleResult,
} from '../../types/analyze-existing-article.types';

export interface AnalyzeExistingArticlePort {
  execute(command: AnalyzeExistingArticleCommand): Promise<AnalyzeExistingArticleResult>;
}
