// DTOs transverses pour la sélection de sujet (Topic Selector)
// Exposés via @casys/shared
import type { EditorialBriefDTO } from './editorial-brief.dto';
import type { KeywordTagDTO } from './keyword-plan.dto';
import type { SeoBriefDataDTO } from './seo-strategy.dto';

/**
 * Article candidat transmis au sélecteur de sujets (IA).
 *
 * Utilisation:
 * - application: propriété `articles` de `SelectTopicCommandDTO` consommée par `SelectTopicUseCase.execute()` dans `packages/application/src/usecases/select-topic.usecase.ts`
 * - application: produit par `mapTopicCandidatesToInputDTOs()` dans `packages/application/src/mappers/topic-selector.mapper.ts`
 */
export interface TopicArticleInputDTO {
  id: string;
  title: string;
  description?: string;
  sourceUrl: string;
  sourceTitle?: string;
  publishedAt?: string; // ISO 8601
  relevanceScore?: number; // 0..1
  categories?: string[];
}

/**
 * Commande d'entrée du Use Case de sélection de sujet.
 *
 * Reçoit désormais les données enrichies du SEO Analysis au lieu de lire directement la config.
 * Les keywords, trendPriority, excludeCategories viennent maintenant du SeoAnalysisResultDTO.
 *
 * Utilisation:
 * - application: entrée de `SelectTopicUseCase.execute(input)` dans `packages/application/src/usecases/select-topic.usecase.ts`
 * - application: mappée vers `TopicSelectorPromptDTO` par `mapCommandToTopicSelectorPromptDTO()` dans `packages/application/src/mappers/topic-selector.mapper.ts`
 */
export interface SelectTopicCommandDTO {
  // Contexte projet (pour le template POML uniquement)
  tenantId: string;
  projectId: string;

  // Langue cible (requise, vient du SEO Analysis)
  language: string;

  // Articles candidats à analyser
  articles: TopicArticleInputDTO[];

  // Paramètres de sélection
  // maxTopics n'est plus fourni par l'appelant: il provient désormais exclusivement de ProjectConfig

  // Analyse SEO complète générée par SeoAnalysisAgent (optionnel)
  // ⚠️ V3 MIGRATION: Utilise SeoBriefDataDTO (objets métier: SearchIntent, ContentStrategy, CompetitiveAnalysis)
  // Pour backward compatibility, les prompts acceptent encore la v2 flat via fallbacks
  seoBriefData?: SeoBriefDataDTO;
}

/**
 * Paramètres injectés dans le template POML du sélecteur (v2 refactoré).
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL:
 * - angle et chosenCluster sont maintenant FOURNIS en input (déjà sélectionnés par AngleSelectionWorkflow)
 * - Le TopicSelector se concentre uniquement sur le filtrage de topics pertinents
 *
 * Utilisation:
 * - application: produit par `mapCommandToTopicSelectorPromptDTO()` (`packages/application/src/mappers/topic-selector.mapper.ts`)
 * - application: consommé par `buildTopicSelectorPoml()` (`packages/application/src/agents/prompts/topic-selector.prompt.ts`)
 */
export interface TopicSelectorPromptDTO {
  maxTopics: number;

  // ✨ FOURNIS par AngleSelectionWorkflow (plus générés par TopicSelector)
  angle: string; // Angle éditorial déjà sélectionné
  chosenCluster: any; // Cluster sémantique déjà choisi (pillarTag + satelliteTags)

  tagLabels: string[]; // Labels des tags à prioriser (utilisé par le mapper)
  tagLabelsItems?: string; // Fragments <item> générés par le builder pour le template

  // JSON compact (stringifié) des articles candidats après normalisation
  articlesJson: string;

  // Analyse SEO complète (optionnel) - Passé directement sans stringify
  // ⚠️ V3 MIGRATION: Utilise SeoBriefDataDTO (objets métier)
  seoBriefData?: SeoBriefDataDTO;

  // ✨ Graph RAG : EditorialBriefs existants (détection doublons stratégiques)
  existingBriefsJson?: string; // JSON stringifié des briefs similaires
  existingBriefsCount?: number; // Nombre de briefs existants
}

/**
 * Sortie structurée renvoyée par l'application après appel IA.
 *
 * Utilisation:
 * - application: type de retour de `SelectTopicUseCase.execute()` (`packages/application/src/usecases/select-topic.usecase.ts`)
 * - application: converti en entité de domaine `Topic` via `mapSelectedTopicDTOToDomain()` (`packages/application/src/mappers/topic-selector.mapper.ts`)
 */
export interface SelectedTopicDTO {
  id: string;
  title: string;
  sourceUrl?: string;
  createdAt: string; // ISO 8601
  language?: string;
}

/**
 * Résultat structuré du Topic Selector
 * 
 * ⚠️ V3 MIGRATION: seoSummary utilise SeoBriefDataDTO (objets métier).
 * Les mappers aplatissent v3 → v2 flat pour les prompts POML.
 */
export interface SelectTopicResultDTO {
  topics: SelectedTopicDTO[];
  angle: string;
  seoSummary: SeoBriefDataDTO; // V3: objets métier (SearchIntent, ContentStrategy, CompetitiveAnalysis)
  editorialBrief?: EditorialBriefDTO;
  selectedTags: KeywordTagDTO[]; // Shortlist des tags sélectionnés pour cet article
}
