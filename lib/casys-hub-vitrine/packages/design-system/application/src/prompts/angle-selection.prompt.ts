import type { AngleSelectionPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[angle-selection.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[angle-selection.prompt] ${message}`);
}

/**
 * Construit un prompt POML pour la sélection d'angle éditorial.
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus et la présence de <poml>
 */
export async function buildAngleSelectionPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: AngleSelectionPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assert(
    Number.isInteger(params.minAngles) && params.minAngles >= 3,
    'minAngles requis (>= 3)'
  );
  assert(
    Number.isInteger(params.maxAngles) && params.maxAngles <= 5,
    'maxAngles requis (<= 5)'
  );
  assert(params.minAngles <= params.maxAngles, 'minAngles <= maxAngles requis');
  assertNonEmpty(params.businessContext, 'businessContext');
  assertNonEmpty(params.seoBriefData, 'seoBriefData');
  assertNonEmpty(params.articlesJson, 'articlesJson');

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[angle-selection] template', { templatePath: String(templatePath) });
  } catch {
    // Ignorer toute erreur de logging pour ne pas affecter le flux applicatif
  }

  // Detect SEO strategy fields
  const seoHasPriority = !!(
    params.seoBriefData?.keywordTags?.some((t: any) => typeof t.priority === 'number')
  );

  const topicClusters =
    (params.seoBriefData as any)?.contentStrategy?.topicClusters ||
    (params.seoBriefData as any)?.topicClusters;
  const seoHasTopicClusters = !!(
    topicClusters && Array.isArray(topicClusters) && topicClusters.length > 0
  );

  // Construire le contexte pour l'injection de variables
  const context = {
    minAngles: String(params.minAngles),
    maxAngles: String(params.maxAngles),

    // Business context
    businessContext: params.businessContext,

    // Personas
    personasJson: params.personasJson ?? '',
    personasCount: params.personasCount ? String(params.personasCount) : '',

    // SEO data
    seoBriefData: params.seoBriefData,
    seoHasPriority,
    seoHasTopicClusters,

    // Articles candidats
    articlesJson: params.articlesJson,

    // Briefs existants (anti-doublons)
    existingBriefsJson: params.existingBriefsJson ?? '',
    existingBriefsCount: params.existingBriefsCount ? String(params.existingBriefsCount) : '',

    // ✨ Liste explicite des clusters disponibles
    availableClustersJson: params.availableClustersJson,
    availableClustersCount: params.availableClusters?.length ? String(params.availableClusters.length) : '',
  };

  // Debug: tracer le contexte injecté si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[angle-selection][debug] Context injecté:', {
        keys: Object.keys(context),
        minAngles: context.minAngles,
        maxAngles: context.maxAngles,
        personasCount: context.personasCount,
        seoHasPriority: context.seoHasPriority,
        seoHasTopicClusters: context.seoHasTopicClusters,
        existingBriefsCount: context.existingBriefsCount,
        articlesJsonLength:
          typeof context.articlesJson === 'string' ? context.articlesJson.length : 0,
        availableClustersCount: context.availableClustersCount,
        availableClustersJsonLength:
          typeof context.availableClustersJson === 'string' ? context.availableClustersJson.length : 0,
        availableClustersJsonDefined: context.availableClustersJson !== undefined,
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
      throw new Error('[angle-selection.prompt] Placeholders non résolus dans le template');
    }

    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[angle-selection.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
