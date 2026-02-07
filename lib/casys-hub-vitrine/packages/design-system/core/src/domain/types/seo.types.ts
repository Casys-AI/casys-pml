import type { ContentGap } from '../value-objects/content-gap.value';

export type TagSource =
  | 'seed' // Keyword seed du projet (config)
  | 'opportunity' // Opportunité SEO détectée
  | 'trend' // Tendance émergente
  | 'ai' // Généré par IA
  | 'related_keywords' // Keywords liés (DataForSEO)
  | 'serp_discovered' // Découvert via SERP
  | 'ai_plus_dataforseo' // Combinaison IA + DataForSEO
  | 'article' // Extrait du frontmatter d'article
  | 'editorial' // Généré par l'analyse éditoriale
  | 'pillar' // Keyword pilier d'un TopicCluster
  | 'satellite'; // Keyword satellite d'un TopicCluster

export interface KeywordTag {
  label: string;
  slug?: string;
  source?: TagSource; // Source principale/actuelle
  sources?: TagSource[]; // Historique de toutes les sources ayant contribué
  weight?: number; // 0..1
  // Timestamps pour traçabilité
  createdAt?: string; // ISO 8601 date de création
  updatedAt?: string; // ISO 8601 date de dernière mise à jour
  // Blog strategy (SEO Analysis v2)
  priority?: number; // 1-10, scoring blog-aware (intent + content-fit + cluster cohesion)
  clusterType?: 'pillar' | 'cluster'; // pillar = article central, cluster = satellite
  // Métriques SEO réelles (DataForSEO)
  searchVolume?: number;
  difficulty?: number; // 0..100 (competition_index)
  cpc?: number; // Cost per click moyen (USD)
  competition?: 'low' | 'medium' | 'high';
  // Fourchette CPC
  lowTopOfPageBid?: number; // CPC min pour top page
  highTopOfPageBid?: number; // CPC max pour top page
  // Tendances saisonnières (12 derniers mois)
  monthlySearches?: {
    year: number;
    month: number;
    searchVolume: number;
  }[];
  // 🆕 AI-enhanced discovery (KeywordDiscoveryAgent)
  aiEnrichment?: KeywordAIEnrichment;
}

/**
 * Résultat de recherche sémantique de tags (RAG Vector)
 * Étend KeywordTag avec des métriques de pertinence et popularité
 */
export interface KeywordTagSearchResult {
  label: string;
  slug: string;
  source: TagSource;
  weight?: number; // Poids optionnel (0-1)
  score: number; // Similarité sémantique (0-1)
  usageCount: number; // Nombre d'articles utilisant ce tag (popularité)
}

export interface TopicCluster {
  pillarTag?: KeywordTag; // Tag pilier avec metrics (searchVolume, difficulty, etc.)
  satelliteTags?: KeywordTag[]; // Tags satellites avec metrics
}

export interface BlogRecommendations {
  seo?: string[]; // SEO technique: meta, schema, internal linking, topical authority
  editorial?: string[]; // Éditorial: ton, exemples concrets, visuels, CTA, structure narrative
  technical?: string[]; // Technique: longueur cible, H2/H3 structure, markdown tables/lists
}

// ContentGap moved to value-objects/content-gap.value.ts (enriched with blog strategy v2)

export interface KeywordPlan {
  tags: KeywordTag[];
  // KeywordPlan is just a container for tags from seed enrichment
  // SEO insights (topicClusters, recommendations, contentGaps) belong to SeoBriefData
}

export type SearchIntentKind = 'informational' | 'commercial' | 'navigational' | 'transactional';

// ============================================================================
// AI ENRICHMENT TYPES (for KeywordDiscoveryAgent)
// ============================================================================

/**
 * Catégorie sémantique du keyword
 */
export interface KeywordCategory {
  type: 'service' | 'feature' | 'benefit' | 'audience' | 'topic' | 'product';
}

/**
 * Description textuelle du keyword
 */
export interface KeywordDescription {
  text: string; // Description courte (max 1 phrase)
}

/**
 * Intent utilisateur pour ce keyword
 */
export interface KeywordIntent {
  type: 'informational' | 'transactional' | 'navigational';
}

