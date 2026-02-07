/**
 * DTOs pour l'enrichissement de mots-clés via DataForSEO
 * Frontière applicative entre Infrastructure et Application
 */

/**
 * Métriques SEO réelles pour un mot-clé (DataForSEO Keywords Data API)
 */
export interface KeywordMetricsDTO {
  keyword: string;
  searchVolume: number;          // Volume de recherche mensuel
  difficulty: number;             // Difficulté SEO (0-100, competition_index)
  cpc?: number;                  // Coût par clic moyen (optionnel)
  competition?: 'low' | 'medium' | 'high'; // Niveau de compétition
  relatedKeywords?: string[];    // Suggestions de mots-clés similaires
  // Fourchette CPC
  lowTopOfPageBid?: number;      // CPC min pour top page
  highTopOfPageBid?: number;     // CPC max pour top page
  // Tendances saisonnières (12 derniers mois)
  monthlySearches?: {
    year: number;
    month: number;
    searchVolume: number;
  }[];
}

/**
 * Analyse SERP enrichie avec questions et recherches associées
 */
export interface SerpAnalysisDTO {
  keyword: string;
  
  // Questions "People Also Ask" extraites du SERP
  peopleAlsoAsk: string[];
  
  // Recherches associées ("Related Searches")
  relatedSearches: string[];
  
  // Top résultats (concurrents)
  topResults: {
    position: number;
    title: string;
    url: string;
    description?: string;
  }[];
  
  // Featured snippet si présent
  featuredSnippet?: {
    title: string;
    snippet: string;
    url: string;
  };
}

/**
 * Analyse de domaine concurrent (DataForSEO Domain Analytics API)
 */
export interface DomainAnalysisDTO {
  domain: string;
  domainRank?: number;           // Rang du domaine (0-100)
  organicTraffic?: number;       // Trafic organique estimé mensuel (etv)
  keywordsCount?: number;        // Nombre de mots-clés positionnés (count)
  domainValue?: number;          // Valeur estimée du domaine en $ (estimated_paid_traffic_cost)
  topKeywords?: {
    keyword: string;
    position: number;
    searchVolume?: number;
  }[];
  backlinksCount?: number;       // Nombre de backlinks (DEPRECATED - requires paid subscription)
  referringDomains?: number;     // Nombre de domaines référents (DEPRECATED - requires paid subscription)
  // Détections auto pour piloter les autres étapes du lead flow
  detectedLocation?: string;       // ex: "France"
  detectedLanguage?: string;       // ex: "French"
  detectedCountryCode?: string;    // ex: "FR"
  detectedLanguageCode?: string;   // ex: "fr"
}
