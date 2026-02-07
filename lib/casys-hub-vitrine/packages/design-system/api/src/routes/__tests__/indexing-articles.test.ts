import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';

type MockFn = ReturnType<typeof vi.fn>;
interface DtoApi { createResponse: MockFn }
interface SharedContainer { dtos: { api: DtoApi } }
interface IndexArticlesUseCaseMock {
  execute: MockFn;
  indexGlobalCatalog: MockFn;
  indexTenantCatalog: MockFn;
  indexProjectCatalog: MockFn;
  indexArticle: MockFn;
}

// Import de la route indexing
import { indexingArticlesRoutes as indexingRoutes } from '../content/indexing';

describe('Articles Indexing API Routes', () => {
  let app: Hono;
  let mockIndexArticlesUseCase: IndexArticlesUseCaseMock;
  let mockSharedContainer: SharedContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock des use cases - avec les noms exacts des méthodes utilisées dans les routes
    mockIndexArticlesUseCase = {
      execute: vi.fn(),
      // Méthodes pour l'indexation granulaire (noms alignés avec l'implémentation)
      indexGlobalCatalog: vi.fn(), // au lieu de indexArticlesGlobal
      indexTenantCatalog: vi.fn(), // au lieu de indexArticlesByTenant
      indexProjectCatalog: vi.fn(), // au lieu de indexArticlesByProject
      indexArticle: vi.fn(),
    };

    // Mock du container shared avec les DTOs
    mockSharedContainer = {
      dtos: {
        api: {
          createResponse: vi.fn().mockImplementation((success, data, message) => ({
            success,
            data,
            message,
            error: success ? undefined : message,
          })),
        },
      },
    };

    // Création de l'app Hono avec middleware mockés
    app = new Hono();

    // Middleware pour injecter les mocks dans le contexte
    app.use('*', async (c, next) => {
      ctxSetUnsafe(c, 'useCases', { indexArticlesUseCase: mockIndexArticlesUseCase } as any);
      ctxSetUnsafe(c, 'shared', mockSharedContainer);
      ctxSetUnsafe(c, 'createApiResponse', mockSharedContainer.dtos.api.createResponse);
      await next();
    });

    app.route('/', indexingRoutes);
  });

  describe('POST /articles', () => {
    it('should index articles successfully', async () => {
      // Arrange
      const requestBody = {
        articles: [
          {
            article: {
              id: 'article-123',
              title: 'Test Article',
            },
            sections: [],
            componentUsages: [],
            comments: [],
          },
        ],
        tenantId: 'tenant-123',
        projectId: 'project-456',
      };

      mockIndexArticlesUseCase.execute.mockResolvedValue({
        success: true,
        indexedCount: 1,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: { indexedCount: 1 },
        message: '1 articles indexés avec succès',
      });

      // Act
      const res = await app.request('/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.indexedCount).toBe(1);
      expect(mockIndexArticlesUseCase.execute).toHaveBeenCalledWith(requestBody);
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        { indexedCount: 1, success: true },
        '1 articles indexés avec succès'
      );
    });

    it('should handle validation errors for invalid article data', async () => {
      // Arrange
      const invalidArticles = [
        {
          article: {
            // Missing required fields
            description: 'Invalid article',
          },
        },
      ];

      const requestBody = {
        articles: invalidArticles,
        tenantId: 'tenant-123',
        projectId: 'project-456',
      };

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Données invalides',
        error: 'Données invalides',
      });

      // Act
      const res = await app.request('/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Assert
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.success).toBe(false);
      // La route ne fait pas appel à createResponse pour les erreurs de validation
      // mais crée directement un objet de réponse
    });

    it('should handle use case execution errors', async () => {
      // Arrange
      const requestBody = {
        articles: [
          {
            article: {
              id: 'article-1',
              title: 'Test Article',
            },
          },
        ],
        userId: 'user-123',
        projectId: 'project-456',
      };

      mockIndexArticlesUseCase.execute.mockRejectedValue(new Error('Database connection failed'));

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: "Erreur lors de l'indexation des articles: Database connection failed",
        error: "Erreur lors de l'indexation des articles: Database connection failed",
      });

      // Act
      const res = await app.request('/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Erreur lors de l'indexation des articles");
      expect(data.message).toContain('Database connection failed');
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining('Database connection failed')
      );
    });
  });

  // Tests pour les nouvelles routes granulaires d'indexation
  describe('POST /articles/global', () => {
    it('should index all articles globally', async () => {
      // Arrange
      mockIndexArticlesUseCase.indexGlobalCatalog.mockResolvedValue({
        success: true,
        indexedCount: 5,
        failedCount: 0,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: { indexedCount: 5, failedCount: 0 },
        message: 'Indexation globale réussie: 5 articles indexés',
      });

      // Act
      const res = await app.request('/articles/global', {
        method: 'POST',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.indexedCount).toBe(5);
      expect(mockIndexArticlesUseCase.indexGlobalCatalog).toHaveBeenCalled();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        { indexedCount: 5, failedCount: 0, success: true },
        'Indexation globale réussie: 5 articles indexés'
      );
    });
  });

  describe('POST /articles/tenant/:tenantId', () => {
    it('should index articles by tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';

      mockIndexArticlesUseCase.indexTenantCatalog.mockResolvedValue({
        success: true,
        indexedCount: 3,
        failedCount: 0,
        tenantId,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: { indexedCount: 3, failedCount: 0, tenantId },
        message: `Indexation des articles pour le tenant ${tenantId} réussie`,
      });

      // Act
      const res = await app.request(`/articles/tenant/${tenantId}`, {
        method: 'POST',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tenantId).toBe(tenantId);
      expect(mockIndexArticlesUseCase.indexTenantCatalog).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('POST /articles/project/:tenantId/:projectId', () => {
    it('should index articles by project', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const projectId = 'project-456';

      mockIndexArticlesUseCase.indexProjectCatalog.mockResolvedValue({
        success: true,
        indexedCount: 2,
        failedCount: 0,
        tenantId,
        projectId,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: { indexedCount: 2, failedCount: 0, tenantId, projectId },
        message: `Indexation des articles pour le projet ${projectId} (tenant ${tenantId}) réussie`,
      });

      // Act
      const res = await app.request(`/articles/project/${tenantId}/${projectId}`, {
        method: 'POST',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tenantId).toBe(tenantId);
      expect(data.data.projectId).toBe(projectId);
      expect(mockIndexArticlesUseCase.indexProjectCatalog).toHaveBeenCalledWith(
        tenantId,
        projectId
      );
    });
  });

  describe('POST /articles/:articleId', () => {
    it('should index a specific article', async () => {
      // Arrange
      const articleId = 'article-789';

      mockIndexArticlesUseCase.indexArticle.mockResolvedValue({
        success: true,
        articleId,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: { articleId },
        message: `Indexation de l'article ${articleId} réussie`,
      });

      // Act
      const res = await app.request(`/articles/${articleId}`, {
        method: 'POST',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.articleId).toBe(articleId);
      expect(mockIndexArticlesUseCase.indexArticle).toHaveBeenCalledWith(articleId);
    });
  });
});