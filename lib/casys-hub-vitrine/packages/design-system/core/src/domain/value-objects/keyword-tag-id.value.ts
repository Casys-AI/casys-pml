import { slugifyKeyword } from './keyword.value';

/**
 * Construit l'identifiant canonique d'un KeywordTag pour un tenant/projet donné.
 * Format: `${tenantId}::${projectId}::${slugNormalise}`
 * 
 * ⚠️ IMPORTANT: Utilise slugifyKeyword (espaces → tirets) pour cohérence totale
 * avec tous les slugs générés ailleurs (tags articles, SEO, topics)
 */
export function buildKeywordTagId(tenantId: string, projectId: string, slugOrLabel: string): string {
  const slugInput = String(slugOrLabel ?? '').trim();
  const normalized = slugifyKeyword(slugInput);  // ✅ Cohérence: normalisation + espaces → tirets
  return `${tenantId}::${projectId}::${normalized}`;
}
