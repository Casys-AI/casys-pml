import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import { discoverRssRoute } from '../rss/discover';

// Mocks
const mockDiscoverUseCase = {
  execute: vi.fn(),
};

const mockConfigReader = {
  getProjectConfig: vi.fn(),
};

function buildApp(withUseCase = true, withConfig = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const useCases: Record<string, unknown> = {};
    if (withUseCase) useCases.discoverRssFeedsUseCase = mockDiscoverUseCase;

    const infraServices: Record<string, unknown> = {};
    if (withConfig) infraServices.configReader = mockConfigReader;

    ctxSetUnsafe(c, 'useCases', useCases as any);
    ctxSetUnsafe(c, 'infraServices', infraServices as any);
    ctxSetUnsafe(
      c,
      'createApiResponse',
      (success: boolean, data: unknown, error?: string) => ({
        success,
        data,
        error,
      })
    );
    await next();
  });
  app.route('/api/rss', discoverRssRoute);
  return app;
}

describe('RSS Discovery Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/rss/discover', () => {
    const validRequest = {
      projectId: 'test-project',
      industry: 'tech',
      targetAudience: 'developers',
      keywords: ['ai', 'machine learning'],
      maxResults: 10,
      minRelevanceScore: 70,
    };

    it('should return 400 for invalid request body', async () => {
      const app = buildApp();
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when projectId is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: 'tech' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 503 when discoverRssFeedsUseCase not available', async () => {
      const app = buildApp(false, true);
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('RSS discovery service not available');
    });

    it('should return 503 when configReader not available', async () => {
      const app = buildApp(true, false);
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Project config service not available');
    });

    it('should return 404 when project config not found', async () => {
      mockConfigReader.getProjectConfig.mockRejectedValue(
        new Error('Project not found')
      );

      const app = buildApp(true, true);
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Project configuration not found');
    });

    it('should return 200 with discovered feeds on success', async () => {
      const mockConfig = {
        language: 'en',
        businessContext: {
          industry: 'technology',
          targetAudience: 'developers',
          businessDescription: 'AI development platform',
        },
      };

      const mockDiscoveryResult = [
        {
          url: 'https://example.com/feed.xml',
          title: 'Tech Blog',
          relevanceScore: 85,
          qualification: { status: 'relevant', score: 85, relevanceReason: 'AI content' },
        },
      ];

      mockConfigReader.getProjectConfig.mockResolvedValue(mockConfig);
      mockDiscoverUseCase.execute.mockResolvedValue(mockDiscoveryResult);

      const app = buildApp(true, true);
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.feeds).toEqual(mockDiscoveryResult);
      expect(body.data.totalFound).toBe(1);

      // Verify use case was called with merged context
      expect(mockDiscoverUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
          businessContext: mockConfig.businessContext,
        })
      );
    });

    it('should handle use case execution errors', async () => {
      const mockConfig = {
        language: 'en',
        businessContext: { industry: 'tech', targetAudience: 'developers' },
      };
      mockConfigReader.getProjectConfig.mockResolvedValue(mockConfig);
      mockDiscoverUseCase.execute.mockRejectedValue(
        new Error('Discovery failed')
      );

      const app = buildApp(true, true);
      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Discovery failed');
    });

    it('should respect maxResults parameter', async () => {
      const mockConfig = {
        language: 'en',
        businessContext: { industry: 'tech', targetAudience: 'developers' },
      };
      mockConfigReader.getProjectConfig.mockResolvedValue(mockConfig);
      mockDiscoverUseCase.execute.mockResolvedValue([]);

      const app = buildApp(true, true);
      const requestWithLimit = { ...validRequest, maxResults: 5 };

      await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestWithLimit),
      });

      expect(mockDiscoverUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 5,
        })
      );
    });

    it('should include keywords in response discoveryContext', async () => {
      const mockConfig = {
        language: 'en',
        businessContext: { industry: 'tech', targetAudience: 'developers' },
      };
      mockConfigReader.getProjectConfig.mockResolvedValue(mockConfig);
      mockDiscoverUseCase.execute.mockResolvedValue([]);

      const app = buildApp(true, true);
      const keywords = ['ai', 'ml', 'deep learning'];
      const requestWithKeywords = { ...validRequest, keywords };

      const res = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestWithKeywords),
      });

      const body = await res.json();
      expect(body.data.discoveryContext.keywords).toEqual(keywords);
    });

    it('should validate maxResults bounds', async () => {
      const app = buildApp();

      // Test maxResults > 50
      const res1 = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', maxResults: 51 }),
      });
      expect(res1.status).toBe(400);

      // Test maxResults < 1
      const res2 = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', maxResults: 0 }),
      });
      expect(res2.status).toBe(400);
    });

    it('should validate minRelevanceScore bounds', async () => {
      const app = buildApp();

      // Test minRelevanceScore > 100
      const res1 = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', minRelevanceScore: 101 }),
      });
      expect(res1.status).toBe(400);

      // Test minRelevanceScore < 0
      const res2 = await app.request('/api/rss/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', minRelevanceScore: -1 }),
      });
      expect(res2.status).toBe(400);
    });
  });
});
