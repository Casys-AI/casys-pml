import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';
import type {
  IndexArticleProgressivelyUseCase,
  TopicRelationsPort,
  ArticleIndexingUpsertPort,
} from '@casys/application';

export interface PersistSectionNodeDeps {
  logger?: Logger;
  indexArticleUseCase?: IndexArticleProgressivelyUseCase;
  topicRelations?: TopicRelationsPort;
  indexingPort?: ArticleIndexingUpsertPort; // direct port to link Section->Article
}

export async function persistSectionNode(
  state: ArticleGenerationState,
  deps: PersistSectionNodeDeps
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.persistSection');
  const indexer = deps.indexArticleUseCase;
  if (!indexer) return state; // no-op if not provided

  if (!state.sections || state.sections.length === 0) return state;

  const idx = state.cursorIndex ?? 0;
  const current = state.sections.find(s => s.position === idx) ?? state.sections[idx];
  if (!current) return state;

  try {
    await indexer.indexSectionContent({
      sectionId: current.id,
      content: current.content,
      projectId: state.projectId,
      tenantId: state.tenantId,
      summary: current.summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn?.('[ArticleGeneration] persistSection failed (non-bloquant)', {
      sectionId: current.id,
      error: msg,
    });
  }

  // Créer les relations détectées par le writer (non-bloquant)
  const rel = state.relationsBySection?.[current.id];
  if (rel) {
    // Section -> Topic
    if (deps.topicRelations && Array.isArray(rel.usedTopics) && rel.usedTopics.length > 0) {
      for (const src of rel.usedTopics) {
        const topicId = src?.id;
        if (!topicId) continue;
        try {
          await deps.topicRelations.linkSectionToTopic({
            tenantId: state.tenantId,
            projectId: state.projectId,
            sectionId: current.id,
            topicId,
            articleId: current.articleId ?? state.outline?.id ?? '',
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn?.('[ArticleGeneration] link Section->Topic failed (non-bloquant)', {
            sectionId: current.id,
            topicId,
            error: msg,
          });
        }
      }
    }

    // Section -> Article (internal linking)
    if (deps.indexingPort && Array.isArray(rel.usedArticles) && rel.usedArticles.length > 0) {
      for (const art of rel.usedArticles) {
        const articleId = art?.articleId;
        if (!articleId) continue;
        try {
          await deps.indexingPort.linkSectionToArticle({
            sectionId: current.id,
            articleId,
            tenantId: state.tenantId,
            projectId: state.projectId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn?.('[ArticleGeneration] link Section->Article failed (non-bloquant)', {
            sectionId: current.id,
            articleId,
            error: msg,
          });
        }
      }
    }
  }

  return state;
}
