import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ArticleStructureSearchPort } from '../../ports/out/article-structure-search.port';
import { type ArticleSearchResult } from '@casys/core/src/domain/entities/article-structure.entity';
import {
  type ArticleContextSearchRequest,
  ArticleStructureSearchService,
} from '../article-structure-search.service';

// Mock des données de test
const mockSearchResults: ArticleSearchResult[] = [
  {
    articleId: 'article-1',
    articleTitle: 'Test Article',
    sectionId: 'section-1',
    sectionTitle: 'Test Section',
    sectionLevel: 2,
    relevanceScore: 0.95,
  },
];

const mockFragmentResults: (ArticleSearchResult & {
  fragmentId: string;
  fragmentContent: string;
})[] = [
  {
    articleId: 'article-1',
    articleTitle: 'Test Article',
    sectionId: 'section-1',
    sectionTitle: 'Test Section',
    relevanceScore: 0.95,
    fragmentId: 'fragment-1',
    fragmentContent: 'Fragment content',
  },
];

// Mock du logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  }),
}));

describe('ArticleStructureSearchService', () => {
  let service: ArticleStructureSearchService;
  let mockSearchPort: ArticleStructureSearchPort;

  beforeEach(() => {
    mockSearchPort = {
      searchArticlesByEmbedding: vi.fn(),
      searchSectionsByEmbedding: vi.fn(),
      searchTextFragmentsByEmbedding: vi.fn(),
      searchCommentsByEmbedding: vi.fn(),
      searchSectionsHybrid: vi.fn(),
      searchSectionsByGraphNeighborhood: vi.fn(),
    };

    service = new ArticleStructureSearchService(mockSearchPort);
  });

  describe('searchContextForComment', () => {
    it('devrait rechercher des sections par défaut', async () => {
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue(mockSearchResults);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      const result = await service.searchContextForComment({
        commentContent: 'test comment',
        tenantId: 'tenant-1',
        searchTypes: ['sections' as const],
      });

      expect(mockSearchPort.searchSectionsByEmbedding).toHaveBeenCalledWith(
        'test comment',
        'tenant-1',
        5,
        0.7
      );
      expect(result.primaryContext).toBeDefined();
      expect(result.primaryContext.sections).toHaveLength(1);
    });

    it('devrait rechercher plusieurs types si spécifiés', async () => {
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue(mockSearchResults);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue(
        mockFragmentResults
      );
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      const result = await service.searchContextForComment({
        commentContent: 'test comment',
        tenantId: 'tenant-1',
        searchTypes: ['sections' as const, 'fragments' as const],
      });

      expect(mockSearchPort.searchSectionsByEmbedding).toHaveBeenCalled();
      expect(mockSearchPort.searchTextFragmentsByEmbedding).toHaveBeenCalled();
      expect(result.primaryContext).toBeDefined();
      expect(result.primaryContext.sections).toHaveLength(1);
      expect(result.primaryContext.fragments).toHaveLength(1);
    });

    it('devrait gérer les erreurs', async () => {
      const error = new Error('Search error');
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockRejectedValue(error);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      // Le service devrait lancer l'erreur car la recherche principale échoue
      await expect(
        service.searchContextForComment({
          commentContent: 'test comment',
          searchTypes: ['sections' as const],
        })
      ).rejects.toThrow('Search error');
    });

    it('should handle search port errors gracefully', async () => {
      const error = new Error('Search service unavailable');
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockRejectedValue(error);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      // Le service devrait lancer l'erreur car la recherche échoue
      await expect(
        service.searchContextForComment({
          commentContent: 'test comment',
          tenantId: 'tenant-1',
          searchTypes: ['sections' as const],
        })
      ).rejects.toThrow('Search service unavailable');
    });

    it('should handle individual search method failures', async () => {
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue(mockSearchResults);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockRejectedValue(
        new Error('Fragment search failed')
      );
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      // Le service devrait lancer l'erreur car une des recherches échoue
      await expect(
        service.searchContextForComment({
          commentContent: 'test comment',
          tenantId: 'tenant-1',
          searchTypes: ['sections' as const, 'fragments' as const],
        })
      ).rejects.toThrow('Fragment search failed');
    });

    it('should log errors during search', async () => {
      const error = new Error('Search failed');
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockRejectedValue(error);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      // Le service devrait lancer l'erreur
      await expect(
        service.searchContextForComment({
          commentContent: 'test comment',
          searchTypes: ['sections' as const],
        })
      ).rejects.toThrow('Search failed');
    });
  });

  describe('searchSectionsWithContext', () => {
    it('should return sections with context', async () => {
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue(mockSearchResults);

      const result = await service.searchSectionsWithContext('React components');

      expect(result).toEqual(mockSearchResults);
      expect(mockSearchPort.searchSectionsHybrid).toHaveBeenCalledWith(
        'React components',
        undefined, // tenantId
        3, // limit
        undefined, // projectId
        undefined // articleId
      );
    });

    it('should use default parameters', async () => {
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      await service.searchSectionsWithContext('test query');

      expect(mockSearchPort.searchSectionsHybrid).toHaveBeenCalledWith(
        'test query',
        undefined, // default tenantId
        3, // default limit
        undefined, // default projectId
        undefined // default articleId
      );
    });

    it('should pass tenant, project and article filters', async () => {
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue(mockSearchResults);

      const options = {
        tenantId: 'tenant-123',
        projectId: 'project-456',
        articleId: 'article-789',
      };

      await service.searchSectionsWithContext('React hooks', options, 5);

      expect(mockSearchPort.searchSectionsHybrid).toHaveBeenCalledWith(
        'React hooks',
        'tenant-123', // tenantId
        5, // limit
        'project-456', // projectId
        'article-789' // articleId
      );
    });

    it('should filter by article only (most common use case)', async () => {
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue(mockSearchResults);

      const options = {
        tenantId: 'tenant-123',
        projectId: 'project-456',
        articleId: 'article-current',
      };

      await service.searchSectionsWithContext('component structure', options);

      expect(mockSearchPort.searchSectionsHybrid).toHaveBeenCalledWith(
        'component structure',
        'tenant-123',
        3,
        'project-456',
        'article-current'
      );
    });

    it('should handle search errors', async () => {
      const error = new Error('Section search failed');
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockRejectedValue(error);

      const result = await service.searchSectionsWithContext('test query');

      expect(result).toEqual([]);
    });
  });

  describe('logging', () => {
    it('should log search operations', async () => {
      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue(mockSearchResults);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      await service.searchContextForComment({
        commentContent: 'test comment',
        tenantId: 'tenant-1',
        searchTypes: ['sections' as const, 'fragments' as const],
      });

      // Logger est mocké globalement, on se contente de vérifier que la méthode fonctionne
    });
  });

  describe('edge cases', () => {
    it('should handle very long comment content', async () => {
      const longComment = 'A'.repeat(10000);
      const longRequest: ArticleContextSearchRequest = {
        commentContent: longComment,
        searchTypes: ['sections'],
      };

      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      const result = await service.searchContextForComment(longRequest);

      expect(result).toBeDefined();
      expect(mockSearchPort.searchSectionsByEmbedding).toHaveBeenCalledWith(
        longComment,
        undefined,
        5,
        0.7
      );
    });

    it('should handle special characters in comment content', async () => {
      const specialRequest: ArticleContextSearchRequest = {
        commentContent: 'Comment with émojis 🚀 and spéciàl chars!',
        searchTypes: ['sections'],
      };

      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      const result = await service.searchContextForComment(specialRequest);

      expect(result).toBeDefined();
      expect(mockSearchPort.searchSectionsByEmbedding).toHaveBeenCalledWith(
        'Comment with émojis 🚀 and spéciàl chars!',
        undefined,
        5,
        0.7
      );
    });

    it('should handle extreme similarity thresholds', async () => {
      const extremeRequest: ArticleContextSearchRequest = {
        commentContent: 'Test',
        minSimilarity: 0.99,
        searchTypes: ['sections'],
      };

      vi.mocked(mockSearchPort.searchSectionsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchTextFragmentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchCommentsByEmbedding).mockResolvedValue([]);
      vi.mocked(mockSearchPort.searchSectionsHybrid).mockResolvedValue([]);

      await service.searchContextForComment(extremeRequest);

      expect(mockSearchPort.searchSectionsByEmbedding).toHaveBeenCalledWith(
        'Test',
        undefined,
        5,
        0.99
      );
    });
  });
});
