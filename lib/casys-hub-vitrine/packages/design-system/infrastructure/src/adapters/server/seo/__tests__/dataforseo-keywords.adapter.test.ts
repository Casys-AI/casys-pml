import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataForSeoKeywordsAdapter } from '../dataforseo-keywords.adapter';

describe('DataForSeoKeywordsAdapter', () => {
  let adapter: DataForSeoKeywordsAdapter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    
    adapter = new DataForSeoKeywordsAdapter({
      DATAFORSEO_API_KEY: 'test-api-key',
      DATAFORSEO_BASE_URL: 'https://api.dataforseo.com',
      DATAFORSEO_TIMEOUT_MS: '10000',
    });
  });

  describe('enrichKeywords', () => {
    it('should enrich keywords with real metrics from DataForSEO', async () => {
      // Arrange - Mock réponse DataForSEO Keywords Data API
      const mockResponse = {
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                keyword: 'réglementation btp',
                search_volume: 1500,
                keyword_difficulty: 45,
                cpc: 2.5,
                competition: 'MEDIUM',
                related_keywords: ['normes btp', 'réglementation construction']
              }
            ]
          }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      // Act
      const result = await adapter.enrichKeywords(['réglementation btp'], 'FR');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        keyword: 'réglementation btp',
        searchVolume: 1500,
        difficulty: 45,
        cpc: 2.5,
        competition: 'medium',
        relatedKeywords: ['normes btp', 'réglementation construction']
      });
    });

    it('should handle multiple keywords', async () => {
      const mockResponse = {
        status_code: 20000,
        tasks_error: 0,
        tasks: [
          {
            status_code: 20000,
            result: [
              { keyword: 'kw1', search_volume: 1000, keyword_difficulty: 30 },
              { keyword: 'kw2', search_volume: 2000, keyword_difficulty: 50 }
            ]
          }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await adapter.enrichKeywords(['kw1', 'kw2'], 'FR');

      expect(result).toHaveLength(2);
      expect(result[0].searchVolume).toBe(1000);
      expect(result[1].searchVolume).toBe(2000);
    });

    it('should fail-fast on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      });

      await expect(adapter.enrichKeywords(['test'], 'FR')).rejects.toThrow('DataForSEO Keywords failed: HTTP 401');
    });

    it('should fail-fast on provider error (status_code !== 20000)', async () => {
      const mockResponse = {
        status_code: 40000,
        tasks_error: 0,
        tasks: []
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      await expect(adapter.enrichKeywords(['test'], 'FR')).rejects.toThrow('status_code 40000');
    });

    it('should throw if no keywords provided', async () => {
      await expect(adapter.enrichKeywords([], 'FR')).rejects.toThrow('Keywords array cannot be empty');
    });
  });
});
