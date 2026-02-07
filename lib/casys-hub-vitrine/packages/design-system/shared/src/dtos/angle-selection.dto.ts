/**
 * DTOs pour la sélection d'angle éditorial
 * Exposés via @casys/shared
 */

import type { BusinessContextDTO,PersonaProfileDTO } from './lead-analysis/business-context.dto';
// Réutiliser TopicArticleInputDTO depuis select-topic.dto.ts
import type { TopicArticleInputDTO } from './select-topic.dto';
import type { SeoBriefDataDTO, TopicClusterDTO } from './seo-strategy.dto';

/**
 * Brief éditorial existant (simplifié pour anti-doublons)
 */
export interface ExistingBriefDTO {
  id: string;
  angle: string;
  createdAt: string;
}

/**
 * Keyword simplifié (pillar ou satellite)
 */
export interface AvailableKeywordDTO {
  label: string; // Texte lisible (ex: "Réglementation BTP")
  slug: string;  // Slug technique (ex: "reglementation-btp")
}

/**
 * Cluster disponible avec hiérarchie pillar + satellites
 * Structure hiérarchique pour aider l'IA à comprendre le contexte sémantique
 */
export interface AvailableClusterDTO {
  pillar: AvailableKeywordDTO;
  satellites: AvailableKeywordDTO[];
}

/**
 * Paramètres injectés dans le template POML d'angle selection
 */
export interface AngleSelectionPromptDTO {
  // Contraintes de génération
  minAngles: number; // Min 3
  maxAngles: number; // Max 5

  // Contexte business et personas
  businessContext: BusinessContextDTO;
  personasJson?: string; // JSON stringifié des personas
  personasCount?: number;

  // Données SEO (clusters, gaps, intent)
  seoBriefData: SeoBriefDataDTO;
  seoHasPriority?: boolean; // Indicateur keywords prioritaires
  seoHasTopicClusters?: boolean; // Indicateur clusters disponibles

  // Articles candidats (contexte actualités)
  articlesJson: string; // JSON stringifié

  // Briefs existants (anti-doublons)
  existingBriefsJson?: string; // JSON stringifié
  existingBriefsCount?: number;

  // ✨ Liste explicite des clusters disponibles (label + slug)
  availableClusters?: AvailableClusterDTO[];
  availableClustersJson?: string; // JSON stringifié pour le template
}

/**
 * Angle candidat généré par l'IA (output LLM)
 * L'AI retourne juste le slug du cluster choisi, le système récupère le cluster complet
 */
export interface CandidateAngleDTO {
  angle: string; // Texte de l'angle éditorial
  chosenClusterPillarSlug: string; // Slug du pillarTag choisi (sera matché dans seoBriefData.contentStrategy.topicClusters)
  contentType: 'guide' | 'comparatif' | 'liste' | 'tutoriel' | 'étude-de-cas' | 'interview' | 'analyse-tendance';
  targetPersona?: {
    category: string;
    archetype: string;
    profile: {
      techSavviness: string;
    };
  };
  selectionMode: 'pillar' | 'satellite';
  reasoning?: string; // Justification IA (1 phrase)
}

/**
 * Résultat du prompt angle selection (parsing LLM)
 */
export interface AngleSelectionPromptResult {
  candidateAngles: CandidateAngleDTO[];
}

/**
 * Résultat final du workflow angle selection
 */
export interface AngleSelectionResultDTO {
  selectedAngle: string;
  chosenCluster: TopicClusterDTO; // Réutilise TopicClusterDTO existant
  contentType: 'guide' | 'comparatif' | 'liste' | 'tutoriel' | 'étude-de-cas' | 'interview' | 'analyse-tendance';
  targetPersona?: PersonaProfileDTO;
  selectionMode: 'pillar' | 'satellite';
  attempts: number;
  status: 'success' | 'failed';
  failureReason?: string;
}
