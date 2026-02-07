import type { CoverImageGenerateForArticlePort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

export class CoverImageOrchestrator {
  async execute(params: {
    outline: {
      title?: string | null;
      summary?: string | null;
      keywordTags?: { label: string; slug?: string }[] | null;
    };
    outlineArticle: { cover?: { src?: string; alt?: string } };
    coverImageUseCase?: CoverImageGenerateForArticlePort;
    tenantId: string;
    projectId: string;
    articleId: string;
  }): Promise<void> {
    const { outline, outlineArticle, coverImageUseCase, tenantId, projectId, articleId } = params;

    // Si une cover existe déjà, compléter alt si nécessaire
    if (outlineArticle.cover?.src && outlineArticle.cover.src.trim().length > 0) {
      if (!outlineArticle.cover.alt || outlineArticle.cover.alt.trim().length === 0) {
        const autoAlt = (outline.summary ?? outline.title ?? '').slice(0, 140).trim();
        if (!autoAlt) {
          throw new Error(
            '[CoverImageOrchestrator] Cover fournie sans alt et aucune description disponible pour auto-compléter'
          );
        }
        outlineArticle.cover.alt = autoAlt;
        logger.debug('Cover: alt auto complété depuis outline', { altLength: autoAlt.length });
      }
      return;
    }

    // Sinon, tenter de générer si un use case est fourni
    if (!coverImageUseCase) {
      logger.debug('Cover: aucun use case fourni, skip génération');
      return;
    }

    // Mapper keywordTags vers string[] de labels pour le DTO
    const tags = (outline.keywordTags ?? []).map(kt => String(kt.label).trim()).filter(Boolean);

    if (!Array.isArray(outline.keywordTags) || tags.length === 0) {
      try {
        logger.error('[CoverImageOrchestrator] keywordTags manquants ou vides — skip génération', {
          articleId,
          hasKeywordTagsField: Array.isArray(outline.keywordTags),
        });
      } catch {
        // ignore logging errors
      }
      return;
    }

    logger.debug('Cover: génération via use case start', { articleId, tagsCount: tags.length });
    const res = await coverImageUseCase.execute({
      articleId,
      outlineTitle: outline.title ?? '',
      outlineSummary: outline.summary ?? '',
      tags,
      tenantId,
      projectId,
    });

    if (!res) {
      logger.debug('Cover: use case a retourné null (skip)');
      return;
    }

    const dataUrl = `data:${res.mime};base64,${res.base64}`;
    outlineArticle.cover = { src: dataUrl, alt: res.alt };
    try {
      const preview = `${dataUrl.slice(0, 80)}${dataUrl.length > 80 ? '…' : ''}`;
      logger.log('Cover: générée (data URL)', { preview });
    } catch {
      // ignore preview logging errors
    }
  }
}
