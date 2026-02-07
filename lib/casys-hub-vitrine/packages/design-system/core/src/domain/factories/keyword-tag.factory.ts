import type { KeywordTag, TagSource } from '../types/seo.types';
import { slugifyKeyword } from '../value-objects/keyword.value';

function clamp01(n?: number): number | undefined {
  if (n === undefined) return undefined;
  if (Number.isNaN(n)) return undefined;
  const v = Math.max(0, Math.min(1, n));
  return v;
}

export function createKeywordTag(
  labelInput: string,
  options?: { source?: TagSource; weight?: number; slug?: string }
): KeywordTag {
  const raw = (labelInput ?? '').trim();
  if (!raw) {
    // Fail-fast: on retourne une structure minimale (label vide non souhaitable)
    // mais pour robustesse on évite de jeter ici (le use case fera le tri)
  }
  const slug = slugifyKeyword(options?.slug ? String(options.slug) : raw);
  const weight = clamp01(options?.weight);
  return {
    label: raw,
    slug,
    source: options?.source,
    weight,
  };
}
