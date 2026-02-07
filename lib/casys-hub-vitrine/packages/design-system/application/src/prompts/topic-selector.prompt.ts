import type { TopicSelectorPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function escapeXml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toPomlItems(values: string[] | undefined): string {
  const arr = Array.isArray(values) ? values : [];
  return arr.map(v => `<item>${escapeXml(v)}</item>`).join('\n');
}

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[topic-selector.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[topic-selector.prompt] ${message}`);
}

/**
 * Construit un prompt POML pour la sélection de sujets (v2 refactoré).
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL:
 * - angle et chosenCluster sont maintenant FOURNIS en input (déjà sélectionnés par AngleSelectionWorkflow)
 * - Le TopicSelector se concentre uniquement sur le filtrage de topics pertinents
 *
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus et la présence de <poml>
 */
export async function buildTopicSelectorPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: TopicSelectorPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assert(Number.isInteger(params.maxTopics) && params.maxTopics > 0, 'maxTopics requis (>0)');
  assertNonEmpty(params.angle, 'angle requis (fourni par AngleSelectionWorkflow)');
  assert(
    params.chosenCluster && typeof params.chosenCluster === 'object',
    'chosenCluster requis (fourni par AngleSelectionWorkflow)'
  );
  assert(Array.isArray(params.tagLabels) && params.tagLabels.length > 0, 'tagLabels requis');
  assertNonEmpty(params.articlesJson, 'articlesJson');

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[topic-selector] template', { templatePath: String(templatePath) });
  } catch {
    // Ignorer toute erreur de logging pour ne pas affecter le flux applicatif
  }

  // Construire le contexte pour l'injection de variables
  // Tags: générer des fragments <item> comme dans Outline Writer (plus robuste qu'une boucle POML)
  const tagLabelsClean: string[] = (params.tagLabels)
    .map(s => String(s).trim())
    .filter(s => s.length > 0);
  const tagLabelsItems: string = toPomlItems(tagLabelsClean);

  // Detect blog strategy fields (SEO Analysis v2+v3)
  const seoHasPriority = !!(
    params.seoBriefData?.keywordTags?.some((t) => typeof t.priority === 'number')
  );
  
  // Support both v2 (flat topicClusters) and v3 (contentStrategy.topicClusters)
  const topicClusters = (params.seoBriefData as any)?.contentStrategy?.topicClusters || 
                        (params.seoBriefData as any)?.topicClusters;
  const seoHasTopicClusters = !!(
    topicClusters && 
    Array.isArray(topicClusters) &&
    topicClusters.length > 0
  );

  const context = {
    maxTopics: String(params.maxTopics),
    // ✨ FOURNIS par AngleSelectionWorkflow (plus générés par TopicSelector)
    angle: params.angle,
    chosenCluster: params.chosenCluster,
    tagLabelsItems,
    articlesJson: params.articlesJson,
    // Analyse SEO complète (object direct) — utilisé par <p if="seoBriefData"> dans le template
    seoBriefData: params.seoBriefData,
    // Blog strategy flags (SEO Analysis v2)
    seoHasPriority,
    seoHasTopicClusters,
    // Graph RAG : EditorialBriefs existants
    existingBriefsJson: params.existingBriefsJson ?? '',
    existingBriefsCount: params.existingBriefsCount ? String(params.existingBriefsCount) : '',
  };

  // Debug: tracer le contexte injecté si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[topic-selector][debug] Context injecté (v2 refactoré):', {
        keys: Object.keys(context),
        hasAngle: !!context.angle,
        angleLength: typeof context.angle === 'string' ? context.angle.length : 0,
        hasChosenCluster: !!context.chosenCluster,
        chosenClusterPillar: (context.chosenCluster as any)?.pillarTag?.label,
        chosenClusterSatellites: (context.chosenCluster as any)?.satelliteTags?.length,
        tagLabelsItemsLength:
          typeof context.tagLabelsItems === 'string' ? context.tagLabelsItems.length : 0,
        seoBriefDataPresent: !!context.seoBriefData,
        seoBriefKeywordsCount: Array.isArray(context.seoBriefData?.keywordTags)
          ? context.seoBriefData.keywordTags.length
          : 0,
        seoHasPriority: context.seoHasPriority,
        seoHasTopicClusters: context.seoHasTopicClusters,
        articlesJsonLength: typeof context.articlesJson === 'string' ? context.articlesJson.length : 0,
      });
    } catch {
      /* noop */
    }
  }

  // Utiliser pomljs pour parser et rendre avec le contexte
  try {
    const { read } = await import('pomljs');

    // Log avant rendering pour debug
    logger.debug('[topic-selector.prompt] Avant POML rendering', {
      contextKeys: Object.keys(context),
      chosenClusterType: typeof context.chosenCluster,
      chosenClusterIsString: typeof context.chosenCluster === 'string',
      chosenClusterIsObject: typeof context.chosenCluster === 'object',
      chosenClusterStringified: typeof context.chosenCluster === 'string' ? context.chosenCluster.substring(0, 100) : 'N/A',
      rawTemplateLength: raw.length,
    });

    const rendered = await read(raw, undefined, context);

    logger.debug('[topic-selector.prompt] POML rendering réussi', {
      renderedLength: rendered.length
    });

    // Détection de placeholders non résolus (ex: {{unknownVar}})
    if (/\{\{\s*[\w.]+\s*\}\}/.test(rendered)) {
      throw new Error('[topic-selector.prompt] Placeholders non résolus dans le template');
    }
    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';

    // Log détaillé de l'erreur
    logger.error('[topic-selector.prompt] POML rendering failed', {
      errorMessage: msg,
      errorStack: stack,
      contextKeys: Object.keys(context),
      chosenClusterType: typeof context.chosenCluster,
      chosenClusterValue: typeof context.chosenCluster === 'string'
        ? context.chosenCluster.substring(0, 200)
        : String(context.chosenCluster).substring(0, 200),
      rawTemplatePreview: raw.substring(0, 200),
    });

    throw new Error(`[topic-selector.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
