/**
 * DTOs pour les métriques de domaine (Step 1 - Overview)
 * Données provenant de DataForSEO domain analysis
 */

/**
 * Keyword avec métriques DataForSEO
 */
export interface TopKeywordDTO {
  keyword: string;
  position?: number;        // Position du site sur ce keyword (1-100)
  searchVolume?: number;    // Volume de recherche mensuel
}

/**
 * Distribution de positions SERP (top 100)
 */
export interface PositionDistributionDTO {
  pos_1: number;
  pos_2_3: number;
  pos_4_10: number;
  pos_11_20: number;
  pos_21_30: number;
  pos_31_40: number;
  pos_41_50: number;
  pos_51_60: number;
  pos_61_70: number;
  pos_71_80: number;
  pos_81_90: number;
  pos_91_100: number;
}

/**
 * Tendances des keywords au fil du temps
 */
export interface KeywordTrendsDTO {
  isNew: number;   // Nouveaux keywords apparus
  isUp: number;    // Keywords en progression
  isDown: number;  // Keywords en baisse
  isLost: number;  // Keywords perdus (hors top 100)
}

/**
 * Métriques de trafic et valeur
 */
export interface TrafficMetricsDTO {
  estimatedTrafficValue: number;      // Valeur estimée du trafic ($)
  estimatedPaidTrafficCost: number;   // Coût si trafic payant ($)
  totalKeywordsCount: number;         // Total keywords rankés
}

/**
 * Métriques de domaine (DataForSEO)
 * Affichées dans la card "Domain Metrics" du dashboard
 */
export interface DomainMetricsDTO {
  // Métriques principales
  domainRank?: number;         // Domain Rating (0-100) - NOTE: DataForSEO Domain Rank Overview API ne fournit PAS ce champ
  organicTraffic?: number;     // Trafic organique estimé
  keywordsCount?: number;      // Nombre total de keywords rankés
  domainValue?: string;        // Valeur estimée du domaine (format: "$X")

  // Backlinks
  backlinksCount?: number;     // Nombre total de backlinks
  referringDomains?: number;   // Nombre de domaines référents

  // Geographic
  topCountries?: string[];     // ex: ["US", "FR", "UK"]

  // Top keywords rankés
  topKeywords?: TopKeywordDTO[];

  // Optional - autres métriques
  topPages?: number;           // Nombre de pages top performers
  competitorDomains?: number;  // Nombre de concurrents identifiés

  // Nouvelles métriques - Position Insights (DataForSEO Domain Rank Overview)
  positionDistribution?: PositionDistributionDTO;  // Distribution positions SERP
  keywordTrends?: KeywordTrendsDTO;                // Tendances keywords
  trafficMetrics?: TrafficMetricsDTO;              // Métriques trafic et valeur
}
