import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dfs from 'dataforseo-client';
import { DataForSeoDomainAdapter } from '../dataforseo-domain.adapter';

describe('DataForSeoDomainAdapter', () => {
  let adapter: DataForSeoDomainAdapter;
  let detectSpy: ReturnType<typeof vi.spyOn>;
  let rankSpy: ReturnType<typeof vi.spyOn<dfs.DataforseoLabsApi, dfs.DataforseoLabsApi['googleDomainRankOverviewLive']>>;
  let kwSpy: ReturnType<typeof vi.spyOn<dfs.DataforseoLabsApi, dfs.DataforseoLabsApi['googleRankedKeywordsLive']>>;
  let backlinksSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset fetch if any leftover
    // @ts-expect-error test env
    global.fetch = vi.fn();

    // Spy on SDK prototype BEFORE creating adapter so instance methods are mocked
    rankSpy = vi
      .spyOn(dfs.DataforseoLabsApi.prototype, 'googleDomainRankOverviewLive')
      .mockResolvedValue({ status_code: 20000, tasks_error: 0, tasks: [] } as unknown as ReturnType<dfs.DataforseoLabsApi['googleDomainRankOverviewLive']>);
    kwSpy = vi
      .spyOn(dfs.DataforseoLabsApi.prototype, 'googleRankedKeywordsLive')
      .mockResolvedValue({ status_code: 20000, tasks_error: 0, tasks: [] } as unknown as ReturnType<dfs.DataforseoLabsApi['googleRankedKeywordsLive']>);
    backlinksSpy = vi
      .spyOn(dfs.BacklinksApi.prototype, 'summaryLive')
      .mockResolvedValue({ status_code: 20000, tasks_error: 0, tasks: [] } as unknown as ReturnType<dfs.BacklinksApi['summaryLive']>);

    adapter = new DataForSeoDomainAdapter({
      DATAFORSEO_API_KEY: 'test-api-key',
      DATAFORSEO_BASE_URL: 'https://api.dataforseo.com',
      DATAFORSEO_TIMEOUT_MS: '10000',
    });

    // Stub internal detection to avoid network and ensure payload enrichment
    detectSpy = vi
      // @ts-expect-error access private for test
      .spyOn(adapter as any, 'detectLocationAndLanguage')
      .mockResolvedValue({
        countryCode: 'US',
        languageCode: 'en',
        ip: '1.1.1.1',
      });
  });

  describe('analyzeDomains', () => {
    it('should analyze domain metrics via SDK and map DTO', async () => {
      // Arrange
      // Rank overview returns etv under first metrics entry
      rankSpy.mockResolvedValueOnce({
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                target: 'batiactu.com',
                items: [
                  { metrics: { organic: { etv: 125000 } } }
                ]
              }
            ]
          }
        ]
      } as unknown as ReturnType<dfs.DataforseoLabsApi['googleDomainRankOverviewLive']>);

      // Ranked keywords returns items with keyword + rank + volume
      kwSpy.mockResolvedValueOnce({
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                target: 'batiactu.com',
                items: [
                  {
                    keyword: 'réglementation btp',
                    ranked_serp_element: { serp_item: { rank_absolute: 3 } },
                    keyword_data: { keyword_info: { search_volume: 1500 } }
                  }
                ]
              }
            ]
          }
        ]
      } as unknown as ReturnType<dfs.DataforseoLabsApi['googleRankedKeywordsLive']>);

      // Backlinks summary returns backlinks + referring_domains
      backlinksSpy.mockResolvedValueOnce({
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                target: 'batiactu.com',
                backlinks: 45000,
                referring_domains: 1200
              }
            ]
          }
        ]
      } as unknown as ReturnType<dfs.BacklinksApi['summaryLive']>);

      // Act
      const result = await adapter.analyzeDomains(['batiactu.com']);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        domain: 'batiactu.com',
        organicTraffic: 125000,
        backlinksCount: 45000,
        referringDomains: 1200,
        topKeywords: [
          { keyword: 'réglementation btp', position: 3, searchVolume: 1500 }
        ]
      });

      // SDK called with correct location/language codes (US/en => 2840)
      expect(rankSpy).toHaveBeenCalledTimes(1);
      expect(kwSpy).toHaveBeenCalledTimes(1);
      expect(backlinksSpy).toHaveBeenCalledTimes(1);
      const rankArg = (rankSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>[];
      const kwArg = (kwSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>[];
      const firstRank = rankArg[0];
      const firstKw = kwArg[0];
      expect(firstRank).toMatchObject({ target: 'batiactu.com', location_code: 2840, language_code: 'en' });
      expect(firstKw).toMatchObject({ target: 'batiactu.com', location_code: 2840, language_code: 'en' });

      // Ensure we used detection once (for DTO enrichment)
      expect(detectSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple domains and call detection for each', async () => {
      rankSpy.mockResolvedValue({
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          { status_code: 20000, result: [ { target: 'domain1.com', items: [ { metrics: { google: { etv: 50000 } } } ] } ] },
          { status_code: 20000, result: [ { target: 'domain2.com', items: [ { metrics: { google: { etv: 80000 } } } ] } ] },
        ]
      } as unknown as ReturnType<dfs.DataforseoLabsApi['googleDomainRankOverviewLive']>);
      kwSpy.mockResolvedValue({ status_code: 20000, tasks_error: 0, tasks: [] } as unknown as ReturnType<dfs.DataforseoLabsApi['googleRankedKeywordsLive']>);

      const result = await adapter.analyzeDomains(['domain1.com', 'domain2.com']);

      expect(result).toHaveLength(2);
      expect(result[0].domain).toBe('domain1.com');
      expect(result[1].domain).toBe('domain2.com');

      // Detection called twice
      expect(detectSpy).toHaveBeenCalledTimes(2);
      expect(rankSpy).toHaveBeenCalledTimes(1);
      const rankArgs = (rankSpy.mock.calls[0] as unknown[])[0] as { target: string }[];
      expect(Array.isArray(rankArgs)).toBe(true);
      expect(rankArgs.map((r) => r.target)).toEqual(['domain1.com', 'domain2.com']);
    });

    it('should fail-fast on SDK error status_code', async () => {
      rankSpy.mockResolvedValueOnce({ status_code: 40000, tasks_error: 0 } as unknown as ReturnType<dfs.DataforseoLabsApi['googleDomainRankOverviewLive']>);
      await expect(adapter.analyzeDomains(['test.com'])).rejects.toThrow(/status_code 40000/);
    });

    it('should throw if no domains provided', async () => {
      await expect(adapter.analyzeDomains([])).rejects.toThrow('Domains array cannot be empty');
    });
  });
});