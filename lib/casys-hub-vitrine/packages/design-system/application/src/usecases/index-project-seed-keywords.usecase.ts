import {
  type IndexProjectSeedKeywordsCommand,
  type IndexProjectSeedKeywordsResult,
  type KeywordTag,
  normalizeSeoKeyword,
} from '@casys/core';

import type { TagRepositoryPort } from '../ports/out';

export class IndexProjectSeedKeywordsUseCase {
  constructor(private readonly tagRepository: TagRepositoryPort) {}

  async execute(params: IndexProjectSeedKeywordsCommand): Promise<IndexProjectSeedKeywordsResult> {
    if (!params) throw new Error('params requis');
    const { tenantId, projectId, baseKeywords } = params;
    if (!tenantId) throw new Error('tenantId requis');
    if (!projectId) throw new Error('projectId requis');
    if (!Array.isArray(baseKeywords)) throw new Error('baseKeywords doit être un tableau');
    const trimmed = baseKeywords.map(k => (k ?? '').trim()).filter(k => k.length > 0);
    if (trimmed.length === 0) throw new Error('aucun seed keyword fourni');

    // Normalisation + déduplication par slug/normalized (source = 'seed')
    const map = new Map<string, KeywordTag>();
    for (const raw of trimmed) {
      const normalized = normalizeSeoKeyword(raw);
      if (!normalized) continue;
      if (!map.has(normalized)) {
        map.set(normalized, { label: raw, slug: normalized, source: 'seed' });
      } else {
        // on conserve la première occurrence rencontrée pour la valeur d'affichage (fail-fast, déterministe)
        // ne rien faire ici pour ne pas écraser la valeur initiale
      }
    }

    const keywords = Array.from(map.values());
    const skipped = trimmed.length - keywords.length;

    await this.tagRepository.upsertProjectSeedTags({ tenantId, projectId, seeds: keywords });

    return {
      indexed: keywords.length,
      skipped,
      total: trimmed.length,
      keywords,
    };
  }
}
