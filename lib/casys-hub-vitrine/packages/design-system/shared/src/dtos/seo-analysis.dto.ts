// DTOs transverses pour l'analyse SEO
// Exposés via @casys/shared

import type { KeywordPlanDTO } from './keyword-plan.dto';
import type {
  CompetitiveAnalysisDTO,
  ContentGapDTO,
  ContentStrategyDTO,
  SeoBriefDataDTO,
} from './seo-strategy.dto';

/**
 * Commande d'entrée du Use Case d'analyse SEO.
 *
 * Lit depuis ProjectConfig:
 * - keywords (generation.keywords)
 * - description (description)
 * - excludeCategories (generation.topicSelector.excludeCategories)
 * - trendPriority (generation.topicSelector.trendPriority)
 *
 * Utilisation:
 * - application: entrée de `SeoAnalysisUseCase.execute(input)` dans `packages/application/src/usecases/seo-analysis.usecase.ts`
 * - application: mappée vers `SeoAnalysisPromptDTO` par `mapCommandToSeoPromptDTO()` dans `packages/application/src/mappers/seo-analysis.mapper.ts`
 */
export interface SeoAnalysisCommandDTO {
  // Contexte projet (requis pour charger la config complète)
  tenantId: string;
  projectId: string;

  // Langue cible (optionnelle) - par défaut, on utilise project.language depuis ProjectConfig
  language?: string;

  // Override optionnel des keywords de la config projet (pour analyse spécifique)
  keywords?: string[];
}

/**
 * Résultat v3 complet de l'analyse SEO (objets métier).
 * - keywordPlan: tags enrichis (source de vérité pour les keywords)
 * - seoBriefData: objets métier v3 (SearchIntent, ContentStrategy, CompetitiveAnalysis)
 * - competitors, trends, scores, metadata: inchangés
 *
 * C'est le DTO principal (v3). Pour la v2 legacy, voir SeoAnalysisResultLegacyDTO.
 */
export interface SeoAnalysisResultDTO {
  // Identifiants
  id: string;
  language: string;
  createdAt: string;

  // Plan de mots-clés enrichi (source de vérité unique)
  keywordPlan: KeywordPlanDTO;

  // Résumé SEO structuré v3 (objets métier)
  seoBriefData: SeoBriefDataDTO;

  // Analyse concurrentielle
  competitors: CompetitorDataDTO[];

  // Données de tendances
  trends: TrendDataDTO[];

  // Scores et métriques
  competitionScore?: number;
  trendScore?: number;

  // Saisonnalité (optionnel)
  seasonality?: SeasonalityDataDTO;

  // Type de contenu ciblé (optionnel)
  contentType?: string;

  // Métadonnées
  analysisDate: string;
  dataSource: string;
}

/**
 * Sortie v3 attendue de l'agent SEO (objets métier).
 * Utilisée par SeoAnalysisUseCase pour construire SeoBriefDataV3 proprement.
 */
export interface SeoAnalysisAgentOutputDTO {
  keywordPlan: KeywordPlanDTO;
  searchIntent: SearchIntentDataDTO;
  contentStrategy?: ContentStrategyDTO;
  competitiveAnalysis?: CompetitiveAnalysisDTO;
}

/**
 * Base commune pour les requêtes et prompts SEO.
 * Contient les données métier essentielles.
 */
export interface SeoAnalysisBaseDTO {
  keywords: string[];
  language: string;
  industry: string;
  businessDescription: string;
  contentType?: string;
}

/**
 * Contexte projet/business utilisé pour contextualiser le ton et la cible.
 * Réutilisé dans les prompts SEO, Outline, Section, etc.
 */
export interface ProjectContextDTO {
  industry?: string;
  targetAudience?: string;
  contentType?: string;
  businessDescription?: string;
}

/**
 * Requête métier pour l'analyse SEO.
 * Structure imbriquée (métier) qui sera dénormalisée par le mapper vers PromptDTO.
 */
