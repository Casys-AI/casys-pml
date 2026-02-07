import type { EditorialBriefPromptDTO } from '@casys/shared';
import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    throw new Error(`[editorial-brief.prompt] Paramètre requis manquant: ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[editorial-brief.prompt] ${message}`);
}

/**
 * Construit un prompt POML pour la synthèse du brief éditorial.
 * - Charge un template POML via PromptTemplatePort
 * - Extrait et flatten les données des objets structurés du DTO
 * - Injecte les variables avec échappement XML strict
 * - Valide l'absence de placeholders non résolus
 *
 * Pattern: Le DTO garde les objets structurés, le builder fait le flattening
 */
export async function buildEditorialBriefPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: EditorialBriefPromptDTO
): Promise<string> {
  assertNonEmpty(templatePath, 'templatePath');

  // Validations strictes (fail-fast)
  assertNonEmpty(params.angle, 'angle');
  assertNonEmpty(params.contentType, 'contentType');
  assertNonEmpty(params.businessContext.industry, 'businessContext.industry');
  assertNonEmpty(params.businessContext.targetAudience, 'businessContext.targetAudience');
  assertNonEmpty(params.chosenCluster.pillarTag?.label, 'chosenCluster.pillarTag');
  assert(
    params.chosenCluster.satelliteTags && params.chosenCluster.satelliteTags.length > 0,
    'chosenCluster.satelliteTags requis (au moins 1)'
  );

  const raw = await templatePort.loadTemplate(templatePath);
  try {
    logger.debug('[editorial-brief] template loaded', { templatePath: String(templatePath) });
  } catch {
    // Ignorer erreur logging
  }

  // ============================================================================
  // FLATTENING: Extraire les données des objets structurés
  // ============================================================================

  // Persona (optionnel)
  const hasPersona = !!params.targetPersona;
  const personaCategory = params.targetPersona?.category ?? '';
  const personaArchetype = params.targetPersona?.archetype ?? '';
  const personaDemographics = params.targetPersona?.profile?.demographics ?? '';
  const personaPainPoints = (params.targetPersona?.painPoints ?? []).join(', ');
  const personaMessagingAngle = params.targetPersona?.messagingAngle ?? '';

  // Business context
  const industry = params.businessContext.industry;
  const targetAudience = params.businessContext.targetAudience;
  const businessDescription = params.businessContext.businessDescription ?? '';

  // Cluster (pillar + satellites)
  const pillar = params.chosenCluster.pillarTag!;
  const clusterPillar = pillar.label;
  const clusterPillarMetrics = `Vol: ${pillar.searchVolume ?? 'N/A'}, Diff: ${pillar.difficulty ?? 'N/A'}`;
  const clusterSatellites = (params.chosenCluster.satelliteTags ?? []).map(t => t.label);
  const clusterSatellitesMetrics = (params.chosenCluster.satelliteTags ?? []).map(
    t => `${t.label} (Vol: ${t.searchVolume ?? 'N/A'}, Diff: ${t.difficulty ?? 'N/A'})`
  );

  // Tous les keywords (pillar + satellites)
  const allKeywords = [
    pillar.label,
    ...(params.seoBriefData.keywordTags ?? []).map(k => k.label),
  ];

  // Questions PAA (depuis searchIntent)
  const questions = params.seoBriefData.searchIntent.supportingQueries ?? [];
  const hasQuestions = questions.length > 0;
  const questionsCount = questions.length;
  const questionsList = questions;

  // Content gaps (depuis competitiveAnalysis)
  const gaps = params.seoBriefData.competitiveAnalysis.contentGaps ?? [];
  const hasGaps = gaps.length > 0;
  const gapsCount = gaps.length;
  const gapsList = gaps.map(g => `${g.keyword.label}: ${g.gap}`);

  // Recommendations (depuis contentStrategy)
  const reco = params.seoBriefData.contentStrategy.recommendations ?? {
    seo: [],
    editorial: [],
    technical: [],
  };
  const hasSeoReco = (reco.seo ?? []).length > 0;
  const seoRecoList = reco.seo ?? [];
  const hasEditorialReco = (reco.editorial ?? []).length > 0;
  const editorialRecoList = reco.editorial ?? [];
  const hasTechnicalReco = (reco.technical ?? []).length > 0;
  const technicalRecoList = reco.technical ?? [];

  // Titres concurrents (depuis competitiveAnalysis)
  const competitorTitles =
    (params.seoBriefData.competitiveAnalysis.competitors ?? [])
      .map(c => c.title)
      .filter((t): t is string => !!t) ?? [];
  const hasCompetitorTitles = competitorTitles.length > 0;
  const competitorTitlesCount = competitorTitles.length;
  const competitorTitlesList = competitorTitles;

  // Corpus (JSON stringifiés → parser)
  const topics = JSON.parse(params.selectedTopicsJson) as Array<{ title: string; sourceUrl: string }>;
  const articles = JSON.parse(params.sourceArticlesJson) as Array<{ title: string; summary: string; url: string }>;
  const topicsCount = topics.length;
  const articlesCount = articles.length;
  const topicsList = topics.map(t => `- ${t.title} (${t.sourceUrl})`);
  const articlesList = articles.map(a => `- ${a.title}\n  Summary: ${a.summary}\n  URL: ${a.url}`);

  // ============================================================================
  // Construire le contexte pour injection de variables
  // ============================================================================

  const context = {
    // Décision éditoriale
    angle: params.angle,
    contentType: params.contentType,
    selectionMode: params.selectionMode,

    // Persona
    hasPersona,
    personaCategory,
    personaArchetype,
    personaDemographics,
    personaPainPoints,
    personaMessagingAngle,

    // Business context
    industry,
    targetAudience,
    businessDescription,

    // Cluster
    clusterPillar,
    clusterPillarMetrics,
    clusterSatellites: clusterSatellites.join(', '),
    clusterSatellitesMetrics: clusterSatellitesMetrics.join(' | '),

    // Tous keywords
    allKeywords: allKeywords.join('\n'),

    // Questions PAA
    hasQuestions,
    questionsCount: String(questionsCount),
    questionsList: questionsList.map((q, i) => `${i + 1}. ${q}`).join('\n'),

    // Gaps
    hasGaps,
    gapsCount: String(gapsCount),
    gapsList: gapsList.map((g, i) => `${i + 1}. ${g}`).join('\n'),

    // Recommendations
    hasSeoReco,
    seoRecoList: seoRecoList.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    hasEditorialReco,
    editorialRecoList: editorialRecoList.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    hasTechnicalReco,
    technicalRecoList: technicalRecoList.map((r, i) => `${i + 1}. ${r}`).join('\n'),

    // Titres concurrents
    hasCompetitorTitles,
    competitorTitlesCount: String(competitorTitlesCount),
    competitorTitlesList: competitorTitlesList.map((t, i) => `${i + 1}. ${t}`).join('\n'),

    // Corpus
    topicsCount: String(topicsCount),
    articlesCount: String(articlesCount),
    topicsList: topicsList.join('\n'),
    articlesList: articlesList.join('\n'),

    // Language
    language: params.language,
    languageDisplay: params.language === 'fr' ? 'FRANÇAIS' : params.language === 'en' ? 'ENGLISH' : params.language.toUpperCase(),
  };

  // Debug si DEBUG_PROMPTS=1
  if (process.env.DEBUG_PROMPTS === '1') {
    try {
      logger.debug('[editorial-brief][debug] Context injecté:', {
        keys: Object.keys(context),
        angle: context.angle.slice(0, 60),
        contentType: context.contentType,
        hasPersona: context.hasPersona,
        questionsCount: context.questionsCount,
        gapsCount: context.gapsCount,
      });
    } catch {
      /* noop */
    }
  }

  // Utiliser pomljs pour parser et rendre avec le contexte
  try {
    const { read } = await import('pomljs');
    const rendered = await read(raw, undefined, context);

    // Détection de placeholders non résolus
    if (/\{\{\s*[\w.]+\s*\}\}/.test(rendered)) {
      throw new Error('[editorial-brief.prompt] Placeholders non résolus dans le template');
    }

    return rendered;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[editorial-brief.prompt] Erreur lors du rendu POML: ${msg}`);
  }
}
