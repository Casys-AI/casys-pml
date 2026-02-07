import {
  type BuildTopicsFromFetchResultsCommand,
  type BuildTopicsFromFetchResultsReport,
  type KeywordTag,
  type Topic} from '@casys/core';

import { type
  LinkTopicToKeywordPlanParams,type
  TopicRelationsPort,
type TopicRepositoryPort, type UpsertTopicsParams ,} from '../ports/out';

export class BuildTopicsFromFetchResultsUseCase {
  constructor(
    private readonly repo: TopicRepositoryPort,
    private readonly relations: TopicRelationsPort
  ) {}

  async execute(
    cmd: BuildTopicsFromFetchResultsCommand
  ): Promise<BuildTopicsFromFetchResultsReport> {
    // Fail-fast input
    if (!cmd) throw new Error('[BuildTopicsFromFetchResults] commande requise');
    const { tenantId, projectId, candidates, keywordTags } = cmd;
    if (!tenantId) throw new Error('[BuildTopicsFromFetchResults] tenantId requis');
    if (!projectId) throw new Error('[BuildTopicsFromFetchResults] projectId requis');
    if (!Array.isArray(candidates) || candidates.length === 0)
      throw new Error('[BuildTopicsFromFetchResults] candidates[] requis et non vide');
    if (!Array.isArray(keywordTags) || keywordTags.length === 0)
      throw new Error('[BuildTopicsFromFetchResults] keywordTags[] requis et non vide');

    const linkKeywords = cmd.linkKeywords ?? true;

    // Mapper candidates -> Topics (minimaux)
    const topics: Topic[] = candidates.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: this.toIso(c.publishedAt),
      language: c.language,
      sourceUrl: c.sourceUrl,
      imageUrls: c.imageUrls,
      sourceContent: c.content ?? c.description,
    }));

    // Upsert topics (idempotent côté repo)
    const upsertParams: UpsertTopicsParams = { tenantId, projectId, topics };
    await this.repo.upsertTopics(upsertParams);

    // Fail-fast: chaque tag doit avoir un slug non vide
    const normalizedKeywords = Array.from(
      new Set(
        (keywordTags)
          .map((t: KeywordTag) => {
            const s = (t?.slug ?? '').trim();
            if (!s) {
              throw new Error('[BuildTopicsFromFetchResults] keywordTags[].slug manquant');
            }
            return s;
          })
      )
    );

    // Lier keywords et sources
    let linkKwCount = 0;

    if (linkKeywords) {
      for (const t of topics) {
        for (const kw of normalizedKeywords) {
          const params: LinkTopicToKeywordPlanParams = {
            tenantId,
            projectId,
            topicId: t.id,
            keywordNormalized: kw,
          };
          await this.relations.linkTopicToKeywordPlan(params);
          linkKwCount += 1;
        }
      }
    }

    return { upsertedCount: topics.length, linkedKeywordTags: linkKwCount };
  }

  private toIso(dateLike: string | Date): string {
    try {
      if (dateLike instanceof Date) return dateLike.toISOString();
      const d = new Date(dateLike);
      return d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  // Normalisation centralisée via @casys/core.normalizeSeoKeyword
}
