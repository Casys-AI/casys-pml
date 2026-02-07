// DTOs pour l'Outline Writer (command + prompt)
// Exposés via @casys/shared

import type { KeywordTagDTO } from './keyword-plan.dto';
import type { ProjectContextDTO } from './seo-analysis.dto';
import type { SeoBriefDataDTO } from './seo-strategy.dto';

// Entrées de commande (use case)
export interface OutlineWriterTopicDTO {
  id: string;
  title: string;
  sourceUrl?: string;
  createdAt: string; // ISO 8601
  language?: string;
  keywords?: string[];
}

export interface OutlineWriterSourceArticleDTO {
  title: string;
  sourceUrl: string;
  content: string;
  summary: string;
}

export interface OutlineWriterCommandDTO {
  language: string;
  articleId: string;
  topics: OutlineWriterTopicDTO[];
  angle?: string;
  contentType?: string;
  // V3 MIGRATION: Utilise SeoBriefDataDTO (objets métier)
  // Le mapper aplatit v3 → v2 flat pour OutlineWriterPromptDTO
  seoSummary?: SeoBriefDataDTO;
  sourceArticles?: OutlineWriterSourceArticleDTO[];
  // Contexte business pour contextualiser le ton et la cible
  businessContext?: ProjectContextDTO;
}

/**
 * Paramètres injectés dans le template POML de l'Outline Writer.
 * Utilisation:
 * - application: consommé par buildOutlineWriterPoml() (packages/application/src/prompts/outline-writer.prompt.ts)
 */
export interface OutlineWriterPromptDTO {
  // Contexte global
  language: string; // ex: 'fr', 'en'
  contentType?: string; // ex: 'article' (défaut côté builder)
  angle?: string; // angle éditorial unique (optionnel)
  articleId: string; // identifiant d'article à propager dans chaque section

  // Contexte business pour contextualiser le ton et la cible
  businessContext?: ProjectContextDTO;

  // Sujets principaux (JSON stringifié) + compteur
  topicsJson: string; // JSON des sujets candidats sélectionnés (id, title, sourceUrl, createdAt, language, keywords)
  topicsCount: number;

  // Synthèse SEO (subset strict) - arrays utilisés par le mapper
  keywordTags?: KeywordTagDTO[];
  userQuestions?: string[];
  contentGaps?: string[];
  seoRecommendations?: string[];
  contentRecommendations?: string[];

  // Synthèse SEO (fragments POML) - strings générés par le builder pour le template
  keywordTagsItems?: string;
  userQuestionsItems?: string;
  contentGapsItems?: string;
  seoRecommendationsItems?: string;
  contentRecommendationsItems?: string;

  // Articles sources (optionnel, JSON stringifié) + compteur
  sourceArticlesJson?: string;

  // Configuration
  maxSections?: number; // DEPRECATED: Utilisez targetSectionsCount à la place

  // V3.1: Contraintes structurelles (depuis EditorialBrief)
  targetSectionsCount?: number; // Nombre cible de sections (1-15)
  targetCharsArticle?: number; // Longueur cible totale de l'article (outline writer decides per-section)

  // RAG Vector: Tags existants suggérés pour réutilisation
  suggestedTags?: {
    label: string;
    slug: string;
    usageCount: number; // Popularité
    score: number;      // Similarité sémantique
  }[];

  // Graph RAG: Articles internes pertinents
  relatedArticles?: {
    id: string;
    title: string;
    slug?: string; // Pour construire le lien de maillage interne (optionnel)
    sectionSummary: string;
    relevanceScore: number;
  }[];
}
