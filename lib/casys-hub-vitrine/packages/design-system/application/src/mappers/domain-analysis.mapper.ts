// Domain analysis mapper centralized in @casys/application (pure function)
// It converts raw provider metrics + detection into the DomainAnalysis-like shape
// used by the application layer and exposed to upper layers.

export interface DomainRawKeyword {
  keyword: string;
  position: number;
  searchVolume: number;
}

export interface DomainRawPositionDistribution {
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

export interface DomainRawKeywordTrends {
  isNew: number;
  isUp: number;
  isDown: number;
  isLost: number;
}

export interface DomainRawTrafficMetrics {
  estimatedTrafficValue: number;
  estimatedPaidTrafficCost: number;
  totalKeywordsCount: number;
}

export interface DomainRawMetrics {
  domain: string;
  domainRank?: number;
  organicTraffic?: number;
  keywordsCount?: number;
  domainValue?: number;
  backlinksCount?: number;
  referringDomains?: number;
  topKeywords?: DomainRawKeyword[];
  // Position Insights v2
  positionDistribution?: DomainRawPositionDistribution;
  keywordTrends?: DomainRawKeywordTrends;
  trafficMetrics?: DomainRawTrafficMetrics;
}

export interface DetectionInfo {
  location_name?: string;
  language_name?: string;
  countryCode?: string;
  languageCode?: string;
}

export interface DomainAnalysisMapped {
  domain: string;
  domainRank?: number;
  organicTraffic?: number;
  keywordsCount?: number;
  domainValue?: number;
  backlinksCount?: number;
  referringDomains?: number;
  topKeywords?: DomainRawKeyword[];
  detectedLocation?: string;
  detectedLanguage?: string;
  detectedCountryCode?: string;
  detectedLanguageCode?: string;
  // Position Insights v2
  positionDistribution?: DomainRawPositionDistribution;
  keywordTrends?: DomainRawKeywordTrends;
  trafficMetrics?: DomainRawTrafficMetrics;
}

export function mapToDomainAnalysisDTO(
  items: { metrics: DomainRawMetrics; detection?: DetectionInfo }[]
): DomainAnalysisMapped[] {
  if (!Array.isArray(items)) return [];
  return items
    .map(({ metrics, detection }) => {
      if (!metrics?.domain) return null;
      const mapped: DomainAnalysisMapped = {
        domain: metrics.domain,
        domainRank: numOrU(metrics.domainRank),
        organicTraffic: numOrU(metrics.organicTraffic),
        keywordsCount: numOrU(metrics.keywordsCount),
        domainValue: numOrU(metrics.domainValue),
        backlinksCount: numOrU(metrics.backlinksCount),
        referringDomains: numOrU(metrics.referringDomains),
        topKeywords: Array.isArray(metrics.topKeywords)
          ? metrics.topKeywords
              .filter((k) => !!k && typeof k.keyword === 'string' && k.keyword.length > 0)
              .map((k) => ({
                keyword: String(k.keyword),
                position: toNumber(k.position),
                searchVolume: toNumber(k.searchVolume),
              }))
          : undefined,
        detectedLocation: detection?.location_name,
        detectedLanguage: detection?.language_name,
        detectedCountryCode: detection?.countryCode,
        detectedLanguageCode: detection?.languageCode,
        // Position Insights v2
        positionDistribution: metrics.positionDistribution,
        keywordTrends: metrics.keywordTrends,
        trafficMetrics: metrics.trafficMetrics,
      };
      return mapped;
    })
    .filter((x): x is DomainAnalysisMapped => x !== null);
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function numOrU(v: unknown): number | undefined {
  const n = toNumber(v);
  return n || undefined;
}
