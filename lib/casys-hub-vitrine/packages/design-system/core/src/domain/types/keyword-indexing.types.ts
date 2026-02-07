import type { KeywordTag } from './seo.types';

/**
 * Commande applicative (domain-centric) pour indexer des mots-clés de base.
 * Utilise exclusivement des types/VO de domaine.
 */
export interface IndexProjectSeedKeywordsCommand {
  tenantId: string;
  projectId: string;
  baseKeywords: string[];
}

/**
 * Résultat applicatif (domain-centric) de l'indexation des mots-clés.
 */
export interface IndexProjectSeedKeywordsResult {
  indexed: number;
  skipped: number;
  total: number;
  keywords: KeywordTag[]; // normalisés/dédupliqués comme KeywordTag (source='seed')
}
