import type {
  SelectTopicCommandDTO,
  SelectedTopicDTO,
  TopicArticleInputDTO,
  TopicSelectorPromptDTO,
  SeoBriefDataDTO,
} from '@casys/shared';
import type {
  SelectTopicCommand,
  Topic,
  TopicCandidate,
} from '@casys/core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[topic-selector.mapper] ${message}`);
}

// Normalise des candidats domaine en un format compact JSON pour le POML
function normalizeArticles(
  articles: SelectTopicCommand['articles']
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
 * Mappe la commande SelectTopic vers les paramètres du builder POML (v3 simplifié).
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL V3:
 * L'angle et le cluster sont maintenant FOURNIS dans cmd (déjà sélectionnés par GenerateAngleUseCase).
 * Le TopicSelector se concentre uniquement sur le filtrage de topics pertinents.
 */
export function mapCommandToTopicSelectorPromptDTO(
  cmd: SelectTopicCommand,
  options: {
    maxTopics: number;
    existingBriefs?: { angle: string; topics: string[]; similarityScore: number }[];
  }
): TopicSelectorPromptDTO {
  assert(cmd && typeof cmd === 'object', 'Commande invalide');

  // maxTopics requis et positif
  assert(
    Number.isInteger(options.maxTopics) && options.maxTopics > 0,
    'maxTopics requis (>0)'
  );

  // V3: angle requis dans command (fourni par GenerateAngleUseCase)
  assert(
    typeof cmd.angle === 'string' && cmd.angle.trim().length > 0,
    'angle requis dans command (fourni par GenerateAngleUseCase en amont)'
  );

  // V3: chosenCluster requis dans command (fourni par GenerateAngleUseCase)
  assert(
    cmd.chosenCluster && typeof cmd.chosenCluster === 'object',
    'chosenCluster requis dans command (fourni par GenerateAngleUseCase en amont)'
  );

  // Articles
  assert(Array.isArray(cmd.articles), 'articles requis (array)');
  const normalizedArticles = normalizeArticles(cmd.articles);
  assert(
    normalizedArticles.length > 0,
    'Aucun article valide: chaque article doit avoir title et sourceUrl'
  );

  const articlesJson = JSON.stringify(
    normalizedArticles.map(a => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source,
      publishedAt: a.publishedAt,
    }))
  );

  // keywordTags only: extraire les labels depuis cmd.seoBriefData
  const tagLabels = (cmd.seoBriefData?.keywordTags ?? []).map(t => t.label).filter(Boolean);
  assert(tagLabels.length > 0, 'cmd.seoBriefData.keywordTags requis (labels)');

  // Graph RAG : EditorialBriefs existants (optionnel)
  const existingBriefsJson =
    options?.existingBriefs && options.existingBriefs.length > 0
      ? JSON.stringify(
          options.existingBriefs.map(b => ({
            angle: b.angle,
            topics: b.topics,
            similarityScore: b.similarityScore,
          }))
        )
      : undefined;

  // V3 MIGRATION: Passer cmd.seoBriefData tel quel (déjà v3 depuis SeoAnalysisUseCase)
  const seoBriefDataV3: SeoBriefDataDTO | undefined = cmd.seoBriefData as SeoBriefDataDTO;

  const params: TopicSelectorPromptDTO = {
    maxTopics: options.maxTopics,
    angle: cmd.angle, // ✅ V3: Pris directement depuis command
    chosenCluster: cmd.chosenCluster, // ✅ V3: Pris directement depuis command
    tagLabels,
    articlesJson,
    seoBriefData: seoBriefDataV3,
    existingBriefsJson,
    existingBriefsCount: options?.existingBriefs?.length ?? 0,
  };

  return params;
}

// Mappe des candidats de domaine -> DTOs d'articles en entrée de l'IA
export function mapTopicCandidatesToInputDTOs(
  candidates: TopicCandidate[]
): TopicArticleInputDTO[] {
  const outputs: TopicArticleInputDTO[] = [];
  for (const c of candidates ?? []) {
    const title = (c.title ?? '').trim();
    const sourceUrl = (c.sourceUrl ?? '').trim();
    if (!title || !sourceUrl) continue; // filtre strict

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

// Mappe la sortie IA -> entité domaine Topic (fail-fast minimal en appelant côté use case)
function mapSelectedTopicDTOToDomain(t: SelectedTopicDTO): Topic {
  return {
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    language: t.language,
    sourceUrl: t.sourceUrl,
  };
}

// Mappe une liste de DTO sélectionnés -> liste d'entités domaine Topic
export function mapSelectedTopicsDTOToDomain(list: SelectedTopicDTO[]): Topic[] {
  const topics: Topic[] = [];
  for (const t of list ?? []) {
    try {
      topics.push(mapSelectedTopicDTOToDomain(t));
    } catch (e) {
      // Fail-fast: si un élément est invalide, on jette immédiatement
      throw new Error(
        `[topic-selector.mapper] SelectedTopicDTO invalide: ${(e as Error)?.message ?? 'unknown'}`
      );
    }
  }
  return topics;
}
