import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';

export interface FinalizeNodeDeps {
  logger?: Logger;
}

export async function finalizeNode(
  state: ArticleGenerationState,
  deps: FinalizeNodeDeps = {}
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.finalize');

  const totalWords = (state.sections ?? [])
    .map(s => s.content.split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);

  const sectionsCount = state.sections?.length ?? 0;
  const fragmentsCount = state.textFragments?.length ?? 0;
  const commentsCount = state.comments?.length ?? 0;

  try {
    logger.log?.('[ArticleGeneration] Finalize', {
      totalWords,
      sectionsCount,
      fragmentsApplied: fragmentsCount,
      commentsGenerated: commentsCount,
      attempts: state.attempts
    });
  } catch {}

  return {
    ...state,
    totalWords,
    // Clear TextFragments and comments to close the cycle
    textFragments: [],
    comments: [],
    recentlyModifiedIds: undefined,
    status: 'completed',
  };
}