/**
 * Keyword lié découvert par scraping AI
 */
export interface AIScrappingRelatedKeyword {
  slug: string; // Slug du keyword lié
  label?: string; // Label humain (optionnel)
  relationStrength?: number; // Force de la relation 0-1 (optionnel)
}

/**
 * Enrichissement AI des keywords découverts
 * Généré par KeywordDiscoveryAgent via analyse LLM du contenu scrapé
 */
export interface KeywordAIEnrichment {
  category?: KeywordCategory;
  description?: KeywordDescription;
  intent?: KeywordIntent;
  relatedKeywords?: AIScrappingRelatedKeyword[];
}

// ============================================================================
// OBJETS MÉTIER SÉPARÉS (v3 Architecture)
// ============================================================================

/**
 * ContentRecommendations: WHAT to write
 * Format et angles narratifs pour le contenu
 */
export interface ContentRecommendations {
  articleTypes: string[]; // Types: guide, liste, comparatif, tutoriel, étude-de-cas, interview, analyse-tendance
  contentAngles: string[]; // Angles actionnables pour articles blog avec structure narrative
}

/**
 * SearchIntent: Intention de recherche pure
 * Décrit l'intention utilisateur et le type de contenu attendu
 */
export interface SearchIntent {
  intent: SearchIntentKind;
  confidence: number; // 0..1
  supportingQueries?: string[]; // Questions PAA (People Also Ask)
  contentRecommendations?: string[] | ContentRecommendations; // WHAT to write: articleTypes + contentAngles
}

/**
 * ContentStrategy: Stratégie éditoriale
 * Organisation et approche d'écriture
 */
export interface ContentStrategy {
  topicClusters?: TopicCluster[]; // Structure piliers → satellites
  recommendations?: BlogRecommendations; // HOW to write: seo/editorial/technical
}

/**
 * CompetitiveAnalysis: Analyse concurrentielle
 * Opportunités et landscape SERP
 */
export interface CompetitiveAnalysis {
  contentGaps?: ContentGap[]; // Opportunités détectées dans la SERP
  competitorTitles?: string[]; // Titres des concurrents majeurs
}

// ============================================================================
// LEGACY TYPE (v2 - backward compatibility)
// ============================================================================

/**
 * @deprecated Use SearchIntent instead
 * Kept for backward compatibility with existing code
 */
export interface SearchIntentData {
  intent: SearchIntentKind;
  confidence: number; // 0..1
  supportingQueries?: string[];
  contentRecommendations?: string[] | ContentRecommendations;
  contentGaps?: ContentGap[];
  seoRecommendations?: string[]; // DEPRECATED: use recommendations.seo instead
  topicClusters?: TopicCluster[];
  recommendations?: BlogRecommendations;
}

export interface CompetitorData {
  title?: string;
  description?: string;
  url?: string;
  keywords?: string[];
}

export interface TrendData {
  keyword: string;
  trend?: string; // 'rising' | 'stable' | 'falling' | ...
  searchVolume?: number;
  relatedQueries?: string[];
}

export interface ProjectContext {
  contentType?: string;
}

// Coeur minimal de la stratégie SEO (nécessaire partout)
export interface SeoStrategyCore {
  keywordPlan: KeywordPlan;
  searchIntent: SearchIntentData;
}

// Contexte concurrentiel optionnel
export interface SeoCompetitiveContext {
  competitors: CompetitorData[];
  competitionScore?: number;
}

// Contexte tendances optionnel
export interface SeoTrendContext {
  trends: TrendData[];
  trendScore?: number;
}

// Métadonnées optionnelles
export interface SeoMeta {
  id?: string;
  language?: string;
  createdAt?: string;
}

// Alias rétro-compatible et plus expressif (composition des contextes)
export type SeoStrategy = SeoStrategyCore &
  Partial<SeoCompetitiveContext> &
  Partial<SeoTrendContext> &
  Partial<SeoMeta> &
  ProjectContext;

// ============================================================================
// SEOBRIEF DATA (v2 Legacy - en cours de migration vers v3)
// ============================================================================

