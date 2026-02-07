import { describe, it, expect, vi } from 'vitest';
import {
  IndexArticlesUseCaseImpl,
  createIndexArticlesUseCase,
  type IndexArticlesInput,
} from '../index-articles.usecase';
import type { ArticleIndexingUpsertPort } from '../../ports/out';
import type { ArticleStructure } from '@casys/core';

describe('IndexArticlesUseCaseImpl', () => {
  describe('execute', () => {
    it('should fail-fast when articles array is empty', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(
        useCase.execute({
          articles: [],
        } as IndexArticlesInput)
      ).rejects.toThrow("[IndexArticlesUseCase] 'articles' requis et non vide");
    });

    it('should fail-fast when article has no id', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      const invalidArticle = {
        article: { id: '' }, // empty id
      } as ArticleStructure;

      // Act & Assert
      await expect(
        useCase.execute({
          articles: [invalidArticle],
        } as IndexArticlesInput)
      ).rejects.toThrow('[IndexArticlesUseCase] article.article.id requis');
    });

    it('should index articles successfully', async () => {
      // Arrange
      const mockResult = {
        success: true,
        indexedCount: 2,
        failedCount: 0,
        errors: [],
        indexedArticleIds: ['article-1', 'article-2'],
        message: '2 articles indexed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexArticles: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      const mockArticles: ArticleStructure[] = [
        { article: { id: 'article-1', title: 'Article 1' } } as ArticleStructure,
        { article: { id: 'article-2', title: 'Article 2' } } as ArticleStructure,
      ];

      // Act
      const result = await useCase.execute({
        articles: mockArticles,
        tenantId: 't1',
        projectId: 'p1',
      });

      // Assert
      expect(mockPort.indexArticles).toHaveBeenCalledWith({
        articles: mockArticles,
        tenantId: 't1',
        projectId: 'p1',
      });

      expect(result).toEqual(mockResult);
    });

    it('should handle indexing errors', async () => {
      // Arrange
      const mockResult = {
        success: false,
        indexedCount: 1,
        failedCount: 1,
        errors: [new Error('Failed to index article-2')],
        indexedArticleIds: ['article-1'],
        message: '1 indexed, 1 failed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexArticles: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      const mockArticles: ArticleStructure[] = [
        { article: { id: 'article-1', title: 'Article 1' } } as ArticleStructure,
        { article: { id: 'article-2', title: 'Article 2' } } as ArticleStructure,
      ];

      // Act
      const result = await useCase.execute({
        articles: mockArticles,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should propagate errors from port', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {
        indexArticles: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      const mockArticles: ArticleStructure[] = [
        { article: { id: 'article-1', title: 'Article 1' } } as ArticleStructure,
      ];

      // Act & Assert
      await expect(
        useCase.execute({
          articles: mockArticles,
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('indexGlobalCatalog', () => {
    it('should index global catalog successfully', async () => {
      // Arrange
      const mockResult = {
        success: true,
        indexedArticles: 100,
        message: 'Global catalog indexed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexGlobalCatalog: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act
      const result = await useCase.indexGlobalCatalog();

      // Assert
      expect(mockPort.indexGlobalCatalog).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should propagate errors from global catalog indexing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {
        indexGlobalCatalog: vi.fn().mockRejectedValue(new Error('Indexing failed')),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexGlobalCatalog()).rejects.toThrow('Indexing failed');
    });
  });

  describe('indexTenantCatalog', () => {
    it('should fail-fast when tenantId is missing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexTenantCatalog('')).rejects.toThrow(
        '[IndexArticlesUseCase] tenantId requis'
      );
    });

    it('should index tenant catalog successfully', async () => {
      // Arrange
      const mockResult = {
        success: true,
        tenantId: 't1',
        indexedArticles: 50,
        message: 'Tenant catalog indexed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexTenantCatalog: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act
      const result = await useCase.indexTenantCatalog('t1');

      // Assert
      expect(mockPort.indexTenantCatalog).toHaveBeenCalledWith('t1');
      expect(result).toEqual(mockResult);
    });

    it('should propagate errors from tenant catalog indexing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {
        indexTenantCatalog: vi.fn().mockRejectedValue(new Error('Tenant not found')),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexTenantCatalog('t1')).rejects.toThrow('Tenant not found');
    });
  });

  describe('indexProjectCatalog', () => {
    it('should fail-fast when tenantId is missing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexProjectCatalog('', 'p1')).rejects.toThrow(
        '[IndexArticlesUseCase] tenantId requis'
      );
    });

    it('should fail-fast when projectId is missing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexProjectCatalog('t1', '')).rejects.toThrow(
        '[IndexArticlesUseCase] projectId requis'
      );
    });

    it('should index project catalog successfully', async () => {
      // Arrange
      const mockResult = {
        success: true,
        tenantId: 't1',
        projectId: 'p1',
        indexedArticles: 25,
        message: 'Project catalog indexed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexProjectCatalog: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act
      const result = await useCase.indexProjectCatalog('t1', 'p1');

      // Assert
      expect(mockPort.indexProjectCatalog).toHaveBeenCalledWith('t1', 'p1');
      expect(result).toEqual(mockResult);
    });

    it('should propagate errors from project catalog indexing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {
        indexProjectCatalog: vi.fn().mockRejectedValue(new Error('Project not found')),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexProjectCatalog('t1', 'p1')).rejects.toThrow('Project not found');
    });
  });

  describe('indexArticle', () => {
    it('should fail-fast when articleId is missing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;
      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexArticle('')).rejects.toThrow(
        '[IndexArticlesUseCase] articleId requis'
      );
    });

    it('should index single article successfully', async () => {
      // Arrange
      const mockResult = {
        success: true,
        articleId: 'article-1',
        message: 'Article indexed',
      };

      const mockPort: ArticleIndexingUpsertPort = {
        indexArticleCatalog: vi.fn().mockResolvedValue(mockResult),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act
      const result = await useCase.indexArticle('article-1');

      // Assert
      expect(mockPort.indexArticleCatalog).toHaveBeenCalledWith('article-1');
      expect(result).toEqual(mockResult);
    });

    it('should propagate errors from article indexing', async () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {
        indexArticleCatalog: vi.fn().mockRejectedValue(new Error('Article not found')),
      } as any;

      const useCase = new IndexArticlesUseCaseImpl(mockPort);

      // Act & Assert
      await expect(useCase.indexArticle('article-1')).rejects.toThrow('Article not found');
    });
  });

  describe('createIndexArticlesUseCase factory', () => {
    it('should create a valid IndexArticlesUseCaseImpl instance', () => {
      // Arrange
      const mockPort: ArticleIndexingUpsertPort = {} as any;

      // Act
      const useCase = createIndexArticlesUseCase(mockPort);

      // Assert
      expect(useCase).toBeInstanceOf(IndexArticlesUseCaseImpl);
    });
  });
});
