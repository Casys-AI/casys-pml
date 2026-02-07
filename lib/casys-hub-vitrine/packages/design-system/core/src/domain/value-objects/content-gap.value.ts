import type { KeywordTag } from '../types/seo.types';

export type ContentGapReason = 'no_content' | 'low_quality' | 'low_performance' | 'competitor_gap';

/**
 * Content gap identifié par analyse SEO
 *
 * V3 Architecture: keyword est un KeywordTag complet avec métriques SEO
 * Permet de calculer opportunityScore basé sur volume/difficulty
 *
 * Supporte deux formats:
 * - Legacy: reason (ContentGapReason) + details
 * - Blog strategy v2: type + opportunityScore (pour priorisation intelligente)
 */
export interface ContentGap {
  keyword: KeywordTag; // V3: KeywordTag complet avec métriques (searchVolume, difficulty, etc.)
  gap: string; // Description du gap (remplace details pour uniformité)

  // Legacy format (optionnel)
  reason?: ContentGapReason;
  details?: string;

  // Blog strategy v2 format (optionnel)
  type?: 'pillar' | 'cluster' | 'angle'; // pillar=nouveau centre thématique, cluster=complément, angle=perspective différente
  opportunityScore?: number; // 1-10, volume × (1-difficulty) × blog-fit
}

/**
 * Legacy V2 format - DEPRECATED
 * Utilisé pour backward compatibility avec le code qui attend keyword: string
 * @deprecated Utiliser ContentGap (V3) avec KeywordTag à la place
 */
export interface ContentGapLegacy {
  keyword: string; // Legacy: simple string
  gap: string;
  reason?: ContentGapReason;
  details?: string;
  type?: 'pillar' | 'cluster' | 'angle';
  opportunityScore?: number;
}
