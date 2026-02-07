import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ctxSetUnsafe } from '../../utils/hono-context';
// Import de la route list pour les articles
import { listArticlesRoutes } from '../content/list';

type MockFn = ReturnType<typeof vi.fn>;
interface DtoApi { createResponse: MockFn }
interface SharedContainer { dtos: { api: DtoApi } }
interface ListArticlesUseCaseMock {
  listAllArticles: MockFn;
  listArticlesByTenant: MockFn;
  listArticlesByProject: MockFn;
  listAllArticlesWithMeta: MockFn;
  getArticle: MockFn;
  getArticleDetails: MockFn;
}

describe('Article Listing API Routes', () => {
  let app: Hono;
  let mockListArticlesUseCase: ListArticlesUseCaseMock;
  let mockSharedContainer: SharedContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock du use case
    mockListArticlesUseCase = {
      listAllArticles: vi.fn(),
      listArticlesByTenant: vi.fn(),
      listArticlesByProject: vi.fn(),
      listAllArticlesWithMeta: vi.fn(),
      getArticle: vi.fn(),
      getArticleDetails: vi.fn(),
    };

    // Mock du container shared avec les DTOs
    mockSharedContainer = {
      dtos: {
        api: {
          createResponse: vi.fn((success, data, message) => ({
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
      // Routes lisent désormais via c.get('useCases').listArticlesUseCase
      ctxSetUnsafe(c, 'useCases', { listArticlesUseCase: mockListArticlesUseCase } as any);
      ctxSetUnsafe(c, 'shared', mockSharedContainer);
      ctxSetUnsafe(c, 'createApiResponse', mockSharedContainer.dtos.api.createResponse);
      await next();
    });

    app.route('/', listArticlesRoutes);
  });

  describe('GET /articles', () => {
    it('should list all articles successfully', async () => {
      // Arrange
      const mockArticles = [
        { id: 'article-1', title: 'Test Article 1' },
        { id: 'article-2', title: 'Test Article 2' },
      ];

      mockListArticlesUseCase.listAllArticles.mockResolvedValue(mockArticles);
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: mockArticles,
        message: 'Articles récupérés avec succès',
      });

      // Act
      const res = await app.request('/articles', {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockArticles);
      expect(mockListArticlesUseCase.listAllArticles).toHaveBeenCalled();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        mockArticles
      );
    });

    it('should handle errors when listing all articles', async () => {
      // Arrange
      const mockError = new Error('Test error');
      mockListArticlesUseCase.listAllArticles.mockRejectedValue(mockError);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Erreur lors du listing global des articles: Test error',
        error: 'Erreur lors du listing global des articles: Test error',
      });

      // Act
      const res = await app.request('/articles', {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining('Erreur lors du listing global des articles')
      );
    });
  });

  describe('GET /articles/tenant/:tenantId', () => {
    it('should list articles by tenant successfully', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const mockArticles = [
        { id: 'article-1', title: 'Test Article 1', tenantId },
        { id: 'article-2', title: 'Test Article 2', tenantId },
      ];

      mockListArticlesUseCase.listArticlesByTenant.mockResolvedValue(mockArticles);
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: mockArticles,
        message: `Articles du tenant ${tenantId} récupérés avec succès`,
      });

      // Act
      const res = await app.request(`/articles/tenant/${tenantId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockArticles);
      expect(mockListArticlesUseCase.listArticlesByTenant).toHaveBeenCalledWith(tenantId);
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        mockArticles
      );
    });

    it('should handle errors when listing articles by tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const mockError = new Error('Test error');
      mockListArticlesUseCase.listArticlesByTenant.mockRejectedValue(mockError);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Erreur lors du listing des articles par tenant: Test error',
        error: 'Erreur lors du listing des articles par tenant: Test error',
      });

      // Act
      const res = await app.request(`/articles/tenant/${tenantId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining('Erreur lors du listing des articles par tenant')
      );
    });
  });

  describe('GET /articles/project/:tenantId/:projectId', () => {
    it('should list articles by project successfully', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const projectId = 'project-456';
      const mockArticles = [
        { id: 'article-1', title: 'Test Article 1', tenantId, projectId },
        { id: 'article-2', title: 'Test Article 2', tenantId, projectId },
      ];

      mockListArticlesUseCase.listArticlesByProject.mockResolvedValue(mockArticles);
      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: mockArticles,
        message: `Articles du projet ${projectId} (tenant ${tenantId}) récupérés avec succès`,
      });

      // Act
      const res = await app.request(`/articles/project/${tenantId}/${projectId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockArticles);
      expect(mockListArticlesUseCase.listArticlesByProject).toHaveBeenCalledWith(
        tenantId,
        projectId
      );
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        mockArticles
      );
    });

    it('should handle errors when listing articles by project', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const projectId = 'project-456';
      const mockError = new Error('Test error');
      mockListArticlesUseCase.listArticlesByProject.mockRejectedValue(mockError);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Erreur lors du listing des articles par projet: Test error',
        error: 'Erreur lors du listing des articles par projet: Test error',
      });

      // Act
      const res = await app.request(`/articles/project/${tenantId}/${projectId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining('Erreur lors du listing des articles par projet')
      );
    });

    it('should return 500 if use case is undefined (DI failure)', async () => {
      // Arrange - Simuler le cas où le use case n'est pas disponible (config manquante)
      const tenantId = 'tenant-123';
      const projectId = 'project-456';
      
      // Créer une nouvelle app sans use case pour simuler le problème DI
      const brokenApp = new Hono();
      brokenApp.use('*', async (c, next) => {
        ctxSetUnsafe(c, 'shared', mockSharedContainer);
        ctxSetUnsafe(c, 'useCases', { listArticlesUseCase: undefined }); // ❌ undefined
        await next();
      });
      brokenApp.route('/', listArticlesRoutes); // Monter à la racine comme dans beforeEach

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: 'Use case de listing des articles non disponible',
        error: 'Use case de listing des articles non disponible',
      });

      // Act
      const res = await brokenApp.request(`/articles/project/${tenantId}/${projectId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('GET /articles/:articleId', () => {
    it('should get a specific article successfully', async () => {
      // Arrange
      const articleId = 'article-123';
      const mockArticle = {
        id: articleId,
        title: 'Test Article',
        content: 'Test content',
      };

      mockListArticlesUseCase.getArticle.mockResolvedValue({
        found: true,
        article: mockArticle,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: mockArticle,
        message: `Article ${articleId} récupéré avec succès`,
      });

      // Act
      const res = await app.request(`/articles/${articleId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockArticle);
      expect(mockListArticlesUseCase.getArticle).toHaveBeenCalledWith({
        articleId,
        tenantId: undefined,
        projectId: undefined,
      });
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        mockArticle
      );
    });

    it('should return 404 when article is not found', async () => {
      // Arrange
      const articleId = 'nonexistent-article';
      mockListArticlesUseCase.getArticle.mockResolvedValue({
        found: false,
        article: null,
      });

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: `Article ${articleId} non trouvé`,
        error: `Article ${articleId} non trouvé`,
      });

      // Act
      const res = await app.request(`/articles/${articleId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining(`Article ${articleId} non trouvé`)
      );
    });

    it('should handle errors when getting a specific article', async () => {
      // Arrange
      const articleId = 'article-123';
      const mockError = new Error('Test error');
      mockListArticlesUseCase.getArticle.mockRejectedValue(mockError);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: "Erreur lors de la récupération de l'article: Test error",
        error: "Erreur lors de la récupération de l'article: Test error",
      });

      // Act
      const res = await app.request(`/articles/${articleId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining("Erreur lors de la récupération de l'article")
      );
    });
  });

  describe('GET /articles/details/:articleId', () => {
    it('should get article details successfully', async () => {
      // Arrange
      const articleId = 'article-123';
      const mockDetails = {
        id: articleId,
        title: 'Test Article',
        sections: [{ id: 'section-1', title: 'Section 1' }],
        fragments: [{ id: 'fragment-1', content: 'Fragment content' }],
      };

      mockListArticlesUseCase.getArticleDetails.mockResolvedValue(mockDetails);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: true,
        data: mockDetails,
        message: `Détails de l'article ${articleId} récupérés avec succès`,
      });

      // Act
      const res = await app.request(`/articles/details/${articleId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockDetails);
      expect(mockListArticlesUseCase.getArticleDetails).toHaveBeenCalledWith(articleId);
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        true,
        mockDetails
      );
    });

    it('should handle errors when getting article details', async () => {
      // Arrange
      const articleId = 'article-123';
      const mockError = new Error('Test error');
      mockListArticlesUseCase.getArticleDetails.mockRejectedValue(mockError);

      mockSharedContainer.dtos.api.createResponse.mockReturnValue({
        success: false,
        data: null,
        message: "Erreur lors de la récupération des détails de l'article: Test error",
        error: "Erreur lors de la récupération des détails de l'article: Test error",
      });

      // Act
      const res = await app.request(`/articles/details/${articleId}`, {
        method: 'GET',
      });

      // Assert
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(mockSharedContainer.dtos.api.createResponse).toHaveBeenCalledWith(
        false,
        null,
        expect.stringContaining('Erreur lors de la récupération des détails')
      );
    });
  });
});