import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArticleStructureRepositoryPort } from '../../ports/out/article-structure-repository.port';
import { type ArticleStructure } from '@casys/core/src/domain/entities/article-structure.entity';
import type { ArticleStructureStorePort } from '../../ports/out';
import { ArticleIndexingService } from '../article-indexing.service';

describe('ArticleIndexingService', () => {
  let service: ArticleIndexingService;
  let mockStore: ArticleStructureStorePort;
  let mockRepository: ArticleStructureRepositoryPort;
  let mockArticleStructure: ArticleStructure;

  beforeEach(() => {
    // Créer un mock pour l'ArticleStructure avec la structure correcte
    mockArticleStructure = {
      article: {
        id: 'article-1',
        title: 'Test Article',
        description: 'Test description',
        content: 'Test content',
        language: 'fr',
        keywords: ['test', 'article'],
        tags: ['test', 'unit'],
        sources: ['source1.md'],
        agents: ['agent-1', 'agent-2'],
        tenantId: 'tenant-1',
        projectId: 'project-1',
        createdAt: '2024-01-01T00:00:00Z',
      },
      sections: [
        {
          id: 'section-1',
          title: 'Test Section',
          content: 'Section content',
          level: 1,
          position: 1,
          articleId: 'article-1',
        },
      ],
      componentUsages: [],
      textFragments: [
        {
          id: 'fragment-1',
          content: 'Fragment content',
          sectionId: 'section-1',
          position: 1,
        },
      ],
    };

    // Créer un mock pour le store (ArticleStructureStorePort)
    mockStore = {
      indexArticleStructure: vi.fn().mockResolvedValue({ success: true }),
      deleteArticleStructure: vi.fn().mockResolvedValue({ success: true }),
      upsertOutline: vi.fn().mockResolvedValue(undefined),
      upsertSection: vi.fn().mockResolvedValue(undefined),
      updateSectionContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as ArticleStructureStorePort;

    // Créer un mock pour le repository (ArticleStructureRepositoryPort)
    mockRepository = {
      findAll: vi.fn().mockResolvedValue([mockArticleStructure]),
      findByTenant: vi.fn().mockResolvedValue([mockArticleStructure]),
      findByProject: vi.fn().mockResolvedValue([mockArticleStructure]),
      findById: vi.fn().mockResolvedValue(mockArticleStructure),
      findByPath: vi.fn().mockResolvedValue(mockArticleStructure),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ArticleStructureRepositoryPort;

    // Créer le service avec les mocks
    service = new ArticleIndexingService(mockStore, mockRepository);
  });

  describe('indexGlobalCatalog', () => {
    it('should index all articles globally', async () => {
      const result = await service.indexGlobalCatalog();

      expect(mockRepository.findAll).toHaveBeenCalledWith();
      expect(mockStore.indexArticleStructure).toHaveBeenCalledWith(mockArticleStructure, undefined);
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(1);
      expect(result.scope).toBe('global');
    });

    it('should handle errors during global indexing', async () => {
      vi.mocked(mockStore.indexArticleStructure).mockRejectedValue(new Error('Indexing failed'));

      const result = await service.indexGlobalCatalog();

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('Indexing failed');
    });

    it('should handle empty article list', async () => {
      vi.mocked(mockRepository.findAll).mockResolvedValue([]);

      const result = await service.indexGlobalCatalog();

      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(0);
    });

    it('should throw error when repository is not provided', async () => {
      const serviceWithoutRepo = new ArticleIndexingService(mockStore);

      await expect(serviceWithoutRepo.indexGlobalCatalog()).rejects.toThrow(
        "ArticleStructureRepository requis pour l'indexation globale"
      );
    });
  });

  describe('indexTenantCatalog', () => {
    it('should index articles by tenant', async () => {
      const tenantId = 'tenant-1';
      const result = await service.indexTenantCatalog(tenantId);

      expect(mockRepository.findByTenant).toHaveBeenCalledWith(tenantId);
      expect(mockStore.indexArticleStructure).toHaveBeenCalledWith(mockArticleStructure, undefined);
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(1);
      expect(result.scope).toBe('tenant');
      expect(result.tenantId).toBe(tenantId);
    });

    it('should handle empty tenant articles', async () => {
      vi.mocked(mockRepository.findByTenant).mockResolvedValue([]);

      const result = await service.indexTenantCatalog('empty-tenant');

      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(0);
    });

    it('should throw error when repository is not provided', async () => {
      const serviceWithoutRepo = new ArticleIndexingService(mockStore);

      await expect(serviceWithoutRepo.indexTenantCatalog('tenant-1')).rejects.toThrow(
        "ArticleStructureRepository requis pour l'indexation par tenant"
      );
    });
  });

  describe('indexProjectCatalog', () => {
    it('should index articles by project', async () => {
      const tenantId = 'tenant-1';
      const projectId = 'project-1';
      const result = await service.indexProjectCatalog(tenantId, projectId);

      expect(mockRepository.findByProject).toHaveBeenCalledWith(tenantId, projectId);
      expect(mockStore.indexArticleStructure).toHaveBeenCalledWith(mockArticleStructure, undefined);
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(1);
      expect(result.scope).toBe('project');
      expect(result.tenantId).toBe(tenantId);
      expect(result.projectId).toBe(projectId);
    });

    it('should handle project parsing errors', async () => {
      vi.mocked(mockRepository.findByProject).mockRejectedValue(new Error('Project not found'));

      const result = await service.indexProjectCatalog('tenant-1', 'project-1');

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('Project not found');
    });
  });

  describe('indexArticleCatalog', () => {
    it('should index a specific article', async () => {
      const tenantId = 'tenant-1';
      const projectId = 'project-1';
      const articleId = 'article-1';
      const result = await service.indexArticleCatalog(articleId);

      expect(mockRepository.findById).toHaveBeenCalledWith(articleId);
      expect(mockStore.indexArticleStructure).toHaveBeenCalledWith(mockArticleStructure, undefined);
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(1);
      expect(result.scope).toBe('article');
      expect(result.tenantId).toBe(tenantId);
      expect(result.projectId).toBe(projectId);
      expect(result.articleId).toBe(articleId);
    });

    it('should handle article not found', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(null);

      const result = await service.indexArticleCatalog('missing-article');

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('Article missing-article non trouvé');
    });
  });

  describe('indexArticles', () => {
    it('should index a list of articles with tenant context', async () => {
      const params = {
        articles: [mockArticleStructure],
        tenantId: 'tenant-1',
      };

      const result = await service.indexArticles(params);

      expect(mockStore.indexArticleStructure).toHaveBeenCalledWith(
        mockArticleStructure,
        'tenant-1'
      );
      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(1);
      expect(result.indexedArticleIds).toContain('article-1');
    });

    it('should handle partial failures', async () => {
      const secondArticle = {
        ...mockArticleStructure,
        article: { ...mockArticleStructure.article, id: 'article-2' },
      };
      const params = {
        articles: [mockArticleStructure, secondArticle],
      };

      // Premier article réussit, deuxième échoue
      vi.mocked(mockStore.indexArticleStructure)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Index failed'));

      const result = await service.indexArticles(params);

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.indexedArticleIds).toContain('article-1');
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      vi.mocked(mockRepository.findAll).mockRejectedValue(new Error('Repository error'));

      const result = await service.indexGlobalCatalog();

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('Repository error');
    });

    it('should handle store indexing errors', async () => {
      vi.mocked(mockStore.indexArticleStructure).mockRejectedValue(new Error('Store error'));

      const result = await service.indexGlobalCatalog();

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('Store error');
    });
  });
});
