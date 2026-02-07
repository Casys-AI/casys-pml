import type { EditorialBriefData } from './editorial-brief.types';

export interface OutlineWriterTopicInput {
  id: string;
  title: string;
  sourceUrl?: string;
  createdAt: string; // ISO 8601
  language?: string;
  keywords?: string[]; // tags shortlist alignée (enrichedKeywords)
}

export interface OutlineWriterSourceArticleInput {
  title: string;
  sourceUrl: string;
  content: string;
  summary: string;
}

/**
 * Commande applicative (domain-centric) pour l'Outline Writer
 *
 * V3: seoSummary → editorialBriefData
 * OutlineWriter reçoit maintenant EditorialBriefData enrichi par l'agent au lieu de SeoBriefDataV3 brut.
 */
export interface OutlineWriterCommand {
  language: string;
  articleId: string;
  topics: OutlineWriterTopicInput[];
  angle?: string;
  contentType?: string;
  editorialBriefData?: EditorialBriefData; // V3: Brief enrichi par EditorialBriefAgent
  sourceArticles?: OutlineWriterSourceArticleInput[];
  businessContext?: {
    targetAudience?: string;
    industry?: string;
    businessDescription?: string;
    contentType?: string;
  }; // Contexte business pour le ton (inline pour éviter dépendance circulaire)
}
