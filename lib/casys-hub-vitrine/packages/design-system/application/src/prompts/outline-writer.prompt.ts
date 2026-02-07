import type { OutlineWriterPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  ) {
    throw new Error(`[outline-writer.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[outline-writer.prompt] ${message}`);
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toPomlItems(values: string[] | undefined): string {
  const arr = Array.isArray(values) ? values : [];
  return arr.map(v => `<item>${escapeXml(String(v))}</item>`).join('\n');
}

/**
 * Construit un prompt POML pour l'Outline Writer.
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus et la présence de <poml>
 */
export async function buildOutlineWriterPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: OutlineWriterPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');
  assertNonEmpty(params.language, 'language');
  assertNonEmpty(params.articleId, 'articleId');
  assertNonEmpty(params.topicsJson, 'topicsJson');
  assert(
    typeof params.topicsCount === 'number' && params.topicsCount > 0,
    'topicsCount requis (>0)'
  );

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[outline-writer] template', { templatePath });
  } catch {
    // ignorer erreurs de logging
  }

  // Construire le contexte pour l'injection de variables
  const context: Record<string, unknown> = {
    language: params.language,
    angle: params.angle ?? '',
    articleId: params.articleId,
    contentType: params.contentType ?? 'article',

    topicsJson: params.topicsJson,
    topicsCount: String(params.topicsCount),
    keywordTagsItems: toPomlItems(params.keywordTags?.map(t => t.label)),
    userQuestionsItems: toPomlItems(params.userQuestions),
    contentGapsItems: toPomlItems(params.contentGaps),
    seoRecommendationsItems: toPomlItems(params.seoRecommendations),
    contentRecommendationsItems: toPomlItems(params.contentRecommendations),

    sourceArticlesJson: params.sourceArticlesJson ?? '',

    maxSections: params.maxSections ? String(params.maxSections) : '', // DEPRECATED

    // V3.1: Contraintes structurelles
    targetSectionsCount: params.targetSectionsCount ? String(params.targetSectionsCount) : '',
    targetCharsArticle: params.targetCharsArticle
      ? String(params.targetCharsArticle)
      : '',

    // RAG Vector: Tags suggérés (JSON stringifié pour injection dans le template)
    suggestedTagsJson: params.suggestedTags ? JSON.stringify(params.suggestedTags) : '[]',
    suggestedTagsCount: params.suggestedTags ? String(params.suggestedTags.length) : '0',

    // Graph RAG: Articles internes pertinents (JSON stringifié pour injection dans le template)
    relatedArticlesJson: params.relatedArticles ? JSON.stringify(params.relatedArticles) : '[]',
  };

  // Debug: tracer le contexte injecté si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[outline-writer][debug] Context injecté:', {
        keys: Object.keys(context),
        topicsJsonLength: typeof context.topicsJson === 'string' ? context.topicsJson.length : 0,
        keywordTagsItemsLength:
          typeof context.keywordTagsItems === 'string'
            ? context.keywordTagsItems.length
            : 0,
        userQuestionsItemsLength:
          typeof context.userQuestionsItems === 'string' ? context.userQuestionsItems.length : 0,
        contentGapsItemsLength:
          typeof context.contentGapsItems === 'string' ? context.contentGapsItems.length : 0,
        sourceArticlesJsonLength:
          typeof context.sourceArticlesJson === 'string' ? context.sourceArticlesJson.length : 0,
        anglePresent: !!context.angle,
        articleId: context.articleId,
      });
    } catch {
      /* noop */
    }
  }

  try {
    const { read } = await import('pomljs');
    const rendered = await read(raw, undefined, context);
    // Détection de placeholders non résolus (ex: {{unknownVar}})
    if (/\{\{\s*[\w.]+\s*\}\}/.test(rendered)) {
      throw new Error('[outline-writer.prompt] Placeholders non résolus dans le template');
    }
    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[outline-writer.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
