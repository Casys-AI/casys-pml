import type { ArticleGenerationState } from '../article-generation.state';
import { createLogger, type Logger } from '../../../../../../utils/logger';

export interface InitCursorNodeDeps {
  logger?: Logger;
}

export async function initCursorNode(
  state: ArticleGenerationState,
  deps: InitCursorNodeDeps = {}
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.initCursor');
  try {
    logger.debug?.('[ArticleGeneration] Initialize cursorIndex=0');
  } catch {}
  return { ...state, cursorIndex: 0 };
}
