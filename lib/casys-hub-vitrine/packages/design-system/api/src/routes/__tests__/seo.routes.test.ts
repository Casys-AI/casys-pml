import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
import seoRoutes from '../seo/index';

// Mocks
const mockSeoAnalysisUseCase = {
  execute: vi.fn(),
};

const mockGenerateAngleUseCase = {
  execute: vi.fn(),
};

function buildApp(withSeoAnalysis = true, withGenerateAngle = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const useCases: Record<string, unknown> = {};
    if (withSeoAnalysis) useCases.seoAnalysisUseCase = mockSeoAnalysisUseCase;
    if (withGenerateAngle) useCases.generateAngleUseCase = mockGenerateAngleUseCase;

    ctxSetUnsafe(c, 'useCases', useCases as any);
    await next();
  });
  app.route('/api/seo', seoRoutes);
  return app;
}

describe('SEO Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/seo/generate', () => {
    const validRequest = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      language: 'en',
      keywords: ['ai', 'machine learning'],
    };

    it('should return 400 for invalid request body', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Données invalides');
    });

    it('should return 400 when tenantId is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', language: 'en' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when projectId is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'test', language: 'en' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when language is missing', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'test', projectId: 'test' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when language is too short', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'test', projectId: 'test', language: 'e' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 500 when useCases not available', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        // Don't set useCases
        await next();
      });
      app.route('/api/seo', seoRoutes);

      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Use cases indisponibles');
    });

    it('should return 500 when seoAnalysisUseCase not available', async () => {
      const app = buildApp(false, true);
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('seoAnalysisUseCase non disponible');
    });

    it('should return 200 with analysis result on success', async () => {
      const mockResult = {
        keywords: ['ai', 'machine learning'],
        difficulty: 'medium',
        opportunities: ['content gap', 'ranking opportunity'],
      };
      mockSeoAnalysisUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true, true);
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.result).toEqual(mockResult);

      expect(mockSeoAnalysisUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        language: 'en',
        keywords: ['ai', 'machine learning'],
      });
    });

    it('should handle use case execution errors', async () => {
      mockSeoAnalysisUseCase.execute.mockRejectedValue(new Error('Analysis failed'));

      const app = buildApp(true, true);
      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Analysis failed');
    });

    it('should work without optional keywords parameter', async () => {
      const mockResult = { keywords: [], difficulty: 'low' };
      mockSeoAnalysisUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true, true);
      const requestWithoutKeywords = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        language: 'fr',
      };

      const res = await app.request('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestWithoutKeywords),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      expect(mockSeoAnalysisUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        language: 'fr',
        keywords: undefined,
      });
    });
  });

  describe('POST /api/seo/generate-angle', () => {
    const validArticle = {
      id: 'article-1',
      title: 'AI trends 2024',
      description: 'Latest AI developments',
      content: 'Full article content',
      sourceUrl: 'https://example.com/article',
      sourceTitle: 'Tech Blog',
      publishedAt: '2024-01-15',
      author: 'John Doe',
      imageUrls: ['https://example.com/image.jpg'],
      language: 'en',
    };

    const validSeoBriefData = {
      targetKeywords: [{ keyword: 'ai trends', searchVolume: 1000 }],
      relatedKeywords: [{ keyword: 'machine learning', searchVolume: 500 }],
      suggestedTopics: ['AI applications', 'ML frameworks'],
      contentGaps: ['technical implementation'],
      competitorInsights: ['competitor analysis data'],
      searchIntent: 'informational',
      difficulty: 'medium',
      opportunities: ['ranking opportunity'],
    };

    const validRequest = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      language: 'en',
      articles: [validArticle],
      seoBriefData: validSeoBriefData,
    };

    it('should return 400 for invalid request body', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Données invalides');
    });

    it('should return 400 when tenantId is missing', async () => {
      const app = buildApp();
      const invalidRequest = { ...validRequest };
      delete (invalidRequest as any).tenantId;

      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidRequest),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when articles array is empty', async () => {
      const app = buildApp();
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, articles: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toBeDefined();
      expect(body.details.some((e: any) => e.message.includes('Au moins 1 article requis'))).toBe(
        true
      );
    });

    it('should return 400 when article is missing required fields', async () => {
      const app = buildApp();
      const invalidArticle = { id: 'test', title: 'Test' }; // Missing sourceUrl, publishedAt
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, articles: [invalidArticle] }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 500 when useCases not available', async () => {
      const app = new Hono();
      app.use('*', async (c, next) => {
        // Don't set useCases
        await next();
      });
      app.route('/api/seo', seoRoutes);

      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Use cases indisponibles');
    });

    it('should return 500 when generateAngleUseCase not available', async () => {
      const app = buildApp(true, false);
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('generateAngleUseCase non disponible');
    });

    it('should return 200 with angle selection result on success', async () => {
      const mockResult = {
        selectedAngle: 'Technical deep dive into AI trends',
        chosenCluster: {
          id: 'cluster-1',
          name: 'AI Technical Analysis',
          keywords: ['ai', 'machine learning'],
        },
        contentType: 'technical-guide',
        selectionMode: 'ai-driven',
        targetPersona: {
          name: 'Technical Developer',
          expertise: 'intermediate',
        },
      };
      mockGenerateAngleUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true, true);
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.result).toEqual(mockResult);

      expect(mockGenerateAngleUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        language: 'en',
        articles: [validArticle],
        seoBriefData: validSeoBriefData,
      });
    });

    it('should handle use case execution errors', async () => {
      mockGenerateAngleUseCase.execute.mockRejectedValue(new Error('Angle generation failed'));

      const app = buildApp(true, true);
      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Angle generation failed');
    });

    it('should accept article with publishedAt as Date object', async () => {
      const mockResult = {
        selectedAngle: 'Test angle',
        chosenCluster: { id: 'c1', name: 'Test', keywords: [] },
        contentType: 'guide',
        selectionMode: 'manual',
      };
      mockGenerateAngleUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true, true);
      const articleWithDate = {
        ...validArticle,
        publishedAt: new Date('2024-01-15'),
      };

      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, articles: [articleWithDate] }),
      });

      expect(res.status).toBe(200);
    });

    it('should accept multiple articles', async () => {
      const mockResult = {
        selectedAngle: 'Comprehensive analysis',
        chosenCluster: { id: 'c1', name: 'Multi-source', keywords: [] },
        contentType: 'analysis',
        selectionMode: 'ai-driven',
      };
      mockGenerateAngleUseCase.execute.mockResolvedValue(mockResult);

      const app = buildApp(true, true);
      const article2 = { ...validArticle, id: 'article-2', title: 'ML trends 2024' };

      const res = await app.request('/api/seo/generate-angle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, articles: [validArticle, article2] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
