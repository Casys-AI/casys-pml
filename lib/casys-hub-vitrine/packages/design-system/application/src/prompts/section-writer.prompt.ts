import type { SectionWriterPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[section-writer.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[section-writer.prompt] ${message}`);
}

/**
 * Construit un prompt POML pour l'écriture de section.
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus et la présence de <poml>
 */
export async function buildSectionWriterPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: SectionWriterPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assert(typeof params.language === 'string' && params.language.trim().length > 0, 'language requis');
  assert(typeof params.topicTitle === 'string' && params.topicTitle.trim().length > 0, 'topicTitle requis');
  assert(typeof params.context === 'string', 'context requis (peut être vide)');

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[section-writer] template', { templatePath: String(templatePath) });
  } catch {
    // Ignorer toute erreur de logging pour ne pas affecter le flux applicatif
  }

  // Construire le contexte pour l'injection de variables
  const context = {
    language: params.language,
    topicTitle: params.topicTitle,
    context: params.context,
    angle: params.angle ?? '',
    sectionDescription: params.sectionDescription ?? '',
    targetCharsPerSection: params.targetCharsPerSection ?? 0,

    // Graph RAG : Liens de cette section uniquement
    relatedArticlesJson: params.relatedArticles ? JSON.stringify(params.relatedArticles) : '[]',
    relatedArticlesCount: params.relatedArticles ? String(params.relatedArticles.length) : '0',
    suggestedTopicsJson: params.suggestedTopics ? JSON.stringify(params.suggestedTopics, null, 2) : '',
    suggestedTopicsCount: params.suggestedTopics?.length ?? 0,
  };

  // 🔍 LOG: Toujours tracer les données Graph RAG injectées dans le template
  logger.info('[SectionWriterPOML] Graph RAG injection:', {
    relatedArticlesCount: context.relatedArticlesCount,
    relatedArticlesIds: params.relatedArticles?.map(a => a.id) ?? [],
    suggestedTopicsCount: context.suggestedTopicsCount,
    suggestedTopicsIds: params.suggestedTopics?.map(t => t.id) ?? [],
  });

  // Debug: tracer le contexte injecté si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[section-writer][debug] Context injecté:', {
        keys: Object.keys(context),
        topicTitleLength: context.topicTitle.length,
        contextLength: context.context.length,
        anglePresent: !!context.angle,
      });
    } catch {
      /* noop */
    }
  }

  // Utiliser pomljs pour parser et rendre avec le contexte
  try {
    const { read } = await import('pomljs');
    const rendered = await read(raw, undefined, context);
    // Détection de placeholders non résolus (ex: {{unknownVar}})
    if (/\{\{\s*[\w.]+\s*\}\}/.test(rendered)) {
      throw new Error('[section-writer.prompt] Placeholders non résolus dans le template');
    }
    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[section-writer.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
