import type { KeywordTagDTO, TagSourceDTO } from './keyword-plan.dto';
import type { SeoBriefDataDTO, TopicClusterDTO } from './seo-strategy.dto';
import type { BusinessContextDTO, PersonaProfileDTO } from './lead-analysis/business-context.dto';

/**
 * DTO représentant l'entité EditorialBrief complète
 * Correspond à EditorialBrief.toObject() du domaine
 */
export interface EditorialBriefDTO {
  id: string;
  tenantId: string;
  projectId: string;
  language: string;
  angle: string;
  seoSummary?: SeoBriefDataDTO;
  businessContext: BusinessContextDTO;
  corpusTopicIds: string[];
  createdAt: string;
  // V3.1: Contraintes structurelles
  targetSectionsCount?: number;
  targetCharsArticle?: number; // Total article length (outline writer decides per-section)
}

/**
 * Topic sélectionné (pour le corpus)
 */
export interface EditorialBriefTopicDTO {
  title: string;
  sourceUrl: string;
}

/**
 * Article source (pour le corpus)
 */
export interface EditorialBriefArticleDTO {
  title: string;
  summary: string;
  url: string;
}

/**
 * DTO pour le prompt EditorialBrief
 * Utilisé pour construire le template POML
 * Suit le pattern AngleSelectionPromptDTO: objets structurés, pas de flattening
 */
export interface EditorialBriefPromptDTO {
  // Décision éditoriale
  angle: string;
  contentType: string;
  selectionMode: string;
  targetPersona?: PersonaProfileDTO;

  // Contexte business structuré
  businessContext: BusinessContextDTO;

  // Cluster choisi structuré (réutilise TopicClusterDTO existant)
  chosenCluster: TopicClusterDTO;

  // Données SEO structurées
  seoBriefData: SeoBriefDataDTO;

  // Corpus (JSON stringifiés pour le template)
  selectedTopicsJson: string;
  sourceArticlesJson: string;

  // Language
  language: string;
}

/**
 * DTO Content Gap pour le résultat
 */
export interface EditorialBriefGapDTO {
  keyword: string;
  gap: string;
  priority: number;
}

/**
 * DTO Recommendations pour le résultat
 */
export interface EditorialBriefRecommendationsDTO {
  seo: string[];
  editorial: string[];
  technical: string[];
}

/**
 * DTO pour le résultat du prompt EditorialBrief
 * Structure JSON attendue de l'IA
 *
 * Note: L'IA renvoie un subset minimal (label, slug, source)
 * Les autres champs de KeywordTagDTO sont optionnels et remplis par défaut dans le parser
 */
export interface EditorialBriefPromptResult {
  keywordTags: KeywordTagDTO[];
  relevantQuestions: string[];
  priorityGaps: EditorialBriefGapDTO[];
  guidingRecommendations: EditorialBriefRecommendationsDTO;
  corpusSummary: string;
  competitorAngles?: string[];
  // V3.1: Contraintes structurelles générées par l'AI
  targetSectionsCount?: number;
  targetCharsArticle?: number; // Total article length (outline writer decides per-section)
}
