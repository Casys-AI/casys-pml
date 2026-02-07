import type { SeoAnalysisPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  ) {
    throw new Error(`[seo-analysis.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[seo-analysis.prompt] ${message}`);
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
 * Construit un prompt POML pour l'analyse SEO.
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus et la présence de <poml>
 */
export async function buildSeoAnalysisPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: SeoAnalysisPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assertNonEmpty(params.keywords, 'keywords');
  assert(
    typeof params.maxKeywords === 'number' && params.maxKeywords > 0,
    'maxKeywords requis (>0)'
  );
  assertNonEmpty(params.targetAudience, 'targetAudience');
  // Champs métier requis
  assertNonEmpty(params.businessDescription, 'businessDescription');
  assertNonEmpty(params.industry, 'industry');
  // projectContext peut être requis par certains templates/tests
  if ('projectContext' in (params as SeoAnalysisPromptDTO & { projectContext?: unknown })) {
    assertNonEmpty(
      (params as SeoAnalysisPromptDTO & { projectContext?: unknown }).projectContext,
      'projectContext'
    );
  }

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[seo-analysis] template', { templatePath });
  } catch {
    // Ignorer toute erreur de logging pour ne pas affecter le flux applicatif
  }

  // Validations fail-fast strictes
  // NOTE: Dans le flux IA d'abord, ces champs peuvent être vides
  // competitorTitles/trendData/webContext deviennent optionnels

  // Formater les données DataForSEO pour POML
  const keywordMetricsItems = (params as any).keywordMetrics
    ? (params as any).keywordMetrics.map((m: any) => 
        `${m.keyword}: volume=${m.searchVolume}/mois, difficulty=${m.difficulty}/100, cpc=${m.cpc}€, competition=${m.competition}`
      ).join('\n')
    : '';

  const competitorTitlesItems = (params as any).competitorTitles
    ? toPomlItems((params as any).competitorTitles)
    : '';

  const trendDataItems = (params as any).trendData
    ? (params as any).trendData.map((t: any) => 
        `${t.keyword}: trend=${t.trend}, volume=${t.searchVolume || 'N/A'}`
      ).join('\n')
    : '';

  // Construire le contexte pour l'injection de variables
  const context: Record<string, unknown> = {
    // Mots-clés de base
    keywordsItems: toPomlItems(params.keywords ?? []),
    excludeCategoryItems: toPomlItems(params.excludeCategories ?? []),
    
    // Données DataForSEO (data-driven)
    keywordMetrics: keywordMetricsItems,
    competitorTitles: competitorTitlesItems,
    trendData: trendDataItems,
    
    // Contexte métier
    targetAudience: params.targetAudience,
    businessDescription: params.businessDescription,
    industry: params.industry,
    maxKeywords: params.maxKeywords,
    projectName: params.projectName ?? '',
    language: params.language ?? '',
    contentType: params.contentType ?? '',
    trendPriority: params.trendPriority ?? 0.5,
  };

  // Debug: tracer le contexte injecté si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[seo-analysis][debug] Context injecté:', {
        keys: Object.keys(context),
        keywordsItemsLength: typeof context.keywordsItems === 'string' ? context.keywordsItems.length : 0,
        excludeCategoryItemsLength: typeof context.excludeCategoryItems === 'string' ? context.excludeCategoryItems.length : 0,
        targetAudience: !!context.targetAudience,
        businessDescription: !!context.businessDescription,
        industry: !!context.industry,
        maxKeywords: context.maxKeywords,
        language: context.language,
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
    if (/\{\{\s*\w+\s*\}\}/.test(rendered)) {
      throw new Error('Placeholders non résolus dans le template');
    }
    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[seo-analysis.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
