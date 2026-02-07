// Aligné sur TagSource du core (@casys/core)
export type TagSourceDTO =
  | 'seed'
  | 'opportunity'
  | 'trend'
  | 'ai'
  | 'related_keywords'
  | 'serp_discovered'
  | 'ai_plus_dataforseo'
  | 'article'
  | 'editorial'
  | 'pillar' // Keyword pilier d'un TopicCluster
  | 'satellite'; // Keyword satellite d'un TopicCluster

export interface ComputeKeywordPlanCommandDTO {
  baseKeywords: string[];
  trendKeywords?: string[];
  competitorKeywords?: string[];
  maxGenerate?: number;
}

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

export interface KeywordTagDTO {
  label: string;
  slug: string;
  source?: TagSourceDTO; // Source principale/actuelle (attribué en cours de route)
  sources?: TagSourceDTO[]; // Historique de toutes les sources ayant contribué
  weight?: number; // 0..1

  // Timestamps pour traçabilité
  createdAt?: string; // ISO 8601 date de création
  updatedAt?: string; // ISO 8601 date de dernière mise à jour

  // Blog strategy (SEO Analysis v2)
  priority?: number; // 1-10, basé sur scoring blog-aware (intent, content-fit, cluster cohesion)
  opportunityScore?: number; // 1-10, estimation qualitative (intent-fit + blogabilité + différenciation + niche)
  clusterType?: 'pillar' | 'cluster'; // pillar = article central, cluster = satellite

  // Métriques SEO réelles (DataForSEO)
  searchVolume?: number; // Volume de recherche mensuel
  difficulty?: number; // Difficulté SEO (0-100, competition_index)
  cpc?: number; // Coût par clic moyen
  competition?: 'low' | 'medium' | 'high'; // Niveau de compétition
  lowTopOfPageBid?: number; // CPC min pour top page
  highTopOfPageBid?: number; // CPC max pour top page
  monthlySearches?: {
    // Tendances saisonnières (12 derniers mois)
    year: number;
    month: number;
    searchVolume: number;
  }[];

  // 🆕 AI-enhanced discovery (KeywordDiscoveryAgent)
  aiEnrichment?: KeywordAIEnrichment;
}

export interface KeywordPlanDTO {
  tags: KeywordTagDTO[];
  // KeywordPlan is just a container for tags from seed enrichment
  // SEO insights (topicClusters, recommendations, contentGaps) belong to SeoBriefData
}
