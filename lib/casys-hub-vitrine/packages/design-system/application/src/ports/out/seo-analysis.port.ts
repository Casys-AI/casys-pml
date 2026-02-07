import type { CompetitorDataDTO, TrendDataDTO } from '@casys/shared';

export interface GoogleScrapingPort {
  // Legacy method (backwards compatible)
  scrapeTopResults(keyword: string, limit?: number): Promise<CompetitorDataDTO[]>;
  // Optional extended method with region support
  scrapeTopResultsWithRegion?(
    keyword: string,
    opts?: { limit?: number; region?: string }
  ): Promise<CompetitorDataDTO[]>;
}

export interface GoogleTrendsPort {
  getTrends(keywords: string[], region?: string): Promise<TrendDataDTO[]>;
}
