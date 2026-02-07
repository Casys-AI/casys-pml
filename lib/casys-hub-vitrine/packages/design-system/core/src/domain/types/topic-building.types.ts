import type { TopicCandidate } from '../entities/topic.entity';
import type { KeywordTag } from './seo.types';

/**
 * Commande applicative (domain-centric) pour construire des Topics depuis des candidats.
 * Utilise exclusivement des types/VO de domaine.
 */
export interface BuildTopicsFromFetchResultsCommand {
  tenantId: string;
  projectId: string;
  candidates: TopicCandidate[];
  keywordTags: KeywordTag[];
  linkKeywords?: boolean; // default true
}

/**
 * Résultat applicatif (domain-centric) du use case de construction de Topics.
 */
export interface BuildTopicsFromFetchResultsReport {
  upsertedCount: number;
  linkedKeywordTags: number; // nombre de relations tentées Topic-Keyword
}
