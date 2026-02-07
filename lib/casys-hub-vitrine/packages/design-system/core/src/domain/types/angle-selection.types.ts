import type { TopicCandidate } from '../entities/topic.entity';
import type { EditorialBrief } from '../aggregates/editorial-brief.aggregate';
import type { KeywordTag, SeoBriefDataV3, TopicCluster } from './seo.types';

/**
 * Types de contenu éditorial supportés
 */
export type ContentType =
  | 'guide'
  | 'comparatif'
  | 'liste'
  | 'tutoriel'
  | 'étude-de-cas'
  | 'interview'
  | 'analyse-tendance';

/**
 * Mode de sélection du cluster (pillar vs satellite)
 */
export type ClusterSelectionMode = 'pillar' | 'satellite';

/**
 * Profil persona (réutilisé depuis BusinessContextDTO)
 * Re-déclaré ici pour typage fort dans le domaine
 */
export interface PersonaProfile {
  category: string;
  archetype: string;
  emoji?: string;
  profile: {
    demographics: string;
    psychographics: string;
    techSavviness: string; // "Débutant" | "Intermédiaire" | "Avancé"
  };
  painPoints: string[];
  motivations: string[];
  messagingAngle: string;
}

/**
 * Contexte business pour l'angle selection
 * (Re-déclaré depuis BusinessContextDTO pour typage domaine)
 */
export interface BusinessContext {
  industry: string;
  siteType?: string;
  targetAudience: string;
  businessDescription?: string;
  contentType?: string;
  personas?: PersonaProfile[];
}

/**
 * Brief éditorial existant (simplifié pour anti-doublons)
 */
export interface ExistingBrief {
  id: string;
  angle: string;
  createdAt: string;
}

/**
 * Commande applicative pour la sélection d'angle éditorial
 * Utilise exclusivement des types/VO de domaine
 */
export interface AngleSelectionCommand {
  tenantId: string;
  projectId: string;
  language: string;

  // Articles candidats (contexte actualités)
  articles: TopicCandidate[];

  // Analyse SEO avec clusters pillar/satellites
  seoBriefData: SeoBriefDataV3;

  // Contexte business et personas
  businessContext: BusinessContext;

  // Briefs existants (anti-doublons)
  // V3.1: EditorialBrief complets depuis getAllEditorialBriefs() (tous les briefs du projet)
  // Le mapper extrait {id, angle, createdAt} pour le prompt POML
  // TODO V4: Filtrer par TopicCluster une fois briefs d'existing articles liés aux clusters
  existingBriefs: EditorialBrief[];
}

/**
 * Cluster sémantique choisi (territoire SEO)
 * Type helper garantissant que pillarTag et satelliteTags sont définis (non-optionnels)
 * Réutilise TopicCluster de seo.types.ts sans duplication
 */
export type ChosenCluster = Required<TopicCluster>;

/**
 * Résultat applicatif de la sélection d'angle
 * Utilise exclusivement des types/VO de domaine
 */
export interface AngleSelectionResult {
  // Angle éditorial sélectionné (texte)
  selectedAngle: string;

  // Cluster sémantique choisi (territoire SEO)
  chosenCluster: ChosenCluster;

  // Format de contenu
  contentType: ContentType;

  // Persona principal ciblé (optionnel)
  targetPersona?: PersonaProfile;

  // Mode de sélection du cluster
  selectionMode: ClusterSelectionMode;
}

/**
 * Angle candidat généré par l'IA (intermédiaire)
 */
export interface CandidateAngle {
  angle: string;
  cluster: ChosenCluster;
  contentType: ContentType;
  targetPersona?: PersonaProfile;
  selectionMode: ClusterSelectionMode;
  reasoning?: string; // Justification de l'IA (pour debug)
}
