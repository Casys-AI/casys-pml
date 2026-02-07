import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArticleListingPort } from '../../ports/out/article-listing.port';
import {
  type ArticleNode,
  type ArticleSearchResult,
  type ArticleStructure,
  type SectionNode,
} from '@casys/core/src/domain/entities/article-structure.entity';
import { type ComponentUsage } from '@casys/core/src/domain/entities/component.entity';
import type { ArticleStructureStorePort } from '../../ports/out';
import { ArticleListingService } from '../article-listing.service';

describe('ArticleListingService', () => {
  let service: ArticleListingService;
  let mockListingStore: ArticleListingPort;
  let mockStructureStore: ArticleStructureStorePort;

  const mockArticleNode: ArticleNode = {
    id: 'test-article-1',
    title: 'Test Article',
    description: 'Description de test',
    language: 'fr',
    createdAt: '2023-01-01T00:00:00.000Z',
    keywords: ['test'],
    tags: ['unit'],
    sources: ['source1'],
    agents: ['agent1'],
    tenantId: 'tenant-1',
    projectId: 'project-1',
    content: "Contenu de l'article",
  };

  const mockArticleStructure: ArticleStructure = {
    article: mockArticleNode,
    sections: [
      {
        id: 'section-1',
        title: 'Section 1',
        level: 1,
        content: 'Contenu de la section 1',
        position: 1,
        articleId: 'test-article-1',
      },
      {
        id: 'section-2',
        title: 'Section 2',
        level: 2,
        content: 'Contenu de la section 2',
        position: 2,
        articleId: 'test-article-1',
        parentSectionId: 'section-1',
      },
    ],
    componentUsages: [
      {
        id: 'usage-1',
        componentId: 'comp-1',
        textFragmentId: 'fragment-1', // Remplacement de sectionId -> textFragmentId
        props: { title: 'Component 1' },
        position: 1,
      },
    ],
    textFragments: [
      {
        id: 'fragment-1',
        content: 'Fragment de texte commenté',
        sectionId: 'section-1',
        position: 1,
      },
    ],
    comments: [
      {
        id: 'comment-1',
        articleId: 'test-article-1',
        textFragmentId: 'fragment-1',
        content: 'Ceci est un commentaire',
        position: 1,
        createdAt: '2023-01-01T00:00:00.000Z',
      },
    ],
  };

  const mockSectionNodes: SectionNode[] = [
    {
      id: 'section-1',
      title: 'Section 1',
      level: 1,
      content: 'Contenu de la section 1',
      position: 1,
      articleId: 'test-article-1',
    },
  ];

  const mockComponentUsages: ComponentUsage[] = [
    {
      id: 'usage-1',
      componentId: 'comp-1',
      textFragmentId: 'fragment-1',
      props: { title: 'Component 1' },
      position: 1,
    },
  ];

  const mockArticleSearchResults: ArticleSearchResult[] = [
    {
      articleId: 'test-article-1',
      articleTitle: 'Test Article',
      relevanceScore: 0.95,
    },
  ];

  beforeEach(() => {
    // Créer un mock pour le listing port
    mockListingStore = {
      getAllArticles: vi.fn().mockResolvedValue([mockArticleNode]),
      getArticlesByTenantId: vi.fn().mockResolvedValue([mockArticleNode]),
      getArticlesByProjectId: vi.fn().mockResolvedValue([mockArticleNode]),
      getArticleById: vi.fn().mockResolvedValue(mockArticleNode),
      getArticleStructureById: vi.fn().mockResolvedValue(mockArticleStructure),
      getSectionsByArticleId: vi.fn().mockResolvedValue(mockSectionNodes),
      getComponentsBySectionId: vi.fn().mockResolvedValue(mockComponentUsages),
      getArticlesByComponentId: vi.fn().mockResolvedValue(mockArticleSearchResults),
    };

    // Créer un mock pour le structure store (pour les opérations de modification)
    mockStructureStore = {
      indexArticleStructure: vi.fn().mockResolvedValue(undefined),
      deleteArticleStructure: vi.fn().mockResolvedValue(undefined),
      upsertOutline: vi.fn().mockResolvedValue(undefined),
      upsertSection: vi.fn().mockResolvedValue(undefined),
      updateSectionContent: vi.fn().mockResolvedValue(undefined),
    } as unknown as ArticleStructureStorePort;

    // Créer le service avec les mocks
    service = new ArticleListingService(mockListingStore, mockStructureStore);
  });

  describe('getAllArticles', () => {
    it('should get all articles', async () => {
      const result = await service.getAllArticles();

      expect(mockListingStore.getAllArticles).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockArticleNode]);
    });

    it('should get all articles with limit', async () => {
      const limit = 10;
      await service.getAllArticles(limit);

      expect(mockListingStore.getAllArticles).toHaveBeenCalledWith(limit);
    });
  });

  describe('getArticlesByTenant', () => {
    it('should get articles by tenant id', async () => {
      const tenantId = 'tenant-1';
      const result = await service.getArticlesByTenant(tenantId);

      expect(mockListingStore.getArticlesByTenantId).toHaveBeenCalledWith(tenantId, undefined);
      expect(result).toEqual([mockArticleNode]);
    });

    it('should get articles by tenant id with limit', async () => {
      const tenantId = 'tenant-1';
      const limit = 5;
      await service.getArticlesByTenant(tenantId, limit);

      expect(mockListingStore.getArticlesByTenantId).toHaveBeenCalledWith(tenantId, limit);
    });
  });

  describe('getArticlesByProject', () => {
    it('should get articles by project id', async () => {
      const tenantId = 'tenant-1';
      const projectId = 'project-1';
      const result = await service.getArticlesByProject(tenantId, projectId);

      expect(mockListingStore.getArticlesByProjectId).toHaveBeenCalledWith(
        projectId,
        tenantId,
        undefined
      );
      expect(result).toEqual([mockArticleNode]);
    });

    it('should get articles by project id with limit', async () => {
      const tenantId = 'tenant-1';
      const projectId = 'project-1';
      const limit = 20;
      await service.getArticlesByProject(tenantId, projectId, limit);

      expect(mockListingStore.getArticlesByProjectId).toHaveBeenCalledWith(
        projectId,
        tenantId,
        limit
      );
    });
  });

  describe('getArticleStructureById', () => {
    it('should get article structure by id', async () => {
      const articleId = 'test-article-1';
      const result = await service.getArticleStructureById(articleId);

      expect(mockListingStore.getArticleStructureById).toHaveBeenCalledWith(articleId, undefined);
      expect(result).toEqual(mockArticleStructure);
    });

    it('should get article structure by id with tenant', async () => {
      const articleId = 'test-article-1';
      const tenantId = 'tenant-1';
      await service.getArticleStructureById(articleId, tenantId);

      expect(mockListingStore.getArticleStructureById).toHaveBeenCalledWith(articleId, tenantId);
    });

    it('should return null if article not found', async () => {
      mockListingStore.getArticleStructureById = vi.fn().mockResolvedValue(null);

      const result = await service.getArticleStructureById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getSectionsByArticleId', () => {
    it('should get sections by article id', async () => {
      const articleId = 'test-article-1';
      const result = await service.getSectionsByArticleId(articleId);

      expect(mockListingStore.getSectionsByArticleId).toHaveBeenCalledWith(articleId, undefined);
      expect(result).toEqual(mockSectionNodes);
    });

    it('should get sections by article id with tenant', async () => {
      const articleId = 'test-article-1';
      const tenantId = 'tenant-1';
      await service.getSectionsByArticleId(articleId, tenantId);

      expect(mockListingStore.getSectionsByArticleId).toHaveBeenCalledWith(articleId, tenantId);
    });
  });

  describe('getComponentsBySectionId', () => {
    it('should get components by section id', async () => {
      const sectionId = 'section-1';
      const result = await service.getComponentsBySectionId(sectionId);

      expect(mockListingStore.getComponentsBySectionId).toHaveBeenCalledWith(sectionId, undefined);
      expect(result).toEqual(mockComponentUsages);
    });

    it('should get components by section id with tenant', async () => {
      const sectionId = 'section-1';
      const tenantId = 'tenant-1';
      await service.getComponentsBySectionId(sectionId, tenantId);

      expect(mockListingStore.getComponentsBySectionId).toHaveBeenCalledWith(sectionId, tenantId);
    });
  });

  describe('getArticlesByComponentId', () => {
    it('should get articles by component id', async () => {
      const componentId = 'comp-1';
      const result = await service.getArticlesByComponentId(componentId);

      expect(mockListingStore.getArticlesByComponentId).toHaveBeenCalledWith(
        componentId,
        undefined,
        undefined
      );
      expect(result).toEqual(mockArticleSearchResults);
    });

    it('should get articles by component id with tenant and limit', async () => {
      const componentId = 'comp-1';
      const tenantId = 'tenant-1';
      const limit = 15;
      await service.getArticlesByComponentId(componentId, tenantId, limit);

      expect(mockListingStore.getArticlesByComponentId).toHaveBeenCalledWith(
        componentId,
        tenantId,
        limit
      );
    });
  });

  describe('deleteArticleStructure', () => {
    it('should delete article structure', async () => {
      const articleId = 'test-article-1';
      await service.deleteArticleStructure(articleId);

      expect(mockStructureStore.deleteArticleStructure).toHaveBeenCalledWith(articleId, undefined);
    });

    it('should delete article structure with tenant', async () => {
      const articleId = 'test-article-1';
      const tenantId = 'tenant-1';
      await service.deleteArticleStructure(articleId, tenantId);

      expect(mockStructureStore.deleteArticleStructure).toHaveBeenCalledWith(articleId, tenantId);
    });

    it('should handle errors during deletion', async () => {
      mockStructureStore.deleteArticleStructure = vi
        .fn()
        .mockRejectedValue(new Error('Deletion failed'));

      await expect(service.deleteArticleStructure('test-article-1')).rejects.toThrow(
        'Deletion failed'
      );
    });
  });
});
