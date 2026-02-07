import type { EditorialBrief } from '../../aggregates/editorial-brief.aggregate';
import type { KeywordTag } from '../../types/seo.types';
import type { SeoBriefDataV3 } from '../../types/seo.types';
import type {
  BusinessContext,
  ChosenCluster,
  ClusterSelectionMode,
  ContentType,
  PersonaProfile,
} from '../../types/angle-selection.types';

/**
 * Article source enrichi (avec summary du ContentQualificationAgent)
 */
export interface SourceArticleInput {
  title: string;
  sourceUrl: string;
  content: string;
  summary: string; // Résumé généré par ContentQualificationAgent
}

/**
 * Topic sélectionné (minimal pour l'agent)
 */
export interface TopicInput {
  id: string;
  title: string;
  sourceUrl?: string;
  createdAt?: string;
  language?: string;
}

/**
 * Input pour CreateEditorialBriefUseCase (Port IN)
 *
 * Deux modes d'utilisation:
 * 1. Génération complète (nouveaux articles):
 *    - Fournir tous les champs optionnels agent
 *    - Le use case appelle EditorialBriefAgent
 *    - Retourne EditorialBrief avec enrichedData
 *
 * 2. Reverse engineering (analyse article existant):
 *    - Fournir seulement les champs de base
 *    - Pas d'appel agent
 *    - Retourne EditorialBrief sans enrichedData
 */
export interface CreateEditorialBriefInput {
  // Champs de base (toujours requis)
  tenantId: string;
  projectId: string;
  language: string;
  angle: string;
  businessContext: BusinessContext;
  corpusTopicIds: string[];

  // Champs optionnels pour génération complète via EditorialBriefAgent
  // Si présents, le use case génère enrichedData
  chosenCluster?: ChosenCluster;
  contentType?: ContentType;
  targetPersona?: PersonaProfile;
  selectionMode?: ClusterSelectionMode;
  seoBriefData?: SeoBriefDataV3;
  selectedTopics?: TopicInput[];
  sourceArticles?: SourceArticleInput[];
}

/**
 * Port IN pour la création d'EditorialBrief
 *
 * Définit le contrat public du use case.
 * Implémenté par CreateEditorialBriefUseCase dans @casys/application.
 */
export interface CreateEditorialBriefPort {
  /**
   * Crée un EditorialBrief
   *
   * Si les champs optionnels agent sont fournis:
   * - Appelle EditorialBriefAgent pour générer enrichedData
   * - Retourne EditorialBrief avec enrichedData complet
   *
   * Sinon (reverse engineering):
   * - Retourne EditorialBrief sans enrichedData
   */
  execute(input: CreateEditorialBriefInput): Promise<EditorialBrief>;
}
