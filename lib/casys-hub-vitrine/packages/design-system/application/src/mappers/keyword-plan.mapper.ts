import type { KeywordPlanDTO, KeywordTagDTO } from '@casys/shared';
import { slugifyKeyword } from '@casys/core';

/**
 * Construit un KeywordPlanDTO à partir des résultats d'enrichissement IA.
 * - enrichedKeywords -> tags (source par défaut: 'trend')
 * Déduplication par slug (fail-fast friendly).
 */
export function buildKeywordPlanFromEnrichment(
  enrichedKeywords: string[]
): KeywordPlanDTO {
  const tags: KeywordTagDTO[] = [];
  const seen = new Set<string>();

  const pushTag = (label: string, source: KeywordTagDTO['source'], weight?: number) => {
    const clean = (label ?? '').trim();
    if (!clean) return;
    const slug = slugifyKeyword(clean);
    if (seen.has(slug)) return;
    seen.add(slug);
    tags.push({ label: clean, slug, source, weight });
  };

  for (const k of enrichedKeywords ?? []) {
    pushTag(k, 'trend');
  }

  return { tags };
}
