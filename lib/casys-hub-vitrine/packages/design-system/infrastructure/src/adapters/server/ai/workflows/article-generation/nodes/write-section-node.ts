import type { z } from 'zod';

import type { SectionWriterPromptDTO } from '@casys/shared';
import {
  type AITextModelPort,
  buildSectionWriterPoml,
  GraphContextBuilder,
  mapStateToSectionWriterPromptDTO,
  type PromptTemplatePort,
  type SectionContextPort,
} from '@casys/application';

import { createLogger, type Logger } from '../../../../../../utils/logger';
import type { ArticleGenerationState } from '../article-generation.state';

interface SectionOutput {
  content?: unknown;
  usedTopics?: unknown;
  usedArticles?: unknown;
  metadata?: unknown;
}

export interface WriteSectionNodeDeps {
  aiModel: AITextModelPort;
  promptTemplate: PromptTemplatePort;
  sectionContext?: SectionContextPort;
  outputContract: z.ZodSchema<SectionOutput>;
  logger?: Logger;
}

export async function writeSectionNode(
  state: ArticleGenerationState,
  deps: WriteSectionNodeDeps
): Promise<ArticleGenerationState> {
  const logger = deps.logger ?? createLogger('ArticleGeneration.writeSection');

  if (
    !state.outline ||
    !Array.isArray(state.outline.sections) ||
    state.outline.sections.length === 0
  ) {
    throw new Error('[ArticleGeneration] outline.sections est vide');
  }
  const idx = state.cursorIndex ?? 0;
  const sec = state.outline.sections[idx];
  if (!sec) return state;

  // Contexte via GraphContextBuilder si SectionContextPort disponible
  let formattedContext = '';

  try {
    if (deps.sectionContext && state.outline?.article.id) {
      const ctx = await deps.sectionContext.getContext({
        articleId: state.outline.article.id,
        sectionId: sec.id,
        tenantId: state.tenantId,
        projectId: state.projectId,
        maxAncestors: 3,
      });
      const builder = new GraphContextBuilder();
      const outlineSections = Array.isArray(state.outline.sections)
        ? state.outline.sections.map(s => ({ title: s.title, description: s.description }))
        : [];
      formattedContext = builder.format(ctx, { outlineSections });
    } else {
      const prev = state.outline.sections.find(s => s.position === sec.position - 1);
      const parts = [
        state.outline.article.title ? `# Article: ${state.outline.article.title}` : '',
        prev ? `Previous: ${prev.title}` : '',
        sec.description ? `Planned: ${sec.description}` : '',
      ];
      formattedContext = parts.filter(Boolean).join('\n');
    }
  } catch (e) {
    logger.warn?.(
      '[ArticleGeneration] SectionContextPort/GraphContextBuilder failed, using outline fallback',
      (e as Error)?.message
    );
    formattedContext = '';
  }

  // Fallback: si pas de contexte du tout (exception ou pas de sectionContext)
  if (!formattedContext) {
    if (sec.parentSectionId) {
      const parent = state.outline.sections.find(s => s.id === sec.parentSectionId);
      if (parent) {
        logger.warn?.(
          '[ArticleGeneration] Using outline-based fallback context (parent section)',
          { sectionId: sec.id, parentId: sec.parentSectionId }
        );
        formattedContext = [
          `# Article: ${state.outline.article.title || 'Untitled'}`,
          `## Parent Section: ${parent.title}`,
          parent.description ? `Parent context: ${parent.description}` : '',
          sec.description ? `This section: ${sec.description}` : '',
        ].filter(Boolean).join('\n');
      } else {
        formattedContext = sec.description ?? '';
      }
    } else {
      formattedContext = sec.description ?? '';
    }
  }

  // Optimisation: injecter le résumé d'article si disponible et non déjà présent
  if (state.outlineSummary && !formattedContext.includes('Summary:')) {
    formattedContext = `Summary: ${state.outlineSummary}\n` + formattedContext;
  }

  // ✅ Utilisation du mapper avec validations fail-fast
  // Garantit que toutes les valeurs proviennent du state (pas de valeurs hardcodées)
  const dto: SectionWriterPromptDTO = mapStateToSectionWriterPromptDTO(
    {
      language: state.language,
      outlineCommand: state.outlineCommand,
    },
    {
      title: sec.title,
      description: sec.description,
      targetCharsPerSection: sec.targetCharsPerSection, // Per-section target from outline writer
      relatedArticles: sec.relatedArticles,
      suggestedTopics: sec.suggestedTopics,
    },
    formattedContext
  );

  // 🔍 LOG: Tracer les données Graph RAG passées au Section Writer
  logger.log(`[WriteSectionNode] Section ${sec.id} Graph RAG data:`, {
    sectionTitle: sec.title,
    relatedArticlesCount: sec.relatedArticles?.length ?? 0,
    relatedArticlesIds: sec.relatedArticles?.map(a => a.id) ?? [],
    suggestedTopicsCount: sec.suggestedTopics?.length ?? 0,
    suggestedTopicsIds: sec.suggestedTopics?.map(t => t.id) ?? [],
    dtoRelatedArticlesCount: dto.relatedArticles?.length ?? 0,
    dtoSuggestedTopicsCount: dto.suggestedTopics?.length ?? 0,
  });

  const poml = await buildSectionWriterPoml(deps.promptTemplate, state.templatePath, dto);
  const raw = await deps.aiModel.generateText(poml);

  // Parse et valide selon le contrat prévu (par défaut: JSON { content, ... })
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[ArticleGeneration] Réponse AI non JSON: ${(e as Error).message}`);
  }

  const out = deps.outputContract.parse(parsed);
  const content = String((out as { content?: unknown })?.content ?? '');
  const usedTopics = (out as { usedTopics?: { id?: string; reason?: string }[] })
    .usedTopics;
  const usedArticles = (out as {
    usedArticles?: { articleId?: string; reason?: string }[];
  }).usedArticles;

  // 🔍 LOG: Tracer ce que l'IA a effectivement retourné
  logger.log(`[WriteSectionNode] AI Response for section ${sec.id}:`, {
    contentLength: content.length,
    usedTopicsCount: usedTopics?.length ?? 0,
    usedTopicsIds: usedTopics?.map(t => t.id) ?? [],
    usedArticlesCount: usedArticles?.length ?? 0,
    usedArticlesIds: usedArticles?.map(a => a.articleId) ?? [],
  });

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const totalWords = (state.totalWords ?? 0) + wordCount;

  const existing = (state.sections ?? []).filter(s => s.id !== sec.id);
  const isRewrite = (state.sections ?? []).some(s => s.id === sec.id);
  
  const written = [
    ...existing,
    {
      id: sec.id,
      title: sec.title,
      position: sec.position,
      level: typeof sec.level === 'number' && sec.level > 0 ? sec.level : 2,
      description: sec.description,
      articleId: state.outline?.article.id ?? '',
      content,
      summary: undefined,
      parentSectionId: sec.parentSectionId, // ✅ Préserver la hiérarchie H2/H3
    },
  ];

  const prevRelations = state.relationsBySection ?? {};
  const nextRelations = {
    ...prevRelations,
    [sec.id]: {
      usedTopics: Array.isArray(usedTopics) ? usedTopics : prevRelations[sec.id]?.usedTopics,
      usedArticles: Array.isArray(usedArticles) ? usedArticles : prevRelations[sec.id]?.usedArticles,
    },
  };

  // ✅ FIX: Incrémenter attempts lors d'un rewrite
  const attempts = isRewrite ? (state.attempts ?? 0) + 1 : state.attempts ?? 0;

  return { ...state, sections: written, totalWords, relationsBySection: nextRelations, attempts };
}