export interface SeoAnalysisQueryDTO {
  keywords: string[];
  language?: string;
  region?: string;
  projectContext?: ProjectContextDTO;
}

/**
 * Paramètres injectés dans le template POML de l'analyseur SEO.
 * Base + enrichissements IA + configuration de génération.
 * Utilisation:
 * - application: produit par `mapCommandToSeoPromptDTO()` (`packages/application/src/mappers/seo-analysis.mapper.ts`)
 * - application: consommé par `buildSeoAnalysisPoml()` (`packages/application/src/agents/prompts/seo-analysis.prompt.ts`)
 */
export interface SeoAnalysisPromptDTO extends SeoAnalysisBaseDTO {
  // Contexte projet optionnel
  projectName?: string;

  // Paramètres migrés du TopicSelector + config IA
  trendPriority: number; // 0..1
  excludeCategories: string[];
  maxKeywords: number; // Utilisé dans le template POML ligne 39
}

/**
 * Données concurrentielles simplifiées pour le DTO.
 */
export interface CompetitorDataDTO {
  title: string;
  description?: string;
  keywords?: string[];
  url?: string;
}

/**
 * Données de tendances simplifiées pour le DTO.
 */
export interface TrendDataDTO {
  keyword: string;
  trend: 'rising' | 'stable' | 'declining';
  relatedQueries?: string[];
  searchVolume?: number;
}

/**
 * Recommendations de contenu blog-oriented (SEO Analysis v2)
 */
export interface ContentRecommendationsDTO {
  articleTypes: string[]; // Types: guide, liste, comparatif, tutoriel, étude-de-cas, interview, analyse-tendance
  contentAngles: string[]; // Angles actionnables pour articles blog avec structure narrative
}

/**
 * Données d'intention de recherche pour le DTO.
 */
export interface SearchIntentDataDTO {
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  confidence: number; // 0..1
  supportingQueries?: string[]; // Questions PAA (People Also Ask)

  // Blog strategy v2: structured format
  contentRecommendations?: string[] | ContentRecommendationsDTO; // Support both old array and new structured format
  contentGaps?: ContentGapDTO[]; // MIGRATED: was string[] (legacy), now ContentGapDTO[] (structured)
  seoRecommendations?: string[]; // Deprecated: use KeywordPlanDTO.recommendations.seo instead
}

/**
 * Données de saisonnalité pour le DTO.
 */
export interface SeasonalityDataDTO {
  keyword: string;
  peakMonths: number[];
  lowMonths: number[];
  yearOverYearTrend: 'rising' | 'declining' | 'stable';
}

/**
 * Sortie structurée alignée sur l'entité SeoStrategy (v2 architecture - flat).
 *
 * ⚠️ LEGACY: Cette structure est v2 (flat). Pour la v3 avec objets métier séparés,
 * voir SeoAnalysisResultDTO (v3) ci-dessous.
 *
 * Plus de doublons - KeywordPlanDTO est la source de vérité.
 */
export interface SeoAnalysisResultLegacyDTO {
  // Identifiants
  id: string;
  language: string;
  createdAt: string;

  // Plan de mots-clés enrichi (source de vérité unique)
  keywordPlan: KeywordPlanDTO;

  // Analyse concurrentielle
  competitors: CompetitorDataDTO[];

  // Données de tendances
  trends: TrendDataDTO[];

  // Intention de recherche
  searchIntent: SearchIntentDataDTO;

  // Scores et métriques
  competitionScore?: number; // 0..1 (0 = facile)
  trendScore?: number; // 0..1 (0 = declining, 1 = rising)

  // Saisonnalité (optionnel, aligné sur SeoStrategy)
  seasonality?: SeasonalityDataDTO;

  // Type de contenu ciblé (optionnel)
  contentType?: string;

  // Métadonnées
  analysisDate: string;
  dataSource: string;
}