/**
 * Projection éditoriale dérivée du VO SeoBrief (format legacy v2)
 *
 * ⚠️ EN MIGRATION PROGRESSIVE vers SeoBriefDataV3
 * Utilisé par le code existant, sera progressivement remplacé
 */
export interface SeoBriefData {
  keywordTags: KeywordTag[];
  userQuestions: string[];
  contentGaps: ContentGap[];
  searchIntent: SearchIntentKind;
  searchConfidence: number;
  topicClusters?: TopicCluster[];
  recommendations: BlogRecommendations; // ✅ Seul champ pour recommendations (HOW to write)
  competitorTitles?: string[];

  // Legacy fields - deprecated, kept for backward compatibility only
  /** @deprecated Use recommendations.seo instead. Will be removed in v4. */
  seoRecommendations?: string[];
  /** @deprecated Misnamed field. Use recommendations instead. Will be removed in v4. */
  contentRecommendations?: string[] | BlogRecommendations;
}

/**
 * Nouvelle architecture v3: Composition des 3 objets métier
 * À utiliser dans les nouveaux usecases / code migré
 *
 * Structure:
 * - keywordTags: Base de keywords enrichis (tags, pas strings!)
 * - searchIntent: Intention utilisateur + type de contenu (WHAT)
 * - contentStrategy: Organisation éditoriale + approche (HOW)
 * - competitiveAnalysis: Opportunités SERP
 */
export interface SeoBriefDataV3 {
  keywordTags: KeywordTag[];
  searchIntent: SearchIntent;
  contentStrategy: ContentStrategy;
  competitiveAnalysis: CompetitiveAnalysis;
}

/**
 * Helper: convertit SeoBriefDataV3 vers legacy SeoBriefData
 */
export function toV2SeoBriefData(v3: SeoBriefDataV3): SeoBriefData {
  // Dans v2, contentRecommendations était BlogRecommendations (HOW to write)
  // Dans v3, SearchIntent.contentRecommendations = ContentRecommendations (WHAT to write)
  // On préfère utiliser ContentStrategy.recommendations (BlogRecommendations) pour v2

  return {
    keywordTags: v3.keywordTags,
    userQuestions: v3.searchIntent.supportingQueries ?? [],
    contentGaps: v3.competitiveAnalysis.contentGaps ?? [],
    searchIntent: v3.searchIntent.intent,
    searchConfidence: v3.searchIntent.confidence,
    topicClusters: v3.contentStrategy.topicClusters,
    recommendations: v3.contentStrategy.recommendations ?? {
      seo: [],
      editorial: [],
      technical: [],
    },
    competitorTitles: v3.competitiveAnalysis.competitorTitles,
  };
}

/**
 * Helper: convertit legacy SeoBriefData vers SeoBriefDataV3
 */
export function toV3SeoBriefData(v2: SeoBriefData): SeoBriefDataV3 {
  // Dans v2, contentRecommendations était BlogRecommendations (HOW to write)
  // Dans v3, on sépare: SearchIntent = WHAT to write, ContentStrategy = HOW to write
  // Conversion intelligente: v2.contentRecommendations → v3.contentStrategy.recommendations

  return {
    keywordTags: v2.keywordTags,
    searchIntent: {
      intent: v2.searchIntent,
      confidence: v2.searchConfidence,
      supportingQueries: v2.userQuestions,
      // v3 SearchIntent.contentRecommendations = ContentRecommendations (WHAT to write)
      // v2.contentRecommendations était BlogRecommendations (HOW), donc on ne le met pas ici
      contentRecommendations: undefined,
    },
    contentStrategy: {
      topicClusters: v2.topicClusters,
      // v2.recommendations est maintenant obligatoire, utiliser fallback si legacy data
      recommendations:
        v2.recommendations ??
        (typeof v2.contentRecommendations === 'object' && !Array.isArray(v2.contentRecommendations)
          ? (v2.contentRecommendations as any)
          : { seo: v2.seoRecommendations ?? [], editorial: [], technical: [] }),
    },
    competitiveAnalysis: {
      contentGaps: v2.contentGaps,
      competitorTitles: v2.competitorTitles,
    },
  };
}
