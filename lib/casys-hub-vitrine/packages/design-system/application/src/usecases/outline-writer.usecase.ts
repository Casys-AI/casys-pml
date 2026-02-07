import type { ProjectConfig } from '@casys/shared';
import type {
  ArticleSearchResult,
  KeywordTag,
  KeywordTagSearchResult,
  OutlineWriterCommand,
  OutlineWriterPort,
  OutlineWriterResult,
} from '@casys/core';

import { mapCommandToOutlineWriterPromptDTO } from '../mappers/outline-writer.mapper';
import {
  type ArticleStructureSearchPort,
  type OutlineWriterGenerateOutlinePort,
  type PromptTemplatePort,
  type UserProjectConfigPort,
} from '../ports/out';
import { buildOutlineWriterPoml } from '../prompts/outline-writer.prompt';
import type { ArticleOutline } from '../schemas/agents/outline-writer.schemas';
import { applicationLogger as logger } from '../utils/logger';
import type { SuggestArticleTagsUseCase } from './suggest-article-tags.usecase';

export class OutlineWriterUseCase implements OutlineWriterPort {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly promptTemplate: PromptTemplatePort,
    private readonly outlineWriter: OutlineWriterGenerateOutlinePort,
    private readonly suggestTagsUseCase?: SuggestArticleTagsUseCase, // Optionnel pour RAG de tags
    private readonly articleSearch?: ArticleStructureSearchPort // Optionnel pour Graph RAG articles
  ) {}

  async execute(
    input: OutlineWriterCommand & { tenantId: string; projectId: string }
  ): Promise<OutlineWriterResult> {
    const { tenantId, projectId } = input;
    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[OutlineWriterUseCase] tenantId et projectId requis');
    }
    if (!input.language?.trim()) {
      throw new Error('[OutlineWriterUseCase] language requis');
    }
    if (!Array.isArray(input.topics) || input.topics.length === 0) {
      throw new Error('[OutlineWriterUseCase] topics requis (min 1)');
    }
    if (!input.articleId?.trim()) {
      throw new Error('[OutlineWriterUseCase] articleId requis');
    }

    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );
    if (!projectConfig) {
      throw new Error('[OutlineWriterUseCase] ProjectConfig introuvable');
    }
    const templatePath = projectConfig?.generation?.outlineWriter?.template;
    if (!templatePath?.trim()) {
      throw new Error('[OutlineWriterUseCase] Template OutlineWriter non configuré');
    }

    // V3.1: Précédence des contraintes structurelles: Brief > Config > Defaults
    const targetSectionsCount =
      input.editorialBriefData?.targetSectionsCount ??
      projectConfig?.generation?.outlineWriter?.maxSections ??
      9;

    // V3.1: Pass global article length target to outline writer
    // Outline writer will decide targetCharsPerSection for each section based on importance
    const targetCharsArticle =
      input.editorialBriefData?.targetCharsArticle ??
      projectConfig?.generation?.outlineWriter?.targetCharsArticle ??
      undefined;

    // V3.1: Validation des contraintes
    if (targetSectionsCount < 1 || targetSectionsCount > 15) {
      throw new Error('[OutlineWriterUseCase] targetSectionsCount must be between 1 and 15');
    }

    if (targetCharsArticle && (targetCharsArticle < 300 || targetCharsArticle > 45000)) {
      throw new Error('[OutlineWriterUseCase] targetCharsArticle must be between 300 and 45000');
    }

    logger.debug('[OutlineWriterUseCase] Article constraints:', {
      source: input.editorialBriefData?.targetSectionsCount ? 'brief' : 'config',
      targetSectionsCount,
      targetCharsArticle,
    });

    // RAG Vector : Rechercher tags similaires existants pour réutilisation
    let suggestedTags: KeywordTagSearchResult[] = [];
    if (this.suggestTagsUseCase) {
      try {
        // Utiliser le titre des topics pour la recherche sémantique
        const queryText = input.topics.map(t => t.title).join(' ');
        suggestedTags = await this.suggestTagsUseCase.searchSimilar({
          queryText,
          projectId,
          tenantId,
          limit: 10,
          threshold: 0.65, // Seuil assez permissif pour avoir des suggestions
        });
        logger.debug('[OutlineWriterUseCase] Tags RAG:', { count: suggestedTags.length });
      } catch (error) {
        logger.warn('[OutlineWriterUseCase] Erreur recherche tags RAG (continue sans):', error);
      }
    }

    // 🔗 Graph RAG (Sections-first) : Rechercher sections pertinentes + contexte article (slug)
    let relatedArticles: Awaited<
      ReturnType<ArticleStructureSearchPort['searchSectionsByTagsAndSemantic']>
    > = [];
    if (
      this.articleSearch &&
      typeof this.articleSearch.searchSectionsByTagsAndSemantic === 'function'
    ) {
      try {
        const queryText = input.topics.map(t => t.title).join(' ');
        const tagLabels = suggestedTags.slice(0, 5).map(t => t.label); // Top 5 tags pour graph traversal

        relatedArticles = await this.articleSearch.searchSectionsByTagsAndSemantic({
          queryText,
          tags: tagLabels,
          projectId,
          tenantId,
          limit: 8, // Top 8 articles pertinents
          semanticWeight: 0.6, // Favoriser légèrement semantic (60%) vs graph (40%)
          threshold: 0.65,
        });

        logger.debug('[OutlineWriterUseCase] Graph RAG Sections:', {
          count: relatedArticles.length,
          topTitles: relatedArticles.slice(0, 3).map((a: ArticleSearchResult) => a.articleTitle),
        });
      } catch (error) {
        logger.warn(
          '[OutlineWriterUseCase] Erreur recherche Graph RAG sections (continue sans):',
          error
        );
      }
    }

    // Mapper -> DTO de prompt
    const dto = mapCommandToOutlineWriterPromptDTO(input, {
      targetSectionsCount,
      targetCharsArticle,
      suggestedTags,
      relatedArticles,
    });
    // Build POML et instructions
    const poml = await buildOutlineWriterPoml(this.promptTemplate, templatePath, dto);
    if (!poml?.trim()) {
      throw new Error('[OutlineWriterUseCase] Échec génération du prompt POML');
    }
    // Appel via port OutlineWriter (typed uniquement)
    logger.debug('[OutlineWriterUseCase] Appel OutlineWriter.generateOutline');
    if (typeof this.outlineWriter.generateOutline !== 'function') {
      throw new Error(
        '[OutlineWriterUseCase] outlineWriter.generateOutline non disponible (adapter manquant)'
      );
    }
    const outline: ArticleOutline = await this.outlineWriter.generateOutline(poml);

    // V3.1: Validation post-génération - Vérifier que l'AI a respecté les contraintes
    // Note: On ne bloque jamais, juste des warnings pour monitoring
    if (outline.sections.length !== targetSectionsCount) {
      const deviation = Math.abs(outline.sections.length - targetSectionsCount);
      const deviationPct = (deviation / targetSectionsCount) * 100;

      if (deviationPct > 20) {
        logger.warn(
          `[OutlineWriterUseCase] ⚠️ SIGNIFICANT DEVIATION: Outline section count (${outline.sections.length}) ` +
            `deviates ${deviationPct.toFixed(1)}% from target (${targetSectionsCount}). ` +
            `Consider adjusting prompt or constraints.`
        );
      } else if (deviationPct > 10) {
        logger.warn(
          `[OutlineWriterUseCase] Outline section count (${outline.sections.length}) deviates ${deviationPct.toFixed(1)}% ` +
            `from target (${targetSectionsCount}).`
        );
      }
    }

    const ids = new Set<string>();
    for (const s of outline.sections) {
      if (ids.has(s.id)) {
        throw new Error(`[OutlineWriterUseCase] Duplicate section id: ${s.id}`);
      }
      ids.add(s.id);
    }
    const keywordTags: KeywordTag[] | undefined = outline.keywordTags;
    const titleTrimmed = (outline.title ?? '').trim();
    const summaryTrimmed = (outline.summary ?? '').trim();
    const safeTitle = titleTrimmed.length > 0 ? titleTrimmed : input.topics[0].title;
    const safeSummary = summaryTrimmed;
    return {
      title: safeTitle,
      summary: safeSummary,
      slug: outline.slug,
      sections: outline.sections,
      keywordTags,
    };
  }
}
