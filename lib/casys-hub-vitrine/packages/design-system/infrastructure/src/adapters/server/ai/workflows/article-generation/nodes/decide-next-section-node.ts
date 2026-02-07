import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';

export interface DecideNextSectionNodeDeps {
  logger?: Logger;
}

export async function decideNextSectionNode(
  state: ArticleGenerationState,
  deps: DecideNextSectionNodeDeps = {}
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.decideNextSection');

  const total = state.outline?.sections?.length ?? 0;
  const current = state.cursorIndex ?? 0;
  const next = current + 1;

  try {
    logger.debug?.('[ArticleGeneration] decideNextSection', { current, total, next });
  } catch {}

  // Increment cursor if more sections remain; routing will be decided in workflow via conditional edges
  if (next <= total) {
    return { ...state, cursorIndex: next };
  }
  return state;
}
