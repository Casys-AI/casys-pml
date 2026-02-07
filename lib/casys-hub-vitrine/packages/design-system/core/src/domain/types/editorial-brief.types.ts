import type { BlogRecommendations, KeywordTag } from './seo.types';
import type { ContentGap } from '../value-objects/content-gap.value';
import type { BusinessContext } from './angle-selection.types';

/**
 * Commande interne pour créer l'aggregate EditorialBrief.
 * Utilisé EN INTERNE par CreateEditorialBriefUseCase.
 *
 * V3 Architecture:
 * - Champs enrichis (keywordTags, relevantQuestions, etc.) sont optionnels
 * - Pour nouveaux articles: fournis par EditorialBriefAgent
 * - Pour reverse engineering: undefined
 *
 * Note: Le contrat public du use case est défini par CreateEditorialBriefPort (ports/in).
 */
export interface CreateEditorialBriefCommand {
  tenantId: string;
  projectId: string;
  language: string;
  angle: string;

  // V3: Champs enrichis (optionnels)
  keywordTags?: KeywordTag[];
  relevantQuestions?: string[];
  priorityGaps?: ContentGap[];
  guidingRecommendations?: BlogRecommendations;
  corpusSummary?: string;
  competitorAngles?: string[];

  // V3.1: Contraintes structurelles (optionnels)
  targetSectionsCount?: number;
  targetCharsArticle?: number; // Total article length (outline writer will calculate per-section)

  businessContext: BusinessContext;
  corpusTopicIds: string[];
}

/**
 * EditorialBriefData - Résultat enrichi de l'EditorialBriefAgent
 *
 * Brief optimisé pour guider l'OutlineWriter avec:
 * - Keywords filtrés et priorisés pour l'angle
 * - Questions PAA pertinentes au contentType
 * - Content gaps prioritaires à couvrir
 * - Recommendations adaptées au persona
 * - Synthèse du corpus
 * - Angles concurrents pour différenciation
 * - Contraintes structurelles (nombre de sections, longueur cible)
 *
 * Utilise exclusivement des types/VO de domaine (vs DTO dans shared).
 */
export interface EditorialBriefData {
  /** Keywords priorisés (cluster + secondaires pertinents) - Max 10 tags */
  keywordTags: KeywordTag[];

  /** Questions PAA filtrées pour l'angle - 3-5 questions alignées avec contentType + angle */
  relevantQuestions: string[];

  /** Content gaps prioritaires - Top 3 gaps à absolument couvrir */
  priorityGaps: ContentGap[];

  /** Recommendations adaptées au persona + contentType */
  guidingRecommendations: BlogRecommendations;

  /** Synthèse du corpus - 2-3 phrases résumant les articles sélectionnés */
  corpusSummary: string;

  /** Angles concurrents - Angles extraits des titres concurrents pour inspiration/différenciation */
  competitorAngles?: string[];

  /**
   * Nombre cible de sections pour l'outline
   * Généré par EditorialBriefAgent basé sur contentType, persona, angle
   * Range: 1-15 sections
   * Utilisation: Guide l'OutlineWriter pour structure cohérente
   */
  targetSectionsCount?: number;

  /**
   * Longueur cible totale de l'article (en caractères)
   * Adapté selon expertise persona et type de contenu
   * Range: 1500-45000 caractères (300-3000 par section × 5-15 sections)
   * Utilisation: OutlineWriter la divise par targetSectionsCount pour obtenir targetCharsPerSection par section
   */
  targetCharsArticle?: number;
}
