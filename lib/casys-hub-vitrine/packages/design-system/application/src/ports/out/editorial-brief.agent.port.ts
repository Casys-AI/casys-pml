import type {
  BlogRecommendations,
  BusinessContext,
  ChosenCluster,
  ClusterSelectionMode,
  ContentGap,
  ContentType,
  EditorialBriefData,
  KeywordTag,
  PersonaProfile,
  SeoBriefDataV3,
  Topic,
} from '@casys/core';

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
 * Input pour l'EditorialBriefAgent
 * Synthétise tous les éléments de décision pour briefer l'OutlineWriter
 *
 * ⚠️ IMPORTANT : Cet agent est UNIQUEMENT pour les NOUVEAUX articles (génération complète)
 *
 * Flow nouveaux articles :
 * SEO Analysis → SeoBrief (niveau projet) → AngleSelection → TopicSelector → EditorialBriefAgent → OutlineWriter
 *
 * Pour les ARTICLES EXISTANTS, utiliser EditorialAngleAgent à la place :
 * Article existant → EditorialAngleAgent → CreateEditorialBrief (sans seoSummary) → Liaison KeywordPlans
 *
 * Raison : SeoBrief est une analyse complète au niveau PROJET (plusieurs clusters, coûteux en API),
 * pas au niveau article individuel.
 */
export interface EditorialBriefAgentParams {
  // Décision éditoriale (de AngleSelectionWorkflow)
  angle: string;
  chosenCluster: ChosenCluster;
  contentType: ContentType;
  targetPersona?: PersonaProfile;
  selectionMode: ClusterSelectionMode;

  // Stratégie SEO projet (complète) - REQUIS pour nouveaux articles
  seoBriefData: SeoBriefDataV3;

  // Contexte business
  businessContext: BusinessContext;

  // Corpus sélectionné (de TopicSelectorWorkflow)
  selectedTopics: Topic[];
  sourceArticles: SourceArticleInput[];

  // Langue
  language: string;
}

/**
 * Port pour l'agent de génération de brief éditorial
 * Génère un brief optimisé à partir de l'angle + SEO + corpus
 *
 * EditorialBriefData est maintenant importé depuis @casys/core (type domain)
 */
export interface EditorialBriefAgentPort {
  generateBrief(params: EditorialBriefAgentParams): Promise<EditorialBriefData>;
}
