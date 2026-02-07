import type { CompetitorDataDTO, KeywordMetricsDTO, TrendDataDTO } from '@casys/shared';

import type { GoogleScrapingPort, GoogleTrendsPort, KeywordEnrichmentPort } from '../../ports/out';

export class SeoDataEnrichmentService {
  constructor(
    private readonly keywordEnrichment: KeywordEnrichmentPort,
    private readonly googleTrends: GoogleTrendsPort,
    private readonly googleScraping: GoogleScrapingPort
  ) {}

  async getKeywordMetrics(keywords: string[], region: string): Promise<KeywordMetricsDTO[]> {
    return this.keywordEnrichment.enrichKeywords(keywords, region);
  }

  async getRelatedKeywords(
    keywords: string[],
    region: string,
    opts: { limit?: number; depth: number }
  ): Promise<KeywordMetricsDTO[]> {
    return this.keywordEnrichment.getRelatedKeywords(keywords, region, opts);
  }

  async getTrends(keywords: string[], region: string): Promise<TrendDataDTO[]> {
    return this.googleTrends.getTrends(keywords, region);
  }

  async scrapeTopCompetitors(
    keywords: string[],
    _region: string,
    topK = 5
  ): Promise<CompetitorDataDTO[]> {
    const scrapeWithRegion = this.googleScraping.scrapeTopResultsWithRegion?.bind(
      this.googleScraping
    );

    const settled = await Promise.allSettled(
      keywords.map(kw =>
        scrapeWithRegion
          ? scrapeWithRegion(kw, { limit: topK, region: _region })
          : this.googleScraping.scrapeTopResults(kw, topK)
      )
    );
    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<CompetitorDataDTO[]> => r.status === 'fulfilled'
    );
    return fulfilled.flatMap(r => r.value);
  }
}
