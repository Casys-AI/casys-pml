import type {
  AngleSelectionPromptDTO,
  ExistingBriefDTO,
  TopicArticleInputDTO,
} from '@casys/shared';
import type {
  AngleSelectionCommand,
  EditorialBrief,
  TopicCandidate,
} from '@casys/core';
import { slugifyKeyword } from '@casys/core';
import { mapBusinessContextV3ToDTO } from './business-context.mapper';
import { toSeoBriefDataDTO } from './seo-brief-data.mapper';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[angle-selection.mapper] ${message}`);
}

/**
 * Normalise des candidats domaine en format compact JSON pour le POML
 */
function normalizeArticles(
  articles: TopicCandidate[]
): {
  title: string;
  description?: string;
  url: string;
  source?: string;
  publishedAt?: string;
}[] {
  const out: {
    title: string;
    description?: string;
    url: string;
    source?: string;
    publishedAt?: string;
  }[] = [];

  for (const a of articles ?? []) {
    const title = String(a?.title ?? '').trim();
    const url = String(a?.sourceUrl ?? '').trim();
    if (!title || !url) continue;

    const description = a?.description ? String(a.description).trim() : undefined;
    const source = a?.sourceTitle ? String(a.sourceTitle).trim() : undefined;
    const publishedAt =
      typeof a?.publishedAt === 'string'
        ? a.publishedAt
        : a?.publishedAt instanceof Date
          ? a.publishedAt.toISOString()
          : undefined;

    out.push({ title, description, url, source, publishedAt });
  }

  return out;
}

/**
 * Normalise les briefs existants pour le POML
 * V3.1: Accepte EditorialBrief[] complets, extrait {id, angle, createdAt}
 * Le mapper garantit la compatibilité avec le format POML léger
 */
function normalizeExistingBriefs(
  briefs: EditorialBrief[]
): ExistingBriefDTO[] {
  return briefs.map(b => ({
    id: b.id,
    angle: b.angle.value, // EditorialBrief.angle est un ValueObject EditorialAngle
    createdAt: b.createdAt,
  }));
}

/**
 * Mappe la commande AngleSelection (domain) vers les paramètres du builder POML
 */
export function mapCommandToAngleSelectionPromptDTO(
  cmd: AngleSelectionCommand
): AngleSelectionPromptDTO {
  assert(cmd && typeof cmd === 'object', 'Commande invalide');

  // Validation businessContext
  assert(cmd.businessContext && typeof cmd.businessContext === 'object', 'businessContext requis');
  assert(cmd.businessContext.industry?.trim(), 'businessContext.industry requis');
  assert(cmd.businessContext.targetAudience?.trim(), 'businessContext.targetAudience requis');

  // Articles
  assert(Array.isArray(cmd.articles), 'articles requis (array)');
  const normalizedArticles = normalizeArticles(cmd.articles);
  assert(
    normalizedArticles.length > 0,
    'Aucun article valide: chaque article doit avoir title et sourceUrl'
  );

  const articlesJson = JSON.stringify(normalizedArticles, null, 2);

  // SeoBriefData requis
  assert(cmd.seoBriefData, 'seoBriefData requis');

  // Personas (optionnel mais recommandé)
  const personas = cmd.businessContext.personas ?? [];
  const personasJson = personas.length > 0 ? JSON.stringify(personas, null, 2) : undefined;
  const personasCount = personas.length;

  // Briefs existants (optionnel)
  const normalizedBriefs = normalizeExistingBriefs(cmd.existingBriefs);
  const existingBriefsJson =
    normalizedBriefs.length > 0 ? JSON.stringify(normalizedBriefs, null, 2) : undefined;
  const existingBriefsCount = normalizedBriefs.length;

  // Détecter les features SEO
  const seoHasPriority = !!(
    cmd.seoBriefData?.keywordTags?.some((t: any) => typeof t.priority === 'number')
  );

  const topicClusters =
    (cmd.seoBriefData as any)?.contentStrategy?.topicClusters ||
    (cmd.seoBriefData as any)?.topicClusters;
  const seoHasTopicClusters = !!(
    topicClusters && Array.isArray(topicClusters) && topicClusters.length > 0
  );

  // ✨ Debug: vérifier extraction des clusters
  if (process.env.DEBUG_PROMPTS === '1' && topicClusters) {
    console.log('[angle-selection.mapper] topicClusters extraits:', {
      count: topicClusters.length,
      firstClusterKeys: topicClusters[0] ? Object.keys(topicClusters[0]) : null,
      firstPillarTag: topicClusters[0]?.pillarTag || null,
    });
  }

  // ✨ Extraire les clusters disponibles avec hiérarchie pillar + satellites
  // Note: les données n'ont pas de slug, on le génère avec slugifyKeyword
  const availableClusters = (topicClusters ?? [])
    .filter((c: any) => c.pillarTag?.label)
    .map((c: any) => ({
      pillar: {
        label: c.pillarTag.label,
        slug: slugifyKeyword(c.pillarTag.label),
      },
      satellites: (c.satelliteTags ?? [])
        .filter((s: any) => s?.label)
        .map((s: any) => ({
          label: s.label,
          slug: slugifyKeyword(s.label),
        })),
    }));

  // ✨ Debug: vérifier clusters après filtrage
  if (process.env.DEBUG_PROMPTS === '1') {
    console.log('[angle-selection.mapper] availableClusters après filtrage:', {
      count: availableClusters.length,
      pillars: availableClusters.map((c: any) => c.pillar.slug),
    });
  }

  const availableClustersJson = availableClusters.length > 0
    ? JSON.stringify(availableClusters, null, 2)
    : undefined;

  const params: AngleSelectionPromptDTO = {
    minAngles: 3,
    maxAngles: 5,
    businessContext: mapBusinessContextV3ToDTO(cmd.businessContext),
    personasJson,
    personasCount,
    seoBriefData: toSeoBriefDataDTO(cmd.seoBriefData),
    seoHasPriority,
    seoHasTopicClusters,
    articlesJson,
    existingBriefsJson,
    existingBriefsCount,
    availableClusters, // ✨ Liste des clusters disponibles
    availableClustersJson, // ✨ JSON pour le template
  };

  return params;
}

/**
 * Mappe les candidats domain → DTOs d'articles en entrée de l'IA
 * (Réutilisé depuis topic-selector pour cohérence)
 */
export function mapTopicCandidatesToArticleDTOs(
  candidates: TopicCandidate[]
): TopicArticleInputDTO[] {
  const outputs: TopicArticleInputDTO[] = [];

  for (const c of candidates ?? []) {
    const title = (c.title ?? '').trim();
    const sourceUrl = (c.sourceUrl ?? '').trim();
    if (!title || !sourceUrl) continue;

    const publishedAt =
      typeof c.publishedAt === 'string'
        ? c.publishedAt
        : c.publishedAt instanceof Date
          ? c.publishedAt.toISOString()
          : undefined;

    outputs.push({
      id: c.id,
      title,
      description: c.description ?? undefined,
      sourceUrl,
      sourceTitle: c.sourceTitle ?? undefined,
      publishedAt,
      relevanceScore: typeof c.relevanceScore === 'number' ? c.relevanceScore : undefined,
      categories: Array.isArray(c.categories) ? c.categories : undefined,
    });
  }

  return outputs;
}
